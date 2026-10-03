extends SceneTree
## Repeatable in-engine art and streaming review. Renders shipped materials.
var game
var camera: Camera3D
var output="res://../test-results/art100/"

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://art100-review/";call_deferred("run")
func shot(label: String,eye: Vector3,at: Vector3):
	camera.position=eye;camera.look_at(at);camera.reset_physics_interpolation();camera.make_current()
	for i in 12:await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path(output+label+".png"))
	print("ART100_CAPTURE ",label)

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1600,1000))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	game.started=true;game.session.opening_done=true;game.close_menu();game.ui.root.hide();game.player.hide()
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	camera=Camera3D.new();game.add_child(camera);camera.fov=48;camera.far=1200;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	for chunk in game.world.chunks.values():chunk.hide()
	for spec in [["wreck-pickup",5.6],["transformer",3.1],["wasteland-container-shelter",6.3],["wasteland-diner",13],["wasteland-survey-rover",3.9],["wasteland-crawler-wreck",5]]:
		var builder=MMFSceneryChunk.new(game.world,Vector2i.ZERO)
		builder.landmark({"kind":spec[0],"width":spec[1],"x":-65.0,"z":-20.0,"yaw":.35,"tilt":0.0,"burial":.025})
		game.world.add_child(builder.root)
		var part=builder.root.get_child(0);var bounds=part.global_transform*part.get_aabb();var center=bounds.get_center()
		await shot("native-"+spec[0],center+Vector3(.92,.67,1.18)*float(spec[1]),center)
		builder.root.free();builder=null
	# Group of real build pieces on supported starter deck cells. These use the
	# normal visual/collider construction path and leave the cockpit access open.
	# Review-only supplies and viewpoint; the shipped starting inventory stays
	# unchanged. Every assembly still passes the normal placement report.
	game.session.inventory.slots.fill(null)
	game.session.inventory.add("scrap",300);game.session.inventory.add("components",40)
	game.player.position=Vector3(0,16.1,8)
	for i in 2:await physics_frame
	var chosen=[];var furnishing_ids=[];var furnishing_bounds=AABB();var candidate_cells=[]
	for z in [5,6]:
		for x in range(-4,5):candidate_cells.append({"x":x,"y":0,"z":z})
	for id in ["nomad-field-chair","nomad-chart-desk","nomad-tool-drawers","nomad-expedition-trunk","nomad-memory-board","nomad-machinist-lamp"]:
		for cell in candidate_cells:
			if cell in chosen:continue
			if not game.building.floor_at(cell):
				var floor_spec={"definitionId":"floor","cell":cell,"rotation":0}
				if not game.building.placement_report(floor_spec).valid:continue
				var floor_piece=game.session.create_piece("floor",cell,0,{},true);game.building.add_visual(floor_piece)
				for i in 2:await physics_frame
			var spec={"definitionId":id,"cell":cell,"rotation":0}
			if not game.building.placement_report(spec).valid:continue
			var piece=game.session.create_piece(id,cell,0,{},true);game.building.add_visual(piece)
			for i in 2:await physics_frame
			var model=game.building.bodies[piece.instanceId];var bounds=model.global_transform*MMFAssets.bounds(model)
			furnishing_bounds=bounds if chosen.is_empty() else furnishing_bounds.merge(bounds)
			chosen.append(cell);furnishing_ids.append(id);break
	var target=furnishing_bounds.get_center();var span=maxf(6,furnishing_bounds.size.x)
	await shot("native-machine-furnishings",target+Vector3(.25,.62,.86)*span,target)
	game.session.seed_name="art100-native-review"
	var report={"furnishingsPlaced":chosen.size(),"furnishingIds":furnishing_ids,"furnishingCells":chosen,"routes":[],"device":RenderingServer.get_video_adapter_name(),"resolution":[1600,1000],"scope":"Static staged camera; wall time frame intervals after route rebuild warmup, not a full gameplay performance benchmark."}
	for distance in [0.0,896.0,1856.0]:
		game.session.distance=distance;game.session.lateral=0;game.world.refresh_chunks(true);game.world.update(0)
		await shot("native-route-"+str(int(distance)),Vector3(-9,18,8),Vector3(-55,1,-70))
		# The TIME_PROCESS monitor retains the expensive synchronous chunk
		# rebuild sample. Measure actual successive rendered-frame intervals.
		for i in 60:await process_frame
		var samples=[];var calls=[];var primitives=[];var prior=Time.get_ticks_usec()
		for i in 120:
			await process_frame
			var now=Time.get_ticks_usec();samples.append((now-prior)/1000.0);prior=now
			calls.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
			primitives.append(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
		samples.sort();calls.sort();primitives.sort()
		report.routes.append({"distance":distance,"frameMedianMs":samples[60],"frameP95Ms":samples[114],"drawCallsMedian":calls[60],"renderedPrimitivesMedian":primitives[60],"chunks":game.world.chunks.size()})
	var file=FileAccess.open(output+"native-review.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt100Story.clear_cache();MMFArt100RobotDetails.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	print("ART100_REVIEW_COMPLETE ",JSON.stringify(report));quit()
