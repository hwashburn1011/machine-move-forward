extends SceneTree

var game
var label="after"
var legacy=false
var report={"views":{}}
const VIEWS=[
	[Vector3(-4.85,13.8,-8.9),Vector3(-6,13.30,-11),48],
	[Vector3(-5.62,13.65,-9.74),Vector3(-6,13.48,-10.7),43],
	[Vector3(7.15,13.78,7.48),Vector3(9.6,13.3,9),46],
	[Vector3(3.5,14.9,-5.8),Vector3(-1.6,13.4,-10.5),64]]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-switchgear-review/"
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
	# Both original resources reside in both runs. Preserve the preceding vessel
	# pass when restoring shared batches, so the comparison isolates cabinets.
	var original=MMFAssets.scene("runtime/machine.glb");game.add_child(original);original.hide()
	var vessel_remainders=MMFAssets.scene("res://art/nomad-vessels-retained.glb");game.add_child(vessel_remainders);vessel_remainders.hide()
	if legacy:
		for entry in MMFAssets.json("res://art/nomad-switchgear.json").trim:
			var frozen=MMFAssets.find_named(original,entry.frozen)
			var source=MMFAssets.find_named(vessel_remainders,entry.original) if entry.priorVesselRemoval else frozen
			var copy=source.duplicate();copy.set_surface_override_material(0,frozen.get_active_material(0))
			if entry.replacement!="":MMFAssets.find_named(game.world.machine,entry.replacement).hide()
			game.world.machine.add_child(copy);copy.global_transform=source.global_transform;copy.show()
		game.world.switchgear.root.hide()
	var camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size);report.legacy=legacy
	report.scope="Four fixed native cabinet views, high Forward+/Vulkan, 4x MSAA, VSync off; both resources resident; 2s warmup/4s samples. Physics frozen. Screenshots after timings."
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
		await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/switchgear-"+label+"-"+str(i+1)+".png"))
		print("SWITCHGEAR_REVIEW ",i+1," ",report.views[str(i+1)])
	if not legacy:
		camera.position=VIEWS[1][0];camera.look_at(VIEWS[1][1]);camera.fov=VIEWS[1][2];camera.reset_physics_interpolation()
		# Render every authored light channel, including dark unpowered lenses.
		for bits in [Vector3.ONE,Vector3.ZERO]:
			game.world.switchgear.indicators.set_shader_parameter("status_bits",bits)
			for frame in 4:await process_frame
			await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/switchgear-"+("faults" if bits==Vector3.ONE else "unpowered")+".png"))
	var file=FileAccess.open("res://../test-results/godot-native/switchgear-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
