class_name MMFPowerBudget
extends RefCounted

# Pure live/preview calculation. Only Session advances fuel and stored energy.
static func calculate(s,pieces: Array,step_seconds: float=0.0,proposed: Dictionary={}) -> Dictionary:
	var config=s.operations if proposed.is_empty() else proposed
	var mods=s.modifiers()
	var projected_quiet=s.expedition_gear.quiet and s.fuel>0 and "quiet-drive" in s.expedition_gear.recovered and pieces.any(func(p):return p.definitionId=="quiet-drive" and p.health>0)
	if projected_quiet!=MMFNativeProgression.quiet_running(s):mods.generationBonus+=-4 if projected_quiet else 4
	var generation=0.0;var demand=0.0;var running=0;var drive_enabled=false;var has_generator=false
	var sources=[];var consumers=[];var powered={};var priority_draws=[0.0,0.0,0.0]
	for p in pieces:
		var id=p.definitionId
		if id=="generator":
			if p.health>0:has_generator=true
			var enabled=MMFMachineOperations.source_enabled(config,p.instanceId)
			var usable=enabled and p.health>0
			if usable:drive_enabled=true
			var output=maxf(0,16+mods.generationBonus)*p.health/s.data.BUILD_PIECES[id].maxHealth if usable and s.fuel>0 else 0.0
			if usable and s.fuel>0:running+=1
			generation+=output
			sources.append({"id":p.instanceId,"enabled":enabled,"output":output,"reason":"Stopped" if not enabled else "Damaged" if p.health<=0 else "No fuel" if s.fuel<=0 else "Running"})
		if MMFSession.POWER_DRAWS.has(id):
			var policy=MMFMachineOperations.policy(config,p.instanceId,id)
			var priority=2 if id.begins_with("turret") else (0 if id=="lamp" else 1)
			var draw=MMFSession.POWER_DRAWS[id]+(mods.turretPowerBonus if id.begins_with("turret") else 0)
			consumers.append({"id":p.instanceId,"type":id,"draw":draw,"enabled":policy.enabled,"priority":policy.priority,"legacy_priority":priority,"healthy":p.health>0})
	if s.recovery.loan and not has_generator:
		var enabled=MMFMachineOperations.source_enabled(config,"loan-generator")
		drive_enabled=enabled
		var output=maxf(0,16+mods.generationBonus) if enabled and s.fuel>0 else 0.0
		generation+=output
		if enabled and s.fuel>0:running+=1
		sources.append({"id":"loan-generator","enabled":enabled,"output":output,"reason":"Stopped" if not enabled else "No fuel" if s.fuel<=0 else "Running"})
	for id in MMFMachineOperations.FIXED:
		if id=="fixed-port-crane" and not s.facts.get("portCraneRepaired",false):continue
		if id=="fixed-radio" and not s.facts.salvage:continue
		if id=="fixed-helm" and "course-gyro" not in s.story.uniques:continue
		if id=="fixed-fieldwork" and not s.fieldwork_active:continue
		var policy=MMFMachineOperations.policy(config,id,id)
		consumers.append({"id":id,"type":id,"draw":2.0 if id=="fixed-port-crane" else 1.0,"enabled":policy.enabled and (id!="fixed-port-crane" or s.facts.get("portCraneEnabled",true)),"priority":policy.priority,"legacy_priority":1,"healthy":true})
	for c in consumers:
		powered[c.id]=false
		if c.enabled and c.healthy:demand+=c.draw;priority_draws[c.legacy_priority]+=c.draw
	var supplied=0.0
	if not config.configured:
		var total=demand;var first_enabled=0
		for priority in [0,1,2]:
			if total<=generation:break
			first_enabled=priority+1;total-=priority_draws[priority]
		for c in consumers:
			powered[c.id]=c.healthy and c.enabled and c.legacy_priority>=first_enabled
			if powered[c.id]:supplied+=c.draw
	else:
		consumers.sort_custom(func(a,b):return a.priority<b.priority if a.priority!=b.priority else a.id<b.id)
		for c in consumers:
			if c.enabled and c.healthy and supplied+c.draw<=generation+.00001:powered[c.id]=true;supplied+=c.draw
	var discharge={};var charge={};var banks=[];var available=0.0;var battery_draw=0.0
	if "battery-bank" in s.expedition_gear.recovered:
		for p in pieces:
			if p.definitionId=="battery-bank" and p.health>0:
				banks.append(p)
				if config.backup:available+=minf(4,float(p.state.get("charge",0))/maxf(.001,step_seconds))
	banks.sort_custom(func(a,b):return a.instanceId<b.instanceId)
	for id in MMFMachineOperations.FIXED:
		if id=="fixed-port-crane":continue # Emergency batteries preserve navigation, not hoists.
		if powered.has(id) and not powered[id] and MMFMachineOperations.policy(config,id,id).enabled and available>=1:
			powered[id]=true;available-=1;battery_draw+=1
	var left=battery_draw
	for p in banks:
		var amount=minf(left,minf(4,float(p.state.get("charge",0))/maxf(.001,step_seconds)))
		discharge[p.instanceId]=amount;left-=amount
	var spare=maxf(0,generation-supplied)
	if battery_draw==0 and config.charging:
		for p in banks:
			var amount=minf(spare,minf(2,(120-float(p.state.get("charge",0)))/maxf(.001,step_seconds)))
			charge[p.instanceId]=amount;spare-=amount
	for c in consumers:
		c.served=powered[c.id]
		c.reason="Damaged" if not c.healthy else "Disabled" if not c.enabled else "Powered" if c.served else "Insufficient supply"
	return {"capacity":generation+battery_draw,"generation":generation,"demand":demand,"served":supplied+battery_draw,"powered":powered,"battery_draw":battery_draw,"priority_draws":priority_draws,"spare":generation-supplied,"sources":sources,"consumers":consumers,"discharge":discharge,"charge":charge,"fuel_rate":running*.06*mods.fuelBurnMultiplier,"drive_enabled":drive_enabled,"running":running}
