extends SceneTree

var game
var camera: Camera3D
var output="res://../test-results/beta-iteration/"

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-beta-salvage-review/";call_deferred("run")

func shot(name: String,eye: Vector3,at: Vector3):
	camera.position=eye;camera.look_at(at);camera.make_current()
	for frame in 8:await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+name+".png")
	print("CAPTURE ",name)

func advance(seconds: float):
	for frame in int(seconds*60):game.salvage.update(1.0/60)

func run():
	Engine.max_fps=60;DisplayServer.window_set_size(Vector2i(1440,900))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.load_payload(game.playtests.payload("port-repair"));game.session.speed=0
	camera=Camera3D.new();game.add_child(camera);camera.fov=52
	game.player.teleport(Vector3(-7.8,16.07,7.8));game.player.update_camera(1)
	game.open_station("PortCrane","port-crane")
	await shot("port-service",Vector3(-5,19,13),Vector3(-10,17,8))
	game.session.inventory.add(MMFSalvageAutomation.ACTUATOR,1);game.salvage.automation.repair();game.close_menu()
	game.salvage.next_distance=1e12;game.session.update_power()
	await shot("port-repaired",Vector3(-20,24,18),Vector3(-12,17.2,7.8))
	for frame in 900:
		game.salvage.update(1.0/60)
		if not game.salvage.automation.port_job.is_empty() and game.salvage.automation.port_job.phase=="lift" and game.salvage.automation.claw.position.y>11:
			await shot("port-carry",Vector3(-22,17,17),Vector3(-16.5,13,8));break
	game.load_payload(game.playtests.payload("salvage-drone"));game.session.speed=0;game.salvage.next_distance=1e12
	game.player.teleport(Vector3(-10,16.07,-8));game.player.update_camera(1)
	game.ui.toast.hide();game.ui.toast_time=0
	await physics_frame;await physics_frame
	game.salvage.update(0)
	await shot("mender-docked",Vector3(-12,18,-6),Vector3(-10,16.8,-10))
	var captured=false
	for frame in 1500:
		game.salvage.update(1.0/60)
		for job in game.salvage.automation.drones.values():
			if not captured and job.phase=="raise" and job.node.position.y>10:
				await shot("mender-carry",job.node.position+Vector3(-4,2,5),job.node.position-Vector3.UP*.35);captured=true
			if job.phase=="idle" and captured:break
	await shot("mender-returned",Vector3(-12,18,-6),Vector3(-10,16.8,-10))
	print("BETA_NATIVE_REVIEW_COMPLETE")
	game.queue_free();await process_frame;quit()
