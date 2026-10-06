extends SceneTree

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://action-probe/";call_deferred("run")

func run():
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	for mesh in MMFAssets.of_type(game.player.visual,"MeshInstance3D"):
		for surface in mesh.mesh.get_surface_count():
			var mat=mesh.get_active_material(surface)
			if mat is StandardMaterial3D and mat.emission_enabled:print("EMISSIVE ",mesh.name," / ",mat.resource_name," / ",mat.albedo_color," / ",mat.emission," / ",mat.emission_energy_multiplier)
	game.player.teleport(Vector3(0,16.03,-1));game.player.pitch=-.8;game.player.yaw=PI
	for i in 6:game.player.update_camera(1);await physics_frame
	game.open_menu("Inventory")
	for i in 30:
		await process_frame
		var t=game.ui.terminal
		print("WRIST ",t.elapsed," blend ",t.blend," camera ",t.camera.global_position," forward ",-t.camera.global_basis.z)
	game.close_menu()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit()
