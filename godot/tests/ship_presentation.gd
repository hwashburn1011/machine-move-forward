extends SceneTree

var game
var variants=[]
var report={"views":{}}
var camera: Camera3D

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-ship-presentation/";call_deferred("run")

func stats(values):
	values.sort();return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back()}

func capture(label):
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/ships-"+label+".png"))

func sample(refined: bool,view: String,repeat: int):
	variants[0].visible=not refined;variants[1].visible=refined
	if view=="wide":
		camera.position=Vector3(9,21,-16);camera.look_at(Vector3(54,7,-68));camera.fov=56
	else:
		camera.position=Vector3(48,12,-75);camera.look_at(Vector3(64,8,-74));camera.fov=48
	await create_timer(2).timeout
	var frames=[];var gpu=[];var calls=[];var start=Time.get_ticks_usec();var previous=start
	while Time.get_ticks_usec()-start<4000000:
		await process_frame
		var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
		calls.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	var label=view+("-refined-" if refined else "-original-")+str(repeat)
	report.views[label]={"frameMs":stats(frames),"gpuMs":stats(gpu),"drawCalls":stats(calls),"samples":frames.size()}
	print("SHIP_PROFILE ",label," ",report.views[label])
	if repeat==1:await capture(label)

func run():
	if DisplayServer.get_name()=="headless":push_error("Ship review needs the GPU");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings();game.started=true;game.session.opening_done=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.player.set_process(false);game.ui.root.hide()
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	for refined in [false,true]:
		var set_root=Node3D.new();game.add_child(set_root);set_root.position=Vector3(54,0,-68);variants.append(set_root)
		for robot in [false,true]:
			var ship=MMFAssets.scene(("res://art/crossfire-" if refined else "runtime/battle-")+("robot" if robot else "human")+".glb")
			set_root.add_child(ship);ship.position=Vector3(13,1.3,5) if robot else Vector3(-17,1.3,-6)
			for spec in ([["warden",Vector3(-2.7,8.1,-1.2)],["bastion",Vector3(-2.4,8.1,2.1)],["revenant",Vector3(-3.35,8.1,-5)]] if robot else [["s07-player",Vector3(2.7,8.1,-1.8)],["s07-player",Vector3(2.7,8.1,1.2)]]):
				var actor=game.cinematics.actor(spec[0],spec[1],ship);actor.rotation.y=-PI/2 if robot else PI/2
				game.cinematics.animate(actor,"idle" if robot else "armed_idle")
		set_root.hide()
	camera=Camera3D.new();game.add_child(camera);camera.far=1800;camera.current=true
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size)
	report.scope="1080p high / Vulkan Forward+ / 4x MSAA / VSync off. Identical frozen native world, original actors and two ship presentations resident. Two 4s samples per view/presentation after 2s warmup; captures after sampling. No travel/combat FPS claim."
	for view in ["wide","close"]:
		for repeat in [1,2]:await sample(false,view,repeat);await sample(true,view,repeat)
	var file=FileAccess.open("res://../test-results/godot-native/ships-profile.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	variants.clear();await create_timer(.1).timeout;MMFAssets.cache.clear();quit()
