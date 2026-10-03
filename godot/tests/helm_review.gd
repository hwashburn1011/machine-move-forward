extends SceneTree

var game
var label="before"
var legacy=false
var report={"views":{}}
const VIEWS=[
	[Vector3(-1.5,17.85,-6.95),Vector3(-3,16.76,-9),46],
	[Vector3(-4.5,17.72,-11.1),Vector3(-3,16.76,-9),46],
	[Vector3(-5.3,17.45,-8.15),Vector3(-3,16.77,-9),46],
	[Vector3(-1.7,17.7,-6.8),Vector3(-3,16.76,-9),46]]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-helm-review/"
	for arg in OS.get_cmdline_user_args():
		if arg=="--legacy":legacy=true
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
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
	game.session.update_power();game.world.switchgear.update(.25,game.session)
	var current=MMFAssets.find_named(game.world.machine,"HelmRoot")
	var frozen=MMFAssets.scene("runtime/machine.glb");game.add_child(frozen);frozen.hide()
	var source=MMFAssets.find_named(frozen,"HelmRoot");var placement=source.global_transform;var copy=source.duplicate()
	copy.name="LegacyHelm";game.world.machine.add_child(copy);copy.global_transform=placement
	copy.visible=legacy;current.visible=not legacy;frozen.free()
	var camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size);report.legacy=legacy
	report.scope="Four fixed native helm views, high Forward+/Vulkan, 4x MSAA, VSync off. 2s warmup/4s samples. Physics frozen; captures follow timings. Last view includes all existing earned hardware."
	for i in VIEWS.size():
		if i==3:
			game.session.story.uniques=["course-gyro","course-actuator","vector-governor","meridian-solution"]
			game.session.update_power()
			game.world.sync_progress()
			var hardware=MMFAssets.find_named(current,"NativeProgressHardware")
			if hardware:copy.add_child(hardware.duplicate())
		camera.position=VIEWS[i][0];camera.look_at(VIEWS[i][1]);camera.fov=VIEWS[i][2];camera.reset_physics_interpolation()
		var start=Time.get_ticks_usec()
		while Time.get_ticks_usec()-start<2000000:await process_frame
		var frames=[];var gpu=[];var draws=[];start=Time.get_ticks_usec();var previous=start
		while Time.get_ticks_usec()-start<4000000:
			await process_frame;var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
			gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
			draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		report.views[str(i+1)]={"frameMs":stats(frames),"gpuMs":stats(gpu),"drawCalls":stats(draws),"samples":frames.size()}
		await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/helm-"+label+"-"+str(i+1)+".png"))
		print("HELM_REVIEW ",i+1," ",report.views[str(i+1)])
	var file=FileAccess.open("res://../test-results/godot-native/helm-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
