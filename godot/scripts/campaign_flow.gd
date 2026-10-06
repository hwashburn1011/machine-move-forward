class_name MMFCampaignFlow
extends RefCounted

# Read-only preparation; existing authorities still own spending and scheduling.
static func fuel_preview(s) -> Dictionary:
	var budget=MMFPowerBudget.calculate(s,s.structures)
	var rate=float(budget.fuel_rate)
	return {"running":budget.running,"per_minute":rate*60.0,"tank_seconds":s.fuel/rate if rate>0 else -1.0,"owned":s.count_resource("fuel"),"docked":MMFMachineOperations.docked(s)}

static func preparation_text(s) -> String:
	var p=fuel_preview(s)
	var lines=[]
	if p.per_minute>0:
		lines.append("Current tank: about %d min %02d sec at %.1f fuel/min with %d running generator(s)."%[int(p.tank_seconds/60),int(p.tank_seconds)%60,p.per_minute,p.running])
	else:
		lines.append("Generators are not burning fuel. A stopped source supplies no engine power.")
	lines.append("Owned reserve: %d fuel. Transfer it at a generator or engineering service port."%p.owned)
	if p.docked:
		lines.append(MMFMachineOperations.docked_guidance(s))
	else:
		lines.append("Cruise disables unused workshop and recovery loads. Each running generator still burns fuel; stop spare sources at engineering.")
	lines.append("These are current operating estimates. Damage, upgrades and switching generators change them.")
	return "\n\n".join(lines)

static func messages(s) -> Array:
	var rows=[]
	if s.scanner.phase not in ["awaiting-receiver","awaiting-module"] and not s.facts.get("portCraneRepaired",false):
		rows.append({"id":"flow/port-repair","speaker":"SERVICE NOTE","text":"The seized port crane is repairable. At a workbench, make a Port crane actuator for 8 scrap and 2 components, then fit it at the left crane base. This is optional; your hand reel still works."})
	if s.facts.get("portCraneRepaired",false):
		rows.append({"id":"flow/port-working","speaker":"L–12" if s.caretaker.recovered else "RECOVERY LOG","text":"The left recovery arm is working. Leave room in storage and it will collect passing cargo while the deck is quiet. The hand reel can still reach the other side."})
	if "salvage-controller" in s.story.uniques:
		rows.append({"id":"flow/drone-unlocked","speaker":"RECOVERY LOG","text":"The Foundry controller unlocks a Salvage drone dock. Build one for 55 scrap and 6 components, supply 4 power, and leave its flight path clear. It retrieves ordinary cargo; heavy loads still need the later gantry."})
	if s.customization.restored:
		rows.append({"id":"flow/patchcoat-ready","speaker":"SERVICE NOTE","text":"Patchcoat tools restored. Use a paint trolley to try muted finishes before spending scrap. You can also give an owned radio cabinet, memory board or field chair a personal keepsake finish."})
	if not s.customization.projects.is_empty() and s.caretaker.recovered:
		rows.append({"id":"l12/first-keepsake","speaker":"L–12","text":"Your first keepsake is restored. We can carry useful things and things you simply want to keep."})
	if s.story.phase=="docked":
		rows.append({"id":"flow/docked-operation","speaker":"SERVICE NOTE","text":MMFMachineOperations.docked_guidance(s)})
	var fuel=fuel_preview(s)
	if fuel.tank_seconds>=0 and fuel.tank_seconds<180:
		rows.append({"id":"flow/fuel-reserve","speaker":"L–12" if s.caretaker.recovered else "SERVICE NOTE","text":"Less than three minutes of fuel remain at the current generator load. Transfer reserve fuel at a generator or service port. If you run dry with no supplies, engineering can arrange emergency recovery."})
	return rows
