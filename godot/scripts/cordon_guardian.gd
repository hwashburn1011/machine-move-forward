class_name MMFCordonGuardian
extends RefCounted

# A single authored encounter on the optional Meridian cordon route. The existing
# ship lifecycle, real subsystem targets, rewards and route receipt remain owners.
const ROUTE="meridian-cordon-gap"
const TITLE="GATEKEEPER G-01"
const LOCK_SECONDS=3.0
const WARNING_SECONDS=1.65
const COOL_SECONDS=6.0
const CROSS_LOCK_SECONDS=4.0
const CROSS_WARNING_SECONDS=1.9
const CROSS_COOL_SECONDS=7.5
var combat
var enabled=false
var phase=""
var remaining=0.0
var volleys=0
var recovery=0.0
var weapon_zone: MMFHitZone
var player_was_dead=false
var completed_cycles=0
var pattern="line"
var committed_target=Vector3.ZERO
var presentation=MMFGatekeeperPresentation.new()

func setup(owner_combat):combat=owner_combat

static func route_label(route: Dictionary) -> String:
	return "Gatekeeper guardian / disable gun or use decoy" if route.id==ROUTE else "quiet approach" if route.scriptedVehicle==null else route.scriptedVehicle+" patrol"

func brief():
	combat.game.journey.enqueue("narrative/gatekeeper-brief","MERIDIAN / SERVICE RECORD","Gatekeeper G-01 enforces the Order's false civilian bearing. Its gun tracks, commits to marked ground, then vents. Move clear of the marks and hit the cyan fire-control unit while it cools. A signal decoy can also break its tracking.")

func begin() -> bool:
	if not combat.begin_ship("gunboat",false,false,"front",1):return false
	enabled=true;phase="approach";remaining=0;volleys=0;player_was_dead=false;weapon_zone=null;completed_cycles=0;pattern="line"
	# Keep the established gunboat hull/health. Difficulty comes from an authored
	# rhythm and a valuable weakpoint, rather than another inflated health bar.
	for target in combat.ship_targets:
		if target.get_meta("ship_component","")=="weapon":weapon_zone=target
	combat.game.session.notify(TITLE+" — move after its lock. Shoot the cyan gun unit during cooling, or deploy a signal decoy.")
	combat.game.record_event("combat","guardian_started",{"id":"gatekeeper-g01","route":ROUTE})
	presentation.setup(combat)
	sync_target()
	return true

func status_text() -> String:
	if not enabled:return ""
	var action="APPROACH / DISABLE GUN OR DECOY"
	if combat.ship_state=="retreat":action="WITHDRAWING / CONTACT CLEARING"
	elif combat.ship_state=="destroying":action="DISABLED / CONTACT CLEARING"
	elif phase=="lock":action=("CROSS SALVO / %.1fs / DIAGONALS CLEAR" if pattern=="cross" else "AIM LOCK / %.1fs / KEEP MOVING")%remaining
	elif phase=="salvo":action="FIVE MARKS LOCKED / CLEAR THE CIRCLES" if pattern=="cross" else "MARKS LOCKED / MOVE CLEAR"
	elif phase=="cooling":action="SHUTTERS OPEN / GUN EXPOSED / %.1fs"%remaining
	return TITLE+" / "+action

func subsystem_damage(id: String,amount: float) -> float:
	var armor=4.0 if id=="engine" else 2.0
	if enabled and id=="weapon":
		armor=0.0 if weapon_exposed() else 10.0
		return maxf(0,amount-armor)*(1.75 if weapon_exposed() else 1.0)
	return maxf(0,amount-armor)

func weapon_exposed() -> bool:
	return enabled and phase=="cooling" and combat.weapon_health>0 and combat.ship_state=="attack" and not combat.tracking_disrupted

func sync_target():
	if not enabled:return
	var exposed=weapon_exposed()
	if is_instance_valid(weapon_zone):
		weapon_zone.armor=0 if exposed else 10
		weapon_zone.label="FIRE CONTROL / EXPOSED" if exposed else "FIRE CONTROL / ARMORED"
	for material in combat.craft.weapon_lenses:
		var lit=combat.weapon_health>0 and combat.ship_state not in ["retreat","destroying"]
		material.albedo_color=Color(.13,.95,.85) if exposed else material.get_meta("lit_color") if lit else Color(.038,.012,.008)
		material.emission=Color(.08,.8,.72) if exposed else material.get_meta("lit_color")
		material.emission_energy_multiplier=2.5 if exposed else .65 if lit else 0

func clear_salvo():
	for shell in combat.shells:
		if is_instance_valid(shell.marker):shell.marker.queue_free()
	combat.shells.clear()

func begin_lock():
	# First contact always teaches the original rhythm. Damage creates one
	# alternating broader pattern, with more time to read it and answer it.
	pattern="cross" if completed_cycles>=2 and completed_cycles%2==0 and combat.ship_health<210 else "line"
	phase="lock";remaining=CROSS_LOCK_SECONDS if pattern=="cross" else LOCK_SECONDS
	if pattern=="cross":combat.game.session.notify(TITLE+" broad salvo — five fixed marks. Move diagonally clear; its cooling window will be longer.")

func salvo_offsets() -> Array:
	if pattern=="cross":return [Vector3.ZERO,Vector3(-3,0,0),Vector3(3,0,0),Vector3(0,0,-3),Vector3(0,0,3)]
	var axis=Vector3.RIGHT if volleys%2==0 else Vector3.FORWARD
	return [-axis*2.2,Vector3.ZERO,axis*2.2]

func update(dt: float):
	if not enabled:return
	if combat.ship_state!="attack" or combat.weapon_health<=0 or combat.tracking_disrupted:
		# Disabling the gun or breaking tracking cancels marked incoming shots.
		# Its retreat still runs through the ordinary visible ship lifecycle.
		clear_salvo();sync_target();presentation.sync(dt,phase,remaining,pattern,false);return
	if combat.game.session.health<=0:
		if not player_was_dead:clear_salvo();begin_lock()
		player_was_dead=true;sync_target();presentation.sync(dt,"recovery",remaining,pattern,false);return
	if player_was_dead:
		player_was_dead=false;begin_lock()
		combat.game.session.notify(TITLE+" reacquiring — fresh lock window.")
	if phase=="approach":
		begin_lock();sync_target();presentation.sync(dt,phase,remaining,pattern,false);return
	remaining=maxf(0,remaining-dt)
	if phase=="lock":
		combat.game.effects.tracer(combat.craft.shot_origin(),combat.game.player.position+Vector3.UP,Color(.8,.35,.08))
		if remaining<=0:
			# Capture the target once: impacts must never chase a player who dodged.
			var at=combat.game.player.position;committed_target=at+Vector3.UP
			var aim=MMFEnemyBallistics.ground_point(combat.craft.shot_origin(),at,combat.aim_rng)
			var warning=CROSS_WARNING_SECONDS if pattern=="cross" else WARNING_SECONDS
			var offsets=salvo_offsets()
			for i in offsets.size():
				combat.queue_shell(aim+offsets[i],warning+i*.18+maxf(0,dt),10,true)
			combat.craft.fire();volleys+=1;phase="salvo";remaining=warning+(offsets.size()-1)*.18+.04
	elif phase=="salvo" and remaining<=0 and combat.shells.is_empty():
		phase="cooling";remaining=(CROSS_COOL_SECONDS if pattern=="cross" else COOL_SECONDS)+(3.0 if combat.engine_health<=0 else 0.0)
		if volleys==1:combat.game.session.notify(TITLE+" venting — cyan fire-control unit exposed.")
	elif phase=="cooling" and remaining<=0:completed_cycles+=1;begin_lock()
	sync_target()
	presentation.sync(dt,phase,remaining,pattern,weapon_exposed())

func finish():
	if not enabled:return
	var s=combat.game.session
	var outcome="destroyed" if combat.ship_health<=0 else "disarmed" if combat.weapon_health<=0 else "evaded"
	var legitimate=combat.ship_state in ["destroying","retreat"] and (combat.ship_health<=0 or combat.weapon_health<=0 or combat.tracking_disrupted)
	if not legitimate:
		reset();return
	enabled=false;phase="";weapon_zone=null;clear_salvo();recovery=650
	if s.story.routeId==ROUTE and s.story.get("scripted","")=="queued":s.story.scripted="resolved"
	var first_resolution=s.complete_guardian(outcome)
	combat.game.journey.quiet_until=maxf(combat.game.journey.quiet_until,s.clock+75)
	var message="Gatekeeper contact cleared. The receiving bearing is still ahead. Take a breath, collect salvage and service the Nomad before the berth."
	if s.caretaker.recovered:message="Gatekeeper can no longer hold this crossing. Seeds and names are still safe. We have time to tend the Nomad before the berth."
	var result="Hull disabled." if outcome=="destroyed" else "Fire control disabled; Gatekeeper withdrew." if outcome=="disarmed" else "Signal decoy broke its tracking; Gatekeeper withdrew."
	message=result+" "+message
	if first_resolution:message+=" G-01 service mark unlocked for the Nomad."
	combat.game.journey.enqueue("narrative/gatekeeper-cleared","L–12" if s.caretaker.recovered else "NAVIGATION",message)
	if first_resolution:combat.game.audio.play_sound("radio-signal",.16)
	combat.game.record_event("combat","guardian_resolved",{"id":"gatekeeper-g01","outcome":outcome,"volleys":volleys})
	presentation.clear()

func take_recovery() -> float:
	var distance=recovery;recovery=0;return distance

func reset():
	clear_salvo();presentation.clear()
	enabled=false;phase="";remaining=0;volleys=0;recovery=0;weapon_zone=null;player_was_dead=false;completed_cycles=0;pattern="line";committed_target=Vector3.ZERO
