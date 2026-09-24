extends SceneTree

var game
var report={"views":{}}
var label="current"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-desert-review/"
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
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.player.visual.hide();game.ui.root.hide()
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	var camera=Camera3D.new();game.add_child(camera);camera.fov=65;camera.far=1800;camera.current=true
	camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size)
	report.quality="high / Forward+ / Vulkan / 4x MSAA / VSync off";report.seed=game.session.seed_name
	report.scope="Static real deck views, gameplay/travel frozen. 2.5s warmup then 5s GPU sample per view. Storm view compares maximum fog and wind with identical clear sky; the separate close-review script captures full weather. Not combat, streaming or gameplay FPS."
	for view in [["upper",Vector3(-10,18,3),Vector3(-65,1,-65),0.0],["lower",Vector3(-12,10,4),Vector3(-34,1,-27),0.0],["storm",Vector3(-12,10,4),Vector3(-34,1,-27),1.0]]:
		camera.position=view[1];camera.look_at(view[2]);game.session.weather.intensity=view[3];game.world.update(0)
		# Freeze travel/gameplay for repeatable views, keep presentation wind alive.
		var start=Time.get_ticks_usec()
		while Time.get_ticks_usec()-start<2500000:
			await process_frame;game.world.atmosphere.update(1.0/120)
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/desert-"+label+"-"+view[0]+".png"))
		var frames=[];var gpu=[];var draw_calls=[];start=Time.get_ticks_usec();var previous=start
		while Time.get_ticks_usec()-start<5000000:
			await process_frame
			var now=Time.get_ticks_usec();game.world.atmosphere.update((now-previous)/1000000.0)
			frames.append((now-previous)/1000.0);previous=now
			gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
			draw_calls.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		report.views[view[0]]={"frameMs":stats(frames),"gpuMs":stats(gpu),"drawCalls":stats(draw_calls),"samples":frames.size()}
		print("DESERT_REVIEW ",view[0]," ",report.views[view[0]])
	var file=FileAccess.open("res://../test-results/godot-native/desert-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	await create_timer(.1).timeout;MMFAssets.cache.clear();call_deferred("quit")
