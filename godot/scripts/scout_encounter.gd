class_name MMFScoutEncounter
extends RefCounted

# One encounter director owns search, broadcast, pursuit and quiet recovery.
const MODEL=preload("res://art/sovereign-drone.glb")
var game
var actor: Node3D
var target: MMFHitZone
var label: Label3D
var health=64.0
var elapsed=0.0
var broadcast_left=0.0
var departure_left=0.0
var start_lateral=0.0
var side=1
var decoy: Node3D
var pending_outcome=""
var pursuit_decoy=false
var player_was_dead=false

func setup(owner_game):game=owner_game

func active() -> bool:return is_instance_valid(actor) or is_instance_valid(decoy) or pursuit_decoy

func begin():
	if game.session.recovery.phase=="service" or game.session.health<=0 or game.combat.active_threat() or game.combat.ship_state!="none":return
	var state=game.session.scout_state
	state.sequence+=1;state.phase="searching";state.progress=0.0
	side=1 if int(state.sequence)%2 else -1
	start_lateral=game.session.lateral;elapsed=0;health=64;pending_outcome="";pursuit_decoy=false;player_was_dead=false
	actor=MODEL.instantiate();actor.name="SearchingScout";game.combat.add_child(actor);actor.scale=Vector3.ONE*1.55
	actor.position=Vector3(side*27,20,-25)
	target=MMFHitZone.new();target.health_reader=func():return health
	target.set_meta("ship_component","scout")
	target.setup(actor,Vector3.ZERO,Vector3.ONE*.8,func(amount,point):
		health=maxf(0,health-maxf(0,amount))
		if health<=0:
			game.effects.explosion(point,.6);finish("disabled"))
	label=Label3D.new();actor.add_child(label);label.position.y=.8;label.font_size=26;label.pixel_size=.007
	label.billboard=BaseMaterial3D.BILLBOARD_ENABLED;label.modulate=Color(1,.7,.25)
	label.hide()
	game.audio.play_at("servo-load",actor.position,.15)

func status_text() -> String:
	if not active():return ""
	if pursuit_decoy:
		if game.combat.ship_state in ["grapple_launch","grapple"]:return "TRACKING LOST / CUT THE GRAPPLE"
		if game.combat.has_live_boarders():return "TRACKING LOST / CLEAR REMAINING BOARDERS"
		return "TRACKING LOST / CARRIER WITHDRAWING" if game.combat.ship_state!="none" else "FALSE SIGNAL ACTIVE / BREAKING CONTACT"
	var phase=game.session.scout_state.phase
	if phase=="searching":return "SCOUT SEARCH / %d%% DETECTED / %s" % [roundi(game.session.scout_state.progress*100),"STEER PORT" if side>0 and game.session.navigation_limit()>0 else "STEER STARBOARD" if game.session.navigation_limit()>0 else "BREAK SIGHT OR DECOY"]
	if phase=="tracking":return "SCOUT LOCKED / BROADCAST IN %.1fs / SHOOT OR DECOY" % broadcast_left
	return "SCOUT LOSING CONTACT"

func can_decoy() -> bool:
	if game.session.health<=0:return false
	return (is_instance_valid(actor) and game.session.scout_state.phase in ["searching","tracking"]) or (game.combat.ship_state in ["approach","grapple_launch","grapple","attack"] and not game.combat.tracking_disrupted)

func deploy_decoy() -> bool:
	if not can_decoy():game.session.notify("No active search or carrier tracking to distract.");return false
	if not game.session.pay({"signal-decoy":1}):game.session.notify("Craft a signal decoy at the workbench first.");return false
	pursuit_decoy=game.combat.ship_state!="none"
	game.combat.tracking_disrupted=pursuit_decoy
	if is_instance_valid(decoy):decoy.queue_free()
	decoy=Node3D.new();decoy.name="DeployedSignalDecoy";game.combat.add_child(decoy);decoy.position=Vector3(side*28,15,12)
	var beacon=MeshInstance3D.new();var mesh=SphereMesh.new();mesh.radius=.18;mesh.height=.36
	var material=MMFAssets.material(Color(.3,1,.55));material.emission_enabled=true;material.emission=Color(.15,.8,.35);material.emission_energy_multiplier=2
	mesh.material=material;beacon.mesh=mesh;decoy.add_child(beacon)
	game.effects.tracer(game.player.position+Vector3.UP,decoy.position,Color(.3,1,.55))
	game.session.scout_state.phase="departing";pending_outcome="escaped" if pursuit_decoy else "decoy";departure_left=4
	if is_instance_valid(label):label.text="FALSE SIGNAL"
	game.audio.play_at("receiver-contact",decoy.position,.15)
	game.session.notify("False signal deployed. Cut the grapple to break contact." if game.combat.ship_state in ["grapple_launch","grapple"] else "False signal deployed — tracking diverted.")
	return true

func update(dt: float):
	if not active():return
	var state=game.session.scout_state
	# Death does not count as evasion or complete a pursuit. A respawn gets a
	# fresh, readable search window; existing carriers and boarders remain real.
	if game.session.health<=0:
		if not player_was_dead and state.phase in ["searching","tracking"]:
			state.phase="searching";state.progress=0;broadcast_left=0;elapsed=0
		start_lateral=game.session.lateral;player_was_dead=true
		return
	player_was_dead=false
	elapsed+=dt
	if is_instance_valid(decoy):decoy.position.z+=game.session.speed*dt
	if state.phase=="departing":
		departure_left-=dt
		if is_instance_valid(actor):actor.position=actor.position.move_toward(decoy.position if is_instance_valid(decoy) else Vector3(side*80,30,-30),dt*12)
		if departure_left<=0:
			if pursuit_decoy:
				clear_visuals();complete_escape_if_clear()
			else:finish(pending_outcome)
		return
	if not is_instance_valid(actor):return
	# The scout patrol has a fixed world-space search lane. Steering must actually
	# move the Nomad out of it; merely selecting a heading never grants escape.
	var lateral=game.session.lateral-start_lateral
	actor.position=Vector3(side*27-lateral,20+sin(elapsed*.9)*.6,-25+sin(elapsed*.22)*9)
	actor.look_at(game.player.position+Vector3.UP)
	var lane_cleared=-side*lateral>=16 and game.session.navigation_limit()>0
	if lane_cleared:finish("avoided");return
	var sight=game.raycast(actor.position,game.player.position+Vector3.UP,[target.get_rid()],1)
	var searching=sight.is_empty() and actor.position.distance_to(game.player.position)<58
	if state.phase=="searching":
		state.progress=clampf(float(state.progress)+(dt/(36.0 if MMFNativeProgression.quiet_running(game.session) else 18.0) if searching else -dt/9.0),0,1)
		if state.progress>=1:state.phase="tracking";broadcast_left=5;game.audio.play_at("servo-load",actor.position,.19)
		elif elapsed>38:finish("avoided");return
	elif state.phase=="tracking":
		broadcast_left-=dt
		if not searching:
			state.progress=maxf(0,float(state.progress)-dt/5.0)
			if state.progress<.45:
				state.phase="searching";broadcast_left=0
				game.session.notify("Scout lost its lock. Keep behind cover or clear its search lane.")
				label.text="SEARCHING / %d%%" % roundi(state.progress*100)
				return
		if broadcast_left<=0:finish("reinforcements");return
	label.text="BROADCAST / %.1fs" % broadcast_left if state.phase=="tracking" else "SEARCHING / %d%%" % roundi(state.progress*100)

func finish(outcome: String):
	if not active():return
	var state=game.session.scout_state
	state.phase="idle";state.progress=0;state.outcome=outcome;state.resolved+=1
	var was_pursuit=pursuit_decoy
	clear_visuals();pending_outcome="";pursuit_decoy=false
	if was_pursuit:return
	if outcome=="reinforcements":
		game.session.notify("Scout broadcast received — boarding craft approaching.")
		game.combat.begin_ship("skiff",false,true,"rear",side)
	else:
		game.session.threat.phase="recovery";game.session.threat.remaining=450;game.session.threat.warning=false
		game.session.notify("Scout disabled. The patrol never received your position." if outcome=="disabled" else "Search lost contact. You can keep moving.")
		game.session.facts["scoutAvoided"]=int(game.session.facts.get("scoutAvoided",0))+1

func complete_escape_if_clear():
	# A disappearing beacon is only visual cleanup. The same encounter remains
	# unsavable until the carrier has left and every genuine boarder is resolved.
	if pursuit_decoy and departure_left<=0 and game.session.health>0 and game.combat.ship_state=="none" and not game.combat.has_live_boarders():
		finish("escaped")

func clear_visuals():
	if is_instance_valid(target):target.collision_layer=0
	if is_instance_valid(actor):actor.queue_free()
	if is_instance_valid(decoy):decoy.queue_free()
	actor=null;target=null;decoy=null;label=null

func reset():
	clear_visuals();pending_outcome="";pursuit_decoy=false;player_was_dead=false
	elapsed=0;broadcast_left=0;departure_left=0;health=64
	game.session.scout_state.phase="idle";game.session.scout_state.progress=0
