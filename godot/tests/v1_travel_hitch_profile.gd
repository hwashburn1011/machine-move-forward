extends SceneTree

# Frame/render observations and explicit timing of the existing preparation callback.
# The normal scene is used; no shipping scripts are replaced or instrumented.
var game
var output="res://../test-results/v1-hitch-20261005/profile.json"
var frame_events=[]
var duration_seconds=18.0
var title_wait_ms=0.0
class PreparationProbe extends Node:
	var target
	var samples=[]
	func _process(dt):
		if target.finished:return
		var state={"pending":target.pending,"next_index":target.next_index,"material_index":target.material_index,"roof_shape_index":target.roof_shape_index}
		var start=Time.get_ticks_usec();target._process(dt)
		var ms=(Time.get_ticks_usec()-start)/1000.0
		if ms>2:samples.append({"frame":Engine.get_process_frames(),"ms":ms,"state":state})


class LateFrameProbe extends Node:
	var owner_test
	func _physics_process(_dt):owner_test.stamp("physics_callbacks_end")
	func _process(_dt):owner_test.stamp("process_callbacks_end")

func stamp(label: String):frame_events.append([label,Engine.get_process_frames(),Time.get_ticks_usec()])

func pipelines() -> Dictionary:
	var result={}
	for key in ["CANVAS","MESH","SURFACE","DRAW","SPECIALIZATION"]:
		result[key]=RenderingServer.get_rendering_info(ClassDB.class_get_integer_constant("RenderingServer","RENDERING_INFO_PIPELINE_COMPILATIONS_"+key))
	return result

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-travel-profile/";call_deferred("run")

func stats(values: Array) -> Dictionary:
	values.sort()
	return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"p99":values[int(values.size()*.99)],"max":values.back()}

func run():
	if DisplayServer.get_name()=="headless":push_error("Travel profiling requires native rendering.");quit(1);return
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--seconds="):duration_seconds=float(arg.trim_prefix("--seconds="))
	physics_frame.connect(func():stamp("physics_callbacks_begin"))
	process_frame.connect(func():stamp("process_callbacks_begin"))
	RenderingServer.frame_pre_draw.connect(func():stamp("render_begin"))
	RenderingServer.frame_post_draw.connect(func():stamp("render_end"))
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate()
	root.add_child(game);current_scene=game
	var prep_probe=PreparationProbe.new();prep_probe.target=game.get_node("EncounterAssets");prep_probe.target.set_process(false)
	prep_probe.process_mode=Node.PROCESS_MODE_ALWAYS;root.add_child(prep_probe)
	var probe=LateFrameProbe.new();probe.owner_test=self;probe.process_priority=100000;probe.process_physics_priority=100000;root.add_child(probe)
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	if "--prepared-title" in OS.get_cmdline_user_args():
		var title_start=Time.get_ticks_usec()
		while not game.cinematics.opening_stage.prepared():
			await process_frame
			if Time.get_ticks_usec()-title_start>30000000:push_error("Title preparation timed out");quit(1);return
		title_wait_ms=(Time.get_ticks_usec()-title_start)/1000.0
	game.invulnerable=true
	if not game.playtests.launch("foundry-route"):push_error("Checkpoint rejected");quit(1);return
	game.campaign.begin_route("foundry-detour")
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	game.world.streamer.profile_steps=true;game.world.atmosphere.profile_placements=true
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	var warm_start=Time.get_ticks_usec()
	while Time.get_ticks_usec()-warm_start<3000000:
		game.player.yaw=0;game.player.pitch=-.12;await process_frame
	var first_pipelines=pipelines()
	var frames=[];var intervals=[];var slow_frames=[]
	var start=Time.get_ticks_usec();var previous=start
	while Time.get_ticks_usec()-start<int(duration_seconds*1000000):
		var now=Time.get_ticks_usec();var elapsed=(now-start)/1000000.0
		game.player.yaw=-TAU*elapsed/20;game.player.pitch=-.12
		await process_frame
		now=Time.get_ticks_usec()
		var ms=(now-previous)/1000.0;previous=now;intervals.append(ms)
		var frame={"frame":Engine.get_process_frames(),"elapsed":elapsed,"ms":ms,"time":game.session.clock,"distance":game.session.distance,"gpuMs":RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()),"renderCpuMs":RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid())}
		frame.setupCpuMs=RenderingServer.get_frame_setup_time_cpu();frame.pipelines=pipelines();frame.focused=DisplayServer.window_is_focused()
		frames.append(frame)
		if ms>16.67:slow_frames.append(frame)
	var report={"adapter":RenderingServer.get_video_adapter_name(),"resolution":str(root.size),"quality":"high / Forward+ / Vulkan / 4x MSAA","vsync":false,"frameMs":stats(intervals),"slowFrames":slow_frames,"streamSteps":game.world.streamer.slow_steps,"placementProfiles":game.world.atmosphere.placement_profiles,"frames":frames}
	report.frameEvents=frame_events;report.firstPipelines=first_pipelines;report.source_hash=MMFPlaytestRecorder.source_fingerprint();report.scope="Exact prepared travel camera/route diagnostic, test-owned instrumentation, 3s warmup; shader profile isolated, OS/driver caches uncontrolled."
	report.preparationSamples=prep_probe.samples;report.title_wait_ms=title_wait_ms;report.prepared_title="--prepared-title" in OS.get_cmdline_user_args();prep_probe.set_process(false)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
	var file=FileAccess.open(output,FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("TRAVEL_PROFILE ",report.frameMs," slow frame count=",slow_frames.size())
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.05).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();call_deferred("quit")
