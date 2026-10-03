extends SceneTree

var game
var label="before"
var camera: Camera3D
var roster=[]
var report={"views":{}}
var live_only=false

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-enemy-animation-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		if arg=="--live":live_only=true
	call_deferred("run")

func median(values: Array):values.sort();return values[values.size()/2]

func capture(name: String):
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/enemy-"+label+"-"+name+".png"))

func measure(name: String):
	await create_timer(2).timeout
	var frames=[];var gpu=[];var previous=Time.get_ticks_usec();var start=previous
	while Time.get_ticks_usec()-start<4000000:
		await process_frame
		var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
	report.views[name]={"medianFrameMs":median(frames),"medianGpuMs":median(gpu),"frames":frames.size(),"drawCalls":RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)}
	await capture(name)

func live_encounter():
	# Real controller/navigation on the current top deck, with a frozen player
	# and no campaign director; this is a presentation capture, not a story event.
	game.player.show();game.player.teleport(Vector3(4,16.05,5));game.player.visual.rotation.y=PI
	game.player.play("armed_idle");game.player.set_camera_fade(0)
	camera.position=Vector3(10,20,11);camera.look_at(Vector3(4,17,1));camera.reset_physics_interpolation()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var raider=game.combat.spawn("raider",Vector3(7,16.05,1));raider.mission="assault"
	var warden=game.combat.spawn("warden",Vector3(3,16.05,-4));warden.cooldown=0
	await create_timer(1.1).timeout
	warden.take_damage(8,warden.position+Vector3.UP)
	await create_timer(.075).timeout
	await capture("deck-combat")

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.settings.vsync=false;game.save_settings();game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.ui.root.hide();game.player.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	camera=Camera3D.new();game.add_child(camera);camera.fov=44;camera.current=true;camera.position=Vector3(56.7,20.7,13.8);camera.look_at(Vector3(50,16.9,0))
	if live_only:await live_encounter()
	else:
		MMFAssets.box(game,Vector3(22,.3,12),Vector3(50,15.85,0),MMFAssets.material(Color(.15,.13,.11)))
		for i in game.data.ENEMIES.size():
			var kind=game.data.ENEMIES.keys()[i];var enemy=game.combat.spawn(kind,Vector3(43.75+i*2.5,16.01,0));enemy.set_physics_process(false);enemy.hp_label.hide()
			enemy.play("walk",true);roster.append(enemy)
		RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
		await measure("walking")
		for enemy in roster:enemy.take_damage(10000,enemy.position)
		await measure("fallen")
		report.adapter=RenderingServer.get_video_adapter_name();report.scope="Six actual native enemies on an isolated review deck; fixed camera, 1920x1080 high/Vulkan/4x MSAA, VSync off; 2s warmup/4s sample, screenshots after timing. Simulation frozen; authored animation continues. Not a live combat FPS test."
		var file=FileAccess.open("res://../test-results/godot-native/enemy-review-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("ENEMY_REVIEW ",report)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
