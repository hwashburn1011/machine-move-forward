class_name MMFMachineOperations
extends RefCounted

const MODES=["legacy","custom","cruise","docked","salvage","defense"]
const FIXED=["fixed-radio","fixed-helm","fixed-fieldwork","fixed-port-crane"]

static func defaults() -> Dictionary:
	return {"version":1,"configured":false,"mode":"legacy","sources":{},"devices":{},"charging":true,"backup":true,"last_travel":{}}

static func valid(value,nested: bool=false) -> bool:
	if not value is Dictionary or value.get("version")!=1 or value.get("mode") not in MODES:return false
	if not value.get("configured") is bool or not value.get("charging") is bool or not value.get("backup") is bool:return false
	if not value.get("sources") is Dictionary or not value.get("devices") is Dictionary:return false
	if value.sources.size()>10000 or value.devices.size()>10000:return false
	for id in value.sources:
		if not id is String or (id!="loan-generator" and not id.begins_with("bp-")) or not value.sources[id] is bool:return false
	for id in value.devices:
		var entry=value.devices[id]
		if not id is String or (id not in FIXED and not id.begins_with("bp-")):return false
		if not entry is Dictionary or entry.size()!=2 or not entry.get("enabled") is bool or not MMFSaveValidation.number(entry.get("priority"),0,2,true):return false
	if not nested:
		if not value.get("last_travel") is Dictionary:return false
		if not value.last_travel.is_empty() and not valid(value.last_travel,true):return false
	elif value.has("last_travel"):return false
	return true

static func source_enabled(config: Dictionary,id: String) -> bool:
	return config.sources.get(id,not config.configured)

static func policy(config: Dictionary,id: String,type: String) -> Dictionary:
	if config.devices.has(id):return config.devices[id]
	var mode=config.mode;var enabled=true;var priority=1
	if id in FIXED:priority=0 if id!="fixed-port-crane" else 1
	elif type in ["lamp","caretaker-dock"]:priority=2
	elif type.begins_with("turret"):priority=0 if mode=="defense" else 1
	if mode=="docked":enabled=id in FIXED and id!="fixed-port-crane"
	elif mode=="cruise":enabled=type not in ["refinery","collector-auto","salvage-crane","fixed-port-crane"]
	elif mode=="salvage":
		enabled=type!="refinery"
		if type in ["collector-auto","salvage-crane","fixed-port-crane"]:priority=0
		elif type.begins_with("turret"):priority=2
	elif mode=="defense":enabled=type not in ["refinery","collector-auto","salvage-crane","fixed-port-crane"]
	return {"enabled":enabled,"priority":priority}

static func docked(s) -> bool:
	return s.story.phase in ["docked","finale-docked"] or s.contacts.active.get("state","") in ["docked","visited"]

static func modes(s) -> Array:
	var result=[]
	if s.story.phase=="docked" or "course-gyro" in s.story.uniques:result=["cruise","docked"]
	if "relay-foundry" in s.story.completed:result=["cruise","docked","salvage","defense"]
	return result

static func materialized(s) -> Dictionary:
	var config=s.operations.duplicate(true)
	for p in s.structures:
		if p.definitionId=="generator":config.sources[p.instanceId]=source_enabled(s.operations,p.instanceId)
		if MMFSession.POWER_DRAWS.has(p.definitionId):config.devices[p.instanceId]=policy(s.operations,p.instanceId,p.definitionId).duplicate()
	for id in FIXED:config.devices[id]=policy(s.operations,id,id).duplicate()
	config.sources["loan-generator"]=source_enabled(s.operations,"loan-generator")
	config.configured=true;config.mode="custom"
	return config

static func clean(s):
	var ids={}
	for p in s.structures:ids[p.instanceId]=p.definitionId
	for config in [s.operations,s.operations.last_travel]:
		if config.is_empty():continue
		for id in config.sources.keys():
			if id!="loan-generator" and ids.get(id,"")!="generator":config.sources.erase(id)
		for id in config.devices.keys():
			if id not in FIXED and not MMFSession.POWER_DRAWS.has(ids.get(id,"")):config.devices.erase(id)

static func signature(s) -> String:
	var pieces=[]
	for p in s.structures:pieces.append([p.instanceId,p.definitionId,p.health,p.state.get("charge",0)])
	return JSON.stringify([s.operations,s.recovery,s.fuel,s.subsystems,pieces,s.story,s.contacts.active,s.fieldwork_active,s.research,s.expedition_gear]).sha256_text()

static func proposal(s,mode: String) -> Dictionary:
	if mode not in modes(s) or (mode=="docked" and not docked(s)):return {}
	var config=defaults();config.configured=true;config.mode=mode
	config.charging=s.operations.charging;config.backup=s.operations.backup
	config.last_travel=s.operations.last_travel.duplicate(true)
	if mode=="docked" and s.operations.mode!="docked":
		config.last_travel=s.operations.duplicate(true);config.last_travel.erase("last_travel")
	var candidates=[]
	for p in s.structures:
		if p.definitionId=="generator":
			config.sources[p.instanceId]=false
			if p.health>0:candidates.append({"id":p.instanceId,"health":p.health})
	if s.recovery.loan and candidates.is_empty():candidates.append({"id":"loan-generator","health":s.data.BUILD_PIECES.generator.maxHealth})
	config.sources["loan-generator"]=false
	candidates.sort_custom(func(a,b):return a.health>b.health if a.health!=b.health else a.id<b.id)
	if mode!="docked":
		for source in candidates:
			config.sources[source.id]=true
			var report=MMFPowerBudget.calculate(s,s.structures,0,config)
			if report.generation>=report.demand:break
	return {"signature":signature(s),"config":config}

static func resume_config(s) -> Dictionary:
	if s.operations.mode!="docked":return s.operations.duplicate(true)
	if not s.operations.last_travel.is_empty():
		var config=s.operations.last_travel.duplicate(true);config.last_travel={};return config
	return defaults()

static func apply(s,quote: Dictionary) -> bool:
	if quote.is_empty() or quote.get("signature","")!=signature(s) or not valid(quote.get("config")):return false
	var config=quote.config
	if config.mode=="docked" and not docked(s):return false
	if config.mode not in ["legacy","custom"] and config.mode not in modes(s):return false
	if config==s.operations:return false
	s.operations=config.duplicate(true);clean(s)
	for p in s.structures:
		if p.definitionId=="generator" or MMFSession.POWER_DRAWS.has(p.definitionId):s.piece_used.emit(p.instanceId,"Changed operating controls")
	s.update_power();s.transaction.emit("operations_applied",{"mode":s.operations.mode,"fuel_per_minute":MMFPowerBudget.calculate(s,s.structures).fuel_rate*60})
	s.changed.emit();return true

static func switch_quote(s,id: String,value: bool) -> Dictionary:
	var p=s.find_piece(id)
	if id!="loan-generator" and (p.is_empty() or p.definitionId!="generator"):return {}
	if id=="loan-generator" and not s.recovery.loan:return {}
	var config=materialized(s);config.sources[id]=value
	return {"signature":signature(s),"config":config}

static func travel(s,metres: float,config: Dictionary={}) -> Dictionary:
	var budget=MMFPowerBudget.calculate(s,s.structures,0,config)
	var speed=s.travel_speed()
	if not budget.drive_enabled:speed=0
	return {"speed":speed,"seconds":metres/speed if speed>.01 else 0.0,"fuel":metres/speed*budget.fuel_rate if speed>.01 else 0.0,"available":speed>.01,"fuel_rate":budget.fuel_rate}

static func departure_reason(s,config: Dictionary={}) -> String:
	var budget=MMFPowerBudget.calculate(s,s.structures,0,config)
	if s.subsystems.engine<=0:return "Repair the engine at the engineering service port."
	if not budget.drive_enabled:return "Start a working generator at the engineering station."
	var needed="fixed-helm" if "course-gyro" in s.story.uniques else "fixed-radio"
	if not budget.powered.get(needed,false):return "Power the helm / receiver before departure."
	return ""
