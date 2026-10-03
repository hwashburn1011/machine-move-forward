extends SceneTree

# Opt-in native checkpoint measurement. No gameplay script is replaced.
var game
var route="foundry-route"
var seconds=90.0
var cap=60
var label="baseline"
var output="res://../test-results/godot-native/feel-route.json"
var instrumented=false
var exercise=""
var exercise_step=0
var exercise_done=false
var exercise_ok=true
var split_preview_load=false
var skip_stairs_preparation=false
var frames=[]
var events=[]
var stamps=[]
var started_at=0
var launch_ms=0.0
var saves=0

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-feel-route-profile/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--route="):route=arg.trim_prefix("--route=")
		elif arg.begins_with("--seconds="):seconds=float(arg.trim_prefix("--seconds="))
		elif arg.begins_with("--cap="):cap=int(arg.trim_prefix("--cap="))
		elif arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		elif arg.begins_with("--output="):output=arg.trim_prefix("--output=")
		elif arg=="--instrumented":instrumented=true
		elif arg.begins_with("--exercise="):exercise=arg.trim_prefix("--exercise=")
		elif arg=="--split-preview-load":split_preview_load=true
		elif arg=="--skip-stairs-preparation":skip_stairs_preparation=true
	call_deferred("run")

func stamp(kind: String):
	stamps.append([Engine.get_process_frames(),Time.get_ticks_usec()-started_at,kind])

func event(kind: String,payload: Dictionary={}):
	events.append({"wall_ms":(Time.get_ticks_usec()-started_at)/1000.0,"simulation_s":game.session.clock,"phase":game.session.story.phase,"event":kind,"payload":payload})

func stats(values: Array) -> Dictionary:
	if values.is_empty():return {}
	var sorted=values.duplicate();sorted.sort()
	return {"count":sorted.size(),"median":sorted[sorted.size()/2],"p95":sorted[mini(sorted.size()-1,int(sorted.size()*.95))],"p99":sorted[mini(sorted.size()-1,int(sorted.size()*.99))],"max":sorted.back(),"over25":sorted.filter(func(v):return v>25).size(),"over50":sorted.filter(func(v):return v>50).size(),"over100":sorted.filter(func(v):return v>100).size()}

func construction_workload(elapsed: float):
	if exercise_step==0 and elapsed>=5:
		game.open_menu("Build");exercise_step=1;event("exercise_catalog")
	elif exercise_step==1 and elapsed>=8:
		game.close_menu();game.player.yaw=0;game.player.pitch=-.45
		exercise_ok=choose_preview("floor");exercise_step=2
	elif exercise_step==2 and elapsed>=12:
		exercise_ok=choose_preview("stairs") and exercise_ok
		game.building.rotation_index=1;exercise_step=3
	elif exercise_step==3 and elapsed>=16:
		game.building.cancel();exercise_done=true;exercise_step=4;event("exercise_complete",{"success":exercise_ok})

func choose_preview(piece: String) -> bool:
	var path="res://assets/runtime/"+piece+".glb"
	var cached=MMFAssets.cache.has(path)
	if split_preview_load and piece=="stairs" and not cached:
		# Diagnostic isolation deliberately warms the same resource before choose.
		# This is not a shipping optimization or an accepted after-fix sample.
		var load_start=Time.get_ticks_usec();var packed=load(path)
		var load_ms=(Time.get_ticks_usec()-load_start)/1000.0
		var instantiate_start=Time.get_ticks_usec();var probe=packed.instantiate()
		var instantiate_ms=(Time.get_ticks_usec()-instantiate_start)/1000.0
		var override_start=Time.get_ticks_usec()
		for mesh in MMFAssets.of_type(probe,"MeshInstance3D"):
			mesh.material_override=game.building.preview_material
			mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var override_ms=(Time.get_ticks_usec()-override_start)/1000.0
		probe.free();MMFAssets.cache[path]=packed
		event("diagnostic_preview_split",{"load_cpu_ms":load_ms,"instantiate_cpu_ms":instantiate_ms,"override_cpu_ms":override_ms,"cached_before":cached})
	var began=Time.get_ticks_usec()
	var accepted=game.building.choose(piece)
	var cpu_ms=(Time.get_ticks_usec()-began)/1000.0
	event("exercise_preview",{"piece":piece,"accepted":accepted,"choose_cpu_ms":cpu_ms,"cached_before":cached,"cached_after":MMFAssets.cache.has(path)})
	return accepted

func expedition_workload():
	# Fixture-assisted placement at supported local controls, not a walking benchmark.
	await create_timer(6).timeout
	var fixture=preload("res://tests/expedition_fixture.gd")
	for action in MMFExpeditionMechanisms.STEPS.power:
		var point=fixture.point(game,"mechanism-power-"+action)
		if point.is_empty() or not fixture.open_step(game,"power",action):exercise_ok=false;break
		var delta=game.campaign.destination.to_global(point.at)-game.player.position
		game.player.yaw=atan2(-delta.x,-delta.z);game.player.pitch=-.12
		event("exercise_control",{"action":action})
		if action=="bus":
			for i in 3:game.activity.adjust(i,[2,1,0][i])
		await create_timer(.7).timeout
		if not await fixture.act(game):exercise_ok=false;break
		event("exercise_milestone",{"action":action})
		game.close_menu()
		await create_timer(.3).timeout
	exercise_done=true;event("exercise_complete",{"success":exercise_ok})

func run():
	if DisplayServer.get_name()=="headless":push_error("Native renderer required");quit(1);return
	Engine.max_fps=cap;DisplayServer.window_set_size(Vector2i(1920,1080))
	started_at=Time.get_ticks_usec()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	# Paired causal control disables only the new resource preparation entry.
	# No frame has run yet; all other production preparation is unchanged.
	if skip_stairs_preparation:game.get_node("EncounterAssets").paths.erase(MMFEncounterAssets.STAIRS_PREVIEW)
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	game.autosaver.completed.connect(func(ok):saves+=int(ok);event("autosave_completed",{"success":ok}))
	var before=Time.get_ticks_usec()
	if not game.playtests.launch(route):push_error("Cannot launch checkpoint "+route);quit(1);return
	if route=="foundry-route" and not game.campaign.begin_route("foundry-detour"):push_error("Cannot start detour");quit(1);return
	launch_ms=(Time.get_ticks_usec()-before)/1000.0
	event("checkpoint_launched",{"id":route,"launch_ms":launch_ms})
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	if instrumented:
		physics_frame.connect(stamp.bind("physics_begin"));process_frame.connect(stamp.bind("process_begin"))
		RenderingServer.frame_pre_draw.connect(stamp.bind("render_begin"));RenderingServer.frame_post_draw.connect(stamp.bind("render_end"))
	var run_start=Time.get_ticks_usec();var previous=run_start
	if exercise=="expedition":call_deferred("expedition_workload")
	var prior_phase=game.session.story.phase;var prior_threat="";var prior_pending=false
	var prior_prepared=game.get_node("EncounterAssets").finished
	while Time.get_ticks_usec()-run_start<int(seconds*1000000):
		await process_frame
		var now=Time.get_ticks_usec();var elapsed=(now-run_start)/1000000.0
		# Identical slow panorama; gameplay and the normal director remain active.
		if exercise=="" and elapsed>3:game.player.yaw=-TAU*(elapsed-3)/24
		if exercise=="construction":construction_workload(elapsed)
		var phase=game.session.story.phase;var threat=game.combat.encounter_status();var pending=game.autosaver.pending()
		if not prior_prepared and game.get_node("EncounterAssets").finished:
			var prep=game.get_node("EncounterAssets")
			event("title_assets_prepared",{"requests":prep.requests,"completed":prep.completed,"failures":prep.failures})
			prior_prepared=true
		if phase!=prior_phase:event("phase",{"from":prior_phase,"to":phase});prior_phase=phase
		if threat!=prior_threat:event("encounter",{"state":threat});prior_threat=threat
		if pending and not prior_pending:event("autosave_queued")
		prior_pending=pending
		frames.append({"frame":Engine.get_process_frames(),"wall_s":elapsed,"ms":(now-previous)/1000.0,"simulation_s":game.session.clock,"distance":game.session.distance,"phase":phase,"gpu_ms":RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()),"render_cpu_ms":RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid()),"setup_cpu_ms":RenderingServer.get_frame_setup_time_cpu(),"focused":DisplayServer.window_is_focused()})
		previous=now
	var all=[];var steady=[];var gpu=[]
	for frame in frames:
		all.append(frame.ms);gpu.append(frame.gpu_ms)
		if frame.wall_s>=5:steady.append(frame.ms)
	var source={}
	for path in ["main","player","combat","enemy","owned_shot","effects","audio","world","session","playtest_checkpoints"]:source[path]=FileAccess.get_sha256("res://scripts/"+path+".gd")
	var report={"schema":1,"run_id":label+"-"+route+"-"+str(started_at),"label":label,"mode":"checkpoint-scripted-panorama","checkpoint_id":route,"seed":game.session.seed_name,"source_hashes":source,"engine":Engine.get_version_info(),"adapter":RenderingServer.get_video_adapter_name(),"cpu":OS.get_processor_name(),"resolution":[1920,1080],"quality":"high Forward+ Vulkan 4x MSAA","vsync":false,"frame_cap":cap,"instrumented":instrumented,"cache_state":"fresh process; OS and driver cache uncontrolled","launch_ms":launch_ms,"sample_seconds":seconds,"frame_ms":stats(all),"steady_after5s_ms":stats(steady),"gpu_ms":stats(gpu),"successful_autosaves":saves,"final_health":game.session.health,"final_distance":game.session.distance,"frames":frames,"events":events,"stamps":stamps}
	# Full hashing and detached recorder export occur after frame measurement ends.
	report.source_fingerprint=MMFPlaytestRecorder.source_fingerprint()
	report.profiler_sha256=FileAccess.get_sha256("res://tests/feel_route_profile.gd")
	report.recording_enabled=game.recorder.enabled
	report.split_preview_load=split_preview_load
	report.skip_stairs_preparation=skip_stairs_preparation
	report.recorder=game.recorder.snapshot(game.session.clock) if game.recorder.enabled else {}
	report.exercise={"kind":exercise,"completed":exercise_done,"success":exercise_ok,"fixture_assisted":exercise=="expedition"}
	if exercise!="":report.mode="checkpoint-scripted-workload"
	var file=FileAccess.open(output,FileAccess.WRITE);file.store_string(JSON.stringify(report));file.close()
	print("FEEL_ROUTE ",route," ",report.steady_after5s_ms," saves=",saves," health=",game.session.health)
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if exercise=="" or (exercise_done and exercise_ok) else 1)
