extends SceneTree

const SITES=[Vector3(9.625,16.03,7.8),Vector3(-9.625,16.03,-6.5),Vector3(5.5,16.03,10.4)]
var game
var label="current"
var legacy=false
var report={"views":{}}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-dressing-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		if arg=="--legacy":legacy=true
	call_deferred("run")

func stats(values: Array) -> Dictionary:
	values.sort();return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back()}

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.visual.hide();game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	# Review-only baseline: restore just the two old visible batches. Physics,
	# camera, surroundings and generator stay identical between both captures.
	if legacy:
		var original=MMFAssets.scene("runtime/machine.glb");game.add_child(original);original.hide()
		for name in ["Secured_weatherproof_cargo_locker001_2","Secured_weatherproof_cargo_locker001_5"]:
			var source=MMFAssets.find_named(original,name);var copy=source.duplicate()
			game.world.machine.add_child(copy);copy.global_transform=source.global_transform;copy.show()
		game.world.native_dressing.hide();MMFAssets.find_named(game.world.machine,"NativeCargoFittings").hide()
	var camera=Camera3D.new();game.add_child(camera);camera.fov=45;camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size)
	report.legacy=legacy
	report.scope="Three fixed native deck-detail views, high Forward+/Vulkan, 4x MSAA, VSync off. 2.5s warmup, 5s samples. Gameplay frozen; not gameplay FPS."
	for i in SITES.size():
		var at=SITES[i];camera.position=at+Vector3(1.1,1.2,1.5 if i==1 else -1.5);camera.look_at(at+Vector3(0,.39,0));camera.reset_physics_interpolation()
		var start=Time.get_ticks_usec()
		while Time.get_ticks_usec()-start<2500000:await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/dressing-"+label+"-"+str(i+1)+".png"))
		var frames=[];var gpu=[];var draws=[];start=Time.get_ticks_usec();var previous=start
		while Time.get_ticks_usec()-start<5000000:
			await process_frame;var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
			gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
			draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		report.views[str(i+1)]={"frameMs":stats(frames),"gpuMs":stats(gpu),"drawCalls":stats(draws),"samples":frames.size()}
		print("DRESSING_REVIEW ",i+1," ",report.views[str(i+1)])
	var file=FileAccess.open("res://../test-results/godot-native/dressing-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
