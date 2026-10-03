class_name MMFSession
extends RefCounted

signal notice(text: String)
signal changed
signal contact_ready
signal piece_used(instance_id: String,reason: String)
signal transaction(event: String,details: Dictionary)

const POWER_DRAWS = {"lamp": 1, "refinery": 10, "turret-manual": 3, "collector-auto": 4, "turret-auto": 6, "caretaker-dock": 3, "salvage-crane":4}
const SCAN_DURATION_SECONDS=180.0
const SCAN_HANDOFF_SECONDS=3.0

var data: Dictionary
var inventory: MMFInventory
var structures: Array = []
var stores: Dictionary = {}
var seed_name = "mmf-default-seed"
var rng = MMFRandom.new()
var distance = 0.0
var speed = 0.0
var fuel = 60.0
var health = 100.0
var subsystems = {}
var current_weapon = "rifle"
var weapons = {}
var scanner = {"format": 1, "phase": "awaiting-receiver", "elapsedS": 0.0, "pendingDelayS": 0.0,"durationS":SCAN_DURATION_SECONDS}
var facts = {"salvage": false, "refined": 0, "defenses": 0, "portCraneRepaired":false, "portCraneEnabled":true, "guardianOutcome":""}
var unlocks: Array = []
var research = {"completed": [], "active": {}, "job": "", "elapsed": 0.0}
var attachment_research: Array = []
var story = {"phase": "locked", "index": 0, "arrival": 0.0, "routeId": "", "uniques": [], "journals": [], "objectives": [], "completed": [], "ending": "none"}
var caretaker = {"recovered": false, "mode": "companion", "priority": "auto"}
var weather = {"phase": "clear", "elapsed": 0.0, "next": 600.0, "intensity": 0.0, "sequence":0}
var sheltered=false
var contacts={"nextSlot":1,"active":{},"candidates":[],"visited":[],"missed":[]}
var threat = {"phase": "calm", "remaining": 800.0, "warning": false}
var course = 0.0
var target_course = 0.0
var lateral = 0.0
var next_piece_id = 0
var attack_recent = 0.0
var clock = 0.0
var capacity = 0.0
var demand = 0.0
var powered: Dictionary = {}
var opening_done = false
var save_extras: Dictionary = {}
var survivor_content={"toolAcquired":false,"toolSelected":false,"refuge":{},"workshop":{}}
var scout_state={"phase":"idle","sequence":0,"resolved":0,"outcome":"","progress":0.0}
var expedition_gear=MMFNativeProgression.gear_defaults()
var operations=MMFMachineOperations.defaults()
var recovery=MMFMachineService.defaults()
var narrative=MMFNarrativeProgress.defaults()
var missions=MMFMissionContracts.defaults()
var finale=MMFMeridianFinale.defaults()
var customization=MMFNomadPersonalization.defaults()
var roadside=MMFRoadsideOutposts.defaults()
var battery_draw=0.0
var fieldwork_active = false

func _init(definitions: Dictionary):
	MMFNativeProgression.apply(definitions)
	data = definitions
	survivor_content=MMFSurvivorContent.defaults()
	rng.seed = MMFRandom.hash_seed([seed_name])
	inventory = MMFInventory.new(data.ITEMS, int(data.PLAYER_INVENTORY_SLOTS))
	for id in data.STARTING_INVENTORY: inventory.add(id, int(data.STARTING_INVENTORY[id]))
	for id in data.WEAPONS: weapons[id] = {"id": id, "ammoInMag": data.WEAPONS[id].magazineSize, "reserveAmmo": data.WEAPONS[id].startingReserve, "magazineBonus": 0, "attachment": ""}
	for id in data.SUBSYSTEMS: subsystems[id] = float(data.SUBSYSTEMS[id].maxHealth)
	for p in data.STARTING_STRUCTURES: create_piece(p.piece, p.cell, int(p.rotation), {}, true)

func notify(text: String):
	notice.emit(text)
	changed.emit()

func containers() -> Array:
	return [inventory] + stores.values()

func count_resource(id: String) -> int:
	var count = 0
	for bag in containers(): count += bag.count_item(id)
	return count

func can_pay(cost: Dictionary) -> bool:
	for id in cost:
		if count_resource(id) < cost[id]: return false
	return true

func pay(cost: Dictionary) -> bool:
	if not can_pay(cost): return false
	for id in cost:
		var left = int(cost[id])
		for bag in containers(): left -= bag.remove(id, left)
	return true

func add_resource(id: String, count: int) -> int:
	var left = count
	for bag in containers(): left = bag.add(id, left)
	return left

func resource_room(id: String) -> int:
	var room = 0
	for bag in containers(): room += bag.room_for(id)
	return room

func has_station(id: String) -> bool:
	for p in structures:
		if p.definitionId == id and p.health > 0: return true
	return false

func station_powered(id: String) -> bool:
	for p in structures:
		if p.definitionId == id and p.health > 0 and powered.get(p.instanceId, true): return true
	return false

func create_piece(id: String, cell: Dictionary, turn: int = 0, edge: Dictionary = {}, free: bool = false) -> Dictionary:
	if not data.BUILD_PIECES.has(id): return {}
	if not free and (id in MMFNativeProgression.RETIRED_PIECES or id in MMFNativeProgression.MODULES and id not in expedition_gear.recovered):return {}
	if not free and MMFMachineSpaces.bay_refusal({"definitionId":id,"cell":cell,"rotation":turn})!="":return {}
	var def = data.BUILD_PIECES[id]
	if not free and not pay(def.cost): return {}
	var instance = {"instanceId": "bp-%d" % next_piece_id, "definitionId": id, "cell": cell.duplicate(), "rotation": turn, "health": def.maxHealth, "state": {}}
	next_piece_id += 1
	if not edge.is_empty(): instance.edge = edge.duplicate()
	structures.append(instance)
	if id=="refinery":facts.refineryBuilt=true
	if id=="workbench":facts.workbenchBuilt=true
	if id in ["crate", "collector-auto"]:
		stores[instance.instanceId] = MMFInventory.new(data.ITEMS, 12 if id == "crate" else 6)
	if id=="battery-bank":instance.state={"charge":0.0}
	changed.emit()
	return instance

func find_piece(id: String) -> Dictionary:
	for p in structures:
		if p.instanceId == id: return p
	return {}

func craft(id: String, times: int = 1, station_id: String="") -> bool:
	var recipe = {}
	for candidate in data.RECIPES:
		if candidate.id == id: recipe = candidate
	if recipe.is_empty(): return false
	if station_id!="":
		var station=find_piece(station_id)
		if station.is_empty() or station.definitionId!=recipe.station or station.health<=0 or not powered.get(station_id,true):return false
	if not station_powered(recipe.station):
		notify("Install and power a " + recipe.station + " first.")
		return false
	var made = 0
	for i in clampi(times, 1, 100):
		if not can_pay(recipe.inputs): break
		# Trial the complete transaction so full bags never delete materials.
		var backups = []
		var revisions=[]
		for bag in containers():backups.append(bag.slots.duplicate(true));revisions.append(bag.mutation_revision)
		pay(recipe.inputs)
		if add_resource(recipe.output.itemId, int(recipe.output.count)) > 0:
			var bags = containers()
			for j in bags.size():bags[j].slots=backups[j];bags[j].mutation_revision=revisions[j]
			break
		made += 1
		if id == "refine-components": facts.refined += int(recipe.output.count)
	if made > 0:
		if station_id!="":piece_used.emit(station_id,"Crafted supplies")
		else:
			for p in structures:
				if p.definitionId==recipe.station and p.health>0:piece_used.emit(p.instanceId,"Crafted supplies")
		transaction.emit("crafted",{"recipe":id,"batches":made,"inputs_per_batch":recipe.inputs,"output":recipe.output})
		notify("Crafted %s × %d" % [recipe.name, made])
	else: notify("Check materials and free storage space.")
	return made > 0

func use_item(id: String) -> bool:
	if inventory.count_item(id) == 0: return false
	match id:
		"repair-kit":
			if health<=0 or health>=100: return false
			health = minf(100, health + 40)
		"extended-mag":
			if weapons[current_weapon].magazineBonus > 0: return false
			weapons[current_weapon].magazineBonus = int(data.WEAPONS[current_weapon].magazineSize * 0.5)
		_: return false
	inventory.remove(id, 1)
	transaction.emit("item_used",{"item":id,"count":1})
	changed.emit()
	return true

func refuel() -> bool:
	return MMFMachineService.refill(self)

func salvage_reward() -> Dictionary:
	var contents = {"scrap": rng.randi_range(22, 46)}
	if rng.randf() < 0.75: contents.components = rng.randi_range(1, 3)
	if rng.randf() < 0.75: contents.fuel = rng.randi_range(3, 4)
	if not facts.salvage:
		contents.scrap+=12
		contents.fuel=contents.get("fuel",0)+4
		facts.salvage = true
		if "manual-turret" not in unlocks: unlocks.append("manual-turret")
		scanner.phase = "awaiting-module"
		notify("Radio recovered. Build a refinery and workbench to repair the scanner.")
	return MMFNomadPersonalization.salvage_reward(self,contents)

func install_scanner() -> bool:
	if scanner.phase != "awaiting-module" or not pay({"scanner-replacement-module": 1}): return false
	scanner.phase = "installed"
	transaction.emit("scanner_installed",{"item":"scanner-replacement-module","count":1})
	notify("Scanner module installed. Ready to begin scanning.\nThe workbench can also make an actuator for the seized port crane; fit it at the left-side crane base.")
	return true

func start_scan(aboard: bool = true) -> bool:
	update_power()
	if scanner.phase != "installed" or not powered.get("fixed-radio",false) or attack_recent > 0 or not aboard: return false
	scanner.phase = "scanning"
	story.phase = "signal"
	notify("Scanner active. Keep the receiver powered for %d seconds. Salvage, repair or build while it scans."%SCAN_DURATION_SECONDS)
	return true

func scan_fraction() -> float:
	return clampf(float(scanner.elapsedS)/SCAN_DURATION_SECONDS,0,1)

func modifiers() -> Dictionary:
	var result = data.DEFAULT_UPGRADE_MODIFIERS.duplicate()
	for id in research.active.values():
		if not data.UPGRADES.has(id): continue
		for key in data.UPGRADES[id].modifiers:
			if key.ends_with("Bonus"): result[key] += data.UPGRADES[id].modifiers[key]
			else: result[key] *= data.UPGRADES[id].modifiers[key]
	if MMFNativeProgression.quiet_running(self):
		result.speedMultiplier*=.65;result.generationBonus-=4
	return result

func begin_research(id: String) -> bool:
	# UpgradeSystem.research is an instant unlock; fitting is a separate choice.
	if not data.UPGRADES.has(id) or id in research.completed: return false
	if not pay(data.UPGRADES[id].researchCost): return false
	research.completed.append(id)
	transaction.emit("researched",{"id":id,"cost":data.UPGRADES[id].researchCost})
	changed.emit()
	return true

func activate_upgrade(id: String) -> bool:
	if not data.UPGRADES.has(id) or id not in research.completed: return false
	research.active[data.UPGRADES[id].branch] = id
	update_power()
	changed.emit()
	return true

func deactivate_upgrade(branch: String) -> bool:
	if not research.active.has(branch): return false
	research.active.erase(branch)
	update_power()
	changed.emit()
	return true

func repair(id: String) -> bool:
	if subsystems.has(id):
		var def = data.SUBSYSTEMS[id]
		var missing = def.maxHealth - subsystems[id]
		if missing <= 0: return false
		var cost = maxi(1, int(ceil(def.repairScrap * missing / def.maxHealth)))
		if not pay({"scrap": cost}): return false
		subsystems[id] = def.maxHealth
	else:
		var p = find_piece(id)
		if p.is_empty(): return false
		var def = data.BUILD_PIECES[p.definitionId]
		if p.health >= def.maxHealth: return false
		var cost = maxi(1, int(ceil(def.cost.get("scrap", 0) * (1-p.health/def.maxHealth) * 0.2)))
		if not pay({"scrap": cost}): return false
		p.health = def.maxHealth
		piece_used.emit(id,"Repaired equipment")
	update_power()
	transaction.emit("machine_repaired",{"id":id})
	notify("Repair complete.")
	return true

func update_power(step_seconds: float=0.0):
	if recovery.loan and has_station("generator"):recovery.loan=false
	var budget=MMFPowerBudget.calculate(self,structures,step_seconds)
	capacity=budget.capacity;demand=budget.demand;powered=budget.powered;battery_draw=budget.battery_draw
	if step_seconds<=0:return
	for p in structures:
		if p.definitionId!="battery-bank" or p.health<=0:continue
		var change=budget.charge.get(p.instanceId,0)-budget.discharge.get(p.instanceId,0)
		p.state["charge"]=clampf(float(p.state.get("charge",0))+change*step_seconds,0,120)

func travel_speed() -> float:
	var mods=modifiers();var weight=12000.0
	for p in structures:weight+=data.BUILD_PIECES[p.definitionId].weight
	var engine=subsystems.engine/data.SUBSYSTEMS.engine.maxHealth
	var legs=0.0
	for id in subsystems:
		if id.begins_with("leg-"):legs+=subsystems[id]/data.SUBSYSTEMS[id].maxHealth
	var result=7.5*engine*(.4+.6*legs/4)*mods.speedMultiplier/sqrt((12000+(weight-12000)*mods.effectiveWeightMultiplier)/12000)
	return result*(.2 if fuel<=0 else 1.0)

func tick(dt: float, stable: bool = true, aboard: bool = true):
	# Split the fuel-exhaustion boundary so energy is never generated for an
	# entire large step from a fractional remainder of fuel.
	var initial=MMFPowerBudget.calculate(self,structures,dt)
	if initial.fuel_rate>0 and fuel>0 and fuel<initial.fuel_rate*dt-.0000001:
		var supplied_seconds=fuel/initial.fuel_rate
		tick(supplied_seconds,stable,aboard);fuel=0
		tick(dt-supplied_seconds,stable,aboard);return
	clock += dt
	attack_recent = maxf(0, attack_recent-dt)
	update_power(dt)
	var mods=modifiers()
	var target=travel_speed() if initial.drive_enabled else 0.0
	fuel=maxf(0,fuel-dt*initial.fuel_rate)
	if recovery.phase=="service":target=0
	if story.phase in ["docked", "crossfire", "arrival", "finale-docked"] or contacts.active.get("state","") in ["docked","visited"] or not opening_done: target = 0
	if contacts.active.get("state","")=="committed":
		target=minf(target,maxf(0.1,(contacts.active.atDistanceM-distance)*0.18))
	if story.phase in ["approach", "braking"]:
		var left = maxf(0, story.arrival-distance)
		if left < 180: target = minf(target, maxf(0.0 if left<=0 else 0.1, left*0.18))
	speed = lerpf(speed, target, 1-exp(-3.3*mods.accelerationMultiplier*dt))
	distance += speed*dt
	course = move_toward(course, target_course, dt*1.5)
	lateral += sin(deg_to_rad(course))*speed*dt
	if scanner.phase == "scanning" and stable and aboard and health>0 and attack_recent <= 0 and powered.get("fixed-radio",false):
		scanner.elapsedS = minf(SCAN_DURATION_SECONDS, scanner.elapsedS+dt)
		if scanner.elapsedS >= SCAN_DURATION_SECONDS:
			scanner.phase = "contact-ready"
			scanner.pendingDelayS = SCAN_HANDOFF_SECONDS
	elif scanner.phase == "contact-ready" and stable and aboard and health>0 and attack_recent <= 0:
		scanner.pendingDelayS = maxf(0, scanner.pendingDelayS-dt)
		if scanner.pendingDelayS == 0:
			scanner.phase = "consumed"
			contact_ready.emit()

func objective() -> String:
	return MMFObjectiveGuide.describe(self).text

func complete_guardian(outcome: String) -> bool:
	if outcome not in ["destroyed","disarmed","evaded"] or facts.get("guardianOutcome","")!="":return false
	if story.routeId!="meridian-cordon-gap" or story.get("scripted","")!="resolved":return false
	facts.guardianOutcome=outcome
	transaction.emit("guardian_clearance",{"outcome":outcome,"reward":"g01-service-mark"})
	changed.emit()
	return true

func navigation_limit() -> float:
	if "meridian-solution" in story.uniques: return 45
	if "vector-governor" in story.uniques: return 28
	if "course-actuator" in story.uniques: return 12
	return 0

var polish={"seen":[],"log":[],"activities":{},"favorites":[]}

func native_snapshot() -> Dictionary:
	var storage = {}
	for id in stores: storage[id] = stores[id].slots.duplicate(true)
	return {"format": 1, "seed": seed_name, "distance": distance, "speed": speed, "fuel": fuel,
		"operations":operations,"recovery":recovery,"narrative":narrative,"missions":missions,"finale":finale,"customization":customization,"roadside":roadside,
		"health": health, "subsystems": subsystems, "expeditionGear":expedition_gear,
		"inventory": inventory.slots, "structures": structures, "stores": storage, "weapons": weapons,
		"currentWeapon": current_weapon, "scanner": scanner, "facts": facts, "unlocks": unlocks,
		"research": research, "attachmentResearch": attachment_research, "story": story, "caretaker": caretaker,
		"weather": weather, "threat": threat, "course": course, "targetCourse": target_course, "lateral": lateral,
		"contacts":contacts,"polish":polish,"survivorContent":survivor_content,"scoutState":scout_state,
		"nextPieceId": next_piece_id, "openingDone": opening_done, "clock": clock, "rngState": str(rng.state)}.duplicate(true)

func restore_native(raw: Dictionary) -> bool:
	if not MMFSaveValidation.session(raw,data,native_snapshot()): return false
	if raw.get("format") != 1 or not raw.get("inventory") is Array: return false
	var trial = MMFInventory.new(data.ITEMS, 20)
	if not trial.restore(raw.inventory): return false
	for p in raw.get("structures", []):
		if not data.BUILD_PIECES.has(p.get("definitionId", "")) or not p.get("cell") is Dictionary: return false
	inventory = trial
	seed_name = raw.get("seed", seed_name)
	distance = float(raw.get("distance", 0))
	speed = float(raw.get("speed", 0))
	fuel = clampf(raw.get("fuel", 60), 0, 100)
	health = clampf(raw.get("health", 100), 0, 100)
	structures = raw.get("structures", []).duplicate(true)
	stores.clear()
	for p in structures:
		if p.definitionId in MMFNativeProgression.RETIRED_PIECES or p.definitionId=="seed-garden":
			var stock=p.state.get("legacyStock",{}).duplicate()
			var item="fuel" if p.definitionId=="condenser" else "scrap"
			stock[item]=stock.get(item,0)+int(p.state.get("stored",0))
			stock["fuel"]=stock.get("fuel",0)+int(p.state.get("water",0))
			p.state={"legacyStock":stock}
		if p.definitionId in ["crate", "collector-auto"]:
			var bag = MMFInventory.new(data.ITEMS, 12 if p.definitionId == "crate" else 6)
			if not bag.restore(raw.get("stores", {}).get(p.instanceId, [])): return false
			stores[p.instanceId] = bag
	for pair in [["subsystems","subsystems"], ["weapons","weapons"], ["scanner","scanner"], ["facts","facts"], ["unlocks","unlocks"], ["research","research"], ["story","story"], ["caretaker","caretaker"], ["weather","weather"], ["threat","threat"]]:
		if raw.has(pair[0]):
			var value=raw[pair[0]].duplicate(true)
			if value is Dictionary:
				var merged=get(pair[1]).duplicate(true);merged.merge(value,true);value=merged
			set(pair[1],value)
	current_weapon = raw.get("currentWeapon", "rifle")
	facts.guardianOutcome=raw.facts.get("guardianOutcome","")
	customization=raw.get("customization",MMFNomadPersonalization.defaults()).duplicate(true)
	roadside=raw.get("roadside",MMFRoadsideOutposts.defaults()).duplicate(true)
	scanner.elapsedS=float(raw.scanner.elapsedS)/float(raw.scanner.get("durationS",180.0))*SCAN_DURATION_SECONDS
	scanner.durationS=SCAN_DURATION_SECONDS
	attachment_research = raw.get("attachmentResearch", []).duplicate()
	course = float(raw.get("course", 0))
	target_course = float(raw.get("targetCourse", course))
	lateral = float(raw.get("lateral", 0))
	next_piece_id = int(raw.get("nextPieceId", structures.size()))
	# Older saves can contain a stale counter; never reuse an existing store ID.
	for p in structures:
		if p.instanceId.begins_with("bp-") and p.instanceId.substr(3).is_valid_int():
			next_piece_id = maxi(next_piece_id,int(p.instanceId.substr(3))+1)
	# Honour already-paid jobs from the early port without charging again.
	if research.job != "" and research.job not in research.completed:
		research.completed.append(research.job)
	research.job = ""
	research.elapsed = 0.0
	operations=raw.get("operations",MMFMachineOperations.defaults()).duplicate(true)
	recovery=raw.get("recovery",MMFMachineService.defaults()).duplicate(true)
	MMFMachineOperations.clean(self)
	narrative=raw.get("narrative",MMFNarrativeProgress.migrated(self)).duplicate(true)
	missions=raw.get("missions",MMFMissionContracts.defaults()).duplicate(true)
	finale=raw.get("finale",MMFMeridianFinale.legacy(story)).duplicate(true)
	if finale.encounter=="launched":finale.encounter="pending";finale.stage="secure"
	fieldwork_active = false
	opening_done = raw.get("openingDone", true)
	clock = float(raw.get("clock", 0))
	contacts=raw.get("contacts",{"nextSlot":1,"active":{},"visited":[],"missed":[]}).duplicate(true)
	contacts["candidates"]=contacts.get("candidates",[])
	for contact in contacts.candidates+[contacts.active]:
		if contact.is_empty():continue
		if contact.kind=="water-cache":contact.kind="fuel-cache"
		contact.rewards=MMFNativeProgression.supplies(contact.rewards)
	for contact in contacts.candidates:
		if contact.id==contacts.active.get("id",""):contacts.active=contact;break
	expedition_gear=raw.get("expeditionGear",MMFNativeProgression.gear_defaults()).duplicate(true)
	caretaker.mode="companion";caretaker.priority="auto"
	polish={"seen":[],"log":[],"activities":{},"favorites":[]}
	polish.merge(raw.get("polish",{}).duplicate(true),true)
	polish["pin"]=polish.get("pin",{})
	if MMFNativeProgression.retired_recipe_pin(polish.pin):polish.pin={}
	polish.activities=MMFExpeditionMechanisms.migrate_activities(polish.activities,story)
	if has_station("refinery"):facts.refineryBuilt=true
	if has_station("workbench"):facts.workbenchBuilt=true
	survivor_content=MMFSurvivorContent.normalize(raw.get("survivorContent",MMFSurvivorContent.defaults()))
	scout_state={"phase":"idle","sequence":0,"resolved":0,"outcome":"","progress":0.0}
	scout_state.merge(raw.get("scoutState",{}).duplicate(true),true)
	# Live encounters cannot be saved. Imported transient scout states resume
	# from their durable outcome rather than retaining a phantom airborne actor.
	scout_state.phase="idle";scout_state.progress=0.0
	if not contacts.active.is_empty() and not contacts.active.has("record"): contacts.active.record=false
	rng.seed = MMFRandom.hash_seed([seed_name])
	if raw.has("rngState"): rng.state = int(raw.rngState)
	update_power()
	changed.emit()
	return true
