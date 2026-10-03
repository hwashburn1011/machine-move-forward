extends SceneTree

var game
var failures=[]
var checks=0
var rendered=false
var output=""

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-test-campaigns/"
	call_deferred("run")

func check(condition: bool,label: String):
	checks+=1
	if not condition: failures.append(label);push_error("FAIL "+label)
	else: print("PASS "+label)

func frames(count: int):
	for i in count: await process_frame

func dismantle_ready(id: String) -> Dictionary:
	var report=game.building.dismantle_preview(id)
	for i in 300:
		if report.refusal!="Checking walking access…":break
		await physics_frame;report=game.building.dismantle_preview(id)
	return report

func operate(item: Dictionary) -> bool:
	var result=await preload("res://tests/expedition_fixture.gd").complete(game,item)
	if not result:print("OPERATE_DIAGNOSTIC ",item.id," at ",game.player.position," entry ",game.activity.entry.get("id","")," refusal ",game.activity.refusal()," moving ",game.activity.moving())
	return result

func capture(name: String):
	if not rendered: return
	await RenderingServer.frame_post_draw
	var image=root.get_texture().get_image()
	image.save_png(output+name+".png")

func run():
	output=ProjectSettings.globalize_path("res://").path_join("../test-results/godot-native/").simplify_path()+"/"
	DirAccess.make_dir_recursive_absolute(output)
	rendered=DisplayServer.get_name()!="headless"
	var fixtures=JSON.parse_string(FileAccess.get_file_as_string("res://data/desert-fixtures.json"))
	var layout=MMFDesertLayout.new()
	for fixture in fixtures:
		# Retain the frozen browser reference; native variety has separate route tests.
		var actual=layout.generate_legacy(fixture.seed,int(fixture.chunk));var matches=actual.size()==fixture.placements.size()
		for i in actual.size():
			for key in actual[i]:
				if key=="kind": matches=matches and actual[i][key]==fixture.placements[i][key]
				else: matches=matches and absf(actual[i][key]-fixture.placements[i][key])<0.00001
		check(matches,"Original seeded desert "+fixture.seed+" / "+str(fixture.chunk))
	game=load("res://scenes/main.tscn").instantiate()
	root.add_child(game)
	current_scene=game
	await frames(10)
	check(game.ui.panel.visible,"Title opens")
	game.started=true
	game.session.opening_done=true
	game.invulnerable=true
	game.close_menu()
	await create_timer(1).timeout
	print("PLAYER ",game.player.position," MODEL ",MMFAssets.bounds(game.player.visual))
	print("MACHINE ",MMFAssets.bounds(game.world.machine))
	for skeleton in MMFAssets.of_type(game.player.visual,"Skeleton3D"):
		var bones=[]
		for i in skeleton.get_bone_count(): bones.append(skeleton.get_bone_name(i))
		print("BONES ",bones)
	check(game.player.position.y>15.8 and game.player.position.y<16.3,"Player rests on upper deck")
	await capture("deck")
	for page in ["Inventory","Build","Workshop","Machine","Signal","Records","Settings","Library"]:
		game.open_menu(page)
		check(game.ui.content.get_child_count()>0,"Terminal "+page)
		await frames(1)
	await capture("terminal")
	game.close_menu()
	var original=game.session.native_snapshot()
	game.session.inventory.add("components",50)
	game.session.inventory.add("scrap",300)
	var refinery=game.session.create_piece("refinery",{"x":3,"y":0,"z":3},0,{},true)
	game.building.add_visual(refinery)
	var workbench=game.session.create_piece("workbench",{"x":4,"y":0,"z":3},0,{},true)
	game.building.add_visual(workbench)
	game.session.update_power()
	check(game.session.craft("refine-components"),"Refine recipe transaction")
	game.session.salvage_reward()
	game.session.update_power()
	game.session.inventory.add("scanner-replacement-module",1)
	check(game.session.install_scanner(),"Install scanner")
	check(game.session.start_scan(),"Start scanner")
	check(MMFDamage.compute(24,45,120,45,5)==19,"Armour before weapon falloff")
	check(is_equal_approx(MMFDamage.compute(24,82.5,120,45,5),9.5),"Linear damage falloff")
	check(MMFDamage.compute(24,121,120,45,5)==0,"No damage beyond range")
	var collector_a=game.session.create_piece("salvage-crane",{"x":2,"y":0,"z":3},0,{},true)
	var collector_b=game.session.create_piece("salvage-crane",{"x":1,"y":0,"z":3},0,{},true)
	game.session.update_power()
	check(not game.session.powered.get(refinery.instanceId,true) and not game.session.powered.get("fixed-radio",true),"Power shedding cuts the whole station class")
	game.session.structures.erase(collector_a);game.session.structures.erase(collector_b);game.session.update_power()
	game.session.scanner.elapsedS=179.99
	game.session.tick(0.02)
	check(game.session.scanner.phase=="contact-ready","Scanner reaches 100%")
	game.session.tick(3.1)
	check(game.cinematic=="signal","Signal triggers native cutscene")
	await frames(4)
	game.cinematics.time=11
	game.cinematics.update(0.016)
	game.cinematics.scenery.reset_physics_interpolation()
	for i in 3: await physics_frame
	await capture("signal")
	game.cinematics.time=13.5
	game.cinematics.update(0.016)
	game.cinematics.scenery.reset_physics_interpolation()
	for i in 3: await physics_frame
	await capture("signal-close")
	game.cinematics.finish()
	game.combat.begin_ship()
	game.combat.update_ship(game.combat.approach_duration)
	check(game.combat.ship_state=="grapple_launch","Boarding craft launches a visible grapple")
	game.combat.update_ship(1.1)
	check(game.combat.ship_state=="grapple","Boarding ship attaches grapple")
	for i in 361:game.combat.update_ship(1.0/60)
	check(not game.combat.crew[0].inactive,"Mech completes grapple climb")
	await frames(5)
	await capture("boarding")
	for enemy in game.combat.enemies:
		if is_instance_valid(enemy): enemy.take_damage(10000,enemy.position)
	game.combat.retreat_ship(true)
	game.combat.update_ship(4.6)
	game.combat.update(0.1)
	check(not game.combat.active_threat(),"Encounter clears")
	game.session.story.phase="route-selection"
	game.session.story.index=0
	check(game.campaign.begin_route(),"First expedition route")
	game.session.distance=game.session.story.arrival
	game.session.speed=0
	game.campaign.update(0.1)
	check(game.session.story.phase=="docked","Elevated destination docks")
	var target=game.campaign.expedition().interactables[3]
	check(await operate(target),"Recover expedition unique through gyro interlocks")
	game.player.position=Vector3(0,16.1,0)
	await capture("destination")
	game.player.position=Vector3(0,16.1,0)
	game.session.attack_recent=0
	print("SAVE SAFETY ",game.safe_to_save()," ",game.session.health," ",game.combat.active_threat()," ",game.cinematic)
	check(game.save_game("native-integration-test"),"Durable campaign save")
	var saved=MMFSaves.read("native-integration-test")
	check(not saved.is_empty(),"Verified campaign load")
	game.load_payload(saved)
	check("course-gyro" in game.session.story.uniques,"Save preserves story unlocks")
	# Follow every destination's real dependency ordering, including journal gates.
	for index in 5:
		game.session.story.index=index
		game.session.story.phase="route-selection"
		game.session.attack_recent=0
		game.session.fuel=100
		game.session.update_power()
		var routes=game.campaign.routes()
		var route_id="" if routes.is_empty() else routes[0].id
		check(game.campaign.begin_route(route_id),"Commit chapter %d"%index)
		game.session.distance=game.session.story.arrival
		game.session.speed=0
		game.session.story.scripted="resolved"
		game.campaign.update(0.01)
		check(game.session.story.phase=="docked","Dock chapter %d"%index)
		for item in game.campaign.expedition().interactables:
			if item.kind=="journal" and game.campaign.can_show(item): check(await operate(item),"Read "+item.id)
		for item in game.campaign.expedition().interactables:
			if item.kind=="objective" and game.campaign.can_show(item): check(await operate(item),"Activate "+item.id)
		for pass_index in 2:
			for item in game.campaign.expedition().interactables:
				if item.kind=="unique" and game.campaign.can_show(item): await operate(item)
		for id in game.campaign.expedition().requiredUniques: check(id in game.session.story.uniques,"Preserve "+id)
		game.player.position=Vector3(0,16.1,0)
		check(game.campaign.depart(),"Depart chapter %d"%index)
		game.session.distance+=41
		game.campaign.update(0.01)
		await frames(2)
	check(game.session.story.phase=="ending-ready","Meridian ending ready")
	check(game.campaign.begin_ending(),"Durable ending checkpoint")
	game.player.position=game.world.receiver.global_position+Vector3(0,0,1);game.open_station("Signal","receiver")
	game.finale.secure_link()
	check(game.combat.ship_state!="none" and game.session.finale.encounter=="launched","All-skipped campaign receives one final interception")
	var gun=game.data.WEAPONS.rifle
	var hull=game.combat.ship_targets[0]
	for shot in 60:
		if game.combat.ship_state=="destroying":break
		hull.take_weapon_damage(gun.damage,hull.global_position,20,gun.range,gun.falloffStart)
	for frame in 70:game.combat.update(.1);game.finale.update()
	await frames(3)
	check(game.session.finale.stage=="ready" and not game.combat.active_threat(),"Ordinary rifle damage can resolve final skiff without optional gear")
	for frame in 60:game.session.tick(.1)
	game.player.position=game.world.helm_model.root.global_position+Vector3(0,0,1);game.open_station("Helm","helm")
	check(game.finale.resume_travel(),"Cleared link unlocks protected journey")
	game.session.distance=game.session.story.get("endingDistance",game.session.distance)
	game.campaign.update(0.01)
	check(game.cinematic=="arrival","Native arrival cinematic")
	game.cinematics.finish()
	await frames(4)
	check(game.session.story.phase=="finale-docked","Arrival preserves player control at receiving berth")
	for id in ["receiver","seeds","archive","transmitter"]:
		var p=game.finale.berth.points.filter(func(point):return point.id==id)[0]
		game.player.position=game.finale.berth.to_global(p.at)+Vector3(0,.06,.7);game.open_station("Finale","receiving-berth",id)
		if id=="receiver":game.finale.act("channel",game.finale.signature());game.finale.act("power",game.finale.signature())
		elif id=="transmitter":game.finale.pending_policy="open";game.finale.pending_signature=game.finale.signature();game.finale.publish()
		else:game.finale.act("transfer",game.finale.signature())
	game.player.position=game.world.helm_model.root.global_position+Vector3(0,0,1);game.open_station("Helm","helm")
	check(game.finale.depart() and game.session.story.phase=="complete","All-skipped campaign completes transfer, policy and continued play")
	game.session.distance+=41;game.finale.update();await frames(2)
	game.close_menu()
	# Optional contact scheduler must detect a crossing between simulation frames.
	game.session.distance=250.01
	game.session.contacts={"active":{},"nextSlot":1,"visited":[],"missed":[]}
	game.opportunities.schedule_armed=true
	game.opportunities.update(0.016)
	check(not game.session.contacts.active.is_empty(),"Optional signal threshold crossing")
	for kind in ["fuel-cache","salvage-wreck","memorial","repair-depot"]:
		game.session.contacts.candidates=[]
		var contact=game.opportunities.make_contact(3)
		contact.kind=kind;contact.state="docked";contact.step="task-ready"
		contact.rewards={"scrap":1};contact.salvageMode="secure" if kind=="salvage-wreck" else ""
		game.session.contacts.active=contact
		game.opportunities.create_site()
		game.opportunities.interact({"id":"reward"})
		check(contact.state=="docked" or kind=="repair-depot","Gate optional retrieval: "+kind)
		contact.step="service-done"
		if kind!="repair-depot": game.opportunities.interact({"id":"retrieval"})
		game.opportunities.interact({"id":"reward"})
		check(contact.state=="visited","Complete optional site: "+kind)
		game.close_menu()
	# Malformed saves are rejected before replacing any live campaign state.
	var valid=game.session.native_snapshot()
	var bad=valid.duplicate(true);bad.structures[0].health="invalid"
	check(not MMFSession.new(game.data).restore_native(bad),"Reject malformed structure health")
	bad=valid.duplicate(true);bad.weapons.rifle.ammoInMag=-1
	check(not MMFSession.new(game.data).restore_native(bad),"Reject negative ammunition")
	bad=valid.duplicate(true);bad.story.index=12
	check(not MMFSession.new(game.data).restore_native(bad),"Reject invalid chapter")
	check(MMFSession.new(game.data).restore_native(valid),"Full campaign native round trip")
	var isolated=MMFSession.new(game.data)
	isolated.opening_done=true;isolated.fuel=0;isolated.tick(5)
	check(isolated.speed>0 and isolated.speed<1.6,"Empty fuel preserves emergency crawl")
	isolated.health=40;isolated.inventory.add("repair-kit",1);isolated.use_item("repair-kit")
	check(isolated.health==80,"Repair kit restores full robot health without food penalties")
	var bag=MMFInventory.new(game.data.ITEMS,1)
	check(not bag.restore([{"itemId":"scrap","count":1.5}]),"Reject fractional item counts")
	# Stair opening, fixture support and transactional cascade are native rules.
	game.session.inventory.add("scrap",100)
	game.session.contacts.active={}
	var floor_piece=game.session.create_piece("floor",{"x":20,"y":0,"z":20},0,{},true);game.building.add_visual(floor_piece)
	var crate=game.session.create_piece("crate",floor_piece.cell,0,{},true);game.building.add_visual(crate)
	game.session.stores[crate.instanceId].add("components",2)
	var count=game.session.count_resource("components")
	await physics_frame
	var removal=await dismantle_ready(floor_piece.instanceId)
	check(removal.refusal=="" and game.building.demolish(floor_piece.instanceId),"Demolition cascades equipment whose only support was the removed off-hull floor")
	check(game.session.find_piece(crate.instanceId).is_empty() and game.session.count_resource("components")>=count,"Cascade preserves stored contents")
	var hull_floor=game.session.create_piece("floor",{"x":-3,"y":-2,"z":-3},0,{},true);game.building.add_visual(hull_floor)
	var hull_crate=game.session.create_piece("crate",hull_floor.cell,0,{},true);game.building.add_visual(hull_crate)
	var hull_store=game.session.stores[hull_crate.instanceId];hull_store.add("components",2)
	var hull_contents=hull_store.slots.duplicate(true)
	await physics_frame
	removal=await dismantle_ready(hull_floor.instanceId)
	check(removal.refusal=="" and game.building.demolish(hull_floor.instanceId),"Overlay deck plate can be dismantled above permanent native support")
	check(not game.session.find_piece(hull_crate.instanceId).is_empty() and game.session.stores[hull_crate.instanceId]==hull_store and hull_store.slots==hull_contents,"Permanent hull retains supported equipment identity and exact stored contents")
	game.session.create_piece("floor",{"x":20,"y":0,"z":20},0,{},true)
	game.session.create_piece("stairs",{"x":20,"y":0,"z":20},0,{},true)
	check(game.building.validate({"definitionId":"floor","cell":{"x":20,"y":1,"z":19},"rotation":0})!="","Cannot cap staircase opening")
	await frames(4)
	game.open_menu("Pause")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"renderer":RenderingServer.get_video_adapter_name()}
	var file=FileAccess.open(output+"integration.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t"))
	file.close()
	game.queue_free()
	await frames(3)
	MMFAssets.cache.clear()
	quit(0 if failures.is_empty() else 1)
