extends SceneTree

var game
var output="res://../test-results/godot-native/"
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-wasteland-review/";call_deferred("run")
func capture(label: String):
	for i in 10:await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path(output+label+".png"))

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1600,900))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.player.visual.hide();game.ui.root.hide()
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	var camera=Camera3D.new();game.add_child(camera);camera.fov=50;camera.far=1200;camera.make_current()
	camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	# Inspect each imported mesh using the actual runtime scaling/grounding path
	# and native world lighting. The showcase is a review, not an expedition.
	for chunk in game.world.chunks.values():chunk.hide()
	for spec in MMFDesertLayout.WASTELAND:
		var builder=MMFSceneryChunk.new(game.world,Vector2i.ZERO)
		builder.landmark({"kind":spec[0],"width":spec[1],"x":-65.0,"z":-20.0,"yaw":.35,"tilt":0.0,"burial":.025})
		game.world.add_child(builder.root)
		var part=builder.root.get_child(0);var bounds=part.global_transform*part.get_aabb();var center=bounds.get_center()
		camera.position=center+Vector3(.9,.65,1.15)*float(spec[1]);camera.look_at(center);camera.reset_physics_interpolation()
		await capture(spec[0]+"-native")
		builder.root.free();builder=null
	# Repeatable views from aboard the machine along the naturally generated route.
	game.session.seed_name="wasteland-review"
	for distance in [0.0,896.0,1856.0]:
		game.session.distance=distance;game.session.lateral=0
		game.world.refresh_chunks(true);game.world.update(0)
		camera.position=Vector3(-9,18,8);camera.look_at(Vector3(-55,1,-70));camera.reset_physics_interpolation()
		await capture("wasteland-route-"+str(int(distance)))
		print("WASTELAND_REVIEW route ",distance)
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit()
