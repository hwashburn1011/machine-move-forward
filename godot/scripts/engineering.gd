class_name MMFEngineering
extends RefCounted

var game
var anchors=[]
var labels=[]
var view="overview"
var pending={}
var held=0.0
var release_required=false
var drone: Node3D
var service_label: Label3D
var last_notice=""

func setup(owner_game):
	game=owner_game
	for cabinet in game.world.switchgear.root.get_children():
		anchors.append(cabinet.global_position+Vector3.UP*.7)
		# Cabinet face graphics and the reached interaction identify the station.
		# A floating duplicate label is not part of the machine's instrumentation.
	drone=Node3D.new();game.world.add_child(drone);drone.visible=false
	var body=MeshInstance3D.new();var sphere=SphereMesh.new();sphere.radius=.22;sphere.height=.32;body.mesh=sphere
	var material=StandardMaterial3D.new();material.albedo_color=Color(.23,.3,.31);material.metallic=.7;material.roughness=.38;body.material_override=material;drone.add_child(body)
	var ring=MeshInstance3D.new();var torus=TorusMesh.new();torus.inner_radius=.26;torus.outer_radius=.31;ring.mesh=torus;ring.material_override=material;drone.add_child(ring)
	service_label=Label3D.new();service_label.position.y=.65;service_label.billboard=BaseMaterial3D.BILLBOARD_ENABLED;service_label.pixel_size=.003;service_label.font_size=26;drone.add_child(service_label)
	service_label.hide() # Service steps use the existing reached interaction prompt.

func nearest_anchor() -> Vector3:
	var best=anchors[0];var distance=INF
	for at in anchors:
		var length=game.player.position.distance_to(at)
		if length<distance:distance=length;best=at
	return best

func near() -> bool:
	return not anchors.is_empty() and game.player.position.distance_to(nearest_anchor())<2.5

func authorized(site: bool=false) -> bool:
	if not game.started or game.session.health<=0 or game.cinematic!="" or not game.menu_open:return false
	if site:return game.ui.page=="Service" and game.ui.station_kind=="service-bay" and not bay().is_empty() and game.player.position.distance_to(bay().at)<2.5
	return game.ui.page=="Machine" and game.ui.station_kind=="engineering" and near()

func operate(quote: Dictionary):
	if not authorized():return
	if not MMFMachineOperations.apply(game.session,quote):game.session.notify("Configuration changed. Review the current controls again.")
	pending={};game.ui.refresh()

func equipment_switch(id: String,quote: Dictionary):
	var p=game.session.find_piece(id)
	if p.is_empty() or p.definitionId!="generator" or game.ui.page!="Equipment" or game.ui.storage_id!=id or not game.menu_open:return
	if game.building.center(p.cell).distance_to(game.player.position)>2.6:return
	MMFMachineOperations.apply(game.session,quote);game.ui.refresh()

func request():
	if not authorized():return
	if MMFMachineService.request(game.session):
		game.close_menu();game.session.notify("Service requested. Return to a chassis cabinet after the threat clears; hold Use at each service step.")

func update(dt: float):
	var s=game.session
	reminders()
	var safe=not game.combat.active_threat() and game.combat.ship_state=="none" and s.attack_recent<=0 and s.health>0 and game.cinematic==""
	if s.recovery.phase=="requested" and safe and near() and not game.menu_open:
		s.recovery.phase="service";held=0;release_required=false
	if s.recovery.phase=="service" and (not safe or not near()):s.recovery.phase="requested";held=0
	if s.recovery.phase=="service" and s.recovery.step==3:MMFMachineService.complete(s,int(s.recovery.serial))
	drone.visible=s.recovery.phase=="service"
	if drone.visible:
		drone.position=nearest_anchor()+Vector3(.65,.75,0);drone.position.y+=sin(s.clock*2)*.04
		service_label.text=step_text()+"\n"+game.hint("HOLD [{key:use}]")
	if not Input.is_action_pressed("use"):held=0;release_required=false
	if s.recovery.phase!="service" or game.menu_open or not safe or not near() or s.speed>.16 or release_required:return
	if Input.is_action_pressed("use"):
		held+=dt
		if held>=1.5:
			held=0;release_required=true;s.recovery.step+=1
			if s.recovery.step>=3:MMFMachineService.complete(s,int(s.recovery.serial))

func step_text() -> String:
	return ["ISOLATE THE SERVICE FEED","CONNECT THE SERVICE COUPLING","RESTART ESSENTIAL SYSTEMS"][mini(2,game.session.recovery.step)]

func reset():
	held=0;release_required=true;pending={};view="overview";last_notice=""
	if is_instance_valid(drone):drone.visible=false

func bay() -> Dictionary:
	var s=game.session;var campaign=game.campaign
	if s.story.phase!="docked" or not is_instance_valid(campaign.destination):return {}
	var def=campaign.expedition()
	if def.id not in MMFMachineService.SITES:return {}
	for id in def.requiredUniques:
		if id not in s.story.uniques:return {}
	for id in def.get("requiredObjectives",[]):
		if id not in s.story.objectives:return {}
	for p in campaign.points:
		if p.entry.kind=="departure":return {"id":def.id,"at":campaign.destination.to_global(p.at)-Vector3.UP*.6}
	return {}

static func overview_diagnosis(s) -> Array:
	var budget=MMFPowerBudget.calculate(s,s.structures)
	var intentional_stop=s.operations.mode=="docked" and MMFMachineOperations.docked(s) and not budget.drive_enabled
	# Keep hardware/tank faults, but do not tell the player to undo a deliberate
	# shutdown. Available backup is factual status, not a restart instruction.
	var lines=MMFMachineService.diagnose(s,not intentional_stop).faults.duplicate()
	if intentional_stop:
		for c in budget.consumers:
			if c.id not in ["fixed-radio","fixed-helm","fixed-fieldwork"]:continue
			lines.append(c.id.trim_prefix("fixed-").capitalize()+": "+("supplied by battery backup." if c.served else "off while Docked; no battery supply."))
	return lines

func render(ui):
	if not authorized():ui.text_line("Approach a chassis switchgear cabinet on the service deck to use engineering.");return
	var s=game.session;var report=MMFPowerBudget.calculate(s,s.structures)
	ui.section("ENGINEERING",("MANUAL" if s.operations.mode=="legacy" else s.operations.mode.to_upper()))
	ui.text_line("%.1f generated · %.1f served / %.1f requested\nFuel %.1f / 100 · %.1f per active minute"%[report.generation,report.served,report.demand,s.fuel,report.fuel_rate*60])
	ui.text_line("Each running generator uses %.1f fuel per active minute. Turn off spare sources to save fuel."%(3.6*s.modifiers().fuelBurnMultiplier))
	ui.text_line("Approx. %.1f active minutes at this load"%(s.fuel/report.fuel_rate/60) if report.fuel_rate>0 else "Generators stopped · no fuel debit")
	for tab in ["overview","modes","devices","service"]:ui.compact_row(tab.capitalize(),"OPEN" if view==tab else "",func():view=tab;pending={};ui.refresh())
	match view:
		"overview":
			for fault in overview_diagnosis(s):ui.text_line(fault)
			ui.text_line(MMFMachineOperations.docked_guidance(s))
			for source in report.sources:
				var quote=MMFMachineOperations.switch_quote(s,source.id,not source.enabled)
				ui.compact_row(source_name(source.id)+" · "+source.reason,"%.1f power · %s"%[source.output,"STOP" if source.enabled else "START"],func():operate(quote))
			ui.button("REPAIRS / EMERGENCY SERVICE",func():view="service";ui.refresh())
		"modes":
			ui.text_line(MMFMachineOperations.docked_guidance(s))
			for mode in MMFMachineOperations.modes(s):
				ui.button("PREVIEW "+mode.to_upper(),func():pending=MMFMachineOperations.proposal(s,mode);ui.refresh(),mode!="docked" or MMFMachineOperations.docked(s))
			if MMFMachineOperations.modes(s).is_empty():ui.text_line("Docked and Cruise are introduced at the Wake. Salvage and Defense follow the Foundry.")
			if not pending.is_empty():
				var projected=MMFPowerBudget.calculate(s,s.structures,0,pending.config)
				ui.section("PROPOSED "+pending.config.mode.to_upper(),"%.1f fuel / min"%(projected.fuel_rate*60))
				for source in projected.sources:ui.text_line(source_name(source.id)+": "+source.reason)
				for c in projected.consumers:ui.text_line(device_name(c)+": "+c.reason)
				ui.button("APPLY OPERATING MODE",func():operate(pending))
		"devices":
			for c in report.consumers:
				ui.text_line(device_name(c)+" · "+c.reason+" · "+str(c.draw)+" power",true)
				var config=MMFMachineOperations.materialized(s);config.devices[c.id].enabled=not c.enabled
				var quote={"signature":MMFMachineOperations.signature(s),"config":config}
				ui.button("DISABLE" if c.enabled else "ENABLE",func():operate(quote))
				if "relay-foundry" in s.story.completed:
					var priorities=["Essential","Normal","Optional"]
					var changed=MMFMachineOperations.materialized(s);changed.devices[c.id].priority=(int(c.priority)+1)%3
					var priority_quote={"signature":MMFMachineOperations.signature(s),"config":changed}
					ui.button("PRIORITY: "+priorities[c.priority]+" → "+priorities[changed.devices[c.id].priority],func():operate(priority_quote))
			if "battery-bank" in s.expedition_gear.recovered and s.has_station("battery-bank"):
				for key in ["charging","backup"]:
					var config=MMFMachineOperations.materialized(s);config[key]=not s.operations[key]
					var quote={"signature":MMFMachineOperations.signature(s),"config":config}
					ui.button(("ALLOW CHARGING" if key=="charging" else "ALLOW NAVIGATION BACKUP")+": "+("ON" if s.operations[key] else "OFF"),func():operate(quote))
				ui.text_line("Battery backup serves navigation only. It cannot power propulsion or guns.")
		"service":render_service(ui,false)

func device_name(c: Dictionary) -> String:
	return c.id.trim_prefix("fixed-").capitalize() if c.id in MMFMachineOperations.FIXED else game.data.BUILD_PIECES[c.type].name+" · "+location_name(c.id)

func render_service(ui,site: bool):
	if not authorized(site):ui.text_line("Approach the local service station.");return
	var s=game.session
	ui.section("MACHINE SERVICE","Tank %.1f / 100"%s.fuel)
	ui.text_line("Fuel items in pack / storage: %d · pooled scrap: %d"%[s.count_resource("fuel"),s.count_resource("scrap")])
	ui.text_line("Transfer your fuel items into the machine's tank; only the amount that fits is used.")
	for amount in [1,5,100]:
		ui.button("TRANSFER "+("AVAILABLE FUEL ITEMS" if amount==100 else str(amount)+(" FUEL ITEM" if amount==1 else " FUEL ITEMS"))+" TO TANK",func():
			if authorized(site):MMFMachineService.refill(s,amount);ui.refresh(),s.count_resource("fuel")>0 and s.fuel<=99)
	for id in s.subsystems:
		var quote=MMFMachineService.repair_quote(s,id)
		if quote.needed:repair_button(ui,quote,site)
	for p in s.structures:
		if p.definitionId=="generator":
			var quote=MMFMachineService.repair_quote(s,p.instanceId)
			if quote.needed:repair_button(ui,quote,site)
	if site:
		var current=bay();var id=current.id
		if id=="glass-orchard" and s.missions.orchard_fuel>0:
			ui.text_line("MISSION RESERVE · Supplies for the next roof · %d fuel items remain"%s.missions.orchard_fuel)
			ui.button("COLLECT MISSION FUEL RESERVE",func():
				if authorized(true) and bay().id=="glass-orchard":
					var before=s.missions.orchard_fuel;s.missions.orchard_fuel=s.add_resource("fuel",int(before));s.transaction.emit("mission_reserve_claimed",{"fuel":before-s.missions.orchard_fuel});ui.refresh())
		ui.text_line("Service pump → machine tank · %d units left · %d scrap per unit"%[s.recovery.stock[id],MMFMachineService.FUEL_PRICE])
		for count in [1,5,10]:
			ui.button("FILL TANK +%d · BUY FOR %d SCRAP"%[count,count*MMFMachineService.FUEL_PRICE],func():
				if authorized(true) and bay().id==id:MMFMachineService.buy_fuel(s,id,count);ui.refresh(),s.recovery.stock[id]>=count and s.fuel+count<=100 and s.can_pay({"scrap":count*MMFMachineService.FUEL_PRICE}))
	else:
		var diagnosis=MMFMachineService.diagnose(s)
		for fault in diagnosis.faults:ui.text_line(fault)
		if s.recovery.phase=="idle":ui.button("REQUEST EMERGENCY SERVICE",request,diagnosis.eligible)
		else:
			ui.text_line("Service requested. Close this panel and hold Use at the cabinet when safe.")
			ui.button("CANCEL REQUEST",func():
				if authorized():MMFMachineService.cancel(s);ui.refresh())
		ui.text_line("Emergency help reaches this port without fuel or a powered receiver. It restores essential machinery and a small tank reserve.")

func repair_button(ui,quote: Dictionary,site: bool):
	var s=game.session;var cost=quote.cost
	ui.button("REPAIR %s · %d SCRAP"%[quote.name,cost],func():
		if authorized(site) and MMFMachineService.repair_quote(s,quote.id).get("cost",-1)==cost:s.repair(quote.id);ui.refresh(),s.can_pay({"scrap":cost}))

func reminders():
	var s=game.session
	if game.menu_open or game.cinematic!="" or game.combat.active_threat() or not s.opening_done or not game.settings.get("objective_reminders",true):return
	var id="";var message=""
	if s.story.phase=="docked" and s.story.index==0:
		id="operations/wake";message="Before exploring: Docked mode stops generator fuel burn. Engineering cabinets are one deck below. Resume travel at the helm when ready."
	elif "relay-foundry" in s.story.completed:
		id="operations/foundry";message="Foundry equipment opens Salvage and Defense modes. Compare power and fuel at the service-deck engineering cabinets."
	elif s.facts.get("defenses",0)>0 and s.subsystems.engine<s.data.SUBSYSTEMS.engine.maxHealth:
		id="operations/repair";message="Engine damage reduces travel speed. Engineering shows its exact scrap repair cost; emergency service is available if you are stranded."
	if id!="" and id not in s.polish.seen:
		s.polish.seen.append(id);s.notify(message)

func location_name(id: String) -> String:
	var p=game.session.find_piece(id)
	if p.is_empty():return "service port"
	return ["lower deck","service deck","top deck","upper deck","roof"][clampi(p.cell.y+2,0,4)]+" ("+str(p.cell.x)+", "+str(p.cell.z)+")"

func source_name(id: String) -> String:
	if id=="loan-generator":return "Loan starter · service port"
	var sources=game.session.structures.filter(func(p):return p.definitionId=="generator")
	for i in sources.size():
		if sources[i].instanceId==id:return "Generator "+str(i+1)+" · "+location_name(id)
	return "Generator"
