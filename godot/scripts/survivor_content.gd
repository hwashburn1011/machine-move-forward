class_name MMFSurvivorContent
extends RefCounted

# Optional native save block. Old campaigns receive an unopened locker, while
# completed exchanges and partially collected caches remain independent of visits.
static func defaults() -> Dictionary:
	return {"toolAcquired":false,"toolSelected":false,"refuge":{"offered":false,"components":0,"repaired":false,"workshopKnown":false,"reward":{"scrap":4,"fuel":3},"ackAt":-1.0,"acknowledged":false,"record":false},"workshop":{"charted":false,"isolated":false,"fuse":false,"powered":false,"record":false,"mainLoot":{"scrap":24,"components":4},"upperLoot":{"components":5,"repair-kit":1}}}

static func normalize(raw) -> Dictionary:
	if not raw is Dictionary: return {}
	raw=raw.duplicate(true)
	if raw.get("refuge") is Dictionary and raw.refuge.get("reward") is Dictionary and raw.refuge.reward.has("water"):
		var reward=raw.refuge.reward
		if not MMFSaveValidation.number(reward.water,0,4,true) or not MMFSaveValidation.number(reward.get("fuel"),0,3,true):return {}
		reward.fuel+=reward.water;reward.erase("water");reward["scrap"]=reward.get("scrap",0)
	var result=defaults()
	for key in ["toolAcquired","toolSelected"]:
		if raw.has(key):
			if not raw[key] is bool: return {}
			result[key]=raw[key]
	for section in ["refuge","workshop"]:
		if not raw.has(section): continue
		if not raw[section] is Dictionary: return {}
		for key in result[section]:
			if not raw[section].has(key): continue
			var value=raw[section][key]
			var fallback=result[section][key]
			if fallback is bool:
				if not value is bool: return {}
			elif fallback is Dictionary:
				if not value is Dictionary or value.size()!=fallback.size(): return {}
				for item in fallback:
					var maximum=7 if section=="refuge" and item=="fuel" else fallback[item]
					if not value.has(item) or not MMFSaveValidation.number(value[item],0,maximum,true): return {}
			elif key=="components":
				if not MMFSaveValidation.number(value,0,3,true): return {}
			elif key=="ackAt":
				if not MMFSaveValidation.number(value,-1,1e12): return {}
			result[section][key]=value.duplicate(true) if value is Dictionary else value
	if result.toolSelected and not result.toolAcquired: return {}
	if result.refuge.repaired and result.refuge.components!=3: return {}
	if result.workshop.powered and (not result.workshop.isolated or not result.workshop.fuse): return {}
	# Earlier native saves already earned this information by helping R-9.
	if not raw.get("refuge",{}).has("workshopKnown"):result.refuge.workshopKnown=result.refuge.repaired
	if not raw.get("refuge",{}).has("offered"):result.refuge.offered=result.refuge.components>0 or result.refuge.repaired
	if not raw.get("workshop",{}).has("charted"):result.workshop.charted=result.workshop.isolated or result.workshop.fuse or result.workshop.powered
	if (result.refuge.workshopKnown or result.refuge.acknowledged) and not result.refuge.repaired:return {}
	return result
