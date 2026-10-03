extends SceneTree

var game
var checks=[]
var base={}
var profiles=[]
var source_start=""

func _initialize():
	set_meta("test_mode",true)
	if "--compiled" not in OS.get_cmdline_user_args():set_meta("author_machine",true)
	MMFSaves.DIRECTORY="user://construction-spaces/";call_deferred("run")

func check(ok: bool,label: String,details={}):
	checks.append({"passed":ok,"label":label,"details":details});print("PASS " if ok else "FAIL ",label," ",details)

func frames(count: int=2):
	for i in count:await physics_frame

func reset_case():
	game.load_payload(base.duplicate(true));game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	game.session.expedition_gear.recovered=["salvage-crane","battery-bank","quiet-drive"]
	game.session.story.uniques.append("salvage-controller")
	game.session.inventory.add("scrap",200);game.session.inventory.add("components",80)
	await frames()

func spec(id: String,x: int,level: int,z: int,rotation: int=0) -> Dictionary:
	return {"definitionId":id,"cell":{"x":x,"y":level,"z":z},"rotation":rotation}

func wall(x: int,level: int,z: int,axis: String,id: String="wall") -> Dictionary:
	var value=spec(id,x,level,z);value.edge=value.cell.duplicate();value.edge.axis=axis;return value

func fixture(value: Dictionary) -> Dictionary:
	var p=game.session.create_piece(value.definitionId,value.cell,int(value.rotation),value.get("edge",{}),true)
	game.building.add_visual(p);return p

func timed(value: Dictionary,label: String) -> Dictionary:
	var b=game.building;var start=Time.get_ticks_usec();var report=b.placement_report(value)
	var maximum=(Time.get_ticks_usec()-start)/1000.0;var waits=0;var max_work=0.0
	while report.reason=="Checking walking access…" and waits<80:
		await frames(1);waits+=1;max_work=maxf(max_work,b.access.last_work_ms)
		start=Time.get_ticks_usec();report=b.placement_report(value);maximum=maxf(maximum,(Time.get_ticks_usec()-start)/1000.0)
	profiles.append({"label":label,"milliseconds":maximum,"wait_frames":waits,"max_budget_work_ms":max_work,"graph_builds":b.access.graph_builds,"candidate_builds":b.access.candidate_builds,"last_graph_ms":b.access.last_graph_ms,"last_candidate_ms":b.access.last_candidate_ms,"reason":report.reason})
	return report

func removal_report(id: String) -> Dictionary:
	var result=game.building.dismantle_preview(id);var waits=0
	while result.refusal=="Checking walking access…" and waits<180:
		await frames(1);waits+=1;result=game.building.dismantle_preview(id)
	return result

func run():
	source_start=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	if not game.has_method("new_game"):print("CONSTRUCTION_SPACES_STARTUP_ERROR");quit(2);return
	game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	base=game.playtests.payload("scanner")
	await reset_case()
	for level in [-2,-1,0]:
		game.player.position=Vector3(-6,MMFMachineSpaces.deck_y(level)+.06,-3)
		var value=spec("workbench",-3,level,-3)
		var report=await timed(value,"cold interior "+str(level))
		check(report.valid,"Workbench uses permanent deck without added plate at level "+str(level),report.reason)
		for i in 5:await timed(value,"warm same candidate "+str(level))
		for x in [-4,-2,0,1]:await timed(spec("workbench",x,level,-3),"changed candidate "+str(level))
	await reset_case()
	game.player.position=Vector3(-6,8.89,-6)
	for value in [wall(-4,-2,-3,"x"),wall(-3,-2,-3,"x"),wall(-3,-2,-4,"z")]:fixture(value)
	await frames()
	var closing=wall(-3,-2,-3,"z")
	var sealed=await timed(closing,"last exit wall")
	check(not sealed.valid and "exit" in sealed.reason,"Reject closing player's last exit",sealed.reason)
	var door=closing.duplicate(true);door.definitionId="doorway"
	var door_report=await timed(door,"door preserves exit")
	check(door_report.valid,"Permit a real doorway through the same enclosure",door_report.reason)
	fixture(door);await frames();game.player.yaw=PI;game.player.set_physics_process(true)
	Input.action_press("forward");await frames(45);Input.action_release("forward");game.player.set_physics_process(false)
	check(game.player.position.z> -4.65,"Native capsule physically walks through the permitted doorway",MMFAssets.dict_v(game.player.position))
	await reset_case()
	game.player.position=Vector3(0,8.89,6)
	for value in [wall(1,-2,3,"x"),wall(2,-2,3,"x"),wall(2,-2,2,"z")]:fixture(value)
	await frames()
	var essential=await timed(wall(2,-2,3,"z"),"seal service route")
	check(not essential.valid and ("walking" in essential.reason or "route" in essential.reason),"Reject sealing essential service access from outside",essential.reason)
	await reset_case()
	for id in MMFNativeProgression.MODULES:
		var bay=MMFMachineSpaces.bay_candidate(id);game.player.position=MMFMachineSpaces.bay_service(id)+Vector3.UP*.06
		var off=bay.duplicate(true);off.cell=off.cell.duplicate();off.cell.x+=1
		var stock=game.session.native_snapshot()
		check(game.session.create_piece(id,off.cell,int(off.rotation)).is_empty() and stock==game.session.native_snapshot(),"Paid authority refuses off-bay "+id+" without spending")
		var fitting=await timed(bay,"physical bay "+id)
		check(fitting.valid,"Agreed service bay physically accepts "+id,fitting.reason)
	await reset_case()
	game.player.position=Vector3(8,16.1,-11)
	var dock=spec("collector-auto",3,0,-6)
	var clear=await timed(dock,"clear drone pad")
	check(clear.valid,"Outdoor drone pad has empty and loaded flight clearance",clear.reason)
	var obstacle=MMFAssets.collider(game.world,{"position":{"x":6.80,"y":17.46,"z":-12},"half":{"x":.04,"y":.15,"z":.35}})
	await frames()
	check(not game.building.build_preview.solid_overlap(dock),"Overhang fixture clears empty dock hardware")
	var blocked=await timed(dock,"held load obstruction")
	check(not blocked.valid and "cargo" in blocked.reason,"Reject loaded landing obstruction despite clear dock hardware",blocked.reason)
	obstacle.queue_free();await frames()
	var installed=fixture(dock);await frames()
	var roof=spec("roof",3,0,-6)
	var roof_report=await timed(roof,"roof above dock")
	check(not roof_report.valid and "drone" in roof_report.reason.to_lower(),"New roof cannot block existing drone ascent",roof_report.reason)
	await reset_case()
	game.player.position=Vector3(-6,8.89,-3)
	var left=fixture(spec("workbench",-3,-2,-3));await frames()
	var right=await timed(spec("workbench",-2,-2,-3),"neighboring workbench")
	check(right.valid,"Multiple neighboring ordinary workbenches stay freely placeable",right.reason)
	var payload=game.session.native_snapshot();var id=left.instanceId
	game.load_payload(payload);game.set_physics_process(false);game.player.set_physics_process(false);await frames()
	check(game.session.find_piece(id)==left,"Existing free interior placement survives save/load untouched")
	await reset_case()
	fixture(wall(-3,0,-5,"z"))
	var stair=fixture(spec("stairs",-3,0,-3))
	fixture(spec("floor",-3,1,-5));var bridge=fixture(spec("floor",-2,1,-5));fixture(spec("floor",-1,1,-5))
	game.player.position=Vector3(-2,19.7,-10);await frames()
	check(not game.building.start_move(stair.instanceId),"Structural stairs cannot be picked up as movable furniture")
	var stair_report=await removal_report(stair.instanceId)
	check("safe return route" in stair_report.refusal,"Reject dismantling the only stair below an upper-platform player",stair_report.refusal)
	var bridge_report=await removal_report(bridge.instanceId)
	check("safe return route" in bridge_report.refusal,"Reject removing the walkway joining the player to that stair",bridge_report.refusal)
	var before_removal=game.session.native_snapshot()
	var removed=game.building.demolish(stair.instanceId);var after_removal=game.session.native_snapshot();var changed=[]
	for key in before_removal:
		if before_removal[key]!=after_removal[key]:changed.append(key)
	check(not removed and before_removal.structures==after_removal.structures and before_removal.inventory==after_removal.inventory and before_removal.stores==after_removal.stores,"Direct voluntary demolition rechecks route protection without refund or construction mutation",{"removed":removed,"changed":changed})
	game.player.position=Vector3(-8,16.1,-6)
	var safe=await removal_report(stair.instanceId)
	check(safe.refusal=="","Permit stair removal after the operator returns to the permanent deck",safe.refusal)
	await reset_case()
	var legacy=fixture(spec("quiet-drive",2,-2,1));game.player.position=Vector3(4,8.89,6);await frames()
	var original=legacy.duplicate(true)
	check(game.building.start_move(legacy.instanceId),"A grandfathered major module can begin relocation")
	var bay_spec=MMFMachineSpaces.bay_candidate("quiet-drive")
	var move_report=game.building.placement_report(bay_spec,legacy.instanceId);var waits=0
	while move_report.get("pending",false) and waits<80:
		await frames(1);waits+=1;move_report=game.building.placement_report(bay_spec,legacy.instanceId)
	check(move_report.valid and game.building.commit_placement(),"Major relocation commits at its guided connection",move_report.reason)
	game.building.choose("quiet-drive")
	game.open_menu("Build")
	var undo_button=game.terminal_pages.catalog_undo_button
	check(is_instance_valid(undo_button) and undo_button.disabled and "Checking walking access" in undo_button.tooltip_text,"Build catalogue initially shows queued safe-undo check")
	game.set_physics_process(true);waits=0
	while is_instance_valid(undo_button) and undo_button.disabled and waits<100:
		await frames(1);waits+=1
	game.set_physics_process(false)
	check(is_instance_valid(undo_button) and not undo_button.disabled and undo_button==game.terminal_pages.catalog_undo_button,"Native catalogue enables the same Undo button after async access finishes",{"wait_frames":waits})
	game.close_menu()
	var undo=game.building.undo_status();waits=0
	while "Checking walking access" in undo.reason and waits<80:
		await frames(1);waits+=1;undo=game.building.undo_status()
	check(undo.allowed and game.building.undo_last(),"Safe immediate undo may return to its grandfathered position",undo.reason)
	check(game.session.find_piece(legacy.instanceId)==original,"Grandfathered return restores only original placement without changing its state")
	await crane_placement_case()
	await cache_cancellation_case()
	await finish()

func cache_cancellation_case():
	await reset_case();game.close_menu()
	var pieces=[]
	for i in 20:pieces.append(fixture(spec("crate",-4+i%5,-2,-4+int(i/5))))
	await frames()
	var b=game.building;var stable_revision=b.layout_revision
	var baseline=b.access.graph(-2)
	while baseline.get("pending",false):await frames(1);baseline=b.access.graph(-2)
	var started=true;var cleared=true;var max_graphs=0;var max_queued=0;var max_work=0.0
	for i in pieces.size():
		var p=pieces[i];game.player.position=b.center(p.cell)+Vector3(0,.06,2)
		started=started and b.start_move(p.instanceId)
		var graph=b.access.graph(-2,p.instanceId)
		await frames(1);max_work=maxf(max_work,b.access.last_work_ms)
		if i%2:
			while graph.get("pending",false):
				await frames(1);max_work=maxf(max_work,b.access.last_work_ms);graph=b.access.graph(-2,p.instanceId)
		max_graphs=maxi(max_graphs,b.access.graphs.size());max_queued=maxi(max_queued,b.access.queued.size())
		b.cancel()
		cleared=cleared and b.access.ignored_contexts.is_empty() and b.access.pending.is_empty() and b.access.queued.is_empty() and b.access.graphs.size()==1
	check(started and cleared and b.layout_revision==stable_revision,"Twenty real begin/cancel moves discard both completed and queued ignored-piece graphs without a layout change",{"max_graphs":max_graphs,"max_queued":max_queued,"max_budget_work_ms":max_work})
	var bounded=true
	# Independent safe-undo/dismantle probes may not have a move-selection owner.
	# Exercise the fallback LRU as well, with five deck graphs per ignored set.
	for p in pieces:
		for level in range(-2,3):b.access.graph(level,p.instanceId)
		bounded=bounded and b.access.ignored_contexts.size()<=2 and b.access.graphs.size()+b.access.queued.size()<=15 and b.access.pending.size()==b.access.queued.size()
	check(bounded and b.access.graphs.has("-2:"),"Adversarial probes retain at most two ignored sets plus reusable base graphs",{"graphs":b.access.graphs.size(),"queued":b.access.queued.size(),"contexts":b.access.ignored_contexts.size()})
	b.access.invalidate()

func crane_placement_case():
	await reset_case();game.close_menu()
	var b=game.building;var bay_spec=MMFMachineSpaces.bay_candidate("salvage-crane")
	game.player.position=MMFMachineSpaces.bay_service("salvage-crane")+Vector3.UP*.06
	var old=fixture(spec("salvage-crane",3,0,-2));var original=old.duplicate(true);await frames()
	var original_colliders=MMFAssets.of_type(b.bodies[old.instanceId],"CollisionObject3D").size()
	check(MMFAssets.find_named(b.bodies[old.instanceId],"FoldedGuide").visible and not MMFAssets.find_named(b.bodies[old.instanceId],"ExtendedJib").visible,"Loaded off-bay crane uses folded authored geometry")
	b.choose("salvage-crane");b.moving=old.instanceId
	var report=b.placement_report(bay_spec,old.instanceId)
	for i in 180:
		if not report.get("pending",false):break
		await frames(1);report=b.placement_report(bay_spec,old.instanceId)
	check(report.valid and b.commit_placement(),"Legacy crane safely relocates to the extended D3 connection",report.reason)
	await frames()
	check(MMFAssets.of_type(b.bodies[old.instanceId],"CollisionObject3D").size()==original_colliders+2,"D3 relocation rebuilds actual physics with the two connected jib boxes")
	check(not MMFAssets.find_named(b.bodies[old.instanceId],"FoldedGuide").visible and MMFAssets.find_named(b.bodies[old.instanceId],"ExtendedJib").visible,"Connected D3 instance displays its extended authored jib")
	fixture(spec("floor",6,0,-2));await frames()
	var roof=await timed(spec("roof",6,0,-2),"crane held-cargo reservation")
	check(not roof.valid and "crane" in roof.reason.to_lower(),"Neighboring roof cannot block D3 held-cargo landing space",roof.reason)
	game.player.position=Vector3(4,16.10,-4)
	b.choose("salvage-crane");var undo=b.undo_status()
	for i in 180:
		if "Checking walking access" not in undo.reason:break
		await frames(1);undo=b.undo_status()
	check(undo.allowed and b.undo_last(),"Safe D3 move undo restores grandfathered folded crane",undo.reason)
	await frames()
	check(game.session.find_piece(old.instanceId)==original and MMFAssets.of_type(b.bodies[old.instanceId],"CollisionObject3D").size()==original_colliders,"Crane undo restores exact placement/state and legacy collider footprint")
	check(MMFAssets.find_named(b.bodies[old.instanceId],"FoldedGuide").visible and not MMFAssets.find_named(b.bodies[old.instanceId],"ExtendedJib").visible,"Safe crane undo restores folded authored geometry")
	await reset_case();game.close_menu()
	game.player.position=MMFMachineSpaces.bay_service("salvage-crane")+Vector3.UP*.06
	old=fixture(spec("salvage-crane",4,0,-2));await frames()
	b.choose("salvage-crane");b.moving=old.instanceId;report=b.placement_report(bay_spec,old.instanceId)
	for i in 180:
		if not report.get("pending",false):break
		await frames(1);report=b.placement_report(bay_spec,old.instanceId)
	var moved=report.valid and b.commit_placement();await frames()
	game.player.position=Vector3(4,16.10,-4);b.choose("salvage-crane");undo=b.undo_status()
	for i in 180:
		if "Checking walking access" not in undo.reason:break
		await frames(1);undo=b.undo_status()
	check(moved and not undo.allowed and "walking route" in undo.reason,"Grandfathered return cannot reseal newly cleared essential service access",undo.reason)

func finish():
	var passed=checks.all(func(c):return c.passed)
	var report={"passed":passed,"checks":checks,"profiles":profiles,"source_hash":source_start,"source_hash_end":MMFPlaytestRecorder.source_fingerprint(),"scope":"Synthetic native construction physics/access regression, not human play or earned progression"}
	var f=FileAccess.open("res://../test-results/deck-audio/construction-spaces.json",FileAccess.WRITE);f.store_string(JSON.stringify(report,"  "));f.close()
	print("CONSTRUCTION_SPACES_RESULT ",passed," ",checks.size())
	var deadline=Time.get_ticks_msec()+10000
	while game.combat.nav.is_baking() and Time.get_ticks_msec()<deadline:await process_frame
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if passed else 1)
