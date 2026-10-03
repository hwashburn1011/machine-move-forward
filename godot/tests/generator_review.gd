extends SceneTree

var game
var label="current"
var report={"views":{}}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-generator-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")

func stats(values: Array) -> Dictionary:
	values.sort();return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back()}

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	game.started=true;game.session.opening_done=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.player.visual.hide();game.ui.root.hide()
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	var pieces=game.session.structures.filter(func(p):return p.definitionId=="generator")
	var piece=pieces[0] if not pieces.is_empty() else game.session.create_piece("generator",{"x":3,"y":0,"z":3},0,{},true)
	if not game.building.bodies.has(piece.instanceId):game.building.add_visual(piece)
	var model=game.building.bodies[piece.instanceId];var at=model.global_position
	report.bounds=str(MMFAssets.bounds(model));report.position=str(at)
	report.meshes=MMFAssets.of_type(model,"MeshInstance3D").size()
	var camera=Camera3D.new();game.add_child(camera);camera.fov=48;camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size)
	report.scope="Matched static generator views; native high Forward+/Vulkan, 4x MSAA, VSync off. 2.5s warmup and 5s sample per view. Gameplay frozen, not gameplay FPS."
	for view in [["front",Vector3(2,1.8,-2.8),Vector3(0,.65,0)],["rear",Vector3(-2.2,1.55,2.5),Vector3(0,.65,0)],["deck",Vector3(3.4,2.6,-5),Vector3(0,.7,0)]]:
		camera.position=at+view[1];camera.look_at(at+view[2]);camera.reset_physics_interpolation()
		var start=Time.get_ticks_usec()
		while Time.get_ticks_usec()-start<2500000:await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/generator-"+label+"-"+view[0]+".png"))
		var frames=[];var gpu=[];var draws=[];start=Time.get_ticks_usec();var previous=start
		while Time.get_ticks_usec()-start<5000000:
			await process_frame
			var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
			gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
			draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		report.views[view[0]]={"frameMs":stats(frames),"gpuMs":stats(gpu),"drawCalls":stats(draws),"samples":frames.size()}
		print("GENERATOR_REVIEW ",view[0]," ",report.views[view[0]])
	var file=FileAccess.open("res://../test-results/godot-native/generator-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
