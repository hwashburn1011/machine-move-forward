extends SceneTree

# Accurate before image includes the commander's retained body material
# overrides; its body-only resource intentionally has no default materials.
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://art100-story-baseline/";call_deferred("run")

func run():
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	for i in 6:await physics_frame
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	DisplayServer.window_set_size(Vector2i(1280,900));game.ui.root.hide();game.player.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	MMFAssets.box(game,Vector3(12,.2,12),Vector3(60,15.93,0),MMFAssets.material(Color(.15,.16,.15)))
	var enemy=game.combat.spawn("sovereign",Vector3(60,16.04,0));enemy.set_physics_process(false);enemy.hp_label.hide();enemy.play("idle",true)
	if enemy.animator:enemy.animator.advance(.25);enemy.animator.pause()
	var mount=MMFAssets.find_named(enemy.visual,"Art100TorsoMount");mount.hide()
	for mesh in enemy.meshes:
		if mount.is_ancestor_of(mesh):continue
		for i in mesh.mesh.get_surface_count():mesh.set_surface_override_material(i,mesh.get_meta("art100_original_materials",[])[i])
	var camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.fov=42;camera.position=enemy.position+Vector3(2.6,1.9,3.2);camera.look_at(enemy.position+Vector3(0,1,0))
	for i in 4:await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../assets/art100/story-robots/review/native-sovereign-before.png"))
	while game.combat.nav.is_baking():await process_frame
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Story.clear_cache();MMFArt100RobotDetails.clear_cache();MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);quit()
