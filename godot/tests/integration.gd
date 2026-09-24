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

func operate(item: Dictionary) -> bool:
	for point in game.campaign.points:
		if point.entry.id==item.id: game.player.position=game.campaign.destination.to_global(point.at)-Vector3.UP*.6
	if game.activity.completed(item): return game.campaign.interact(item)
	game.campaign.interact(item)
	var id=game.activity.key(item)
	if game.activity.refusal()!="": return false
	if id in ["power","array"]:
		var values=[2,1,0] if id=="power" else [25,60,85]
		for i in 3: game.activity.adjust(i,values[i])
		game.activity.act()
	else:
		for i in range(int(game.activity.state(id).step),3): game.activity.act(i)
	game.close_menu()
	return game.activity.completed(item)

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
		var actual=layout.generate(fixture.seed,int(fixture.chunk));var matches=actual.size()==fixture.placements.size()
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
	var condenser_a=game.session.create_piece("condenser",{"x":2,"y":0,"z":3},0,{},true)
	var condenser_b=game.session.create_piece("condenser",{"x":1,"y":0,"z":3},0,{},true)
	game.session.update_power()
	check(not game.session.powered.get(refinery.instanceId,true) and not game.session.powered.get("fixed-radio",true),"Power shedding cuts the whole station class")
	game.session.structures.erase(condenser_a);game.session.structures.erase(condenser_b);game.session.update_power()
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
	game.combat.ship.position=Vector3(20,6,0)
	game.combat.update_ship(0.01)
	check(game.combat.ship_state=="grapple","Boarding ship attaches grapple")
	game.combat.update_ship(6)
	check(not game.combat.crew[0].inactive,"Mech completes grapple climb")
	await frames(5)
	await capture("boarding")
	for enemy in game.combat.enemies:
		if is_instance_valid(enemy): enemy.take_damage(10000,enemy.position)
	game.combat.retreat_ship(true)
	game.combat.ship.position.z=100
	game.combat.update_ship(0.1)
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
	check(operate(target),"Recover expedition unique through gyro interlocks")
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
			if item.kind=="journal" and game.campaign.can_show(item): check(game.campaign.interact(item),"Read "+item.id)
		for item in game.campaign.expedition().interactables:
			if item.kind=="objective" and game.campaign.can_show(item): check(operate(item),"Activate "+item.id)
		for pass_index in 2:
			for item in game.campaign.expedition().interactables:
				if item.kind=="unique" and game.campaign.can_show(item): operate(item)
		for id in game.campaign.expedition().requiredUniques: check(id in game.session.story.uniques,"Preserve "+id)
		game.player.position=Vector3(0,16.1,0)
		check(game.campaign.depart(),"Depart chapter %d"%index)
		game.session.distance+=41
		game.campaign.update(0.01)
		await frames(2)
	check(game.session.story.phase=="ending-ready","Meridian ending ready")
	check(game.campaign.begin_ending(),"Durable ending checkpoint")
	game.session.distance=game.session.story.endingDistance
	game.campaign.update(0.01)
	check(game.cinematic=="arrival","Native arrival cinematic")
	game.cinematics.finish()
	check(game.session.story.phase=="complete","Keep Walking completion")
	game.close_menu()
	# Optional contact scheduler must detect a crossing between simulation frames.
	game.session.distance=250.01
	game.session.contacts={"active":{},"nextSlot":1,"visited":[],"missed":[]}
	game.opportunities.schedule_armed=true
	game.opportunities.update(0.016)
	check(not game.session.contacts.active.is_empty(),"Optional signal threshold crossing")
	for kind in ["water-cache","salvage-wreck","memorial","repair-depot"]:
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
	isolated.nourishment=0;isolated.health=40;isolated.inventory.add("repair-kit",1);isolated.use_item("repair-kit")
	check(isolated.health==60,"Empty nourishment halves healing")
	var bag=MMFInventory.new(game.data.ITEMS,1)
	check(not bag.restore([{"itemId":"scrap","count":1.5}]),"Reject fractional item counts")
	# Stair opening, fixture support and transactional cascade are native rules.
	game.session.inventory.add("scrap",100)
	game.session.contacts.active={}
	var floor_piece=game.session.create_piece("floor",{"x":20,"y":0,"z":20},0,{},true);game.building.add_visual(floor_piece)
	var crate=game.session.create_piece("crate",floor_piece.cell,0,{},true);game.building.add_visual(crate)
	game.session.stores[crate.instanceId].add("components",2)
	var count=game.session.count_resource("components")
	check(game.building.demolish(floor_piece.instanceId),"Demolition cascades supported equipment")
	check(game.session.find_piece(crate.instanceId).is_empty() and game.session.count_resource("components")>=count,"Cascade preserves stored contents")
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
