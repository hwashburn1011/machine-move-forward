class_name MMFMachineService
extends RefCounted

const SITES=["relay-foundry","glass-orchard"]
const FUEL_PRICE=2

static func defaults() -> Dictionary:
	return {"version":1,"phase":"idle","serial":0,"completed":0,"step":0,"loan":false,"stock":{"relay-foundry":20,"glass-orchard":20}}

static func valid(value) -> bool:
	if not value is Dictionary or value.get("version")!=1 or value.get("phase") not in ["idle","requested","service"] or not value.get("loan") is bool:return false
	for key in ["serial","completed","step"]:
		if not MMFSaveValidation.number(value.get(key),0,3 if key=="step" else 1e9,true):return false
	if value.completed>value.serial or (value.phase!="idle" and value.serial<=value.completed):return false
	if value.phase=="idle" and (value.step!=0 or value.serial!=value.completed):return false
	if not value.get("stock") is Dictionary or value.stock.size()!=2:return false
	for id in SITES:
		if not MMFSaveValidation.number(value.stock.get(id),0,20,true):return false
	return true

static func repair_quote(s,id: String) -> Dictionary:
	if s.subsystems.has(id):
		var def=s.data.SUBSYSTEMS[id];var missing=def.maxHealth-s.subsystems[id]
		return {"id":id,"name":def.name,"cost":maxi(1,int(ceil(def.repairScrap*missing/def.maxHealth))),"needed":missing>0}
	var p=s.find_piece(id)
	if p.is_empty():return {}
	var def=s.data.BUILD_PIECES[p.definitionId]
	return {"id":id,"name":def.name,"cost":maxi(1,int(ceil(def.cost.get("scrap",0)*(1-p.health/def.maxHealth)*.2))),"needed":p.health<def.maxHealth}

static func diagnose(s,include_operating_advice: bool=true) -> Dictionary:
	var faults=[];var assistance=[];var repair_ids=[]
	var fuel_empty=s.fuel<=0
	if fuel_empty:
		faults.append("Tank empty. Transfer owned fuel at the service port." if s.count_resource("fuel")>0 else "Tank empty; no owned fuel. Request emergency service.")
		if s.count_resource("fuel")==0:assistance.append("fuel")
	if s.subsystems.engine<=s.data.SUBSYSTEMS.engine.maxHealth*.1:
		faults.append("Engine cannot provide useful travel. Repair at the service port.")
		repair_ids.append("engine")
		if not s.can_pay({"scrap":repair_quote(s,"engine").cost}):assistance.append("engine")
	var generators=s.structures.filter(func(p):return p.definitionId=="generator")
	var minimum=2.0 if s.scanner.phase=="consumed" else 11.0
	var output=0.0
	for p in generators:output+=maxf(0,16+s.modifiers().generationBonus)*p.health/s.data.BUILD_PIECES.generator.maxHealth
	if s.recovery.loan and not generators.any(func(p):return p.health>0):output=maxf(0,16+s.modifiers().generationBonus)
	if output<minimum:
		generators.sort_custom(func(a,b):return a.health>b.health if a.health!=b.health else a.instanceId<b.instanceId)
		if generators.is_empty():
			faults.append("No generator installed. Build one, or request a fuel-consuming loan starter.")
			assistance.append("loan") # Stock alone does not prove a supported build site exists.
		else:
			var id=generators[0].instanceId
			faults.append("Generator condition cannot supply essential equipment. Repair a generator.")
			repair_ids.append(id)
			if not s.can_pay({"scrap":repair_quote(s,id).cost}):assistance.append(id)
	var budget=MMFPowerBudget.calculate(s,s.structures)
	if include_operating_advice:
		if not budget.drive_enabled and output>=minimum:faults.append("Usable generation is stopped. Restart a source below; emergency supplies are unnecessary.")
		for c in budget.consumers:
			if c.id in MMFMachineOperations.FIXED and not c.served and not fuel_empty:faults.append(c.id.replace("fixed-","").capitalize()+": "+c.reason+". Review switches and priorities.")
	return {"faults":faults,"assistance":assistance,"eligible":not assistance.is_empty(),"repairs":repair_ids,"fuel_owned":s.count_resource("fuel")}

static func refill(s,amount: int=100) -> bool:
	# Whole items only; never consume the fraction that cannot fit in the tank.
	var count=mini(maxi(0,amount),mini(int(floor(100-s.fuel+.000001)),s.count_resource("fuel")))
	if count<=0 or not s.pay({"fuel":count}):return false
	s.fuel+=count
	for p in s.structures:
		if p.definitionId=="generator":s.piece_used.emit(p.instanceId,"Refuelled")
	s.update_power();s.transaction.emit("refuelled",{"fuel_items":count,"fuel":s.fuel});s.changed.emit();return true

static func request(s) -> bool:
	if not s.opening_done or s.health<=0 or s.recovery.phase!="idle" or not diagnose(s).eligible:return false
	s.recovery.serial+=1;s.recovery.phase="requested";s.recovery.step=0
	s.transaction.emit("recovery_requested",{"request":s.recovery.serial});s.changed.emit();return true

static func cancel(s):
	if s.recovery.phase=="idle":return
	s.recovery.completed=s.recovery.serial;s.recovery.phase="idle";s.recovery.step=0
	s.transaction.emit("recovery_cancelled",{"request":s.recovery.serial});s.changed.emit()

static func complete(s,serial: int) -> bool:
	if s.recovery.phase!="service" or s.recovery.step!=3 or serial!=s.recovery.serial or serial<=s.recovery.completed:return false
	var before={"fuel":s.fuel,"engine":s.subsystems.engine}
	var needed=diagnose(s).assistance
	if "fuel" in needed:s.fuel=maxf(s.fuel,20)
	if "engine" in needed:
		s.subsystems.engine=maxf(s.subsystems.engine,s.data.SUBSYSTEMS.engine.maxHealth*.5)
		for id in s.subsystems:
			if id.begins_with("leg-"):s.subsystems[id]=maxf(s.subsystems[id],s.data.SUBSYSTEMS[id].maxHealth*.25)
	for id in needed:
		if id=="loan":s.recovery.loan=true
		var p=s.find_piece(id)
		if not p.is_empty() and p.definitionId=="generator":p.health=s.data.BUILD_PIECES.generator.maxHealth;s.piece_used.emit(id,"Emergency service")
	# Select a restart configuration only when assistance was still necessary.
	if not needed.is_empty():
		var config=MMFMachineOperations.materialized(s)
		for id in config.sources:config.sources[id]=false
		var best={}
		for p in s.structures:
			if p.definitionId=="generator" and (best.is_empty() or p.health>best.health):best=p
		if not best.is_empty() and best.health>0:config.sources[best.instanceId]=true
		else:config.sources["loan-generator"]=s.recovery.loan
		for id in config.devices:
			var p=s.find_piece(id)
			config.devices[id]={"enabled":id in MMFMachineOperations.FIXED or p.get("definitionId","")=="refinery","priority":0 if id in MMFMachineOperations.FIXED else 1}
		s.operations=config
	s.recovery.completed=serial;s.recovery.phase="idle";s.recovery.step=0
	s.update_power();s.transaction.emit("recovery_completed",{"request":serial,"before":before,"fuel":s.fuel,"engine":s.subsystems.engine,"assisted":needed})
	s.notify("Service finished. Check the engineering panel before continuing.");return true

static func buy_fuel(s,site: String,amount: int) -> bool:
	if site not in SITES or amount<=0 or amount>s.recovery.stock[site] or amount>int(floor(100-s.fuel+.000001)):return false
	if not s.pay({"scrap":amount*FUEL_PRICE}):return false
	s.recovery.stock[site]-=amount;s.fuel+=amount;s.update_power()
	s.transaction.emit("service_fuel_purchased",{"site":site,"fuel":amount,"scrap":amount*FUEL_PRICE});s.changed.emit();return true
