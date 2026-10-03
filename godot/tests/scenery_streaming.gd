extends SceneTree

var game
var output="res://../test-results/godot-native/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-streaming-tests/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
	call_deferred("run")

func frames(n: int):
	for i in n:await process_frame

func percentile(values: Array,portion: float):
	var sorted=values.duplicate();sorted.sort();return sorted[clampi(int(ceil(sorted.size()*portion))-1,0,sorted.size()-1)]

func summary(values: Array):
	return {"p50Ms":percentile(values,.5),"p95Ms":percentile(values,.95),"p99Ms":percentile(values,.99),"maxMs":values.max()}

func memory():
	var values={"staticBytes":Performance.get_monitor(Performance.MEMORY_STATIC),"objects":Performance.get_monitor(Performance.OBJECT_COUNT),"nodes":Performance.get_monitor(Performance.OBJECT_NODE_COUNT),"resources":Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT),"videoBytes":Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED),"chunks":game.world.chunks.size(),"rotorEntries":game.world.atmosphere.rotors.size()}
	var stream=game.world.get("streamer")
	if stream:values.merge({"readyChunks":stream.ready.size(),"unfinishedChunks":1 if stream.pending else 0,"synchronousBuilds":stream.synchronous_builds,"preparedActivations":stream.prepared_activations})
	values.sceneryCollisionCache=game.world.scenery_collision.shapes.size()
	return values

func run():
	if DisplayServer.get_name()=="headless":push_error("Streaming benchmark needs GPU rendering");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings();Engine.max_fps=0
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.ui.root.hide()
	game.session.speed=7.5;game.session.fuel=100
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	game.world.update(0);await create_timer(3).timeout
	var prepared="--prepared" in OS.get_cmdline_user_args();var steps=40 if "--profile" in OS.get_cmdline_user_args() else 80 if prepared else 240
	var stream=game.world.get("streamer")
	if stream:
		stream.profile_steps="--profile" in OS.get_cmdline_user_args()
		game.world.atmosphere.profile_placements=stream.profile_steps
	var report={"adapter":RenderingServer.get_video_adapter_name(),"cpu":OS.get_processor_name(),"resolution":str(root.size),"source_hash":MMFPlaytestRecorder.source_fingerprint(),"quality":"high Forward+ Vulkan / 4x MSAA","frame_cap":0,"prepared":prepared,"description":"Accelerated boundary crossings; main gameplay paused, world/gait/atmosphere fully updated, GPU renders current full assets. Prepared mode allows 60 normal update ticks before each crossing. Measures streaming work, not normal travel FPS.","initial":memory(),"checkpoints":[]}
	var setup_steps=[];var forward=[];var lateral=[];var frames_after=[];var regular=[];var slow_updates=[]
	for step in steps:
		# One boundary per step; reverse the lateral course every eight crossings.
		game.session.distance=step*64.0+63.8
		game.session.lateral=255.8 if (step/8)%2==0 else 256.2
		var start=Time.get_ticks_usec();game.world.update(1.0/60)
		setup_steps.append((Time.get_ticks_usec()-start)/1000.0)
		await frames(3)
		for tick in (60 if prepared else 1):
			start=Time.get_ticks_usec();game.world.update(1.0/60);var ms=(Time.get_ticks_usec()-start)/1000.0;regular.append(ms)
			if ms>4:slow_updates.append({"step":step,"tick":tick,"stage":"beforeForward","ms":ms})
			await process_frame
		game.session.distance+=.4
		start=Time.get_ticks_usec();game.world.update(1.0/60)
		forward.append((Time.get_ticks_usec()-start)/1000.0)
		var before=Time.get_ticks_usec();await process_frame;frames_after.append((Time.get_ticks_usec()-before)/1000.0)
		if prepared:
			for tick in 60:
				start=Time.get_ticks_usec();game.world.update(1.0/60);var ms=(Time.get_ticks_usec()-start)/1000.0;regular.append(ms)
				if ms>4:slow_updates.append({"step":step,"tick":tick,"stage":"beforeLateral","ms":ms})
				await process_frame
		game.session.lateral+=.4 if (step/8)%2==0 else -.4
		start=Time.get_ticks_usec();game.world.update(1.0/60)
		lateral.append((Time.get_ticks_usec()-start)/1000.0)
		await frames(3)
		if step%40==39:
			game.world.atmosphere.update(3);await frames(3)
			var snapshot=memory();snapshot.step=step+1;report.checkpoints.append(snapshot)
			print("STREAMING_PROGRESS ",step+1,"/",steps," ",snapshot)
	report.setupUpdate=summary(setup_steps);report.sameCell=summary(regular);report.forwardBoundary=summary(forward);report.lateralBoundary=summary(lateral);report.nextRenderFrame=summary(frames_after);report.final=memory();report.slowPreparationUpdates=slow_updates
	if stream:report.slowSteps=stream.slow_steps;report.slowPlacements=game.world.atmosphere.placement_profiles
	var file=FileAccess.open(output+"scenery-streaming.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("STREAMING_COMPLETE ",report.forwardBoundary," lateral ",report.lateralBoundary)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.1).timeout
	var drain=load("res://tests/audio_drain.gd");var audio_refs=drain.capture(game.audio)
	game.queue_free();await frames(4);MMFAssets.cache.clear();MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache()
	await drain.finish(self,audio_refs);quit()
