extends SceneTree

var checks=0
var failures=[]
var game
var source=""
var captures=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://recovery-operations-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func fresh():
	var s=MMFSession.new(game.data);s.opening_done=true;s.story.phase="route-selection";s.facts.salvage=true
	return s

func empty(s):
	for bag in s.containers():bag.slots.fill(null)

func frames(n: int=3):
	for i in n:await process_frame

func capture(name: String):
	if DisplayServer.get_name()=="headless":return
	await frames(4);await RenderingServer.frame_post_draw
	var path="res://../test-results/recovery-"+name+".png"
	root.get_texture().get_image().save_png(path);captures.append(path)

func run():
	source=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	await frames(5)
	var s=fresh();var generator=s.structures.filter(func(p):return p.definitionId=="generator")[0]
	var original=s.native_snapshot();var budget=MMFPowerBudget.calculate(s,s.structures,1)
	check(is_equal_approx(budget.fuel_rate,.06) and budget.generation==16,"One healthy generator supplies 16 and costs 3.6 fuel/min")
	check(s.native_snapshot()==original,"Budget preview does not mutate session")
	check(MMFMachineOperations.apply(s,MMFMachineOperations.switch_quote(s,generator.instanceId,false)),"Generator switches off")
	var before=s.fuel;s.tick(5)
	check(s.fuel==before and s.speed==0 and s.capacity==0,"Stopped source supplies no power, consumes no fuel and cannot propel")
	check(not MMFMachineService.diagnose(s).eligible,"Deliberately stopped healthy machinery receives no bailout")
	check(MMFMachineOperations.apply(s,MMFMachineOperations.switch_quote(s,generator.instanceId,true)),"Unpowered controls restart generator")
	s.tick(1);check(s.speed>0 and is_equal_approx(before-s.fuel,.06),"Restart restores ordinary propulsion and exact debit")
	var quote=MMFMachineOperations.switch_quote(s,generator.instanceId,false);s.fuel-=1
	check(not MMFMachineOperations.apply(s,quote),"Stale operating quote cannot apply")
	s.fuel=0;s.speed=0;s.tick(1);check(s.speed>0 and s.speed<2,"Enabled zero-fuel source retains emergency crawl")
	s.subsystems.engine=0;s.speed=0;s.tick(1);check(s.speed==0,"Destroyed engine blocks crawl")
	s=fresh();s.story.completed=["relay-foundry"];s.story.uniques=["course-gyro"]
	var refinery=s.create_piece("refinery",{"x":3,"y":0,"z":3},0,{},true)
	var turret=s.create_piece("turret-auto",{"x":4,"y":0,"z":3},0,{},true)
	var collector=s.create_piece("collector-auto",{"x":5,"y":0,"z":3},0,{},true)
	var defense=MMFMachineOperations.proposal(s,"defense");var salvage=MMFMachineOperations.proposal(s,"salvage")
	var d=MMFPowerBudget.calculate(s,s.structures,1,defense.config);var a=MMFPowerBudget.calculate(s,s.structures,1,salvage.config)
	check(d.powered[turret.instanceId] and not d.powered[refinery.instanceId] and not d.powered[collector.instanceId],"Defense explicitly disables industry and serves guns")
	check(a.powered[collector.instanceId] and not a.powered[refinery.instanceId],"Salvage serves collector without demanding refinery")
	check(MMFMachineOperations.apply(s,defense),"Explicit preset applies once")
	check(not MMFMachineOperations.apply(s,defense),"Repeated preset callback cannot recommit")
	check(MMFMachineOperations.proposal(s,"docked").is_empty(),"Docked cannot stop an undocked journey")
	s.story.phase="docked";quote=MMFMachineOperations.proposal(s,"docked")
	check(MMFMachineOperations.apply(s,quote) and MMFPowerBudget.calculate(s,s.structures).fuel_rate==0,"Docked stops generator debit")
	check(MMFMachineOperations.resume_config(s).mode=="defense","Docked retains prior travel settings")
	var saved=s.native_snapshot();var restored=fresh()
	check(restored.restore_native(saved) and restored.operations==s.operations,"Docked and previous operating plan round-trip")
	var bad=saved.duplicate(true);bad.operations.sources["bp-0"]="yes"
	var preserved=restored.native_snapshot();check(not restored.restore_native(bad) and restored.native_snapshot()==preserved,"Invalid operating switch rejects atomically")
	bad=saved.duplicate(true);bad.operations.devices["fixed-radio"]={"enabled":true,"priority":-1}
	check(not restored.restore_native(bad),"Invalid device priority is rejected")
	var old=saved.duplicate(true);old.erase("operations");old.erase("recovery")
	check(restored.restore_native(old) and restored.operations.mode=="legacy","Older native save receives legacy running defaults")
	s=fresh();s.expedition_gear.recovered=["battery-bank"];s.story.uniques=["course-gyro"]
	var bank=s.create_piece("battery-bank",{"x":3,"y":0,"z":3},0,{},true);bank.state.charge=120;s.fuel=0
	before=bank.state.charge;budget=MMFPowerBudget.calculate(s,s.structures,1)
	check(budget.battery_draw==2 and bank.state.charge==before,"Backup estimate is truthful and pure")
	s.update_power(1);check(bank.state.charge==118 and s.powered["fixed-helm"],"Actual backup debits two navigation units")
	s.operations.backup=false;s.update_power(1);check(bank.state.charge==118 and not s.powered["fixed-radio"],"Disabled backup preserves reserve")
	s.fuel=10;bank.state.charge=0;s.operations.charging=false;s.update_power(1);check(bank.state.charge==0,"Disabled charging creates no energy")
	s.operations.charging=true;s.update_power(1);check(bank.state.charge==2,"Charging obeys two-unit rate")
	s.fuel=.003;bank.state.charge=0;s.tick(1)
	check(s.fuel==0 and bank.state.charge<=.10001,"Fractional fuel cannot power a full second of charging")
	for step in [.1,.25,1.0]:
		var trial=fresh();trial.fuel=.06
		for i in int(2/step):trial.tick(step)
		check(is_zero_approx(trial.fuel),"Fuel exhaustion is bounded at dt "+str(step))
	s=fresh();empty(s);s.fuel=0;s.subsystems.engine=0;s.structures=s.structures.filter(func(p):return p.definitionId!="generator")
	var facts=s.story.duplicate(true);var inventory=s.inventory.slots.duplicate(true);var rng=s.rng.state
	check(MMFMachineService.diagnose(s).eligible,"Combined no-fuel/no-stock/no-engine/no-generator state qualifies")
	check(MMFMachineService.request(s) and not MMFMachineService.request(s),"Emergency request is unique while pending")
	s.recovery.phase="service";s.recovery.step=3
	check(MMFMachineService.complete(s,s.recovery.serial),"Combined stranded state completes without power, cargo or items")
	check(s.fuel==20 and s.subsystems.engine==160 and s.recovery.loan,"Assistance restores bounded tank, half engine and loan starter")
	check(s.inventory.slots==inventory and s.story==facts and s.rng.state==rng,"Assistance awards no materials, story facts or RNG changes")
	check(not MMFMachineService.complete(s,s.recovery.serial),"Duplicate completion gives nothing")
	budget=MMFPowerBudget.calculate(s,s.structures)
	check(budget.generation==16 and budget.fuel_rate==.06,"Loan starter has ordinary output and fuel cost")
	s.tick(1);check(s.speed>0 and s.fuel<20,"Assisted machine can actually move toward salvage")
	s.create_piece("refinery",{"x":3,"y":0,"z":3},0,{},true);s.update_power()
	check(s.station_powered("refinery") and s.powered["fixed-radio"],"Emergency restart can run opening refinery plus receiver")
	saved=s.native_snapshot();restored=fresh();check(restored.restore_native(saved) and restored.recovery==s.recovery,"Recovery benefits and request completion survive save/load")
	var real=s.create_piece("generator",{"x":4,"y":0,"z":3},0,{},true);s.update_power()
	check(not s.recovery.loan and MMFPowerBudget.calculate(s,s.structures).sources.size()==1,"Ordinary generator replaces loan without stacking supply")
	check(not MMFMachineOperations.source_enabled(s.operations,real.instanceId),"New generator in a deliberate configuration starts stopped")
	s=fresh();empty(s);s.fuel=99.5;s.inventory.add("fuel",1)
	check(not MMFMachineService.refill(s,1) and s.inventory.count_item("fuel")==1,"Fractional tank headroom does not waste a whole fuel item")
	s.fuel=90;var crate=s.create_piece("crate",{"x":4,"y":0,"z":3},0,{},true);s.stores[crate.instanceId].add("fuel",5)
	check(MMFMachineService.refill(s,5) and s.fuel==95 and s.count_resource("fuel")==1,"Pooled refill consumes pack then storage exactly")
	s.inventory.add("scrap",40);before=s.count_resource("scrap")
	check(MMFMachineService.buy_fuel(s,"relay-foundry",5) and s.fuel==100 and s.recovery.stock["relay-foundry"]==15 and s.count_resource("scrap")==before-10,"Service pump transfers five fuel for exact price and durable stock")
	preserved=s.native_snapshot();check(not MMFMachineService.buy_fuel(s,"relay-foundry",1) and s.native_snapshot()==preserved,"Full tank purchase has zero mutation")
	restored=fresh();check(restored.restore_native(s.native_snapshot()) and restored.recovery.stock["relay-foundry"]==15,"Partial pump stock survives load")
	bad=s.native_snapshot();bad.recovery.stock["relay-foundry"]=21;check(not restored.restore_native(bad),"Invalid service stock is rejected")
	for id in ["recovery-empty","recovery-destroyed","operations-shutdown","operations-loads"]:
		var payload=game.playtests.payload(id);var trial=fresh()
		check(trial.restore_native(payload.session),"Fault checkpoint round-trip: "+id)
		if id.begins_with("recovery"):check(trial.fuel==0 and trial.count_resource("scrap")==0 and trial.count_resource("fuel")==0,"Fault checkpoint has exact empty supplies: "+id)
	extra_contracts()
	await world_tests()
	await finish()

func world_tests():
	check(game.playtests.launch("operations-loads"),"Operations checkpoint launches in isolated save scope")
	game.set_physics_process(false);game.player.set_physics_process(false)
	var s=game.session
	game.close_menu();game.player.position=Vector3(-6,12.5,-9.7);await frames(4)
	check(game.engineering.near(),"Permanent service cabinet is within reach on service deck")
	check(game.interaction_target().get("kind")=="engineering","World interaction selects physical engineering cabinet")
	game.interact();check(game.ui.page=="Machine" and game.engineering.authorized(),"Use opens local engineering interface")
	check(game.ui.context_pages().is_empty() and not game.ui.terminal.active,"Engineering is separate from helm tabs and personal wrist")
	await capture("engineering")
	game.engineering.view="modes";game.engineering.pending=MMFMachineOperations.proposal(s,"defense");game.ui.refresh();await capture("modes")
	var before=s.operations.duplicate(true);game.open_menu("Inventory")
	game.engineering.operate(MMFMachineOperations.proposal(s,"defense"));check(s.operations==before,"Personal wrist cannot apply machine settings")
	game.close_menu();game.player.position=Vector3(-6,12.5,-9.7);game.interact();game.engineering.view="service";game.ui.refresh();await capture("service")
	game.close_menu();check(game.playtests.launch("recovery-destroyed"),"Destroyed-machine playtest launches")
	game.set_physics_process(false);game.player.set_physics_process(false);s=game.session
	game.player.position=Vector3(-6,12.5,-9.7);game.interact();game.engineering.request()
	game.combat.ship_state="retreat";game.engineering.update(1)
	check(s.recovery.phase=="requested","Pending assistance does not erase a retreating carrier")
	game.combat.ship_state="none";game.engineering.update(.1)
	check(s.recovery.phase=="service" and not game.combat.begin_ship(),"Safe service begins locally and defers new ships")
	var snapshot=s.native_snapshot();var restored=fresh()
	check(restored.restore_native(snapshot) and restored.recovery.phase=="service","Service can be saved mid-procedure")
	for step in 3:
		Input.action_release("use");game.engineering.update(.1)
		Input.action_press("use");game.engineering.update(1.6)
		Input.action_release("use")
	check(s.recovery.phase=="idle" and s.recovery.loan and s.fuel==20,"Real held-action coordinator completes all three steps")
	check(game.combat.ship_state=="none" and s.story.phase=="locked","Recovery never grants story progress or starts an encounter")
	await capture("restart")
	for checkpoint in ["foundry","orchard-caretaker","orchard-cold-vault"]:
		game.close_menu();check(game.playtests.launch(checkpoint),"Service site checkpoint launches: "+checkpoint)
		game.set_physics_process(false);game.player.set_physics_process(false);s=game.session
		check(game.engineering.bay().is_empty(),"Service bay waits for required recoveries: "+checkpoint)
		var def=game.campaign.expedition()
		for id in def.requiredUniques:
			if id not in s.story.uniques:s.story.uniques.append(id)
		for id in def.get("requiredObjectives",[]):
			if id not in s.story.objectives:s.story.objectives.append(id)
		var bay=game.engineering.bay();check(not bay.is_empty(),"Service uses common supported return station: "+checkpoint)
		if not bay.is_empty():
			game.player.position=bay.at;game.interact();check(game.ui.page=="Service" and game.engineering.authorized(true),"Site service uses its own reached interface: "+checkpoint)
			await capture(checkpoint+"-bay")
	game.close_menu();game.player.position=Vector3.ZERO+Vector3(0,16.1,-1)
	var config=MMFMachineOperations.proposal(s,"docked")
	check(MMFMachineOperations.apply(s,config),"Actual dock accepts Docked mode")
	check(game.campaign.depart() and s.operations.mode!="docked","Valid departure restores prior travel configuration atomically")
	game.close_menu();game.playtests.launch("wake");game.set_physics_process(false);game.player.set_physics_process(false);s=game.session
	MMFMachineOperations.apply(s,MMFMachineOperations.proposal(s,"docked"));var stopped=s.operations.duplicate(true)
	check(not game.campaign.depart() and s.operations==stopped and s.story.phase=="docked","Unfinished expedition cannot resume power or retract its gangway")
	game.close_menu();game.playtests.launch("refuge");game.set_physics_process(false);game.player.set_physics_process(false);s=game.session
	MMFMachineOperations.apply(s,MMFMachineOperations.proposal(s,"docked"));game.opportunities.depart()
	check(s.contacts.active.state=="departing" and s.operations.mode!="docked","Optional departure also resumes its saved travel configuration")
	game.close_menu();game.playtests.launch("final-bearing");game.set_physics_process(false);game.player.set_physics_process(false);s=game.session
	game.manual_turret="blocked-save-fixture";var before_commit=s.native_snapshot()
	check(not game.campaign.begin_ending() and preload("res://tests/wrist_receipt_contract.gd").same_campaign(before_commit,s.native_snapshot()),"Failed final checkpoint leaves every campaign field unchanged except its local failure receipt")
	check(s.polish.get("receipts",[]).back().text=="Leave the deck gun before saving.","Failed checkpoint precondition remains accessible in local activity")
	game.manual_turret=""
	game.close_menu();game.playtests.launch("foundry-route");game.set_physics_process(false);game.player.set_physics_process(false)
	game.open_menu("Helm");await frames(3)
	var route_buttons=game.ui.content.find_children("*","Button",true,false)
	var estimates=[]
	for route in game.campaign.routes():
		var estimate=MMFMachineOperations.travel(game.session,route.distanceM)
		var expected="%dm · ~%.1f fuel"%[route.distanceM,estimate.fuel]
		check(route_buttons.any(func(button):return button.text.begins_with(route.id) and expected in button.text),"Route button shows its own distance and fuel: "+route.id)
		estimates.append(estimate.fuel)
	check(estimates.size()==2 and not is_equal_approx(estimates[0],estimates[1]),"Different Foundry routes carry different transit costs")
	await capture("route-estimates")


func finish():
	var report={"checks":checks,"failures":failures,"source_hash":source,"source_hash_end":MMFPlaytestRecorder.source_fingerprint(),"renderer":RenderingServer.get_video_adapter_name(),"captures":captures,"human_test":false}
	var suffix="headless" if DisplayServer.get_name()=="headless" else "native"
	var file=FileAccess.open("res://../test-results/recovery-operations-"+suffix+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	print("RECOVERY_OPERATIONS_RESULT ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)

func extra_contracts():
	var s=fresh();s.structures=s.structures.filter(func(p):return p.definitionId!="generator" and p.definitionId!="floor")
	s.inventory.add("components",6)
	check(MMFMachineService.diagnose(s).eligible,"Missing source can use loan even when stock cannot prove usable construction space")
	var s1=fresh();s1.story.completed=["relay-foundry"];s1.story.uniques=["course-gyro"]
	s1.create_piece("generator",{"x":3,"y":0,"z":3},0,{},true)
	var stock=s1.fuel
	for i in 60:s1.tick(1)
	check(is_equal_approx(stock-s1.fuel,7.2),"Two running generators debit 7.2 fuel over 60 simulated seconds")
	var proposal=MMFMachineOperations.proposal(s1,"cruise");MMFMachineOperations.apply(s1,proposal);stock=s1.fuel
	for i in 60:s1.tick(1)
	check(is_equal_approx(stock-s1.fuel,3.6),"Cruise shuts spare source and debits 3.6 over same interval")
	s1.story.phase="docked";MMFMachineOperations.apply(s1,MMFMachineOperations.proposal(s1,"docked"));stock=s1.fuel
	for i in 600:s1.tick(1)
	check(s1.fuel==stock,"Ten active docked minutes consume zero generator fuel")
	s=fresh();empty(s);s.fuel=0
	check(MMFMachineService.request(s),"New exhausted episode is requestable")
	MMFMachineService.cancel(s);check(s.recovery.phase=="idle" and MMFMachineService.valid(s.recovery),"Cancellation leaves durable valid state")
	check(MMFMachineService.request(s) and s.recovery.serial==2,"Cancellation does not consume future assistance")
	s.inventory.add("fuel",1);s.fuel=4;s.recovery.phase="service";s.recovery.step=3
	MMFMachineService.complete(s,s.recovery.serial)
	check(s.fuel==4 and s.inventory.count_item("fuel")==1,"Resolved fault receives no unnecessary top-up at completion")
	s=fresh();s.fuel=0;s.inventory.slots.fill(null);s.recovery.loan=true
	s.structures=s.structures.filter(func(p):return p.definitionId!="generator")
	s.fuel=20;s.expedition_gear.recovered=["quiet-drive"];s.create_piece("quiet-drive",{"x":3,"y":0,"z":3},0,{},true)
	s.expedition_gear.quiet=true;s.update_power()
	var preview=MMFNativeProgression.drive_preview(s)
	check(preview.quiet_generation==s.capacity and preview.normal_generation==16,"Quiet-drive comparison includes real loan source")
	var trial=fresh();var raw=s.native_snapshot();raw.recovery.phase="service";raw.recovery.serial=1;raw.recovery.completed=0;raw.recovery.step=3
	check(trial.restore_native(raw),"Durable completed substeps validate before final acknowledgement")
	var count=trial.structures.size();trial.recovery.phase="service";trial.recovery.step=3
	check(MMFMachineService.complete(trial,1) and trial.structures.size()==count,"Recovered substep completion creates no duplicate construction")
