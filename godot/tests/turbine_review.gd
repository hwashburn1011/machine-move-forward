extends SceneTree

var game
var label="after"
var legacy=false
var report={"views":{}}
const VIEWS=[
	[Vector3(7.4,14.55,-19.0),Vector3(5.02,13.85,-13.4),49],
	[Vector3(7.4,14.55,-9.2),Vector3(5.02,13.85,-13.4),49],
	[Vector3(10,14.8,-14.7),Vector3(5.02,13.85,-13.4),49],
	[Vector3(18,19,-25),Vector3(3,14.5,-10),56]]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-turbine-review/"
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
	# Load both assemblies in both runs; only their visibility differs.
	var frozen=MMFAssets.scene("runtime/machine.glb");game.add_child(frozen);frozen.hide()
	var source=MMFAssets.find_named(frozen,"Front_Turbine_Housing")
	var placement=source.global_transform;var copy=source.duplicate()
	game.world.machine.add_child(copy);copy.global_transform=placement
	copy.visible=legacy;game.world.native_intake.visible=not legacy;frozen.free()
	var camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size);report.legacy=legacy
	report.scope="Four fixed native turbine views, high Forward+/Vulkan, 4x MSAA, VSync off. 2s warmup/4s samples. Physics frozen. Screenshots after timings."
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
		await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/turbine-"+label+"-"+str(i+1)+".png"))
		print("TURBINE_REVIEW ",i+1," ",report.views[str(i+1)])
	var file=FileAccess.open("res://../test-results/godot-native/turbine-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
