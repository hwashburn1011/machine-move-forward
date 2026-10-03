extends SceneTree
## Visual review of real imported assets in shipped desert lighting.
var game
var camera: Camera3D
var output="res://../test-results/art200/native/"
var captures=[]
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://art200-review/";call_deferred("run")
func shot(label: String,eye: Vector3,at: Vector3):
	camera.global_position=eye;camera.look_at(at);camera.reset_physics_interpolation();camera.make_current()
	for i in 20:await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+label+".png")
	captures.append({"id":label,"eye":str(eye),"target":str(at)})
	print("ART200_CAPTURE ",label)
func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	DisplayServer.window_set_size(Vector2i(1920,1080))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.save_settings()
	game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	game.started=true;game.session.opening_done=true;game.close_menu();game.ui.root.hide();game.player.hide()
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	camera=Camera3D.new();game.add_child(camera);camera.fov=60;camera.far=1200;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	game.session.seed_name="art200-native-review"
	for distance in [0.0,896.0,1856.0]:
		game.session.distance=distance;game.session.lateral=0;game.world.refresh_chunks(true);game.world.update(0)
		await shot("route-"+str(int(distance)),Vector3(-5,18.1,3),Vector3(-58,13,-64))
		var closest: MeshInstance3D;var nearest=INF
		for chunk in game.world.chunks.values():
			for part in chunk.get_children():
				if not part is MeshInstance3D or not MMFArt200Scenery.is_billboard(part.get_meta("landmark_kind","")):continue
				var bounds=part.global_transform*part.get_aabb();var center=bounds.get_center()
				if center.x>=-14 or center.x<-100:continue
				var metric=center.distance_to(Vector3(0,18,0))
				if metric<nearest:closest=part;nearest=metric
		if closest:
			var bounds=closest.global_transform*closest.get_aabb();var target=bounds.get_center();target.y=bounds.position.y+bounds.size.y*.8
			await shot("deck-sign-"+str(int(distance)),Vector3(-5,18.1,3),target)
	# Close review uses the same terrain placement, sun, fog and native materials.
	for chunk in game.world.chunks.values():chunk.hide()
	for id in ["wreck-pickup","transformer","art200-dustmile-motel-office","art200-ceramic-kiln","art200-billboard-morrow-motors","art200-billboard-open-road-retreads"]:
		var original=game.world.prototypes[id];var size=maxf(original.get_aabb().size.x,original.get_aabb().size.z)
		var builder=MMFSceneryChunk.new(game.world,Vector2i.ZERO)
		builder.landmark({"kind":id,"width":size,"x":-65.0,"z":-20.0,"yaw":.35,"tilt":0.0,"burial":.015})
		game.world.add_child(builder.root);var part=builder.root.get_child(0)
		var bounds=part.global_transform*part.get_aabb();var center=bounds.get_center();var span=maxf(bounds.size.y,size)
		await shot(id,center+Vector3(.85,.45,1.45)*span,center)
		builder.root.free();builder=null
	var file=FileAccess.open(output+"review.json",FileAccess.WRITE);file.store_string(JSON.stringify({"captures":captures,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"First six captures show actual streamed routes and deck-height views. Last six are staged close views using native terrain placement and shipped lighting/materials; simulation is paused."},"\t"));file.close()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFArt100Story.clear_cache();MMFArt200Story.clear_cache();MMFArt100RobotDetails.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit()
