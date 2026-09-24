class_name MMFSaveValidation
extends RefCounted

static func number(value,low: float,high: float,integer: bool=false) -> bool:
	return (value is float or value is int) and is_finite(float(value)) and value>=low and value<=high and (not integer or floor(value)==value)

static func strings(value) -> bool:
	if not value is Array or value.size()>10000: return false
	for entry in value:
		if not entry is String or entry.length()>500: return false
	return true

static func cell(value) -> bool:
	return value is Dictionary and number(value.get("x"),-50,50,true) and number(value.get("z"),-50,50,true) and number(value.get("y"),-2,2,true)

static func bounded_json(value,depth: int=0) -> bool:
	if depth>24: return false
	if value is float: return is_finite(value)
	if value is String: return value.length()<100000
	if value is Array or value is Dictionary:
		if value.size()>10000: return false
		for child in (value.values() if value is Dictionary else value):
			if not bounded_json(child,depth+1): return false
	return true

static func session(raw: Dictionary,data: Dictionary,defaults: Dictionary) -> bool:
	if raw.get("format")!=1 or not bounded_json(raw): return false
	for key in defaults:
		if not raw.has(key): continue
		var expected=defaults[key]
		if expected is Dictionary and not raw[key] is Dictionary: return false
		if expected is Array and not raw[key] is Array: return false
		if expected is String and not raw[key] is String: return false
		if expected is bool and not raw[key] is bool: return false
		if (expected is int or expected is float) and not number(raw[key],-1e12,1e12): return false
	for field in ["health","fuel","hydration","nourishment"]:
		if not number(raw.get(field),0,100): return false
	if not number(raw.get("distance"),0,1e12) or not number(raw.get("clock"),0,1e12): return false
	if raw.has("nextPieceId") and not number(raw.nextPieceId,0,1e12,true): return false
	if not raw.get("inventory") is Array or not raw.get("structures") is Array or not raw.get("stores") is Dictionary: return false
	var ids={}
	for p in raw.structures:
		if not p is Dictionary or not p.get("instanceId") is String or p.instanceId=="" or ids.has(p.instanceId): return false
		if not data.BUILD_PIECES.has(p.get("definitionId","")) or not cell(p.get("cell")): return false
		var def=data.BUILD_PIECES[p.definitionId]
		if not number(p.get("rotation"),0,3,true) or not number(p.get("health"),0,def.maxHealth): return false
		if not p.get("state") is Dictionary: return false
		if def.anchor=="edge" and (not cell(p.get("edge")) or p.edge.get("axis") not in ["x","z"]): return false
		for key in ["water","stored","elapsedS"]:
			if p.state.has(key) and not number(p.state[key],0,100000): return false
		ids[p.instanceId]=true
	for key in raw.stores:
		if not ids.has(key) or not raw.stores[key] is Array: return false
	if not raw.get("subsystems") is Dictionary or not raw.get("weapons") is Dictionary: return false
	for id in data.SUBSYSTEMS:
		if not number(raw.subsystems.get(id),0,data.SUBSYSTEMS[id].maxHealth): return false
	for id in data.WEAPONS:
		var weapon=raw.weapons.get(id)
		if not weapon is Dictionary: return false
		if not number(weapon.get("magazineBonus"),0,100,true) or not number(weapon.get("ammoInMag"),0,data.WEAPONS[id].magazineSize+weapon.magazineBonus,true): return false
		if weapon.get("attachment","")!="" and (not data.WEAPON_ATTACHMENTS.has(weapon.attachment) or data.WEAPON_ATTACHMENTS[weapon.attachment].weaponId!=id): return false
	if not data.WEAPONS.has(raw.get("currentWeapon","")): return false
	for field in ["story","research","scanner","facts","caretaker","weather","threat"]:
		if not raw.get(field) is Dictionary: return false
		for key in defaults[field]:
			if not raw[field].has(key): continue
			var expected=defaults[field][key];var got=raw[field][key]
			if expected is String and not got is String: return false
			if expected is bool and not got is bool: return false
			if expected is Dictionary and not got is Dictionary: return false
			if expected is Array and not strings(got): return false
			if (expected is int or expected is float) and not number(got,-1e12,1e12): return false
	if raw.story.get("phase") not in ["locked","signal","crossfire","raids","route-selection","approach","braking","docked","departing","ending-ready","ending-journey","arrival","complete"]: return false
	if not number(raw.story.get("index"),0,4,true): return false
	if raw.scanner.get("phase") not in ["awaiting-receiver","awaiting-module","installed","scanning","contact-ready","consumed"]: return false
	if not number(raw.scanner.get("elapsedS"),0,180): return false
	if raw.research.get("job","")!="" and not data.UPGRADES.has(raw.research.job): return false
	for id in raw.research.get("completed",[]):
		if not data.UPGRADES.has(id): return false
	for branch in raw.research.get("active",{}):
		var id=raw.research.active[branch]
		if not id is String or not data.UPGRADES.has(id) or data.UPGRADES[id].branch!=branch or id not in raw.research.get("completed",[]): return false
	if not strings(raw.get("attachmentResearch",[])): return false
	for id in raw.get("attachmentResearch",[]):
		if not data.WEAPON_ATTACHMENTS.has(id): return false
	if raw.has("contacts"):
		var chart=raw.contacts
		if not chart.get("active") is Dictionary or not number(chart.get("nextSlot"),1,1e9,true) or not strings(chart.get("visited")) or not strings(chart.get("missed")): return false
		var c=chart.active
		if not c.is_empty():
			for key in ["id","kind","state","step","salvageMode"]:
				if not c.get(key) is String: return false
			if not data.OPPORTUNITIES.has(c.kind) or not c.get("rewards") is Dictionary: return false
			if c.state not in ["detected","committed","docked","visited","departing"]: return false
			if c.has("record") and not c.record is bool: return false
			if not number(c.get("slot"),1,1e9,true): return false
			for key in ["atDistanceM","worldX","expiresAtM","slot"]:
				if not number(c.get(key),-1e12,1e12): return false
			for id in c.rewards:
				if not data.ITEMS.has(id) or not number(c.rewards[id],0,1000,true): return false
	return true
