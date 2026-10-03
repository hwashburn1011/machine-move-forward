extends SceneTree

var game
var report={}
var output="res://../test-results/godot-native/"

class MeasuredCaretaker extends MMFCaretaker:
	var search_ms=[]
	var search_queries=[]
	var query_count=0
	var update_ms=[]
	func reachable(p: Dictionary) -> bool:
		query_count+=1
		return super.reachable(p)
	func choose_job() -> Dictionary:
		var start=Time.get_ticks_usec();var before=query_count
		var found=super.choose_job()
		search_ms.append((Time.get_ticks_usec()-start)/1000.0);search_queries.append(query_count-before)
		return found
	func update(dt: float):
		var start=Time.get_ticks_usec();super.update(dt);update_ms.append((Time.get_ticks_usec()-start)/1000.0)

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-construction-tests/";call_deferred("run")

func stats(values: Array) -> Dictionary:
	values.sort()
	return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"p99":values[int(values.size()*.99)],"max":values.back()}

func add_piece(kind: String,cell: Dictionary,rotation: int=0,edge: Dictionary={}):
	var candidate={"definitionId":kind,"cell":cell,"rotation":rotation}
	if not edge.is_empty():candidate.edge=edge
	var refusal=game.building.validate(candidate)
	if refusal!="":return false
	var piece=game.session.create_piece(kind,cell,rotation,edge,true)
	game.building.add_visual(piece)
	return true

func furnish():
	var kinds=["crate","workbench","refinery","generator","condenser","planter","chair","table","shelf"]
	var index=0
	for level in [0,-1,-2]:
		for z in [-6,-4,-2,0,2,4,6]:
			for x in [-5,-3,2,4,5]:
				var cell={"x":x,"y":level,"z":z}
				if not add_piece("floor",cell):continue
				if add_piece(kinds[index%kinds.size()],cell,index%4):index+=1
	# Keep the player's central lane and all built-in stair openings clear.
	game.combat.layout_changed()

func extend_deck():
	for side in [-1,1]:
		for x in range(6,12):
			for z in range(-6,7):
				var cell={"x":side*x,"y":0,"z":z}
				if not add_piece("floor",cell):continue
				if x==11:
					var edge={"x":side*x-(1 if side<0 else 0),"y":0,"z":z,"axis":"x"}
					add_piece("railing",cell,0,edge)
	game.combat.layout_changed()

func sample(label: String):
	await create_timer(3).timeout
	if game.caretaker is MeasuredCaretaker:
		game.caretaker.search_ms.clear();game.caretaker.search_queries.clear();game.caretaker.update_ms.clear();game.caretaker.query_count=0
	var values={"frameMs":[],"physicsMs":[],"processMs":[],"gpuMs":[],"renderCpuMs":[],"draws":[],"primitives":[]}
	var start=Time.get_ticks_usec();var previous=start
	var yaw_start=game.player.yaw
	while Time.get_ticks_usec()-start<8000000:
		var now=Time.get_ticks_usec()
		game.player.yaw=yaw_start-TAU*float(now-start)/8000000
		await process_frame
		now=Time.get_ticks_usec();values.frameMs.append((now-previous)/1000.0);previous=now
		values.physicsMs.append(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000)
		values.processMs.append(Performance.get_monitor(Performance.TIME_PROCESS)*1000)
		values.gpuMs.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
		values.renderCpuMs.append(RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid()))
		values.draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		values.primitives.append(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
	var result={"pieces":game.session.structures.size(),"objects":Performance.get_monitor(Performance.OBJECT_COUNT),"nodes":Performance.get_monitor(Performance.OBJECT_NODE_COUNT),"distance":game.session.distance,"samples":values.frameMs.size()}
	for key in values:result[key]=stats(values[key])
	if game.caretaker is MeasuredCaretaker:
		result.caretakerQueries=game.caretaker.query_count;result.caretakerUpdateMs=stats(game.caretaker.update_ms)
		if not game.caretaker.search_ms.is_empty():
			result.caretakerSearchMs=stats(game.caretaker.search_ms);result.caretakerSearchQueries=game.caretaker.search_queries.duplicate()
	report.scenarios[label]=result;print("CONSTRUCTION_PROFILE ",label," ",result)
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path(output+"construction-"+label+".png"))

func run():
	if DisplayServer.get_name()=="headless":push_error("Construction profile requires native rendering.");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	game.started=true;game.session.opening_done=true;game.session.facts.tutorialStarted=true;game.invulnerable=true;game.close_menu()
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	game.player.teleport(Vector3(0,16.1,5));game.player.pitch=-.12
	# Test-owned inventory avoids altering costs, definitions or personal saves.
	game.session.inventory.slots=[{"itemId":"scrap","count":100000},{"itemId":"components","count":100000}]
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report={"adapter":RenderingServer.get_video_adapter_name(),"resolution":str(root.size),"quality":"high / Forward+ / Vulkan / 4x MSAA","vsync":false,"sampleSeconds":8,"physicsHz":60,"seed":game.session.seed_name,"monitorNote":"physicsMs/processMs are periodically refreshed engine monitors, not independent per-frame CPU timings; frameMs and caretakerUpdateMs/searchMs are direct samples.","scenarios":{}}
	await sample("starter")
	furnish();await sample("furnished")
	extend_deck();await sample("expanded")
	game.session.caretaker.recovered=true;game.session.caretaker.mode="automation"
	var dock_cell={"x":1,"y":0,"z":5}
	add_piece("floor",dock_cell)
	if not add_piece("caretaker-dock",dock_cell):push_error("Caretaker fixture requires a supported powered dock");quit(1);return
	game.combat.layout_changed();await create_timer(2).timeout
	while game.combat.nav.is_baking():await create_timer(.05).timeout
	game.caretaker.free();game.caretaker=MeasuredCaretaker.new();game.add_child(game.caretaker);game.caretaker.setup(game)
	game.caretaker.process_mode=Node.PROCESS_MODE_PAUSABLE
	await sample("caretaker-idle")
	for piece in game.session.structures:
		if piece.definitionId in ["condenser","planter"]:piece.state.stored=1
	await sample("caretaker-work")
	var assets=[]
	for kind in game.data.BUILD_PIECE_ORDER:
		var model=MMFAssets.scene("runtime/"+kind+".glb");var meshes=MMFAssets.of_type(model,"MeshInstance3D");var surfaces=0;var triangles=0
		for mesh in meshes:
			surfaces+=mesh.mesh.get_surface_count()
			for i in mesh.mesh.get_surface_count():triangles+=mesh.mesh.surface_get_array_index_len(i)/3
		assets.append({"id":kind,"meshes":meshes.size(),"surfaces":surfaces,"triangles":triangles,"bounds":str(MMFAssets.bounds(model))});model.free()
	report.assets=assets
	var file=FileAccess.open(output+"construction-profile.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.05).timeout
	game.queue_free();await create_timer(.1).timeout;MMFAssets.cache.clear();call_deferred("quit")
