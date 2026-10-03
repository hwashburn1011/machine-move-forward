class_name MMFMissionContracts
extends RefCounted

const STATUSES=["unavailable","available","offered","accepted","in_progress","completed","declined","abandoned","expired"]

static func defaults() -> Dictionary:
	var records={}
	for id in MMFNativeNarrativeData.MISSION_IDS:
		records[id]={"status":"unavailable","step":0,"offers":0,"offer_after":0.0,"paid":false,"method":"","effect_used":false,"stock":{"fuel":4,"components":2} if id=="stranded-courier" else {}}
	return {"version":1,"records":records,"orchard_fuel":0}

static func valid(value) -> bool:
	if not value is Dictionary or value.get("version")!=1 or not value.get("records") is Dictionary or value.records.size()!=3 or not MMFSaveValidation.number(value.get("orchard_fuel"),0,8,true):return false
	for id in MMFNativeNarrativeData.MISSION_IDS:
		var r=value.records.get(id)
		if not r is Dictionary or r.get("status") not in STATUSES:return false
		for key in ["paid","effect_used"]:
			if not r.get(key) is bool:return false
		if not MMFSaveValidation.number(r.get("step"),0,2,true) or not MMFSaveValidation.number(r.get("offers"),0,100000,true) or not MMFSaveValidation.number(r.get("offer_after"),0,1e12):return false
		if r.get("method") not in ["","physical","decoy"] or not r.get("stock") is Dictionary:return false
		if (r.status=="completed")!=(r.step==2):return false
		if id=="roof-supplies" and (r.step>0)!=r.paid:return false
		if r.status=="unavailable" and (r.step!=0 or r.offers!=0):return false
		if r.paid and id!="roof-supplies":return false
		if r.effect_used and (id!="quiet-watch" or r.status!="completed"):return false
		if id=="quiet-watch" and (r.step==2)!=(r.method!=""):return false
		if id!="quiet-watch" and r.method!="":return false
		if id=="stranded-courier":
			if r.stock.size()!=2 or not MMFSaveValidation.number(r.stock.get("fuel"),0,4,true) or not MMFSaveValidation.number(r.stock.get("components"),0,2,true):return false
			if r.status!="completed" and (r.stock.fuel!=4 or r.stock.components!=2):return false
		elif not r.stock.is_empty():return false
	if value.orchard_fuel>0 and value.records["roof-supplies"].status!="completed":return false
	return true

static func completed(s,id: String) -> bool:
	return s.missions.records[id].status=="completed"

static func reward_pending(s,id: String) -> bool:
	return id=="stranded-courier" and completed(s,id) and s.missions.records[id].stock.values().any(func(n):return n>0)

static func window(s,id: String) -> bool:
	return s.story.phase=="route-selection" and int(s.story.index)==MMFNativeNarrativeData.MISSIONS[id].index

static func signature(s) -> String:
	return JSON.stringify([s.missions,s.contacts.active,s.inventory.slots,s.native_snapshot().stores,s.story.phase,s.story.index]).sha256_text()

static func quote(s,id: String,action: String) -> Dictionary:
	return {"id":id,"action":action,"signature":signature(s)} if id in MMFNativeNarrativeData.MISSION_IDS else {}

static func act(s,q: Dictionary) -> bool:
	if q.is_empty() or q.get("signature")!=signature(s) or q.get("id") not in MMFNativeNarrativeData.MISSION_IDS:return false
	var id=q.id;var action=q.get("action","");var r=s.missions.records[id]
	match action:
		"accept":
			if not window(s,id) or r.status not in ["available","offered","abandoned"]:return false
			r.status="accepted"
		"decline":
			if not window(s,id) or r.status not in ["available","offered","accepted","abandoned"]:return false
			r.status="declined"
		"recover":
			if id!="stranded-courier" or r.step!=0 or r.status!="in_progress":return false
			r.step=1
		"donate":
			if id!="roof-supplies" or r.paid or r.step!=0 or r.status!="in_progress" or not s.pay({"components":2,"fuel":4}):return false
			r.paid=true;r.step=1
		"isolate":
			if id!="quiet-watch" or r.step!=0 or r.status!="in_progress":return false
			r.step=1
		"connect","restart","cut","decoy":
			if r.status!="in_progress":return false
			if id=="stranded-courier" and (action!="connect" or r.step!=1):return false
			if id=="roof-supplies" and (action!="restart" or not r.paid or r.step!=1):return false
			if id=="quiet-watch":
				if action not in ["cut","decoy"] or (action=="cut" and r.step!=1):return false
				if action=="decoy" and not s.pay({"signal-decoy":1}):return false
				r.method="decoy" if action=="decoy" else "physical"
			r.step=2;r.status="completed"
			if id=="roof-supplies":s.missions.orchard_fuel=8
		"claim":
			if id!="stranded-courier" or r.status!="completed" or r.stock.values().all(func(n):return n==0):return false
			var prior=r.stock.duplicate()
			for item in r.stock:r.stock[item]=s.add_resource(item,int(r.stock[item]))
			if prior==r.stock:return false
		_:return false
	s.transaction.emit("mission_action",{"mission":id,"action":action,"status":r.status,"step":r.step});s.changed.emit();return true

static func close_window(s):
	for id in MMFNativeNarrativeData.MISSION_IDS:
		var r=s.missions.records[id]
		if window(s,id) and r.status not in ["completed","declined"]:r.status="expired"

static func supplies_sources(s) -> String:
	var lines=[]
	var needed={"fuel":4,"components":2}
	var bags=[{"name":"Pack","bag":s.inventory}]
	for id in s.stores:bags.append({"name":"Storage "+id,"bag":s.stores[id]})
	for entry in bags:
		var fuel=mini(needed.fuel,entry.bag.count_item("fuel"));var parts=mini(needed.components,entry.bag.count_item("components"))
		needed.fuel-=fuel;needed.components-=parts
		if fuel>0 or parts>0:lines.append("From %s: %d fuel items · %d components"%[entry.name,fuel,parts])
	if needed.fuel>0 or needed.components>0:lines.append("Still needed: %d fuel items · %d components"%[needed.fuel,needed.components])
	return "\n".join(lines)
