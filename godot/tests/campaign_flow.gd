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
	var report={"checks":checks,"failures":failures,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"Pure operating estimates, native transaction/save validation and inventory-driven guidance; no human pacing claim."}
	var f=FileAccess.open("res://../test-results/beta-next/campaign-flow.json",FileAccess.WRITE);f.store_string(JSON.stringify(report,"  "));f.close()
	print("CAMPAIGN_FLOW ",checks," checks; failures=",failures.size())
	MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
