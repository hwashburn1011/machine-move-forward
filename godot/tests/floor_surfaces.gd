extends SceneTree
var game
var checks=[]
var walks=[]
var compiled=false

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://floor-surface-tests/"
	compiled="--compiled" in OS.get_cmdline_user_args()
	if not compiled:set_meta("author_machine",true)
	call_deferred("run")

func check(ok: bool,label: String,details={}):
	checks.append({"passed":ok,"label":label,"details":details});print("PASS " if ok else "FAIL ",label," ",details)

func frames(count=2):
	for i in count:await physics_frame

func spec(x: int,y: int,z: int) -> Dictionary:return {"definitionId":"floor","cell":{"x":x,"y":y,"z":z},"rotation":0}

func install(value: Dictionary,free=true) -> Dictionary:
	var p=game.session.create_piece("floor",value.cell,0,{},free)
	if not p.is_empty():game.building.add_visual(p)
	return p

func report_ready(value: Dictionary) -> Dictionary:
	var result=game.building.placement_report(value)
	for i in 200:
		if not result.pending:break
		await frames(1);result=game.building.placement_report(value)
	return result

func undo_ready() -> bool:
	var status=game.building.undo_status()
	for i in 200:
		if not "Checking walking access" in status.reason:break
		await frames(1);status=game.building.undo_status()
	return game.building.undo_last() if status.allowed else false

func floor_hit(at: Vector3,exclude: Array[RID]=[]) -> Dictionary:
	return game.raycast(at+Vector3.UP*.18,at-Vector3.UP*.35,exclude)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.playtests.launch("first-steps");game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	game.session.inventory.add("scrap",100);game.session.inventory.add("components",30)
	await frames()
	for row in [[4,-2,0,"cap"],[4,-1,0,"cap"],[4,0,0,"cap"],[6,0,3,"edge"],[7,0,3,"slab"],[-1,-1,0,"slab"],[-6,-1,0,"slab"],[-1,-2,0,"cap"],[-7,-1,0,"cap"],[-1,-1,1,"edge"],[0,1,0,"slab"]]:
		var value=spec(row[0],row[1],row[2]);var kind=MMFFloorSurfaces.mode(value)
		check(kind==row[3],"Exact native footprint classification "+str(value.cell),kind)
		var parts=MMFMachineSpaces.piece_colliders(value,game.runtime);var low=parts[0].offset.y-parts[0].half.y;var top=parts[0].offset.y+parts[0].half.y
		check(is_equal_approx(top,0 if kind=="slab" else .012) and is_equal_approx(low,0 if kind=="cap" else -.16),"Physical floor thickness matches surface kind "+kind,{"top":top,"bottom":low})
		var model=game.building.model_for("floor");MMFFloorSurfaces.configure_model(model,value)
		var bound=MMFAssets.bounds(model)
		check(absf(bound.end.y-top)<.00001 and absf(bound.position.y-low)<.00001,"Imported geometry exactly seats on matching floor collision",{"visual_min":bound.position.y,"visual_max":bound.end.y})
		model.free()
	# Three real native deck levels retain their original support height.
	for level in [-2,-1,0]:
		var value=spec(4,level,0);var at=game.building.center(value.cell)
		var hit=floor_hit(at)
		check(not hit.is_empty() and absf(hit.position.y-at.y)<.001,"Permanent deck height is unchanged D"+str(level+3),hit.get("position"))
		var piece=install(value);await frames()
		var cap_hit=floor_hit(at)
		check(not cap_hit.is_empty() and cap_hit.collider.get_meta("piece_id","")==piece.instanceId and absf(cap_hit.position.y-at.y-.012)<.0001,"Cap is the single exposed constructed surface D"+str(level+3),cap_hit.get("position"))
		game.player.teleport(at+Vector3(0,.05,3.2));game.player.yaw=0;game.close_menu();game.player.set_physics_process(true)
		Input.action_press("forward")
		var min_y=INF;var max_y=-INF
		for i in 85:
			await frames(1);min_y=minf(min_y,game.player.position.y);max_y=maxf(max_y,game.player.position.y)
		Input.action_release("forward");game.player.set_physics_process(false)
		var result={"deck":level,"finish":MMFAssets.dict_v(game.player.position),"min_y":min_y,"max_y":max_y,"native_y":at.y}
		walks.append(result)
		check(game.player.position.z<at.z-2 and min_y>at.y-.025 and max_y<at.y+.09,"Actual player walks across seated cap and both edges D"+str(level+3),result)
	# A mixed edge tile cannot become a thin floating plate outside the hull.
	var edge=install(spec(6,0,0));var extension=install(spec(7,0,0));await frames()
	var edge_hit=floor_hit(Vector3(12.6,16.03,0));var extension_hit=floor_hit(Vector3(14,16.03,0))
	check(edge_hit.get("collider").get_meta("piece_id","")==edge.instanceId and absf(edge_hit.position.y-16.042)<.0001,"Partially supported tile retains raised structural surface outside native edge",edge_hit.get("position"))
	check(extension_hit.get("collider").get_meta("piece_id","")==extension.instanceId and absf(extension_hit.position.y-16.03)<.0001,"Fully external extension keeps original top height",extension_hit.get("position"))
	var underside=game.raycast(Vector3(12.6,15.60,0),Vector3(12.6,16.02,0))
	check(not underside.is_empty() and absf(underside.position.y-15.87)<.0001,"Partial edge keeps full original underside instead of hovering cap",underside.get("position"))
	game.world.set_dock_open(true);game.player.teleport(Vector3(10,16.08,0));game.player.yaw=-PI/2;game.player.set_physics_process(true)
	Input.action_press("forward");await frames(64);Input.action_release("forward");game.player.set_physics_process(false)
	check(game.player.position.x>14.4 and game.player.position.y>16,"Actual player crosses native-to-partial-to-external floor transitions",MMFAssets.dict_v(game.player.position))
	game.player.yaw=PI/2;game.player.set_physics_process(true);Input.action_press("forward");await frames(64);Input.action_release("forward");game.player.set_physics_process(false)
	check(game.player.position.x<10.7 and game.player.position.y>16,"Actual player returns over the 12 mm edge step",MMFAssets.dict_v(game.player.position))
	# An old saved plate keeps all stored data and physical support after reload.
	var legacy=game.session.structures.filter(func(p):return p.definitionId=="floor")[0]
	legacy.state={"legacyMarker":"unchanged"};legacy.health-=3
	var legacy_copy=legacy.duplicate(true);var snapshot=game.session.native_snapshot()
	game.load_payload(snapshot);game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false);await frames()
	check(game.session.find_piece(legacy.instanceId)==legacy_copy,"Legacy floor instance, cell, health and custom state survive load without migration")
	check(game.building.bodies[legacy.instanceId].get_meta("floor_surface","")=="cap","Legacy native-supported floor receives seated visual on load")
	# Paid floor transaction and safe undo use the same ordinary authority.
	var paid_spec=spec(4,-2,3);game.player.teleport(Vector3(5,8.89,6));game.close_menu();game.building.choose("floor")
	var placement=await report_ready(paid_spec)
	check(placement.valid,"A fresh native cap passes normal placement authority",placement.reason)
	var before=game.session.count_resource("scrap");var payment_before=game.building.history.capture_payment(game.data.BUILD_PIECES.floor.cost)
	var paid=install(paid_spec,false)
	check(not paid.is_empty() and game.session.count_resource("scrap")<before,"Fresh cap uses ordinary paid creation")
	game.building.history.record("place",paid,{},game.building.history.paid_since(payment_before));await frames()
	var undone=await undo_ready();await frames()
	check(undone and game.session.find_piece(paid.instanceId).is_empty() and game.session.count_resource("scrap")==before,"Safe cap undo removes only purchased plate and refunds its exact cost")
	var permanent=floor_hit(game.building.center(paid_spec.cell))
	check(not permanent.is_empty() and absf(permanent.position.y-8.83)<.001,"Undo exposes the original supported native deck without a gap")
	game.playtests.launch("workshop");game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	var guide=game.opportunities.survivor_site.workshop_guide;guide.show()
	check(guide.next.get("definitionId","")=="floor" and guide.ghost.get_meta("floor_surface","")=="cap" and absf(MMFAssets.bounds(guide.ghost).end.y-.012)<.00001,"Actual optional workshop guide seats its native floor ghost exactly like constructed plates")
	# Candidate cache must stay bounded while traversing arbitrary external cells.
	for x in 300:MMFFloorSurfaces.mode(spec(x,2,0))
	check(MMFFloorSurfaces.modes.size()<=128,"Cancelled floor preview classifications have bounded cache",MMFFloorSurfaces.modes.size())
	var failed=checks.filter(func(c):return not c.passed)
	var report={"checks":checks,"passed":failed.is_empty(),"failures":failed,"walks":walks,"compiled":compiled,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"Headless native physics and real imported floor geometry; actual held forward input on player across each deck cap. Fixture resources and saved payload are explicit; no human playtest claim."}
	var file=FileAccess.open("res://../test-results/roof-floor/floor-surfaces-"+("compiled" if compiled else "author")+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("FLOOR_SURFACES_COMPLETE ",checks.size()," checks, ",failed.size()," failures")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failed.is_empty() else 1)
