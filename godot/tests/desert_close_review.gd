extends SceneTree

var game
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-desert-close/";call_deferred("run")
func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.save_settings();game.started=true;game.session.opening_done=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.player.visual.hide();game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	# This close artist review stages the seven real meshes against native sand
	# and lighting. It is not a new playable sand-level location or a spawn rule.
	for chunk in game.world.chunks.values():chunk.hide()
	var life=game.world.atmosphere.desert_life;var kit=Node3D.new();game.add_child(kit)
	for i in life.KINDS.size():
		var kind=life.KINDS[i];var model=life.sources[kind].duplicate();kit.add_child(model)
		var x=-70+(i%4-1.5)*1.9;var z=(i/4)*2.2
		model.position=Vector3(x,MMFDunes.height_at(x,z)-.04,z)
		model.material_override=life.brush_material if i<4 else life.stone_material
	var camera=Camera3D.new();game.add_child(camera);camera.fov=47;camera.make_current()
	var center=Vector3(-70,MMFDunes.height_at(-70,1)+.4,1)
	camera.position=center+Vector3(5,3.5,7);camera.look_at(center);camera.reset_physics_interpolation()
	for i in 8:await process_frame
	await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/desert-kit-native.png"))
	kit.queue_free()
	for chunk in game.world.chunks.values():chunk.show()
	# Inspect a naturally spawned near-road cluster, not just the staged kit.
	var near=[]
	for key in game.world.chunks:
		if key.y!=0 or absi(key.x)>1:continue
		var group=game.world.chunks[key].get_node("DesertGroundLife")
		for batch in group.get_children():
			if not batch.has_meta("ground_sites"):continue
			for entry in batch.get_meta("ground_sites"):
				if batch.name.begins_with("DryBrush"):near.append(group.global_position+entry[0].origin)
	near.sort_custom(func(a,b):return a.length_squared()<b.length_squared())
	if not near.is_empty():
		var at=near[0];camera.position=at+Vector3(4,2.3,4);camera.look_at(at+Vector3.UP*.4);camera.reset_physics_interpolation()
		for i in 8:await process_frame
		await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/desert-cluster-native.png"))
	game.session.scanner.phase="consumed";game.session.story.phase="locked"
	game.session.weather={"phase":"front","elapsed":12.0,"next":600.0,"intensity":1.0,"sequence":0}
	game.home.update_weather(0);game.world.update(0)
	camera.position=Vector3(-12,10,4);camera.look_at(Vector3(-34,1,-27));camera.reset_physics_interpolation()
	for i in 8:await process_frame
	await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/desert-full-storm.png"))
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	life=null;await create_timer(.1).timeout;MMFAssets.cache.clear();quit()
