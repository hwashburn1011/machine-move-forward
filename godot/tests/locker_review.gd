extends SceneTree

const SITES=[Vector3(8.525,16.03,7.54),Vector3(-8.9375,16.03,-8.19),Vector3(8.8,12.43,9.88),Vector3(6.875,8.83,-6.5)]
var game
var label="current"
var legacy=false
var report={"views":{}}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-locker-review/"
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
	if legacy and MMFAssets.find_named(game.world.machine,"NativeCargoLockers"):
		# Restore only the previous cargo presentation, including its small shared
		# handle batch. The already-refined drums, access and physics stay intact.
		var original=MMFAssets.scene("runtime/machine.glb");game.add_child(original);original.hide()
		for name in ["Secured_weatherproof_cargo_locker001","Secured_weatherproof_cargo_locker001_1"]:
			var source=MMFAssets.find_named(original,name);var copy=source.duplicate()
			game.world.machine.add_child(copy);copy.global_transform=source.global_transform;copy.show()
		var handles=MMFAssets.scene("res://art/nomad-cargo-fittings.glb")
		var original_material=MMFAssets.find_named(original,"Secured_weatherproof_cargo_locker001_2").get_active_material(0)
		for mesh in MMFAssets.of_type(handles,"MeshInstance3D"):mesh.set_surface_override_material(0,original_material)
		game.world.machine.add_child(handles)
		MMFAssets.find_named(game.world.machine,"NativeCargoLockers").hide()
		MMFAssets.find_named(game.world.machine,"NativePressureAccumulators").hide()
	var camera=Camera3D.new();game.add_child(camera);camera.fov=48;camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size);report.legacy=legacy
	report.scope="Four fixed native deck-detail views, high Forward+/Vulkan, 4x MSAA, VSync off. 2.5s warmup, 5s samples. Gameplay frozen; not gameplay FPS."
	for i in SITES.size():
		var at=SITES[i];var sign_z=1 if at.z<0 else -1
		camera.position=at+Vector3(-1.3 if at.x>0 else 1.3,1.3,1.7*sign_z)
		camera.look_at(at+Vector3(0,.42,0));camera.reset_physics_interpolation()
		var start=Time.get_ticks_usec()
		while Time.get_ticks_usec()-start<2500000:await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/lockers-"+label+"-"+str(i+1)+".png"))
		# Let the screenshot readback settle before collecting timing samples.
		for frame in 8:await process_frame
		var frames=[];var gpu=[];var draws=[];start=Time.get_ticks_usec();var previous=start
		while Time.get_ticks_usec()-start<5000000:
			await process_frame;var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
			gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
			draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		report.views[str(i+1)]={"frameMs":stats(frames),"gpuMs":stats(gpu),"drawCalls":stats(draws),"samples":frames.size()}
		print("LOCKER_REVIEW ",i+1," ",report.views[str(i+1)])
	var file=FileAccess.open("res://../test-results/godot-native/lockers-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
