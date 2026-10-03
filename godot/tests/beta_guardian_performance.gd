extends "res://tests/art200_performance.gd"
## Separate late-phase rendering fixture; the ordinary Guardian comparison is
## unchanged. Only setup supplies half hull/two completed cycles, then live AI runs.
var escalated=false
var phases={"fixture":"half-hull Guardian after two cycles","scope":"Prepared, invulnerable rendering workload; not earned combat or difficulty evidence.","samples":{},"cross_observed":false}
var next_sample=0.0

func _initialize():
	super._initialize()
	output="res://../test-results/beta-next/performance/"
	scenario="guardian";label="beta-escalated";seconds=45.0

func camera_update(elapsed: float):
	super.camera_update(elapsed)
	var combat=game.combat
	if not escalated and combat.guardian.enabled:
		combat.ship_health=200
		combat.guardian.completed_cycles=2
		combat.guardian.begin_lock()
		events.append(phases);escalated=true
	if not escalated or elapsed<next_sample:return
	next_sample=elapsed+1
	var key=combat.guardian.pattern+"/"+combat.guardian.phase
	phases.samples[key]=int(phases.samples.get(key,0))+1
	if combat.guardian.pattern=="cross" and combat.guardian.phase=="salvo":phases.cross_observed=true
