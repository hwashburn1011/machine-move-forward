extends SceneTree
## Native quality review or explicit performance fixture. No production saves.
var game
var camera: Camera3D
var performance=false
var captures=[]
var failures=[]
const OUT="res://../test-results/roadside-outposts/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://roadside-native-review/"
	performance="--performance" in OS.get_cmdline_user_args();call_deferred("run")

func stats(values: Array) -> Dictionary:
	if values.is_empty():return {}
	var sorted=values.duplicate();sorted.sort()
	return {"samples":sorted.size(),"median":sorted[sorted.size()/2],"p95":sorted[mini(sorted.size()-1,int(sorted.size()*.95))],"p99":sorted[mini(sorted.size()-1,int(sorted.size()*.99))],"max":sorted.back()}

func write(name: String,data: Dictionary):
	var file=FileAccess.open(OUT+name+".json",FileAccess.WRITE);file.store_string(JSON.stringify(data,"\t"));file.close()

func capture(label: String,at: Vector3,target: Vector3,fov: float=55):
	camera.position=at;camera.look_at(target);camera.fov=fov;camera.make_current()
	for i in 6:await process_frame
	await RenderingServer.frame_post_draw
	var path=OUT+label+".png"
	if root.get_texture().get_image().save_png(path)!=OK:failures.append("Capture failed: "+label)
	captures.append(path)

func fixture(side: int,variant: int):
	game.roadside.reset();game.session.distance=600;game.session.lateral=0
	var spec={"slot":0,"atDistance":600.0,"side":side,"offset":35.0}
	var place=game.roadside.clear_placement(spec,0)
	if place.is_empty():failures.append("No safe review placement");return
	# This is a deliberate view fixture; the first earned slot remains solo.
	game.session.roadside={"nextSlot":1,"active":{"slot":0,"atDistance":600.0,"worldX":place.worldX,"side":place.side,"variant":variant,"health":[60.0],"shots":[0]}}
	if variant==1:game.session.roadside.active.health.append(60.0);game.session.roadside.active.shots.append(0)
	game.roadside.update(0);game.world.refresh_chunks(true);game.world.update(0)
	game.player.position=Vector3(int(place.side)*12,16.03,0)
	for i in 3:await physics_frame
	for guard in game.roadside.guards:guard.update(2,true);guard.animator.advance(0)

func run():
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	DisplayServer.window_set_size(Vector2i(1920,1080));DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED);Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.cinematics.opening_stage.set_process(false)
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.settings.quality="high";game.settings.vsync=false;game.apply_quality()
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED);Engine.max_fps=0
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.session.scanner.phase="consumed";game.session.facts.defenses=1;game.session.threat.remaining=1000000
	for i in 45:await process_frame
	# Match production's completed title preparation, not an arbitrary number
	# of uncapped frames that can leave threaded resources still pending.
	var prepared=game.cinematics.opening_stage.encounter_assets
	while not prepared.finished:await process_frame
	if not prepared.failures.is_empty():failures.append("Title preparation failed: "+str(prepared.failures))
	MMFRoadsideOutposts.prepare_models()
	camera=Camera3D.new();game.add_child(camera);camera.fov=55;camera.far=1200;camera.near=.08
	camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	if performance:await profile();await finish();return
	for side in [-1,1]:
		await fixture(side,0 if side<0 else 1)
		var tower=game.roadside.tower;var actual_side=int(game.session.roadside.active.side)
		await capture("tower-%d-full"%side,tower.to_global(Vector3(-15,10,-24)),tower.to_global(Vector3(0,10,0)),60)
		await capture("tower-%d-from-deck"%side,Vector3(actual_side*10,18.3,-5),tower.global_position+Vector3(0,19.1,0),48)
		await capture("tower-%d-grounding"%side,tower.to_global(Vector3(-5,2,-6)),tower.to_global(Vector3(0,.2,0)),60)
		await capture("tower-%d-guards"%side,tower.to_global(Vector3(-4,20.5,-7)),tower.to_global(Vector3(0,19.1,0)),50)
		game.roadside.guards[0].take_damage(1000,game.roadside.guards[0].global_position+Vector3.UP)
		for guard in game.roadside.guards:
			if guard.dead and guard.animator:
				guard.animator.advance(3)
				guard.update(0,false)
		await capture("tower-%d-defeated"%side,tower.to_global(Vector3(-4,20.5,-7)),tower.to_global(Vector3(0,18.8,0)),50)
		if game.roadside.guards.size()==2:
			var other=game.roadside.guards[1];other.take_damage(1000,other.global_position+Vector3.UP);other.animator.advance(3);other.update(0,false)
			await capture("tower-%d-both-defeated"%side,tower.to_global(Vector3(-4,20.5,-7)),tower.to_global(Vector3(0,18.8,0)),50)
	write("native-review",{"captures":captures,"failures":failures,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"Two explicit native visual fixtures, clear deterministic scenery sites, posed live and defeated guards; not earned campaign timing"})
	await finish()

func profile():
	var costs=[];var initial_seed=game.session.seed_name
	for seed_name in ["mmf-default-seed","roadside-perf-iron","roadside-perf-dust"]:
		game.session.seed_name=seed_name
		for slot in range(6):
			var spec=MMFRoadsideOutposts.slot_spec(seed_name,slot);var begin=Time.get_ticks_usec()
			var placed=game.roadside.clear_placement(spec,0)
			costs.append((Time.get_ticks_usec()-begin)/1000.0)
	game.session.seed_name=initial_seed
	var slot=1;var spec=MMFRoadsideOutposts.slot_spec(initial_seed,slot)
	while spec.variant!=1:slot+=1;spec=MMFRoadsideOutposts.slot_spec(initial_seed,slot)
	game.session.roadside={"nextSlot":slot,"active":{}}
	game.session.distance=spec.atDistance-MMFRoadsideOutposts.REVEAL-40;game.session.speed=game.session.travel_speed()
	game.session.threat.remaining=1000000;game.session.story.phase="route-selection"
	game.world.refresh_chunks(true);game.world.update(0)
	# Warm initial scenery uploads before observing normal travel; the reveal
	# sample must not include the fixture's large checkpoint relocation.
	camera.position=Vector3(int(spec.side)*7,21.4,-7)
	camera.look_at(Vector3(int(spec.side)*float(spec.offset),18.9,MMFRoadsideOutposts.REVEAL+40));camera.make_current()
	var approach_warm=Time.get_ticks_usec()
	while Time.get_ticks_usec()-approach_warm<3000000:await process_frame
	game.set_physics_process(true)
	var reveal_frames=[];var prior=Time.get_ticks_usec();var start=prior
	while not is_instance_valid(game.roadside.tower) and Time.get_ticks_usec()-start<20000000:
		await process_frame;var now=Time.get_ticks_usec();reveal_frames.append((now-prior)/1000.0);prior=now
	if not is_instance_valid(game.roadside.tower):failures.append("Normal travel failed to reveal the selected two-guard tower");return
	var receipt=game.session.roadside.active
	game.session.distance=float(receipt.atDistance)-65
	game.player.position=Vector3(int(receipt.side)*12,16.03,0)
	game.world.refresh_chunks(true);game.world.update(0)
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	var warm=Time.get_ticks_usec()
	while Time.get_ticks_usec()-warm<3000000:
		profile_camera();await process_frame
	var sample=Time.get_ticks_usec();prior=sample
	var values={"frame_ms":[],"gpu_ms":[],"draw_calls":[],"render_cpu_ms":[]}
	var distance=game.session.distance
	while Time.get_ticks_usec()-sample<18000000:
		profile_camera();await process_frame
		var now=Time.get_ticks_usec();values.frame_ms.append((now-prior)/1000.0);prior=now
		values.gpu_ms.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
		values.render_cpu_ms.append(RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid()))
		values.draw_calls.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	var metrics={}
	for key in values:metrics[key]=stats(values[key])
	var fired=0
	for guard in game.roadside.guards:fired+=guard.shots_fired
	if game.roadside.guards.size()!=2 or fired==0:failures.append("Two-guard passing fixture did not fire real shots")
	await capture("performance-final",camera.position,game.roadside.tower.global_position+Vector3.UP*18.9)
	write("performance-diagnostic" if "--diagnostic" in OS.get_cmdline_user_args() else "performance",{"failures":failures,"metrics":metrics,"clearance_ms":stats(costs),"normal_reveal_frames_ms":stats(reveal_frames),"normal_reveal_last_frame_ms":reveal_frames.back(),
		"production_preparation_peak_ms":game.roadside.preparation_peak_usec/1000.0,"assembly_ms":game.roadside.last_reveal_usec/1000.0,
		"warmup_seconds":3,"sample_seconds":18,"resolution":[1920,1080],"quality":"high Forward+ 4xMSAA","vsync":DisplayServer.window_get_vsync_mode(),"frame_cap":Engine.max_fps,
		"shots":fired,"guards":game.roadside.guards.size(),"distance_travelled":game.session.distance-distance,"source_hash":MMFPlaytestRecorder.source_fingerprint(),
		"adapter":RenderingServer.get_video_adapter_name(),"scope":"Normal travel reveal observed separately; then staged pass with two live guards, stationary invulnerable test player, real travel/scenery and AI, no fixed-fps; no resource loading inside measured 18s beyond normal streaming."})

func profile_camera():
	if not is_instance_valid(game.roadside.tower):return
	var side=int(game.session.roadside.active.side)
	camera.position=Vector3(side*7,21.4,-7)
	camera.look_at(game.roadside.tower.global_position+Vector3.UP*18.9);camera.make_current()

func finish():
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();MMFRoadsideOutposts.clear_cache();MMFArt100RobotDetails.clear_cache();MMFArt100Story.clear_cache();MMFSiteGrounding.clear_cache()
	await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
