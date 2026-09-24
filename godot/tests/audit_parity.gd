extends SceneTree

var game
var checks=0
var failures=[]
var output=""

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-test-campaigns/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1
	print("PASS " if ok else "FAIL ",label)
	if not ok: failures.append(label)

func frames(count: int):
	for i in count: await physics_frame

func supplies(s):
	s.inventory.add("scrap",600);s.inventory.add("components",400)

func controller_parity(data: Dictionary):
	var fixtures=JSON.parse_string(FileAccess.get_file_as_string("res://data/audit-fixtures.json"))
	for fixture in fixtures.producers:
		var s=MMFSession.new(data)
		var p=s.create_piece(fixture.kind,{"x":10,"y":0,"z":10},0,{},true)
		for i in fixture.steps.size():
			var step=fixture.steps[i]
			if step.action=="claim": p.state.stored=maxi(0,p.state.stored-int(step.value))
			elif step.action!="off": s.fuel=100;s.tick(step.value)
			else: s.fuel=0;s.tick(step.value)
			check(p.state.stored==step.stored and is_equal_approx(p.state.elapsedS,step.progress),"Source %s production step %d"%[fixture.kind,i])
	var garden_session=MMFSession.new(data)
	var garden=garden_session.create_piece("seed-garden",{"x":10,"y":0,"z":10},0,{},true)
	for i in fixtures.garden.size():
		var step=fixtures.garden[i]
		if step.action=="water": garden.state.water=mini(2,garden.state.water+int(step.value))
		elif step.action=="harvest": garden.state.stored=maxi(0,garden.state.stored-int(step.value))
		else: garden_session.tick(step.value)
		check(garden.state.stored==step.greens and garden.state.water==step.water and is_equal_approx(garden.state.elapsedS,step.progressS),"Source seed garden step %d"%i)
	var healthy=MMFSession.new(data);healthy.opening_done=true;healthy.tick(10)
	for fixture in fixtures.legs:
		var s=MMFSession.new(data);s.opening_done=true
		for id in s.subsystems:
			if id.begins_with("leg-"): s.subsystems[id]*=fixture.fraction
		s.tick(10)
		check(is_equal_approx(s.speed/healthy.speed,fixture.speedScale),"Source leg damage speed %.2f"%fixture.fraction)
	var s=MMFSession.new(data);supplies(s)
	for i in fixtures.upgrades.size():
		var step=fixtures.upgrades[i]
		var before=s.count_resource("scrap")
		var ok=false
		if step.action=="research": ok=s.begin_research(step.id)
		elif step.action=="fit": ok=s.activate_upgrade(step.id)
		else: ok=s.deactivate_upgrade(data.UPGRADES[step.id].branch)
		var completed=s.research.completed.duplicate();completed.sort()
		var expected=step.snapshot.researched.duplicate();expected.sort()
		check(ok==step.ok and completed==expected and s.research.active==step.snapshot.active and s.modifiers()==step.modifiers,"Source upgrade transaction %d / %s"%[i,step.action])
		var paid=data.UPGRADES[step.id].researchCost.scrap if step.action=="research" and step.ok else 0
		check(s.count_resource("scrap")==before-paid,"Upgrade charged exactly once %d"%i)
	for id in ["water","rations"]:
		s.inventory.add(id,2)
		var count=s.inventory.count_item(id)
		check(not s.use_item(id) and s.inventory.count_item(id)==count,"Full meter does not waste "+id)
		s.hydration=50;s.nourishment=50
		check(s.use_item(id) and s.inventory.count_item(id)==count-1,"Low meter consumes one "+id)
		s.hydration=100;s.nourishment=100
	var old=s.native_snapshot();old.nextPieceId=0
	old.research.job=data.UPGRADES.keys()[0];old.research.completed.erase(old.research.job)
	old.structures.append({"instanceId":"bp-999","definitionId":"planter","cell":{"x":12,"y":0,"z":12},"rotation":0,"health":data.BUILD_PIECES.planter.maxHealth,"state":{"stored":3,"elapsedS":10000}})
	var restored=MMFSession.new(data)
	check(restored.restore_native(old),"Load legacy paid research and producer timers")
	check(old.research.job in restored.research.completed and restored.research.job=="","Legacy paid research remains unlocked")
	check(restored.find_piece("bp-999").state.elapsedS==150,"Restore clamps old banked production")
	var next=restored.create_piece("crate",{"x":10,"y":0,"z":10},0,{},true)
	check(next.instanceId=="bp-1000","Restored piece counter cannot overwrite storage")
	var bad=s.native_snapshot();bad.research.active.power="unknown"
	check(not MMFSession.new(data).restore_native(bad),"Malformed active upgrade rejected")
	bad=s.native_snapshot();bad.nextPieceId=-1
	check(not MMFSession.new(data).restore_native(bad),"Negative piece counter rejected")
	# Inventory transfers and failed crafting must conserve every item.
	var source=MMFInventory.new(data.ITEMS,2);var dest=MMFInventory.new(data.ITEMS,1)
	source.add("scrap",100);dest.add("scrap",int(data.ITEMS.scrap.stackSize)-1)
	var total=source.count_item("scrap")+dest.count_item("scrap")
	check(source.transfer_to(dest)==1 and source.count_item("scrap")+dest.count_item("scrap")==total,"Partial Take All conserves full storage contents")
	source.sort_slots();check(source.count_item("scrap")+dest.count_item("scrap")==total,"Sorting conserves contents")
	var craft=MMFSession.new(data);craft.inventory=MMFInventory.new(data.ITEMS,1);craft.stores.clear()
	craft.inventory.add("scrap",int(data.ITEMS.scrap.stackSize));craft.create_piece("refinery",{"x":10,"y":0,"z":10},0,{},true);craft.update_power()
	var slots=craft.inventory.slots.duplicate(true)
	check(not craft.craft("refine-components") and craft.inventory.slots==slots,"Full output bag rolls back recipe materials")

func run():
	output=ProjectSettings.globalize_path("res://../test-results/godot-native/")
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	controller_parity(game.data)
	game.started=true;game.session.opening_done=true;game.close_menu();await frames(15)
	game.salvage.next_distance=1e9
	var s=game.session;supplies(s)
	var upgrade=game.data.UPGRADES.keys()[0]
	check(not game.research_action("research",upgrade),"Machine research requires recovered radio")
	s.facts.salvage=true;s.fuel=0
	check(not game.research_action("research",upgrade),"Machine research requires powered radio")
	s.fuel=100
	check(game.research_action("research",upgrade) and s.research.active.is_empty(),"Powered radio researches without workbench or automatic fitting")
	check(game.research_action("fit",upgrade),"Researched hardware can be fitted")
	s.fuel=0
	check(game.research_action("remove",game.data.UPGRADES[upgrade].branch),"Hardware can be removed while receiver has no power")
	s.fuel=100;s.story.phase="approach"
	check(not game.research_action("fit",upgrade),"Research fitting is blocked during an active route")
	s.story.phase="locked"
	game.open_menu("Workshop")
	check(not game.fit_attachment("rifle-stabilizer"),"Attachments are locked before Relay Foundry")
	s.story.completed.append("relay-foundry")
	check(not game.fit_attachment("rifle-stabilizer"),"Attachments require a functional workbench")
	var bench=s.create_piece("workbench",{"x":3,"y":0,"z":5},0,{},true);game.building.add_visual(bench)
	s.fuel=0
	check(not game.fit_attachment("rifle-stabilizer"),"Attachments require fieldwork power")
	s.fuel=100
	var components=s.count_resource("components")
	check(game.fit_attachment("rifle-stabilizer") and s.count_resource("components")==components-8,"First attachment pays its source cost")
	check(s.fieldwork_active and s.powered.get("fixed-fieldwork",false),"Terminal workbench registers its 1 power load")
	components=s.count_resource("components")
	game.player.reload_left=1;game.player.burst_left=2;game.player.burst_recovery=0.4
	check(game.remove_attachment("rifle") and game.fit_attachment("rifle-stabilizer") and s.count_resource("components")==components,"Attachment removal and refitting are free")
	check(game.player.reload_left==0 and game.player.burst_left==0 and game.player.burst_recovery==0,"Changing weapon hardware cancels old reload and burst state")
	game.ui.refresh()
	var remove_visible=false
	for child in game.ui.content.get_children():
		if child is Button and child.text=="REMOVE Rifle Stabilizer" and not child.disabled: remove_visible=true
	check(remove_visible,"Workshop exposes working attachment removal button")
	game.open_menu("Build");check(not s.fieldwork_active,"Live construction catalog does not reserve fieldwork power")
	game.open_menu("Pause");check(not s.fieldwork_active,"Pause menu does not reserve fieldwork power")
	game.close_menu();check(not s.fieldwork_active,"Closing terminal releases temporary tool power")
	# Aim at a supported build plane outside the original hull, in reachable space.
	game.player.teleport(Vector3(20,16.1,16))
	var at=Vector3(20,16.03,20)
	game.player.camera.global_position=at+Vector3(0,6,2);game.player.camera.look_at(at)
	game.building.choose("floor");game.building.update(0)
	check(game.building.failure=="","Source permits upper-deck extension preview")
	game.building.choose("workbench")
	var before=s.structures.size()
	check(not game.building.commit_placement() and s.structures.size()==before,"Changing catalog item cannot reuse a stale floor approval")
	game.building.choose("floor")
	check(game.building.commit_placement(),"Placement click recomputes and creates valid floor")
	check(not game.building.commit_placement(),"Second same-frame click cannot duplicate a floor")
	game.building.choose("crate")
	s.attack_recent=3
	check(not game.building.commit_placement() and game.building.selected=="","Incoming damage cancels even a between-frame build click")
	s.attack_recent=0
	game.player.teleport(Vector3(0,16.1,-1));await frames(5)
	# Restore inside a real machine collider and on a now-missing platform.
	var payload={"session":s.native_snapshot(),"player":{"position":{"x":0,"y":16.1,"z":9},"yaw":0,"pitch":0}}
	game.load_payload(payload);await frames(6)
	check(game.player.boundary.fits(game.player.position),"Saved position inside equipment resolves to clear supported deck")
	payload.player.position={"x":40,"y":20,"z":40}
	game.load_payload(payload);await frames(6)
	check(game.player.boundary.fits(game.player.position) and game.aboard(),"Unsupported saved position safely returns aboard")
	s=game.session
	var c=game.opportunities.make_contact(2);c.erase("record")
	var old=s.native_snapshot();old.contacts.active=c
	var restored=MMFSession.new(game.data)
	check(restored.restore_native(old) and restored.contacts.active.record==false,"Old optional contacts receive safe missing-record default")
	old.contacts.active.record=[]
	check(not MMFSession.new(game.data).restore_native(old),"Malformed optional record rejected before interaction")
	# Exercise actual turret collision rays with authored models on a clear deck.
	for x in range(9,14):
		for z in range(-8,-2):
			var floor=s.create_piece("floor",{"x":x,"y":0,"z":z},0,{},true);game.building.add_visual(floor)
	var turret=s.create_piece("turret-auto",{"x":10,"y":0,"z":-4},0,{},true);game.building.add_visual(turret)
	var manual=s.create_piece("turret-manual",{"x":12,"y":0,"z":-4},0,{},true);game.building.add_visual(manual)
	s.fuel=100;s.update_power()
	var enemy=game.combat.spawn("warden",Vector3(20,16.08,-14),true)
	var other=game.combat.spawn("warden",Vector3(24,16.08,-14),true)
	await frames(6)
	var hp=enemy.health
	for i in 100: game.combat.update_turrets(1.0/60)
	check(enemy.health<hp,"Powered automatic turret locks and damages a visible enemy")
	var auto_hp=turret.health
	s.fuel=0;s.update_power();hp=other.health
	for i in 100: game.combat.update_turrets(1.0/60)
	check(other.health==hp and turret.health==auto_hp,"Unpowered automatic turret cannot fire or hit itself")
	s.fuel=100;s.update_power();game.player.teleport(Vector3(24,16.1,-6.7));game.service_piece(manual)
	game.player.yaw=0;game.player.pitch=0;hp=other.health
	Input.action_press("fire");game.update_manual_turret(0.2);Input.action_release("fire")
	check(other.health<hp and manual.health==game.data.BUILD_PIECES["turret-manual"].maxHealth,"Mounted deck gun damages its target without shooting its own collider")
	game.dismount_turret()
	while game.combat.nav.is_baking(): await create_timer(0.02).timeout
	s.caretaker.recovered=true;s.caretaker.mode="companion"
	game.player.teleport(Vector3(-9,16.1,-5))
	game.caretaker.spawned=true;game.caretaker.position=Vector3(-9,16.1,6)
	await frames(660)
	check(game.caretaker.position.distance_to(game.player.position)<3,"L12 companion completes a real baked navigation route")
	game.caretaker.position=Vector3(-9,16.1,6)
	var barrier=MMFAssets.box(game,Vector3(6,2,0.5),Vector3(-9,17.03,4.5))
	await frames(180)
	check(game.caretaker.position.z>5.0,"L12 collision recovery cannot pass through a new wall")
	barrier.queue_free();await frames(2)
	game.caretaker.agent.navigation_layers=0
	game.caretaker.velocity=Vector3(1,0,0)
	game.caretaker.update(1.0/60)
	check(Vector2(game.caretaker.velocity.x,game.caretaker.velocity.z).length()<0.001,"L12 stops instead of drifting when its route becomes unavailable")
	s.fuel=0;s.update_power()
	var walker=game.combat.spawn("revenant",Vector3(-9,16.1,6))
	walker.mission="travel";walker.mission_point=Vector3(-9,16.03,-5)
	await frames(360)
	check(walker.position.distance_to(walker.mission_point)<2,"Boarding mech completes a real deck navigation route")
	await frames(30)
	check(Vector2(walker.velocity.x,walker.velocity.z).length()<0.01,"Mech stops at its destination without overshoot jitter")
	game.open_menu("Pause")
	if DisplayServer.get_name()!="headless":
		game.ui.panel.hide()
		game.player.camera.global_position=Vector3(-14,21,10)
		game.player.camera.look_at(Vector3(-9,17,0))
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(output+"audit-navigation.png")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"renderer":RenderingServer.get_video_adapter_name()}
	var file=FileAccess.open(output+"audit-parity.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	while game.combat.nav.is_baking(): await create_timer(0.02).timeout
	game.queue_free();await frames(4);MMFAssets.cache.clear()
	quit(0 if failures.is_empty() else 1)
