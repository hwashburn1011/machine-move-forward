extends SceneTree
const Fixture=preload("res://tests/nomad_personalization_fixture.gd")
var game
var checks=0
var failures=[]
var events=[]
var source_start=""

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://nomad-personalization-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);push_error(label)

func frames(count: int=2):
	for i in count:await physics_frame

func placement_ready(spec: Dictionary,ignore_id: String="") -> Dictionary:
	var report=game.building.placement_report(spec,ignore_id)
	for i in 200:
		if not report.get("pending",false):break
		await frames(1);report=game.building.placement_report(spec,ignore_id)
	return report

func commit_ready() -> bool:
	# Synchronize fixture additions/undo transforms before the next real input.
	await frames();game.building.update(0)
	for i in 200:
		if not game.building.report.get("pending",false):break
		await frames(1);game.building.update(0)
	return game.building.commit_placement()

func undo_ready() -> Dictionary:
	var report=game.building.undo_status()
	for i in 240:
		if "Checking walking access" not in report.reason:break
		await frames(1);report=game.building.undo_status()
	return report

func snapshot() -> Dictionary:return game.session.native_snapshot().duplicate(true)

func run():
	source_start=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	var parts=Fixture.prepare(game);await frames()
	var s=game.session;var view=game.personalization
	s.transaction.connect(func(event,details):events.append({"event":event,"details":details.duplicate(true)}))
	check(MMFNomadPersonalization.valid(MMFNomadPersonalization.defaults()),"Old-save defaults are valid and unpainted")
	var legacy=snapshot();legacy.erase("customization");legacy.facts.erase("guardianOutcome")
	var old=MMFSession.new(game.data)
	check(old.restore_native(legacy) and old.customization==MMFNomadPersonalization.defaults(),"Existing saves without new keys restore original finishes and no invented receipts")
	for malformed in [null,[],{},true,{"format":1},"paint"]:check(not MMFNomadPersonalization.valid(malformed),"Malformed customization rejected: "+str(malformed))
	for key in ["restored","machinePaint","serviceMark","projects","format"]:
		var bad=MMFNomadPersonalization.defaults();bad[key]=null;check(not MMFNomadPersonalization.valid(bad),"Null field rejected: "+key)
	var bad=MMFNomadPersonalization.defaults();bad.extra=true;check(not MMFNomadPersonalization.valid(bad),"Unknown customization keys rejected")
	bad=MMFNomadPersonalization.defaults();bad.machinePaint.lockers="neon";check(not MMFNomadPersonalization.valid(bad),"Unbounded palette ID rejected")
	bad=MMFNomadPersonalization.defaults();bad.serviceMark="g01";check(not MMFNomadPersonalization.valid(bad,{"guardianOutcome":"evaded"}),"Unrestored tools cannot carry applied G01 mark")
	bad.restored=true;check(not MMFNomadPersonalization.valid(bad),"G01 mark requires durable guardian receipt")
	for outcome in ["destroyed","disarmed","evaded"]:check(MMFNomadPersonalization.valid(bad,{"guardianOutcome":outcome}),"Every legitimate guardian outcome permits G01: "+outcome)
	bad=MMFNomadPersonalization.defaults();bad.restored=true;bad.projects=["road-rest","road-rest"];check(not MMFNomadPersonalization.valid(bad),"Duplicate projects rejected")
	bad.projects=["missing-project"];check(not MMFNomadPersonalization.valid(bad),"Unknown projects rejected")
	check(not MMFNomadPersonalization.valid_piece({"definitionId":"floor","state":{"finish":"petrol"}}),"Structural floor is not paint eligible")
	check(not MMFNomadPersonalization.valid_piece({"definitionId":"nomad-field-chair","state":{"restoration":"first-route"}}),"Project receipt cannot migrate to wrong art definition")
	var catalog_count=game.data.BUILD_PIECE_ORDER.size();var item_count=game.data.ITEM_IDS.size()
	MMFNomadPersonalization.apply_data(game.data);MMFNomadPersonalization.apply_data(game.data)
	check(game.data.BUILD_PIECE_ORDER.size()==catalog_count and game.data.ITEM_IDS.size()==item_count,"Idempotent data application preserves all blueprints and item IDs")
	await materials()
	await restoration(parts)
	await painting(parts)
	await keepsakes(parts)
	await move_and_save(parts)
	await salvage_checks()
	await finish()

func materials():
	var view=game.personalization
	check(view.config.pieces.size()==51 and view.config.palette.size()==14 and view.config.zones.size()==2,"Exactly51 supported definitions,14 muted families,2 enamel zones")
	var stage=Node3D.new();root.add_child(stage)
	for id in view.config.pieces:
		var model=MMFArt100Decor.model(id) if MMFArt100Decor.PIECES.has(id) else MMFArt200Decor.model(id) if MMFArt200Decor.PIECES.has(id) else MMFAssets.scene("res://art/native-generator.glb")
		stage.add_child(model)
		var before=[]
		for mesh in MMFAssets.of_type(model,"MeshInstance3D"):
			for surface in mesh.mesh.get_surface_count():before.append({"mesh":mesh,"surface":surface,"material":mesh.get_active_material(surface),"mesh_resource":mesh.mesh})
		var bounds=MMFAssets.bounds(model)
		for color in MMFNomadPersonalization.PALETTE_IDS:
			var plan=MMFNomadFinishView.plan(model,view.config.pieces[id],view.config.palette,color)
			check(not plan.is_empty(),"Authored paint surface exists: "+id+" / "+color)
			MMFNomadFinishView.apply(plan)
			for row in before:
				var painted=row.mesh.get_active_material(row.surface)
				if view.config.pieces[id].has(row.material.resource_name):
					check(painted!=row.material and painted.albedo_texture==row.material.albedo_texture and painted.normal_texture==row.material.normal_texture and painted.roughness==row.material.roughness and painted.metallic==row.material.metallic,"Instance tint preserves authored texture/normal/roughness/metallic: "+id+" / "+color)
					check(is_finite(painted.albedo_color.r) and is_finite(painted.albedo_color.g) and is_finite(painted.albedo_color.b) and painted.albedo_color.r>=0 and painted.albedo_color.g>=0 and painted.albedo_color.b>=0,"Palette produces finite nonnegative modulation: "+id+" / "+color)
				else:check(painted==row.material,"Bare metal, lettering, indicators and other nonpigment batches unchanged: "+id+" / "+color)
			check(MMFAssets.bounds(model)==bounds,"Finish preserves geometry bounds: "+id+" / "+color)
		var once=MMFNomadFinishView.plan(model,view.config.pieces[id],view.config.palette,"petrol")
		MMFNomadFinishView.apply(once)
		var twice=MMFNomadFinishView.plan(model,view.config.pieces[id],view.config.palette,"petrol")
		for i in once.size():check(once[i].material.albedo_color==twice[i].material.albedo_color,"Repeated bind uses original base and never compounds tint: "+id)
		MMFNomadFinishView.apply(MMFNomadFinishView.plan(model,view.config.pieces[id],view.config.palette,"original"))
		for row in before:check(row.mesh.get_active_material(row.surface)==row.material and row.mesh.mesh==row.mesh_resource,"Original restores exact shared resource identity without mesh edit: "+id)
		model.free()
	stage.free()

func restoration(parts: Dictionary):
	var s=game.session;var view=game.personalization;var bench=parts.workbench
	Fixture.enter(game,bench);await frames()
	var before=snapshot();s.scanner.phase="awaiting-module"
	check(not view.restore_tools(bench.instanceId) and not s.customization.restored,"Tools wait for installed receiver")
	s.scanner.phase=before.scanner.phase
	var original_power=s.powered.get(bench.instanceId,true);s.powered[bench.instanceId]=false
	check(not view.restore_tools(bench.instanceId),"Unpowered workbench cannot restore tools");s.powered[bench.instanceId]=original_power
	game.player.position+=Vector3(5,0,0)
	check(not view.restore_tools(bench.instanceId),"Stale workbench callback rechecks actual reach")
	Fixture.enter(game,bench)
	s.attack_recent=1;check(not view.restore_tools(bench.instanceId),"Recent attack refuses restoration");s.attack_recent=0
	bench.health=0;check(not view.restore_tools(bench.instanceId),"Destroyed workbench refuses restoration");bench.health=game.data.BUILD_PIECES.workbench.maxHealth
	check(snapshot()==before,"Rejected tool restoration leaves all persistent state unchanged")
	var funds=s.count_resource("scrap");var parts_before=s.count_resource(MMFNomadPersonalization.PART)
	check(view.restore_tools(bench.instanceId),"Powered reachable workbench restores optional tools")
	check(s.customization.restored and s.count_resource("scrap")==funds-6 and s.count_resource(MMFNomadPersonalization.PART)==parts_before-3,"Tool restoration consumes exact recovered parts and scrap once")
	before=snapshot();check(not view.restore_tools(bench.instanceId) and snapshot()==before,"Repeated restoration cannot charge twice")
	await frames()

func painting(parts: Dictionary):
	var s=game.session;var view=game.personalization;var trolley=parts.trolley;var chair=parts.chair
	Fixture.enter(game,trolley);await frames()
	var before=snapshot();var saved_spec=view.config.pieces[chair.definitionId].duplicate(true)
	var first=game.building.bodies[chair.instanceId]
	var twin=MMFArt100Decor.model(chair.definitionId);root.add_child(twin)
	var twin_original=[]
	for mesh in MMFAssets.of_type(twin,"MeshInstance3D"):twin_original.append(mesh.get_active_material(0))
	check(view.preview(trolley.instanceId,chair.instanceId,"petrol") and snapshot()==before,"World preview changes no saved state or inventory")
	view.reset_preview();check(snapshot()==before and view.config.pieces[chair.definitionId]==saved_spec,"Cancel preview restores persisted finish and retains immutable material contract")
	var index=0
	for mesh in MMFAssets.of_type(twin,"MeshInstance3D"):check(mesh.get_active_material(0)==twin_original[index],"Preview does not alter another instance");index+=1
	twin.free()
	for color in ["neon","", "../../other"]:check(not view.paint_piece(trolley.instanceId,chair.instanceId,color),"Unknown finish cannot mutate/spend: "+color)
	check(not view.paint_piece(trolley.instanceId,"missing","petrol"),"Missing piece cannot be painted")
	check(not view.paint_piece(trolley.instanceId,parts.workbench.instanceId,"petrol"),"Unapproved structural/station material cannot be painted")
	check(not view.paint_machine(trolley.instanceId,"hull","petrol"),"Structural hull is not a paint zone")
	var old_page=game.ui.page;game.ui.page="Inventory";check(not view.paint_piece(trolley.instanceId,chair.instanceId,"petrol"),"Stale painter callbacks require physical console page");game.ui.page=old_page
	var old_id=game.ui.storage_id;game.ui.storage_id=parts.workbench.instanceId;check(not view.paint_piece(trolley.instanceId,chair.instanceId,"petrol"),"Painter callback binds exact station identity");game.ui.storage_id=old_id
	game.cinematic="test";check(not view.paint_piece(trolley.instanceId,chair.instanceId,"petrol"),"Cinematic paint refused");game.cinematic=""
	s.health=0;check(not view.paint_piece(trolley.instanceId,chair.instanceId,"petrol"),"Dead player cannot paint");s.health=before.health
	check(snapshot()==before,"All rejected paint callbacks are atomic")
	var bags=[]
	for bag in s.containers():bags.append({"bag":bag,"slots":bag.slots.duplicate(true),"revision":bag.mutation_revision});bag.remove("scrap",bag.count_item("scrap"))
	var broke=snapshot();check(not view.paint_piece(trolley.instanceId,chair.instanceId,"petrol") and snapshot()==broke,"Insufficient scrap cannot partially change finish or inventory")
	for bag in bags:bag.bag.slots=bag.slots;bag.bag.mutation_revision=bag.revision
	var funds=s.count_resource("scrap");var shape_count=MMFAssets.of_type(first,"CollisionShape3D").size()
	check(view.paint_piece(trolley.instanceId,chair.instanceId,"petrol"),"Real owned chair accepts paid muted finish")
	check(chair.state.finish=="petrol" and s.count_resource("scrap")==funds-2 and MMFAssets.of_type(first,"CollisionShape3D").size()==shape_count,"Paid finish changes state once and preserves collisions")
	before=snapshot();check(not view.paint_piece(trolley.instanceId,chair.instanceId,"petrol") and snapshot()==before,"Same finish is a zero-cost no-op")
	check(view.paint_piece(trolley.instanceId,chair.instanceId,"original") and s.count_resource("scrap")==funds-4,"Returning to original is an explicit paid repaint")
	for zone in MMFNomadPersonalization.ZONES:
		funds=s.count_resource("scrap");check(view.paint_machine(trolley.instanceId,zone,"denim"),"Named machine enamel accepts finish: "+zone)
		check(s.customization.machinePaint[zone]=="denim" and s.count_resource("scrap")==funds-2,"Zone paint spends once: "+zone)
		check(not view.paint_machine(trolley.instanceId,zone,"denim"),"Zone no-op does not charge: "+zone)
	before=snapshot();check(not view.set_service_mark(trolley.instanceId,"g01") and snapshot()==before,"G01 stencil cannot be forged before encounter receipt")
	s.facts.guardianOutcome="evaded"
	funds=s.count_resource("scrap");check(view.set_service_mark(trolley.instanceId,"g01") and s.count_resource("scrap")==funds,"Legitimate evasion allows free optional service mark")
	var anchor=MMFAssets.find_named(game.world.machine,"CargoLocker1");var mark=anchor.get_node_or_null("NomadServiceMark")
	check(mark!=null and mark.visible and mark.position==Vector3(0,.585,-.463),"Service stencil is attached to authored cargo enamel")
	check(view.set_service_mark(trolley.instanceId,"none") and not mark.visible,"Service mark can be removed freely")
	check(view.paint_piece(trolley.instanceId,parts.generator.instanceId,"slate"),"Starter generator has an independent paintable enamel batch")
	var generator_view=game.building.generator_visuals[parts.generator.instanceId]
	generator_view.update(0);check(generator_view.reserve.visible and not generator_view.running.visible and is_equal_approx(generator_view.needle.rotation.z,deg_to_rad(-110)),"Painted generator still animates reserve/run lamps and fuel needle")
	generator_view.update(100);check(not generator_view.reserve.visible and generator_view.running.visible and is_equal_approx(generator_view.needle.rotation.z,deg_to_rad(110)),"Painted generator restores dynamic full-fuel indicators")
	await frames()

func keepsakes(parts: Dictionary):
	var s=game.session;var view=game.personalization;var trolley=parts.trolley
	Fixture.enter(game,trolley)
	var before=snapshot();check(not view.restore_project(trolley.instanceId,"road-rest",parts.radio.instanceId) and snapshot()==before,"Project cannot bind to the wrong furnishing")
	for row in [["returning-signal","radio"],["first-route","board"],["road-rest","chair"]]:
		var project=row[0];var p=parts[row[1]];var funds=s.count_resource("scrap");var parts_before=s.count_resource(MMFNomadPersonalization.PART)
		check(view.restore_project(trolley.instanceId,project,p.instanceId),"Owned model becomes named cosmetic keepsake: "+project)
		check(p.state.restoration==project and p.state.finish==MMFNomadPersonalization.PROJECTS[project].finish and s.count_resource("scrap")==funds-4 and s.count_resource(MMFNomadPersonalization.PART)==parts_before-1,"Project charges exact refinishing cost and records durable receipt: "+project)
		before=snapshot();check(not view.restore_project(trolley.instanceId,project,p.instanceId) and snapshot()==before,"Project cannot repeat/refund/duplicate: "+project)
		await frames()
	before=snapshot();check(MMFNomadPersonalization.valid_session(s.customization,s.structures,s.facts),"Completed project state validates across all structures")
	var invalid=before.duplicate(true);invalid.customization.projects.erase("road-rest")
	check(not MMFNomadPersonalization.valid_session(invalid.customization,invalid.structures,invalid.facts),"Attached restoration requires global project receipt")
	invalid=before.duplicate(true);invalid.structures.append(parts.chair.duplicate(true))
	check(not MMFNomadPersonalization.valid_session(invalid.customization,invalid.structures,invalid.facts),"Two attached copies cannot claim one restoration")
	invalid=before.duplicate(true);invalid.customization=MMFNomadPersonalization.defaults()
	check(not MMFNomadPersonalization.valid_session(invalid.customization,invalid.structures,invalid.facts),"Painted pieces require completed tool restoration")
	var survivor_list=s.structures.filter(func(p):return p.instanceId!=parts.chair.instanceId)
	check(MMFNomadPersonalization.valid_session(s.customization,survivor_list,s.facts),"Dismantled keepsake may retain its durable completed project")
	var cloned=MMFSession.new(game.data);check(cloned.restore_native(before),"Full authoritative save accepts three restored keepsakes")
	check(cloned.customization==s.customization and cloned.find_piece(parts.chair.instanceId).state==parts.chair.state,"All finishes and receipts round-trip exactly")

func move_and_save(parts: Dictionary):
	var s=game.session;var b=game.building;var p=parts.chair;var view=game.personalization
	game.player.position=b.piece_transform(p).origin+Vector3(.9,.95,0)
	game.open_station("Equipment",p.definitionId,p.instanceId)
	var before=p.duplicate(true);var funds=s.count_resource("scrap")
	check(b.start_move(p.instanceId),"Painted keepsake enters existing safe relocation flow")
	b.cancel();check(p==before and s.count_resource("scrap")==funds,"Canceled relocation preserves finish, receipt and inventory")
	var target_cell={}
	for x in range(-4,5):
		for z in range(-4,5):
			var cell={"x":x,"y":0,"z":z}
			if cell==p.cell or b.center(cell).distance_to(game.player.position)>10:continue
			if (await placement_ready({"definitionId":"floor","cell":cell,"rotation":0})).get("valid",false):
				Fixture.add(game,"floor",cell);await frames()
			if (await placement_ready({"definitionId":p.definitionId,"cell":cell,"rotation":0},p.instanceId)).get("valid",false):target_cell=cell;break
		if not target_cell.is_empty():break
	check(not target_cell.is_empty(),"Real placement authority finds a supported clear destination for painted chair")
	if not target_cell.is_empty():
		game.player.camera.reparent(game,true);game.player.camera.position=b.center(target_cell)+Vector3.UP*6;game.player.camera.look_at(b.center(target_cell),Vector3.FORWARD);game.player.camera.reset_physics_interpolation()
		check(b.start_move(p.instanceId),"Painted chair begins committed relocation")
		b.manual_level=0;await frames()
		check(await commit_ready(),"Actual aim/support/collision commit moves painted chair: "+b.failure)
		check(p.cell==target_cell and p.state==before.state and s.count_resource("scrap")==funds,"Relocation moves same piece and preserves finish/keepsake without new payment")
		check(b.undo_status().reason=="Open construction to undo a build.","Finished move requires actual construction controls before undo")
		game.open_menu("Build")
		var undo=await undo_ready()
		check(undo.allowed and b.undo_last() and p==before and s.count_resource("scrap")==funds,"Real construction undo restores painted chair location without tint loss or extra refund")
		game.close_menu();b.choose("nomad-field-chair");b.manual_level=0
		check(await commit_ready(),"Ordinary paid chair placement creates an actual undo receipt")
		var purchased=s.structures.back();Fixture.enter(game,parts.trolley)
		check(view.paint_piece(parts.trolley.instanceId,purchased.instanceId,"olive"),"Newly paid chair can be personalized")
		game.player.position=b.piece_transform(purchased).origin+Vector3(1.1,.95,0);game.open_menu("Build")
		await undo_ready()
		var paid_state=snapshot()
		check(not b.undo_last() and preload("res://tests/wrist_receipt_contract.gd").same_campaign(paid_state,snapshot()),"Painting marks equipment used so placement undo cannot refund an already personalized part")
		check(s.polish.receipts.back().text=="Painted finish","Refused personalized-part refund records its exact local reason")
	var data=snapshot();var copy=MMFSession.new(game.data)
	check(copy.restore_native(data),"Native snapshot with paint and keepsakes passes actual save validation")
	var malformed=data.duplicate(true);malformed.structures.filter(func(piece):return piece.instanceId==p.instanceId)[0].state.finish="neon"
	var prior=copy.native_snapshot().duplicate(true);check(not copy.restore_native(malformed) and copy.native_snapshot()==prior,"Malformed finish rejects complete restore atomically")
	view.bind_machine(game.world.machine);b.rebuild();await frames()
	check(s.find_piece(p.instanceId).state==before.state,"Building rebuild preserves paint and restoration state")
	# Preview cancellation is wired through the actual menu boundary.
	Fixture.enter(game,parts.trolley);check(view.preview(parts.trolley.instanceId,p.instanceId,"denim"),"Saved keepake can be previewed after rebuild")
	game.close_menu();check(view.preview_root==null and p.state==before.state,"Closing actual menu clears transient world preview")

func salvage_checks():
	var s=MMFSession.new(game.data);var seed_before=s.rng.seed;var ordinary={"scrap":24,"fuel":3}
	var reward=MMFNomadPersonalization.salvage_reward(s,ordinary)
	check(reward.get(MMFNomadPersonalization.PART,0)==1 and ordinary=={"scrap":24,"fuel":3} and s.rng.seed==seed_before,"Recovered part adds without mutating cargo source or consuming RNG")
	s.inventory.add(MMFNomadPersonalization.PART,3)
	check(not MMFNomadPersonalization.salvage_reward(s,ordinary).has(MMFNomadPersonalization.PART),"Three owned parts cap further ordinary part awards")
	s.inventory.remove(MMFNomadPersonalization.PART,3);s.customization.restored=true
	check(MMFNomadPersonalization.salvage_reward(s,ordinary).has(MMFNomadPersonalization.PART),"Post-tool salvage supports unfinished keepsakes")
	s.customization.projects=MMFNomadPersonalization.PROJECTS.keys()
	check(not MMFNomadPersonalization.salvage_reward(s,ordinary).has(MMFNomadPersonalization.PART),"Finished optional projects stop spare-part awards")
	var actual=MMFSession.new(game.data);var control=MMFSession.new(game.data);control.customization.restored=true;control.customization.projects=MMFNomadPersonalization.PROJECTS.keys()
	for i in 20:
		var a=actual.salvage_reward();var b=control.salvage_reward();a.erase(MMFNomadPersonalization.PART)
		check(a==b and actual.rng.seed==control.rng.seed,"Actual salvage keeps existing RNG/content sequence at cargo "+str(i))
	var live=game.session;game.session=MMFSession.new(game.data)
	var c=game.salvage.crates[0];c.active=true;c.opened=false;c.contents={};c.claimed="parked";c.node.position=Vector3(-18,0,0)
	var full=MMFInventory.new(game.data.ITEMS,1);full.add("components",game.data.ITEMS.components.stackSize)
	check(not game.salvage.automation.transfer(c,full) and c.opened and c.contents.get(MMFNomadPersonalization.PART)==1,"Actual automatic cargo transfer retains recovered part when destination is full")
	var cargo=game.salvage.snapshot();var seed=game.session.rng.seed
	check(not game.salvage.automation.transfer(c,full) and game.session.rng.seed==seed and game.salvage.snapshot()==cargo,"Reopening full cargo cannot reroll or duplicate its part")
	game.salvage.restore(cargo)
	check(game.salvage.crates[0].opened and game.salvage.crates[0].contents.get(MMFNomadPersonalization.PART)==1,"Cargo snapshot/restore retains outstanding recovered part")
	var roomy=MMFInventory.new(game.data.ITEMS,20)
	check(game.salvage.automation.transfer(game.salvage.crates[0],roomy) and roomy.count_item(MMFNomadPersonalization.PART)==1 and game.session.rng.seed==seed,"Restored cargo transfers exactly one part without another reward roll")
	var heavy=game.salvage.crates[1];heavy.active=true;heavy.opened=true;heavy.heavy=true;heavy.contents={"scrap":4};heavy.claimed=""
	var parts_before=roomy.count_item(MMFNomadPersonalization.PART)
	check(game.salvage.automation.transfer(heavy,roomy) and roomy.count_item(MMFNomadPersonalization.PART)==parts_before,"Prefilled heavy cargo does not manufacture ordinary restoration parts")
	game.session=live

func finish():
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"transactions":events,"source_start":source_start,"source_end":MMFPlaytestRecorder.source_fingerprint(),"scope":"Stocked headless authority/save/real imported material fixtures; no claim of earned campaign completion or visual acceptance."}
	var file=FileAccess.open("res://../test-results/beta-next/personalization-test.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("NOMAD_PERSONALIZATION ",checks," checks; ",failures.size()," failures")
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)
