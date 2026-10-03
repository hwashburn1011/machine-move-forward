extends SceneTree

var game
var label="compiled"
var author=false
const VIEWS=[
	[Vector3(18,21,-25),Vector3(0,13,-1),55],
	[Vector3(-7,18,7),Vector3(2,17,-3),65],
	[Vector3(8,14,-10),Vector3(2,13.8,-4),65],
	[Vector3(-16,12,9),Vector3(-10,12,-1),58]]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-compiled-review/"
	for arg in OS.get_cmdline_user_args():
		if arg=="--author":author=true;set_meta("author_machine",true)
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.visual.hide();game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	game.session.update_power();game.world.switchgear.update(.25,game.session)
	# TIME is independent of game pause. Freeze these shared shader resources
	# only in this capture process; the source files are never changed.
	for name in ["desert_brush","ground_drift","wind_canvas","weathered_beacon"]:
		var shader=load("res://shaders/"+name+".gdshader");shader.code=shader.code.replace("TIME","0.0")
	for particles in MMFAssets.of_type(game.world,"GPUParticles3D"):particles.hide()
	for particles in MMFAssets.of_type(game.effects,"GPUParticles3D"):particles.hide()
	var camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	for i in VIEWS.size():
		camera.position=VIEWS[i][0];camera.look_at(VIEWS[i][1]);camera.fov=VIEWS[i][2];camera.reset_physics_interpolation()
		for frame in 45:await process_frame
		await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/machine-"+label+"-"+str(i+1)+".png"))
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
