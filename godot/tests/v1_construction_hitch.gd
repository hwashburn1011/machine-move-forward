extends SceneTree
## Native performance workload. Real game simulation, disposable test saves.
## No shipping script replacement and no personal settings writes in test_mode.
var game
var scenario="construction"
var label="baseline"
var seconds=36.0
var output="res://../test-results/art200/performance/"
var action_times=[]
var events=[]
var started=0
var render_camera: Camera3D
var target=Vector3.ZERO
var capture_at=0.0
var construction_step=-1
var placed_count=0

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://art200-performance/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--scenario="):scenario=arg.trim_prefix("--scenario=")
		elif arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		elif arg.begins_with("--seconds="):seconds=float(arg.trim_prefix("--seconds="))
		elif arg.begins_with("--output="):output=arg.trim_prefix("--output=")
	call_deferred("run")

func stats(values: Array,time_metric: bool=false) -> Dictionary:
	if values.is_empty():return {}
	var sorted=values.duplicate();sorted.sort()
	var result={"samples":sorted.size(),"median":sorted[sorted.size()/2],"p95":sorted[mini(sorted.size()-1,int(sorted.size()*.95))],"p99":sorted[mini(sorted.size()-1,int(sorted.size()*.99))],"max":sorted.back()}
	if time_metric:
		result.over33ms=sorted.filter(func(x):return x>33.333).size()
		result.over50ms=sorted.filter(func(x):return x>50).size()
	return result

func furnisher() -> int:
	var ids=[]
	for id in game.data.BUILD_PIECE_ORDER:
		if id.begins_with("nomad-") or id.begins_with("nomad2-"):ids.append(id)
	game.session.inventory.slots=[{"itemId":"scrap","count":100000},{"itemId":"components","count":100000}]
	var index=0
	# Keep the original baseline positions, then extend the attached side deck
	# for the added collection; every furnishing must pass ordinary placement.
	for z in range(-6,11):
		for x in [-7,-6,5,6,7]:
			if index>=ids.size():break
			var cell={"x":x,"y":0,"z":z}
			if not game.building.floor_at(cell):
				var spec={"definitionId":"floor","cell":cell,"rotation":0}
				if game.building.validate(spec)!="":continue
				game.building.add_visual(game.session.create_piece("floor",cell,0,{},true))
				await physics_frame;await physics_frame
			var spec={"definitionId":ids[index],"cell":cell,"rotation":index%4}
			if game.building.validate(spec)!="":continue
			game.building.add_visual(game.session.create_piece(ids[index],cell,index%4,{},true));index+=1
			await physics_frame;await physics_frame
	game.combat.layout_changed()
	if index!=ids.size():push_error("Furnished workload could place only %d of %d models"%[index,ids.size()])
	return index

func construction_work(elapsed: float):
	var step=int(elapsed/2)
	if step==construction_step:return
	construction_step=step
	var before=Time.get_ticks_usec()
	var operation="";var result=true
	match step%9:
		0: operation="open_build";game.open_menu("Build")
		1:
			operation="choose_chart_desk";game.close_menu();result=game.building.choose("nomad-chart-desk")
		2:
			operation="rotate";var event=InputEventAction.new();event.action="use";event.pressed=true;game.building._unhandled_input(event)
		3:
			operation="commit_aimed";result=game.building.commit_placement()
		4:
			operation="cancel_then_choose_chair";game.building.cancel();result=game.building.choose("nomad-field-chair")
		5:
			operation="commit_aimed";result=game.building.commit_placement()
		6:
			operation="undo";game.building.cancel();result=game.building.undo_last()
		7: operation="reopen_build";game.open_menu("Build")
		8: operation="close_cancel";game.close_menu();game.building.cancel()
	action_times.append({"step":step,"seconds":elapsed,"operation":operation,"ms":(Time.get_ticks_usec()-before)/1000.0,"success":result,"target":game.building.target.duplicate(true),"reason":game.building.failure})

func camera_update(elapsed: float):
	if render_camera:
		var angle=elapsed*.11
		var radius=20.0 if scenario!="berth" else 15.0
		render_camera.global_position=target+Vector3(sin(angle)*radius,10,cos(angle)*radius)
		render_camera.look_at(target);render_camera.reset_physics_interpolation();render_camera.make_current()
	elif scenario not in ["construction","crane","drone"]:
		game.player.yaw=-TAU*elapsed/20;game.player.pitch=-.12

func run():
	if DisplayServer.get_name()=="headless":push_error("Native graphics required");quit(1);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	started=Time.get_ticks_usec()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	var startup_ms=(Time.get_ticks_usec()-started)/1000.0
	game.settings.vsync=false;game.settings.quality="high";game.save_settings();game.invulnerable=true
	# Normal New Game waits for this title gate. A direct checkpoint previously
	# skipped it, letting one-off model packing and pipeline uploads spill into
	# the travel sample. Keep preparation visible and report its cost separately.
	var title_prepare_start=Time.get_ticks_usec()
	while not game.cinematics.opening_stage.prepared():
		await process_frame
		if Time.get_ticks_usec()-title_prepare_start>30000000:
			push_error("Title preparation did not finish before performance checkpoint");quit(1);return
	var title_prepare_ms=(Time.get_ticks_usec()-title_prepare_start)/1000.0
	var checkpoint={"travel":"foundry-route","construction":"scanner","furnished":"scanner","combat":"defense","guardian":"gatekeeper","crane":"port-repair","drone":"salvage-drone","wake":"wake","foundry":"foundry","array":"array","orchard":"orchard-caretaker","meridian":"meridian-quiet","berth":"finale-transfer"}.get(scenario,"scanner")
	var before=Time.get_ticks_usec()
	if not game.playtests.launch(checkpoint):push_error("Checkpoint failed: "+checkpoint);quit(1);return
	var launch_ms=(Time.get_ticks_usec()-before)/1000.0
	if scenario=="travel":game.campaign.begin_route("foundry-detour")
	game.player.teleport(Vector3(-6,16.1,-6));game.player.yaw=PI;game.player.pitch=-.62
	game.session.inventory.slots=[{"itemId":"scrap","count":10000},{"itemId":"components","count":10000}]
	if scenario=="crane":
		var ok=game.salvage.automation.repair();events.append({"port_repaired":ok})
	if scenario=="combat":
		# Representative six-body AI/animation workload on actual supported deck.
		# Player is invulnerable; enemy logic and projectile presentation run normally.
		for spec in [["scavenger",Vector3(-3,16.1,-5)],["raider",Vector3(3,16.1,-5)],["warden",Vector3(-3,16.1,4)],["revenant",Vector3(3,16.1,4)],["bastion",Vector3(-5,16.1,0)],["sovereign",Vector3(5,16.1,0)]]:
			game.combat.spawn(spec[0],spec[1])
	if scenario=="furnished":placed_count=await furnisher()
	if scenario in ["wake","foundry","array","orchard","meridian","berth"]:
		var site=game.finale.berth if scenario=="berth" else game.campaign.destination
		if not is_instance_valid(site):push_error("Missing site "+scenario);quit(1);return
		target=site.to_global(Vector3(0,1.2,0))
		render_camera=Camera3D.new();game.add_child(render_camera);render_camera.fov=55;render_camera.far=1000
		render_camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	var warm_start=Time.get_ticks_usec()
	while Time.get_ticks_usec()-warm_start<3000000:
		camera_update(0);await process_frame
	var values={"frame_ms":[],"gpu_ms":[],"render_cpu_ms":[],"draw_calls":[],"primitives":[],"video_memory_bytes":[],"static_memory_bytes":[]}
	var sample_start=Time.get_ticks_usec();var prior=sample_start;var first_distance=game.session.distance
	var slow=[];var max_enemies=0;var max_projectiles=0;var max_drones=0;var focus_frames=0
	while Time.get_ticks_usec()-sample_start<int(seconds*1000000):
		var elapsed=(Time.get_ticks_usec()-sample_start)/1000000.0
		if scenario=="construction":construction_work(elapsed)
		camera_update(elapsed)
		await process_frame
		var now=Time.get_ticks_usec();var ms=(now-prior)/1000.0;prior=now
		values.frame_ms.append(ms)
		values.gpu_ms.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
		values.render_cpu_ms.append(RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid()))
		values.draw_calls.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		values.primitives.append(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
		values.video_memory_bytes.append(Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED))
		values.static_memory_bytes.append(Performance.get_monitor(Performance.MEMORY_STATIC))
		focus_frames+=int(DisplayServer.window_is_focused())
		max_enemies=maxi(max_enemies,game.combat.enemies.size());max_projectiles=maxi(max_projectiles,game.combat.shells.size())
		max_drones=maxi(max_drones,game.salvage.automation.drones.size())
		if ms>20:slow.append({"seconds":elapsed,"ms":ms,"distance":game.session.distance,"phase":game.session.story.phase,"step":construction_step,"action":action_times.back() if not action_times.is_empty() else {},"gpu_ms":values.gpu_ms.back(),"render_cpu_ms":values.render_cpu_ms.back()})
		if elapsed>=seconds*.55 and capture_at==0:
			# Screenshot is deferred until after timing to avoid readback pollution.
			capture_at=elapsed
	var measures={}
	for key in values:measures[key]=stats(values[key],String(key).ends_with("_ms"))
	var report={"label":label,"scenario":scenario,"checkpoint":checkpoint,"adapter":RenderingServer.get_video_adapter_name(),"cpu":OS.get_processor_name(),"resolution":[1920,1080],"quality":"high Forward+ Vulkan / 4x MSAA","vsync":false,"frame_cap":0,"warmup_seconds":3,"sample_seconds":seconds,"startup_ms":startup_ms,"checkpoint_launch_ms":launch_ms,"metrics":measures,"slow_frames_over20ms":slow,"action_times":action_times,"events":events,"distance_travelled":game.session.distance-first_distance,"max_enemies":max_enemies,"max_shell_markers":max_projectiles,"max_drones":max_drones,"furnishings":placed_count,"chunks":game.world.chunks.size(),"focused_fraction":float(focus_frames)/values.frame_ms.size(),"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"Ordinary construction callbacks, real aim and validation. No capture or route planner during samples. Prepared checkpoint/test inventory, invulnerable player. OS/driver caches uncontrolled."}
	report.title_prepare_ms=title_prepare_ms
	report.title_prepared=game.get_node("EncounterAssets").finished

	var file=FileAccess.open(output+label+"-"+scenario+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("ART200_PERFORMANCE ",scenario," ",JSON.stringify(measures.frame_ms))
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	for path in ["art100_decor","art100_story","art100_robot_details","art200_decor","art200_story"]:
		if ResourceLoader.exists("res://scripts/"+path+".gd"):
			var script=load("res://scripts/"+path+".gd")
			if script.has_method("clear_cache"):script.clear_cache()
	MMFAssets.cache.clear();await drain.finish(self,refs);quit()
