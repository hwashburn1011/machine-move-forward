extends SceneTree

var game
var report=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-canopy-review/";call_deferred("run")

func stats(values: Array):
	values.sort();return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back()}

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings();game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.visual.hide();game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	var original=MMFAssets.scene("runtime/machine.glb");game.add_child(original);original.hide()
	var legacy=Node3D.new();game.add_child(legacy)
	var retained=[]
	for entry in MMFAssets.json("res://art/nomad-canopy.json").trim:
		var mesh=MMFAssets.find_named(original,entry.original);var copy=mesh.duplicate();legacy.add_child(copy);copy.global_transform=mesh.global_transform;copy.show()
		if entry.replacement!="":retained.append(MMFAssets.find_named(game.world.machine,entry.replacement))
	var camera=Camera3D.new();game.add_child(camera);camera.fov=48;camera.current=true
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	for view in [["overview",Vector3(12,25,14),Vector3(1.5,18.8,2.5)],["corner",Vector3(7,20.5,-2.8),Vector3(4.7,19.25,-.2)],["underneath",Vector3(3,17.4,4.5),Vector3(0,18.5,.5)]]:
		camera.position=view[1];camera.look_at(view[2])
		for mode in ["legacy","refined"]:
			legacy.visible=mode=="legacy";game.world.canopy.root.visible=mode=="refined"
			for mesh in retained:mesh.visible=mode=="refined"
			await create_timer(2).timeout
			var frames=[];var gpu=[];var start=Time.get_ticks_usec();var previous=start
			while Time.get_ticks_usec()-start<4000000:
				await process_frame;var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
				gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
			var row={"view":view[0],"mode":mode,"frames":stats(frames),"gpu":stats(gpu),"drawCalls":RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)}
			report.append(row);print("CANOPY_PROFILE ",row)
			await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/canopy-"+mode+"-"+view[0]+".png"))
	# Native visual frames at two known wind phases; profiling above is static.
	for t in [0.0,1.6]:
		game.world.canopy.clock=t;game.world.canopy.update(0,1);await process_frame;await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/canopy-wind-"+str(t)+".png"))
	var file=FileAccess.open("res://../test-results/godot-native/canopy-profile.json",FileAccess.WRITE);file.store_string(JSON.stringify({"adapter":RenderingServer.get_video_adapter_name(),"scope":"Native fixed views, 1080p high/Forward+/Vulkan/4xMSAA, uncapped/no vsync. Gameplay and cloth phase frozen; both resources resident. 2s warmup, 4s samples per view; captures after sampling. Measures rendering cost, not overall gameplay FPS.","samples":report},"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit()
