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
	if raw.has("roadside") and not MMFRoadsideOutposts.valid(raw.roadside):return false
	if raw.has("narrative") and not MMFNarrativeProgress.valid(raw.narrative):return false
	if raw.has("missions") and not MMFMissionContracts.valid(raw.missions):return false
	if raw.has("finale") and not MMFMeridianFinale.valid(raw.finale):return false
	if raw.has("operations") and not MMFMachineOperations.valid(raw.operations):return false
	if raw.has("recovery") and not MMFMachineService.valid(raw.recovery):return false
	if raw.has("expeditionGear") and not gear_state(raw.expeditionGear):return false
	if raw.has("survivorContent") and MMFSurvivorContent.normalize(raw.survivorContent).is_empty():return false
	if raw.has("scoutState") and not scout_state(raw.scoutState):return false
	if raw.get("format")!=1 or not bounded_json(raw): return false
	if not raw.get("facts") is Dictionary or raw.facts.get("guardianOutcome","") not in ["","destroyed","disarmed","evaded"]:return false
	if raw.has("customization") and not MMFNomadPersonalization.valid(raw.customization,raw.facts):return false
	if raw.has("polish") and not polish_state(raw.polish,data): return false
	for key in defaults:
		if not raw.has(key): continue
		var expected=defaults[key]
		if expected is Dictionary and not raw[key] is Dictionary: return false
		if expected is Array and not raw[key] is Array: return false
		if expected is String and not raw[key] is String: return false
		if expected is bool and not raw[key] is bool: return false
		if (expected is int or expected is float) and not number(raw[key],-1e12,1e12): return false
	for field in ["health","fuel"]:
		if not number(raw.get(field),0,100): return false
	if not number(raw.get("distance"),0,1e12) or not number(raw.get("clock"),0,1e12): return false
	if raw.has("nextPieceId") and not number(raw.nextPieceId,0,1e12,true): return false
	if not raw.get("inventory") is Array or not raw.get("structures") is Array or not raw.get("stores") is Dictionary: return false
	if not MMFNomadPersonalization.valid_session(raw.get("customization",MMFNomadPersonalization.defaults()),raw.structures,raw.facts):return false
	var ids={}
	for p in raw.structures:
		if not p is Dictionary or not p.get("instanceId") is String or p.instanceId=="" or ids.has(p.instanceId): return false
		if not data.BUILD_PIECES.has(p.get("definitionId","")) or not cell(p.get("cell")): return false
		var def=data.BUILD_PIECES[p.definitionId]
		if not number(p.get("rotation"),0,3,true) or not number(p.get("health"),0,def.maxHealth): return false
		if not p.get("state") is Dictionary: return false
		if not MMFNomadPersonalization.valid_piece(p):return false
		if def.anchor=="edge" and (not cell(p.get("edge")) or p.edge.get("axis") not in ["x","z"]): return false
		for key in ["water","stored","elapsedS"]:
			if p.state.has(key) and not number(p.state[key],0,100000): return false
		if p.definitionId=="battery-bank" and not number(p.state.get("charge",0),0,120):return false
		if p.state.has("legacyStock") and not supplies(p.state.legacyStock,data,200000):return false
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
	if raw.story.get("phase") not in ["locked","signal","crossfire","raids","route-selection","approach","braking","docked","departing","ending-ready","ending-journey","arrival","complete","finale-link","finale-docked"]: return false
	if raw.has("finale") and not MMFMeridianFinale.valid_phase(raw.finale,raw.story):return false
	if not raw.has("finale") and raw.story.phase in ["finale-link","finale-docked"]:return false
	if raw.get("finale",{}).get("encounter","")=="suppressed" and not raw.get("missions",{}).get("records",{}).get("quiet-watch",{}).get("effect_used",false):return false
	for beat in raw.get("narrative",{}).get("known",[]):
		var fact=MMFNativeNarrativeData.BEATS[beat].fact
		if fact!="" and fact not in raw.story.get("uniques",[]):return false
		if fact=="" and raw.get("finale",{}).get("completion",0)!=1:return false
	if not number(raw.story.get("index"),0,4,true): return false
	if raw.scanner.get("phase") not in ["awaiting-receiver","awaiting-module","installed","scanning","contact-ready","consumed"]: return false
	if not number(raw.scanner.get("durationS",180.0),1,3600):return false
	if not number(raw.scanner.get("elapsedS"),0,float(raw.scanner.get("durationS",180.0))): return false
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
		if not chart is Dictionary:return false
		if not chart.get("active") is Dictionary or not number(chart.get("nextSlot"),1,1e9,true) or not strings(chart.get("visited")) or not strings(chart.get("missed")): return false
		if not chart.active.is_empty() and not contact(chart.active,data):return false
		var candidates=chart.get("candidates",[])
		if not candidates is Array or candidates.size()>3:return false
		var seen=[]
		for c in candidates:
			if not contact(c,data) or c.id in seen:return false
			if c.id==chart.active.get("id",""):
				if c!=chart.active:return false
			elif c.state!="detected":return false
			seen.append(c.id)
		if not candidates.is_empty() and not chart.active.is_empty() and chart.active.id not in seen:return false
	return true

static func supplies(value,data: Dictionary,maximum: int) -> bool:
	if not value is Dictionary:return false
	for id in value:
		if not data.ITEMS.has(id) or not number(value[id],0,maximum,true):return false
	return true

static func contact(c,data: Dictionary) -> bool:
	if not c is Dictionary:return false
	for key in ["id","kind","state","step","salvageMode"]:
		if not c.get(key) is String:return false
	if c.id=="" or not data.OPPORTUNITIES.has(c.kind) or not supplies(c.get("rewards"),data,1000):return false
	if c.state not in ["detected","committed","docked","visited","departing"]:return false
	for key in ["record","patrolTriggered"]:
		if c.has(key) and not c[key] is bool:return false
	if c.has("risk") and c.risk not in ["quiet","patrol","unknown"]:return false
	if not number(c.get("slot"),1,1e9,true):return false
	for key in ["atDistanceM","worldX","expiresAtM"]:
		if not number(c.get(key),-1e12,1e12):return false
	return true

static func gear_state(value) -> bool:
	if not value is Dictionary or not strings(value.get("recovered")) or not value.get("sites") is Dictionary or not value.get("quiet") is bool:return false
	if not number(value.get("lastRecoveryDistance"),-1,1e12):return false
	var seen=[]
	for id in value.recovered:
		if not MMFNativeProgression.MODULES.has(id) or id in seen:return false
		seen.append(id)
	if value.quiet and "quiet-drive" not in seen:return false
	for id in value.sites:
		if not MMFNativeProgression.MODULES.has(id):return false
		var st=value.sites[id]
		if not st is Dictionary or not number(st.get("step"),0,2,true) or not st.get("record") is bool or not st.get("trialSpawned") is bool:return false
	return true

static func scout_state(value) -> bool:
	if not value is Dictionary:return false
	if value.get("phase","") not in ["idle","searching","tracking","departing"]:return false
	if value.get("outcome","") not in ["","disabled","decoy","avoided","reinforcements","escaped"]:return false
	for id in ["sequence","resolved"]:
		if not number(value.get(id),0,1e9,true):return false
	return number(value.get("progress"),0,1)

static func polish_state(value,data: Dictionary) -> bool:
	if not value is Dictionary: return false
	if not MMFWristLog.valid(value.get("receipts",[])):return false
	var pin=value.get("pin",{})
	if not MMFObjectiveGuide.valid_pin(pin,data) and not MMFNativeProgression.retired_recipe_pin(pin):return false
	if not strings(value.get("seen",[])) or not strings(value.get("favorites",[])): return false
	for id in value.get("favorites",[]):
		if not data.BUILD_PIECES.has(id): return false
	if not value.get("log",[]) is Array or value.get("log",[]).size()>64: return false
	for line in value.get("log",[]):
		if not line is Dictionary or not line.get("speaker") is String or not line.get("text") is String: return false
	if not value.get("activities",{}) is Dictionary: return false
	for id in value.get("activities",{}):
		if not MMFDestinationActivity.TITLES.has(id): return false
		var st=value.activities[id]
		if not st is Dictionary or not st.get("done") is bool or not number(st.get("step"),0,3,true): return false
		if not st.get("values") is Array or st.values.size()!=3: return false
		for v in st.values:
			if not number(v,0,4 if id=="power" else 100,true): return false
		if st.done:
			if id=="power" and not MMFExpeditionMechanisms.power_solved(st.values): return false
			if id=="array":
				for i in 3:
					if absf(st.values[i]-[25,60,85][i])>2: return false
			if MMFDestinationActivity.STEPS.has(id) and st.step!=3: return false
		if not MMFExpeditionMechanisms.valid_activity(id,st):return false
	return true
