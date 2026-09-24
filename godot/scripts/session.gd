class_name MMFSession
extends RefCounted

signal notice(text: String)
signal changed
signal contact_ready

const POWER_DRAWS = {"lamp": 1, "refinery": 10, "condenser": 4, "turret-manual": 3, "collector-auto": 4, "turret-auto": 6, "caretaker-dock": 3}

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
var hydration = 100.0
var nourishment = 100.0
var subsystems = {}
var current_weapon = "rifle"
var weapons = {}
var scanner = {"format": 1, "phase": "awaiting-receiver", "elapsedS": 0.0, "pendingDelayS": 0.0}
var facts = {"salvage": false, "refined": 0, "defenses": 0}
var unlocks: Array = []
var research = {"completed": [], "active": {}, "job": "", "elapsed": 0.0}
var attachment_research: Array = []
var story = {"phase": "locked", "index": 0, "arrival": 0.0, "routeId": "", "uniques": [], "journals": [], "objectives": [], "completed": [], "ending": "none"}
var caretaker = {"recovered": false, "mode": "companion", "priority": "auto"}
var weather = {"phase": "clear", "elapsed": 0.0, "next": 600.0, "intensity": 0.0, "sequence":0}
var sheltered=false
var contacts={"nextSlot":1,"active":{},"visited":[],"missed":[]}
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
var fieldwork_active = false

func _init(definitions: Dictionary):
	data = definitions
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
	var def = data.BUILD_PIECES[id]
	if not free and not pay(def.cost): return {}
	var instance = {"instanceId": "bp-%d" % next_piece_id, "definitionId": id, "cell": cell.duplicate(), "rotation": turn, "health": def.maxHealth, "state": {}}
	next_piece_id += 1
	if not edge.is_empty(): instance.edge = edge.duplicate()
	structures.append(instance)
	if id in ["crate", "collector-auto"]:
		stores[instance.instanceId] = MMFInventory.new(data.ITEMS, 12 if id == "crate" else 6)
	if id in ["planter", "condenser", "seed-garden"]: instance.state = {"elapsedS": 0.0, "stored": 0, "water": 0}
	changed.emit()
	return instance

func find_piece(id: String) -> Dictionary:
	for p in structures:
		if p.instanceId == id: return p
	return {}

func craft(id: String, times: int = 1) -> bool:
	var recipe = {}
	for candidate in data.RECIPES:
		if candidate.id == id: recipe = candidate
	if recipe.is_empty(): return false
	if not station_powered(recipe.station):
		notify("Install and power a " + recipe.station + " first.")
		return false
	var made = 0
	for i in clampi(times, 1, 100):
		if not can_pay(recipe.inputs): break
		# Trial the complete transaction so full bags never delete materials.
		var backups = []
		for bag in containers(): backups.append(bag.slots.duplicate(true))
		pay(recipe.inputs)
		if add_resource(recipe.output.itemId, int(recipe.output.count)) > 0:
			var bags = containers()
			for j in bags.size(): bags[j].slots = backups[j]
			break
		made += 1
		if id == "refine-components": facts.refined += int(recipe.output.count)
	if made > 0: notify("Crafted %s × %d" % [recipe.name, made])
	else: notify("Check materials and free storage space.")
	return made > 0

func use_item(id: String) -> bool:
	if inventory.count_item(id) == 0: return false
	match id:
		"water":
			if hydration >= 100: return false
			hydration = minf(100, hydration + 60)
		"rations":
			if nourishment >= 100: return false
			nourishment = minf(100, nourishment + 60)
		"repair-kit":
			if health<=0 or health>=100: return false
			health = minf(100, health + 40*(0.5 if nourishment<=0 else 1))
		"extended-mag":
			if weapons[current_weapon].magazineBonus > 0: return false
			weapons[current_weapon].magazineBonus = int(data.WEAPONS[current_weapon].magazineSize * 0.5)
		_: return false
	inventory.remove(id, 1)
	changed.emit()
	return true

func refuel() -> bool:
	var count = mini(int(ceil(100-fuel)), inventory.count_item("fuel"))
	if count <= 0: return false
	inventory.remove("fuel", count)
	fuel = minf(100, fuel+count)
	notify("Generator refuelled: %d%%" % fuel)
	return true

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
	return contents

func install_scanner() -> bool:
	if scanner.phase != "awaiting-module" or not pay({"scanner-replacement-module": 1}): return false
	scanner.phase = "installed"
	notify("Scanner module installed. Ready to begin scanning.")
	return true

func start_scan(aboard: bool = true) -> bool:
	update_power()
	if scanner.phase != "installed" or not powered.get("fixed-radio",false) or attack_recent > 0 or not aboard: return false
	scanner.phase = "scanning"
	story.phase = "signal"
	notify("Scanner active. Keep the receiver powered for three minutes.")
	return true

func modifiers() -> Dictionary:
	var result = data.DEFAULT_UPGRADE_MODIFIERS.duplicate()
	for id in research.active.values():
		if not data.UPGRADES.has(id): continue
		for key in data.UPGRADES[id].modifiers:
			if key.ends_with("Bonus"): result[key] += data.UPGRADES[id].modifiers[key]
			else: result[key] *= data.UPGRADES[id].modifiers[key]
	return result

func begin_research(id: String) -> bool:
	# UpgradeSystem.research is an instant unlock; fitting is a separate choice.
	if not data.UPGRADES.has(id) or id in research.completed: return false
	if not pay(data.UPGRADES[id].researchCost): return false
	research.completed.append(id)
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
	notify("Repair complete.")
	return true

func update_power():
	capacity = 0
	demand = 0
	powered.clear()
	var priority_draws = [0.0, 0.0, 0.0]
	var mods = modifiers()
	for p in structures:
		var id = p.definitionId
		if id == "generator" and fuel > 0:
			capacity += maxf(0, 16+mods.generationBonus) * p.health / data.BUILD_PIECES[id].maxHealth
		if POWER_DRAWS.has(id) and p.health > 0:
			var priority = 2 if id.begins_with("turret") else (0 if id == "lamp" else 1)
			var draw=POWER_DRAWS[id]+(mods.turretPowerBonus if priority==2 else 0)
			priority_draws[priority]+=draw
			powered[p.instanceId]=priority
			demand += draw
	if facts.salvage: powered["fixed-radio"]=1;priority_draws[1]+=1;demand+=1
	if fieldwork_active: powered["fixed-fieldwork"]=1;priority_draws[1]+=1;demand+=1
	if "course-gyro" in story.uniques: powered["fixed-helm"]=1;priority_draws[1]+=1;demand+=1
	# Temporarily store priorities in the output map, then resolve them in place.
	# This keeps the same whole-tier shedding without allocating a consumer record
	# for every powered station on every simulation tick.
	var total=demand;var first_enabled=0
	for priority in [0,1,2]:
		if total<=capacity: break
		first_enabled=priority+1
		total-=priority_draws[priority]
	for id in powered: powered[id]=int(powered[id])>=first_enabled

func tick(dt: float, stable: bool = true, aboard: bool = true):
	clock += dt
	attack_recent = maxf(0, attack_recent-dt)
	update_power()
	var mods = modifiers()
	var generators = 0
	var weight = 12000.0
	for p in structures:
		weight += data.BUILD_PIECES[p.definitionId].weight
		if p.definitionId == "generator" and p.health > 0: generators += 1
	fuel = maxf(0, fuel - dt*0.06*generators*mods.fuelBurnMultiplier)
	var engine = subsystems.engine / data.SUBSYSTEMS.engine.maxHealth
	var legs = 0.0
	for id in subsystems:
		if id.begins_with("leg-"): legs += subsystems[id] / data.SUBSYSTEMS[id].maxHealth
	var target = 7.5 * engine * (0.4 + 0.6*legs/4) * mods.speedMultiplier / sqrt((12000+(weight-12000)*mods.effectiveWeightMultiplier)/12000)
	if fuel <= 0: target *= 0.2
	if story.phase in ["docked", "crossfire", "arrival"] or contacts.active.get("state","") in ["docked","visited"] or not opening_done: target = 0
	if contacts.active.get("state","")=="committed":
		target=minf(target,maxf(0.1,(contacts.active.atDistanceM-distance)*0.18))
	if story.phase in ["approach", "braking"]:
		var left = maxf(0, story.arrival-distance)
		if left < 180: target = minf(target, maxf(0.0 if left<=0 else 0.1, left*0.18))
	speed = lerpf(speed, target, 1-exp(-3.3*mods.accelerationMultiplier*dt))
	distance += speed*dt
	course = move_toward(course, target_course, dt*1.5)
	lateral += sin(deg_to_rad(course))*speed*dt
	if opening_done:
		# Weather changes visibility and ambience, not resource consumption.
		hydration = maxf(0, hydration - dt*float(data.HYDRATION_DRAIN_PER_S))
		nourishment = maxf(0, nourishment - dt*float(data.NOURISHMENT_DRAIN_PER_S))
	if scanner.phase == "scanning" and stable and aboard and health>0 and attack_recent <= 0 and powered.get("fixed-radio",false):
		scanner.elapsedS = minf(180, scanner.elapsedS+dt)
		if scanner.elapsedS >= 180:
			scanner.phase = "contact-ready"
			scanner.pendingDelayS = 3.0
	elif scanner.phase == "contact-ready" and stable and aboard and health>0 and attack_recent <= 0:
		scanner.pendingDelayS = maxf(0, scanner.pendingDelayS-dt)
		if scanner.pendingDelayS == 0:
			scanner.phase = "consumed"
			contact_ready.emit()
	for p in structures:
		var kind = p.definitionId
		if kind not in ["planter", "condenser", "seed-garden"] or p.health <= 0: continue
		var st = p.state
		if kind == "condenser" and not powered.get(p.instanceId, false): continue
		var cap = 1 if kind == "condenser" else (6 if kind == "seed-garden" else 3)
		if st.get("stored", 0) >= cap: continue
		var period = 90 if kind == "condenser" else (180 if kind == "seed-garden" else 150)
		if kind == "seed-garden":
			var remaining = dt
			while remaining > 0 and st.get("water",0) > 0 and st.get("stored",0) <= cap-3:
				var step = minf(remaining, period-st.get("elapsedS",0.0))
				st.elapsedS = st.get("elapsedS",0.0)+step
				remaining -= step
				if st.elapsedS+1e-9 < period: break
				st.elapsedS = 0.0
				st.water -= 1
				st.stored = st.get("stored",0)+3
			continue
		st.elapsedS = st.get("elapsedS", 0.0)+dt
		while st.elapsedS >= period and st.get("stored",0)<cap:
			st.elapsedS -= period
			st.stored = st.get("stored", 0)+1
		if st.stored >= cap: st.elapsedS = minf(st.elapsedS,period)

func objective() -> String:
	if not facts.salvage: return "RECOVER SALVAGE\nReel in a drifting cargo crate with [F]."
	if has_station("refinery"): facts.refineryBuilt=true
	if has_station("workbench"): facts.workbenchBuilt=true
	if not facts.get("refineryBuilt",false): return "BUILD A REFINERY\nOpen [B] and place a refinery aboard."
	if facts.refined < 12 and scanner.phase in ["awaiting-module", "installed"]: return "REFINE COMPONENTS\nUse the wrist Workshop to refine 12 components."
	if not facts.get("workbenchBuilt",false): return "BUILD A WORKBENCH\nBuild the station needed for scanner repairs."
	if scanner.phase == "awaiting-module": return "REPAIR THE SCANNER\nCraft a replacement module, then install it at the receiver."
	if scanner.phase == "installed": return "START THE SCAN\nOpen Signal in the wrist terminal."
	if scanner.phase == "scanning": return "SCAN IN PROGRESS  %d%%\nKeep the receiver powered. Explore and improve your machine." % (scanner.elapsedS/1.8)
	if scanner.phase == "contact-ready": return "CONTACT ACQUIRED\nTransmission stabilizing…"
	if scanner.phase=="consumed" and (not has_station("turret-manual") or not facts.get("defenseCrewed",false)): return "PREPARE A DEFENSE\nBuild and crew the Manual Deck Gun. [E] to mount."
	if story.phase == "raids": return "DEFEND THE NOMAD\nWatch both sides for grappling mechs."
	if story.phase == "docked": return data.STORY_EXPEDITIONS[int(story.index)].objective
	if story.phase in ["approach", "braking"]: return "FOLLOW THE SIGNAL\nDestination in %d m" % maxf(0, story.arrival-distance)
	if story.phase == "complete": return "KEEP WALKING\nYour machine, your course."
	return "TRACE THE SIGNAL\nOpen the wrist Signal page or navigation helm."

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
		"health": health, "hydration": hydration, "nourishment": nourishment, "subsystems": subsystems,
		"inventory": inventory.slots, "structures": structures, "stores": storage, "weapons": weapons,
		"currentWeapon": current_weapon, "scanner": scanner, "facts": facts, "unlocks": unlocks,
		"research": research, "attachmentResearch": attachment_research, "story": story, "caretaker": caretaker,
		"weather": weather, "threat": threat, "course": course, "targetCourse": target_course, "lateral": lateral,
		"contacts":contacts,"polish":polish,
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
	hydration = clampf(raw.get("hydration", 100), 0, 100)
	nourishment = clampf(raw.get("nourishment", 100), 0, 100)
	structures = raw.get("structures", []).duplicate(true)
	stores.clear()
	for p in structures:
		if p.definitionId in ["condenser","planter","seed-garden"]:
			var period=90 if p.definitionId=="condenser" else (180 if p.definitionId=="seed-garden" else 150)
			var cap=1 if p.definitionId=="condenser" else (6 if p.definitionId=="seed-garden" else 3)
			p.state.elapsedS=clampf(p.state.get("elapsedS",0),0,period)
			p.state.stored=clampi(int(p.state.get("stored",0)),0,cap)
			p.state.water=clampi(int(p.state.get("water",0)),0,2)
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
	fieldwork_active = false
	opening_done = raw.get("openingDone", true)
	clock = float(raw.get("clock", 0))
	contacts=raw.get("contacts",{"nextSlot":1,"active":{},"visited":[],"missed":[]}).duplicate(true)
	polish={"seen":[],"log":[],"activities":{},"favorites":[]}
	polish.merge(raw.get("polish",{}).duplicate(true),true)
	if not contacts.active.is_empty() and not contacts.active.has("record"): contacts.active.record=false
	rng.seed = MMFRandom.hash_seed([seed_name])
	if raw.has("rngState"): rng.state = int(raw.rngState)
	update_power()
	changed.emit()
	return true
