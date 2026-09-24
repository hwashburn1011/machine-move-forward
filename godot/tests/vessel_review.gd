extends SceneTree

var game
var label="refined"
var legacy=false
var report={"views":{}}
const VIEWS=[
	[Vector3(-1.35,13.80,8.24),Vector3(0,13.50,10.4),48],
	[Vector3(-.28,13.69,9.30),Vector3(0,13.52,10.06),38],
	[Vector3(5.5,14.30,6.0),Vector3(3,13.30,10.4),62],
	[Vector3(7.28,13.64,8.30),Vector3(8.25,13.02,10.2),50]]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-vessel-review/"
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
	# Keep both complete resources resident in both runs; only draw visibility
	# changes. Other previous refinements remain identical.
	var original=MMFAssets.scene("runtime/machine.glb");game.add_child(original);original.hide()
	if legacy:
		var manifest=MMFAssets.json("res://art/nomad-vessels.json")
		for entry in manifest.trim:
			var source=MMFAssets.find_named(original,entry.original);var copy=source.duplicate()
			game.world.machine.add_child(copy);copy.global_transform=source.global_transform;copy.show()
			if entry.replacement!="":MMFAssets.find_named(game.world.machine,entry.replacement).hide()
		MMFAssets.find_named(game.world.machine,"NativePressureVessels").hide()
	var camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size);report.legacy=legacy
	report.scope="Four fixed native middle-deck views, high Forward+/Vulkan, 4x MSAA, VSync off. 2s warmup, 4s samples. Both assets resident. Gameplay frozen; not gameplay FPS. Captures after timings."
	for i in VIEWS.size():
		camera.position=VIEWS[i][0];camera.look_at(VIEWS[i][1]);camera.fov=VIEWS[i][2];camera.reset_physics_interpolation()
		var start=Time.get_ticks_usec()
		while Time.get_ticks_usec()-start<2000000:await process_frame
		var frames=[];var gpu=[];var draws=[];start=Time.get_ticks_usec();var previous=start
		while Time.get_ticks_usec()-start<4000000:
			await process_frame;var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
			gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
			draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		report.views[str(i+1)]={"frameMs":stats(frames),"gpuMs":stats(gpu),"drawCalls":stats(draws),"samples":frames.size()}
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/vessels-"+label+"-"+str(i+1)+".png"))
		print("VESSEL_REVIEW ",i+1," ",report.views[str(i+1)])
	var file=FileAccess.open("res://../test-results/godot-native/vessels-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
