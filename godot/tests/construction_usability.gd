extends SceneTree

var game
var checks=0
var failures=[]
var base={}
var source_hash_start=""
var results="res://../docs/godot-port/results/construction-usability-2026-09-28.json"

func _initialize():
	if "--art100-report" in OS.get_cmdline_user_args():results="res://../docs/godot-port/results/art100-construction-2026-10-01.json"
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-construction-usability/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count: int=2):
	for i in count:await physics_frame

func ready_report(spec: Dictionary,ignore_id: String="") -> Dictionary:
	var report=game.building.placement_report(spec,ignore_id)
	for i in 200:
		if not report.get("pending",false):break
		await frames(1);report=game.building.placement_report(spec,ignore_id)
	return report

func undo_ready() -> Dictionary:
	var status=game.building.undo_status()
	for i in 240:
		if "Checking walking access" not in status.reason:break
		await frames(1);status=game.building.undo_status()
	return status

func undo_last_ready() -> bool:
	await undo_ready()
	return game.building.undo_last()

func commit_ready() -> bool:
	await frames()
	game.building.update(0)
	for i in 200:
		if not game.building.report.get("pending",false):break
		await frames(1);game.building.update(0)
	return game.building.commit_placement()

func unchanged(before: Dictionary) -> bool:
	return preload("res://tests/wrist_receipt_contract.gd").same_campaign(before,game.session.native_snapshot())

func key(action: String,echo: bool=false):
	var event=InputEventKey.new()
	event.physical_keycode=int(game.settings.bindings.get(action,game.key_defaults[action]));event.keycode=event.physical_keycode
	event.pressed=true;event.echo=echo;Input.parse_input_event(event);await frames()
	event=event.duplicate();event.pressed=false;event.echo=false;Input.parse_input_event(event);await frames()

func reset_case():
	game.load_payload(base.duplicate(true))
	game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	game.player.camera.reparent(game,true)
	game.player.position=Vector3(0,16.1,-1)
	game.session.attack_recent=0
	await frames()

func aim(spec: Dictionary):
	var at=game.building.center(spec.cell)
	if spec.has("edge"):at+=(Vector3.RIGHT if spec.edge.axis=="x" else Vector3.BACK)*.98
	game.player.camera.global_position=at+Vector3.UP*6
	game.player.camera.look_at(at,Vector3.FORWARD)
	game.player.camera.reset_physics_interpolation()

func find_cell() -> Dictionary:
	for x in range(-4,5):
		for z in range(-4,5):
			var spec={"definitionId":"floor","cell":{"x":x,"y":0,"z":z},"rotation":0}
			if game.building.center(spec.cell).distance_to(game.player.position)<3:continue
			if game.building.placement_report(spec).get("valid",false):return spec.cell
	return {"x":-3,"y":0,"z":-3}

func find_furnishing_cell(id: String) -> Dictionary:
	for x in range(-4,5):
		for z in range(-4,5):
			var cell={"x":x,"y":0,"z":z}
			if game.building.center(cell).distance_to(game.player.position)<3:continue
			if not game.building.placement_report({"definitionId":"floor","cell":cell,"rotation":0}).get("valid",false):continue
			if not game.building.build_preview.solid_overlap({"definitionId":id,"cell":cell,"rotation":0}):return cell
	return {}

func paid(id: String,cell: Dictionary,turn: int=0) -> Dictionary:
	# Let fixture additions and queued undo removals synchronize with physics,
	# as they do before the player's next input frame.
	await frames()
	var b=game.building
	game.close_menu();b.choose(id);b.manual_level=int(cell.y);b.rotation_index=turn
	var spec={"definitionId":id,"cell":cell,"rotation":turn}
	aim(spec)
	var ok=await commit_ready()
	check(ok,"Ordinary paid placement: "+id+str(cell)+" "+b.failure)
	return game.session.structures.back() if ok else {}

func fixture(id: String,cell: Dictionary,turn: int=0) -> Dictionary:
	var p=game.session.create_piece(id,cell,turn,{},true)
	game.building.add_visual(p)
	return p

func run():
	source_hash_start=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	base=game.playtests.payload("scanner")
	await reset_case()
	var b=game.building
	check(b.history.entries.is_empty(),"Free campaign/checkpoint setup creates no undo receipts")
	var original=game.session.count_resource("scrap")
	var floor_piece=await paid("floor",find_cell())
	if floor_piece.is_empty():await finish();return
	var paid_cost=int(game.data.BUILD_PIECES.floor.cost.scrap)
	check(game.session.count_resource("scrap")==original-paid_cost and b.history.entries.size()==1,"One placement records exactly one paid transaction")
	var next_id=game.session.next_piece_id
	game.data.BUILD_PIECES.floor.cost.scrap=paid_cost+99
	check((await undo_ready()).allowed and await undo_last_ready(),"Untouched recent part can be undone")
	check(game.session.count_resource("scrap")==original and game.session.find_piece(floor_piece.instanceId).is_empty(),"Refund uses actual payment, not changed blueprint price")
	game.data.BUILD_PIECES.floor.cost.scrap=paid_cost
	check(game.session.next_piece_id==next_id and not await undo_last_ready(),"Undo never reuses IDs or refunds a consumed receipt twice")
	check(not game.session.native_snapshot().has("constructionHistory"),"Ephemeral history is absent from native saves")

	# The authored furnishings are explicitly cosmetic, so the ordinary paid
	# construction path must create a reversible receipt, including compound
	# physics bodies. This exercises the new passive-ID registration end to end.
	await reset_case()
	var occupied_cell=find_furnishing_cell("nomad-memory-board")
	check(not occupied_cell.is_empty(),"Physical clearance finds a supported clear furnishing footprint")
	if occupied_cell.is_empty():await finish();return
	fixture("floor",occupied_cell);fixture("generator",occupied_cell)
	await frames()
	var blocked_board={"definitionId":"nomad-memory-board","cell":occupied_cell,"rotation":0}
	check(b.placement_report(blocked_board).reason=="Something solid is in the way","Memory board cannot share a generator's solid volume across station/decor categories")
	b.choose("nomad-memory-board");b.manual_level=0;aim(blocked_board)
	var before_refusal=game.session.native_snapshot()
	check(not await commit_ready() and unchanged(before_refusal),"Blocked furnishing commit cannot spend materials or create an intersecting piece")
	var movable_cell=find_furnishing_cell("nomad-memory-board")
	check(not movable_cell.is_empty(),"Relocation fixture starts at a separate clear footprint")
	if movable_cell.is_empty():await finish();return
	fixture("floor",movable_cell)
	var movable=fixture("nomad-memory-board",movable_cell)
	await frames()
	b.choose("nomad-memory-board");b.moving=movable.instanceId;b.manual_level=0;aim(blocked_board)
	var before_move=game.session.native_snapshot()
	var before_transform=b.bodies[movable.instanceId].transform
	check(not await commit_ready() and unchanged(before_move) and b.bodies[movable.instanceId].transform==before_transform,"Moving a furnishing into generator collision is refused without moving or spending")

	await reset_case()
	var decor_cell=find_furnishing_cell("nomad-tool-drawers")
	check(not decor_cell.is_empty(),"Paid furnishing fixture has actual solid clearance")
	if decor_cell.is_empty():await finish();return
	fixture("floor",decor_cell)
	await frames()
	game.session.inventory.add("scrap",18);game.session.inventory.add("components",1)
	var decor_before={"scrap":game.session.count_resource("scrap"),"components":game.session.count_resource("components")}
	var decor=await paid("nomad-tool-drawers",decor_cell)
	if decor.is_empty():await finish();return
	var decor_body=b.bodies[decor.instanceId]
	await frames()
	check((await ready_report(decor,decor.instanceId)).valid,"Moving furnishing ignores only its own compound bodies and supporting floor")
	check(b.placement_report({"definitionId":"generator","cell":decor_cell,"rotation":0}).reason=="Something solid is in the way","Legacy generator cannot be placed through an existing authored furnishing")
	check(game.session.count_resource("scrap")==decor_before.scrap-18 and game.session.count_resource("components")==decor_before.components-1,"Authored furnishing records the exact 18 scrap and 1 component paid cost")
	check(b.history.entries.size()==1 and b.history.entries.back().definition_id=="nomad-tool-drawers","Cosmetic furnishing receives one ordinary construction receipt")
	check((await undo_ready()).allowed and await undo_last_ready(),"New cosmetic furnishing uses safe recent-construction undo")
	await frames()
	check(game.session.count_resource("scrap")==decor_before.scrap and game.session.count_resource("components")==decor_before.components,"Furnishing undo refunds both actual paid materials exactly")
	check(game.session.find_piece(decor.instanceId).is_empty() and not b.bodies.has(decor.instanceId) and not is_instance_valid(decor_body),"Furnishing undo removes its saved instance, render root and compound physics bodies")
	check(not await undo_last_ready() and game.session.count_resource("scrap")==decor_before.scrap and game.session.count_resource("components")==decor_before.components,"Consumed furnishing receipt cannot produce a second refund")

	await reset_case()
	var open_cell=find_furnishing_cell("nomad-chart-desk")
	check(not open_cell.is_empty(),"Open furniture fixture has clear initial geometry")
	if open_cell.is_empty():await finish();return
	fixture("floor",open_cell)
	var open_spec={"definitionId":"nomad-chart-desk","cell":open_cell,"rotation":0}
	var probe=MMFAssets.box(game,Vector3(.10,.18,.10),b.center(open_cell)+Vector3(0,.30,0))
	await frames()
	check((await ready_report(open_spec)).valid,"Compound clearance preserves table kneespace around a real layer-one solid")
	probe.position=b.center(open_cell)+Vector3(.56,.30,.31)
	await frames()
	check((await ready_report(open_spec)).reason=="Something solid is in the way","Fixed layer-one solid at a table leg blocks the furnishing")
	probe.position=b.center(open_cell)+Vector3(.56,-.01,.31)
	await frames()
	check((await ready_report(open_spec)).valid,"Only the bottom ten-centimetre contact band is tolerated")
	probe.free()

	await reset_case()
	floor_piece=await paid("floor",find_cell())
	game.session.inventory.slots.fill(null)
	for i in game.session.inventory.slots.size():game.session.inventory.slots[i]={"itemId":"fuel","count":game.data.ITEMS.fuel.stackSize}
	var full=game.session.native_snapshot()
	check(not await undo_last_ready() and unchanged(full),"Full bags reject full refund atomically without removing the part")
	check(game.session.polish.receipts.back().text=="Free storage for the full construction refund.","Rejected refund records the exact local explanation")
	game.session.inventory.slots[0]=null
	check(await undo_last_ready(),"A transient refund-capacity refusal can be retried after freeing storage")

	await reset_case()
	var store_cell=find_cell();fixture("floor",store_cell)
	var source=fixture("crate",store_cell)
	var bag=game.session.stores[source.instanceId]
	game.session.inventory.slots.fill(null);game.session.inventory.add("scrap",4);game.session.inventory.add("components",1)
	bag.add("scrap",11);bag.add("components",1)
	var target_cell=find_cell();fixture("floor",target_cell)
	var crate=await paid("crate",target_cell)
	if crate.is_empty():await finish();return
	check(b.history.entries.back().sources.size()==2 and b.history.entries.back().paid=={"scrap":15,"components":2},"Receipt records exact deductions across pack and store")
	check(await undo_last_ready() and game.session.count_resource("scrap")==15 and game.session.count_resource("components")==2,"Atomic undo refunds the complete split payment")
	game.session.inventory.add("scrap",120);game.session.inventory.add("components",12)
	crate=await paid("crate",target_cell)
	var moved_bag=game.session.stores[crate.instanceId]
	moved_bag.add("fuel",3);moved_bag.remove("fuel",3)
	check(not (await undo_ready()).allowed and not await undo_last_ready(),"Used-then-emptied storage cannot regain full-price undo eligibility")

	await reset_case()
	store_cell=find_cell();fixture("floor",store_cell);crate=fixture("crate",store_cell,1)
	bag=game.session.stores[crate.instanceId];bag.add("fuel",7)
	var contents=bag.slots.duplicate(true)
	target_cell=find_cell();fixture("floor",target_cell)
	var resources=game.session.count_resource("scrap")
	b.choose("crate");b.moving=crate.instanceId;b.manual_level=0;b.rotation_index=2
	aim({"definitionId":"crate","cell":target_cell,"rotation":2})
	check(await commit_ready(),"Loaded crate relocates through ordinary placement validation")
	b.choose("floor")
	check(await undo_last_ready(),"Untouched loaded crate relocation can be reversed")
	check(crate.cell==store_cell and crate.rotation==1 and game.session.stores[crate.instanceId]==bag and bag.slots==contents and game.session.count_resource("scrap")==resources,"Reverse move retains the same live instance and contents, with no resource transaction")
	b.choose("floor")
	check(b.copy_piece(crate.instanceId) and b.selected=="crate" and b.moving=="" and b.rotation_index==1,"Copy selects only blueprint and orientation, not relocation identity")
	aim({"definitionId":"crate","cell":target_cell,"rotation":1})
	check(await commit_ready(),"Copied blueprint creates an ordinary paid part")
	var clone=game.session.structures.back()
	check(clone.instanceId!=crate.instanceId and game.session.stores[clone.instanceId].count_item("fuel")==0 and bag.count_item("fuel")==7,"Copying loaded storage never clones its items")
	check(game.session.count_resource("scrap")==resources-int(game.data.BUILD_PIECES.crate.cost.scrap),"Copy placement pays ordinary resources exactly once")

	await reset_case()
	floor_piece=await paid("floor",find_cell())
	b.damage(floor_piece.instanceId,1,b.center(floor_piece.cell))
	floor_piece.health=game.data.BUILD_PIECES.floor.maxHealth
	check(b.history.entries.is_empty() and not (await undo_ready()).allowed,"Damage invalidates history even after repair")
	game.session.attack_recent=0
	floor_piece=await paid("floor",find_cell())
	game.session.clock+=121
	check(not (await undo_ready()).allowed and not await undo_last_ready() and b.history.entries.is_empty(),"Expired receipt cannot undo or silently undo an older operation")

	await reset_case()
	game.player.position=Vector3(6,16.1,6);await frames()
	fixture("floor",{"x":5,"y":0,"z":3})
	floor_piece=await paid("floor",{"x":6,"y":0,"z":3})
	fixture("floor",{"x":7,"y":0,"z":3})
	check(not (await undo_ready()).allowed and "depend" in (await undo_ready()).reason,"Undo cannot disconnect a neighboring supported floor chain")
	check(not await undo_last_ready() and not game.session.find_piece(floor_piece.instanceId).is_empty(),"Support refusal leaves every part in place")

	await reset_case()
	game.player.position=Vector3(5,16.1,0);await frames()
	floor_piece=await paid("floor",{"x":6,"y":0,"z":0})
	game.session.story.phase="docked"
	check(not (await undo_ready()).allowed and "gangway" in (await undo_ready()).reason,"Active return gangway support cannot be undone")

	await reset_case()
	floor_piece=await paid("floor",find_cell())
	game.open_menu("Inventory")
	check(not await undo_last_ready() and not game.session.find_piece(floor_piece.instanceId).is_empty(),"Personal wrist cannot execute construction undo")
	game.close_menu();b.choose("floor")
	game.session.attack_recent=1;b.update(.01)
	check(b.history.entries.is_empty() and b.selected=="","Combat clears recent receipts and placement")
	game.session.attack_recent=0
	floor_piece=await paid("floor",find_cell())
	game.load_payload(base.duplicate(true))
	check(b.history.entries.is_empty(),"Loading a native save clears all actionable history")

	await reset_case()
	store_cell=find_cell();fixture("floor",store_cell)
	var bench=await paid("workbench",store_cell)
	check((await undo_ready()).allowed,"Unused workbench is eligible through its registered use tracking")
	var recipe=""
	for value in game.data.RECIPES:
		if value.station=="workbench" and game.session.can_pay(value.inputs):recipe=value.id;break
	check(recipe!="" and game.session.craft(recipe,1,bench.instanceId),"Ordinary crafting uses the actual selected workbench")
	check(not (await undo_ready()).allowed and not await undo_last_ready(),"Successful station use prevents full-price construction undo")
	store_cell=find_cell();fixture("floor",store_cell)
	var generator=await paid("generator",store_cell)
	check(not (await undo_ready()).allowed and "cutter" in (await undo_ready()).reason,"Untracked autonomous equipment has an explicit safe refusal")
	check(not await undo_last_ready() and not game.session.find_piece(generator.instanceId).is_empty(),"Refused autonomous equipment undo cannot remove/refund the machine")

	await reset_case()
	store_cell=find_cell();fixture("floor",store_cell);crate=fixture("crate",store_cell)
	target_cell=find_cell();fixture("floor",target_cell)
	bag=game.session.stores[crate.instanceId]
	for i in game.session.inventory.slots.size():game.session.inventory.slots[i]={"itemId":"fuel","count":game.data.ITEMS.fuel.stackSize}
	for i in bag.slots.size():bag.slots[i]={"itemId":"fuel","count":game.data.ITEMS.fuel.stackSize}
	bag.slots[0]={"itemId":"scrap","count":8};bag.slots[1]={"itemId":"components","count":8}
	b.choose("crate");b.moving=crate.instanceId;b.manual_level=0
	aim({"definitionId":"crate","cell":target_cell,"rotation":0})
	check(await commit_ready(),"Full storage can be relocated without changing its contents")
	b.choose("floor")
	contents=bag.slots.duplicate(true)
	var revision=bag.mutation_revision
	var existing_bench=game.session.structures.filter(func(p):return p.definitionId=="workbench")[0]
	check(not game.session.craft("craft-repair-kit",1,existing_bench.instanceId),"Craft whose output has no room fails through the real station transaction")
	check(bag.slots==contents and bag.mutation_revision==revision and (await undo_ready()).allowed,"Failed output rollback preserves contents, mutation revision and untouched relocation eligibility")
	check(await undo_last_ready() and bag.slots==contents and crate.cell==store_cell,"Failed craft cannot destroy a safe loaded-storage move reversal")

	await reset_case()
	floor_piece=await paid("floor",find_cell())
	game.settings.bindings=MMFControls.rebind(game.settings.bindings,"build_undo",KEY_I)
	game.settings.bindings=MMFControls.rebind(game.settings.bindings,"build_copy",KEY_U)
	game.configure_input()
	await key("build_undo",true)
	check(not game.session.find_piece(floor_piece.instanceId).is_empty(),"Held/repeating undo key cannot consume construction history")
	await undo_ready()
	await key("build_undo")
	check(game.session.find_piece(floor_piece.instanceId).is_empty(),"Remapped undo executes through real input while placing")
	store_cell=find_cell();fixture("floor",store_cell);crate=fixture("crate",store_cell,3)
	b.choose("floor");aim({"definitionId":"crate","cell":store_cell,"rotation":3})
	var count=game.session.structures.size()
	# New fixture colliders enter the physics space at its next synchronization.
	# The input must target an installed crate, not race the fixture's creation.
	await frames()
	var copy_hit=game.crosshair_hit(12)
	var copy_target="" if copy_hit.is_empty() else str(copy_hit.collider.get_meta("piece_id",""))
	await key("build_copy")
	check(copy_target==crate.instanceId and b.selected=="crate" and b.rotation_index==3 and b.moving=="" and game.session.structures.size()==count,"Remapped copy key selects the aimed blueprint without creating a part")
	game.open_menu("Inventory")
	await key("build_copy")
	check(b.selected=="" and game.session.structures.size()==count,"Copy cannot leak through the personal wrist interface")
	game.settings.bindings={};game.configure_input()

	await reset_case()
	for i in 11:await paid("floor",find_cell())
	check(b.history.entries.size()==10,"Construction journal retains at most ten receipts")
	var latest=b.history.entries.back().instance_id
	var previous_id=b.history.entries[b.history.entries.size()-2].instance_id
	check(await undo_last_ready() and game.session.find_piece(latest).is_empty() and not game.session.find_piece(previous_id).is_empty(),"Undo removes only the most recent exact instance")

	await reset_case()
	var preview=b.build_preview
	preview.reset()
	check(preview.candidate(Vector3(.98,16.03,0),0,"floor",0,false).cell.x==0,"Initial grid candidate uses normal nearest-cell snap")
	check(preview.candidate(Vector3(1.03,16.03,0),0,"floor",0,false).cell.x==0,"Small boundary jitter keeps the selected cell")
	check(preview.candidate(Vector3(1.14,16.03,0),0,"floor",0,false).cell.x==1,"Deliberate movement beyond hysteresis changes cell")
	preview.reset()
	check(preview.candidate(Vector3(-1.14,16.03,0),0,"floor",0,false).cell.x==-1,"Negative coordinates snap consistently")
	preview.reset()
	var edge=preview.candidate(Vector3(.9,16.03,.8),0,"wall",0,true)
	check(edge.edge.axis=="x" and preview.candidate(Vector3(.8,16.03,.9),0,"wall",0,true).edge.axis=="x","Small corner jitter does not flip wall edge axis")
	check(preview.candidate(Vector3(.4,16.03,.95),0,"wall",0,true).edge.axis=="z","Deliberate edge change releases the prior axis")
	check(preview.candidate(Vector3(.1,19.63,.1),1,"floor",3,false).cell.y==1,"Changed deck resets candidate memory")
	var cell=find_cell();fixture("floor",cell)
	var spec={"definitionId":"crate","cell":cell,"rotation":0}
	game.player.position=b.center(cell)+Vector3(0,.07,0);await frames()
	check(not b.placement_report(spec).valid,"Occupied equipment footprint is an authoritative refusal")
	game.player.position=Vector3(0,16.1,-1);await frames()
	var neutral=game.session.native_snapshot()
	for i in 100:
		b.catalog_report("refinery");b.placement_report(spec)
	check(unchanged(neutral),"Repeated previews do not change inventory, power charge, clock or gameplay RNG")
	var power=b.catalog_report("refinery").power
	fixture("refinery",cell);game.session.update_power()
	check(is_equal_approx(game.session.capacity,power.capacity) and is_equal_approx(game.session.demand,power.demand),"Power preview matches authoritative power after placement")
	check(not power.selected_powered and not power.newly_unpowered.is_empty(),"Over-capacity preview reports whole-tier shedding")
	var s=MMFSession.new(game.data)
	s.expedition_gear.recovered=["battery-bank"];s.facts.salvage=true;s.story.uniques=["course-gyro"]
	s.fuel=0
	var battery=s.create_piece("battery-bank",{"x":3,"y":0,"z":2},0,{},true);battery.state.charge=120.0
	var before=s.native_snapshot()
	var budget=MMFPowerBudget.calculate(s,s.structures,1)
	check(budget.battery_draw==2 and budget.powered["fixed-radio"] and budget.powered["fixed-helm"],"Battery preview serves navigation when generation is absent")
	check(s.native_snapshot()==before,"Power calculation does not drain battery energy")
	s.update_power(1)
	check(is_equal_approx(battery.state.charge,118) and s.capacity==budget.capacity,"Live power advances charge once after shared pure calculation")
	await finish()

func finish():
	var source_hash_end=MMFPlaytestRecorder.source_fingerprint()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"scope":"headless authority/input fixtures; native review remains separate","source_hash":source_hash_start,"source_hash_end":source_hash_end,"source_stable":source_hash_start==source_hash_end,"human_test":false}
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://../test-results/godot-native"))
	var file=FileAccess.open(results,FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("CONSTRUCTION_USABILITY ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)
