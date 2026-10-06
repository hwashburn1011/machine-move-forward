extends SceneTree

var checks=0
var failures=[]
func _initialize():call_deferred("run")
func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);print("FAIL ",label)
func run():
	var data=MMFAssets.json("res://data/definitions.json")
	var runtime=MMFAssets.json("res://data/runtime-play.json")
	MMFNativeSurvivorData.apply(data,runtime);MMFNativeProgression.apply(data);MMFNativeNarrativeData.apply(data)
	var s=MMFSession.new(data)
	s.update_power()
	var before=s.native_snapshot()
	var preview=MMFCampaignFlow.fuel_preview(s)
	check(preview.running==1 and is_equal_approx(preview.per_minute,3.6),"Starter source burns the real 3.6 fuel/min")
	check(is_equal_approx(preview.tank_seconds,1000),"Starting 60-unit tank has a 1000-second running horizon")
	check(MMFCampaignFlow.preparation_text(s).contains("16 min 40 sec"),"Horizon is displayed in player-readable time")
	for i in 5:MMFCampaignFlow.messages(s);MMFCampaignFlow.preparation_text(s)
	check(before==s.native_snapshot(),"Preparation/acknowledgment queries do not spend supplies, advance clocks or RNG")
	s.create_piece("generator",{"x":4,"y":0,"z":4},0,{},true);s.update_power()
	preview=MMFCampaignFlow.fuel_preview(s)
	check(preview.running==2 and is_equal_approx(preview.tank_seconds,500),"Second running generator halves the true tank horizon")
	s.fuel=0;s.update_power()
	preview=MMFCampaignFlow.fuel_preview(s)
	check(preview.tank_seconds==-1 and preview.per_minute==0,"Empty tank never reports an infinite/NaN horizon")
	s.fuel=60;s.update_power();s.scanner.phase="installed"
	var messages=MMFCampaignFlow.messages(s)
	check(messages.any(func(m):return m.id=="flow/port-repair"),"Installed receiver reveals optional port-crane repair")
	check(not messages.any(func(m):return m.speaker=="L–12"),"Unrecovered L12 never speaks")
	s.facts.portCraneRepaired=true
	messages=MMFCampaignFlow.messages(s)
	check(not messages.any(func(m):return m.id=="flow/port-repair"),"Repaired crane invalidates stale repair advice")
	s.caretaker.recovered=true
	check(MMFCampaignFlow.messages(s).any(func(m):return m.id=="flow/port-working" and m.speaker=="L–12"),"Recovered companion acknowledges actual working crane")
	s.story.phase="docked"
	check(MMFCampaignFlow.preparation_text(s).contains("Choose Docked"),"Docked visit explains the existing fuel-saving mode")
	check(not s.complete_guardian("evaded"),"Unresolved unrelated route cannot issue guardian entitlement")
	s.story.index=4;s.story.routeId="meridian-cordon-gap";s.story.scripted="resolved"
	check(not s.complete_guardian("invalid"),"Unknown guardian outcome is rejected")
	check(s.complete_guardian("evaded") and s.facts.guardianOutcome=="evaded","Legitimate evasion grants durable cosmetic receipt")
	before=s.native_snapshot()
	check(not s.complete_guardian("destroyed") and s.native_snapshot()==before,"Repeated guardian resolution never replaces earned outcome")
	var restored=MMFSession.new(data)
	check(restored.restore_native(before) and restored.facts.guardianOutcome=="evaded","Guardian receipt survives validated save roundtrip")
	var restored_before=restored.native_snapshot()
	var bad=before.duplicate(true);bad.facts.guardianOutcome="invented"
	check(not restored.restore_native(bad) and restored.native_snapshot()==restored_before,"Malformed outcome rejects before session mutation")
	bad=before.duplicate(true);bad.facts=[]
	check(not restored.restore_native(bad),"Non-dictionary facts are rejected without a runtime error")
	var legacy=before.duplicate(true);legacy.facts.erase("guardianOutcome")
	var old=MMFSession.new(data)
	check(old.restore_native(legacy) and old.facts.guardianOutcome=="","Old save receives no invented guardian history")
	check(restored.restore_native(legacy) and restored.facts.guardianOutcome=="","Loading old save into used session clears newer guardian receipt")
	# Opening targets must use owned stock, not a lifetime crafting counter.
	var fresh=MMFSession.new(data);fresh.facts.salvage=true;fresh.scanner.phase="awaiting-module"
	fresh.facts.refined=100
	check(MMFObjectiveGuide.describe(fresh).id=="build-refinery","Spent historical components do not fund today's repair")
	fresh.inventory.add("components",4)
	check(MMFObjectiveGuide.describe(fresh).id=="build-workbench","Recovered components bypass unnecessary refining")
	var bench=fresh.create_piece("workbench",{"x":3,"y":0,"z":3})
	check(not bench.is_empty() and fresh.count_resource("components")==0,"Workbench actually pays its component bill")
	check(MMFObjectiveGuide.describe(fresh).id=="build-refinery","Guide notices components consumed by building")
	fresh.inventory.add("components",4)
	check(MMFObjectiveGuide.describe(fresh).id=="craft-scanner","Recovered module inputs permit next recipe without a refinery")
	fresh.inventory.add("scanner-replacement-module",1)
	check(MMFObjectiveGuide.describe(fresh).id=="install-scanner","Ready module takes precedence over other materials")
	# Docked help follows actual availability and operation state, not merely
	# arrival. Reading it must never switch off a new player's machinery.
	var dock=MMFSession.new(data);dock.facts.salvage=true
	var help=MMFMachineOperations.docked_guidance(dock)
	check(help.contains("introduced at the first expedition") and not help.contains("PREVIEW DOCKED"),"Locked modes do not advertise an unavailable command")
	dock.story.phase="docked";dock.update_power();before=dock.native_snapshot()
	help=MMFMachineOperations.docked_guidance(dock)
	check(help.contains("Modes → PREVIEW DOCKED → APPLY OPERATING MODE"),"Moored help names the real preview and apply controls")
	check(help.contains("Mooring alone does not stop") and MMFPowerBudget.calculate(dock,dock.structures).fuel_rate>0,"Mooring is not falsely described as fuel shutdown")
	check(MMFCampaignFlow.preparation_text(dock).contains(help) and MMFCampaignFlow.messages(dock).any(func(m):return m.id=="flow/docked-operation" and m.text==help),"Helm preparation and quiet wrist note share current explanation")
	check(before==dock.native_snapshot(),"Docked help has no resource, power, clock or save-state effects")
	var dock_quote=MMFMachineOperations.proposal(dock,"docked")
	check(MMFMachineOperations.apply(dock,dock_quote),"Only explicit application activates Docked")
	help=MMFMachineOperations.docked_guidance(dock)
	var stopped=MMFPowerBudget.calculate(dock,dock.structures)
	check(help.contains("DOCKED MODE ACTIVE") and stopped.fuel_rate==0 and not stopped.powered["fixed-radio"],"Active help matches stopped generation and unavailable unbacked receiver")
	check(help.contains("charged battery backup, if enabled") and help.contains("Devices controls"),"Help explains conditional backup and custom equipment controls")
	for equipment in ["refinery","turret-manual","lamp","collector-auto"]:
		check(not MMFMachineOperations.policy(dock.operations,"test-"+equipment,equipment).enabled,"Docked equipment tradeoff is truthful: "+equipment)
	check(help.contains("automatically restores your saved travel plan") and MMFMachineOperations.resume_config(dock).mode=="legacy","Departure explanation matches preserved plan")
	before=dock.native_snapshot()
	var overview=MMFEngineering.overview_diagnosis(dock)
	check(not overview.any(func(line):return line.contains("Restart a source") or line.contains("Review switches")),"Intentional Docked Overview does not recommend undoing shutdown")
	check(overview.has("Radio: off while Docked; no battery supply."),"Docked Overview still reports unavailable receiver supply")
	check(MMFMachineService.diagnose(dock).faults.any(func(line):return line.contains("Restart a source")),"General service diagnosis retains its default operating advice")
	check(before==dock.native_snapshot(),"Contextual diagnosis does not change power or save state")
	dock.expedition_gear.recovered.append("battery-bank")
	var bank=dock.create_piece("battery-bank",{"x":3,"y":0,"z":3},0,{},true);bank.state.charge=30
	check(MMFEngineering.overview_diagnosis(dock).has("Radio: supplied by battery backup."),"Charged Docked backup is reported truthfully")
	dock.operations.backup=false
	check(MMFEngineering.overview_diagnosis(dock).has("Radio: off while Docked; no battery supply."),"Disabled backup never claims battery power")
	dock.fuel=0;dock.subsystems.engine=0
	for piece in dock.structures:
		if piece.definitionId=="generator":piece.health=0
	overview=MMFEngineering.overview_diagnosis(dock)
	check(overview.any(func(line):return line.begins_with("Tank empty")),"Actual empty tank remains visible during Docked")
	check(overview.any(func(line):return line.begins_with("Engine cannot")),"Actual engine failure remains visible during Docked")
	check(overview.any(func(line):return line.begins_with("Generator condition")),"Actual generator failure remains visible during Docked")
	dock.story.uniques.append("course-gyro");dock.story.phase="route-selection"
	check(MMFMachineOperations.docked_guidance(dock).contains("only while moored") and MMFMachineOperations.proposal(dock,"docked").is_empty(),"Travel help does not offer an unavailable shutdown")
	var report={"checks":checks,"failures":failures,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"Pure operating estimates, native transaction/save validation and inventory-driven guidance; no human pacing claim."}
	var f=FileAccess.open("res://../test-results/beta-next/campaign-flow.json",FileAccess.WRITE);f.store_string(JSON.stringify(report,"  "));f.close()
	print("CAMPAIGN_FLOW ",checks," checks; failures=",failures.size())
	MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
