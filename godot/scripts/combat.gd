class_name MMFCombat
extends Node3D

var game
var enemies: Array = []
var ship: Node3D
var ship_state = "none"
var ship_kind = "skiff"
var ship_health = 0.0
var engine_health = 0.0
var weapon_health = 0.0
var hook_health = 0.0
var hook: MMFHitZone
var ship_side = 1
var ship_timer = 0.0
var volley_timer = 0.0
var crew: Array = []
var shells: Array = []
var loot: Array = []
var loot_view=MMFLootView.new()
var boarding=MMFBoarding.new()
var craft=MMFRaiderCraft.new()
var shot_clocks = {}
var encounter_had_enemies = false
var nav: NavigationRegion3D
var rope: MeshInstance3D
var raid_wave=0
var turret_aim={}
var mission=MMFRaidMission.new()
var nav_dirty=false
var nav_delay=0.0
var tutorial_ship=false
var disabled_time=0.0
var approach_direction="rear"
var approach_start=Vector3.ZERO
var approach_end=Vector3.ZERO
var approach_duration=18.0
var ship_targets: Array=[]
var rewards_issued=false
var tracking_disrupted=false
var escape_time=0.0
var ship_marker: Label3D
var scout=MMFScoutEncounter.new()
var guardian=MMFCordonGuardian.new()
var aim_rng: MMFRandom
var enemy_serial=0

func setup(owner_game):
	game=owner_game
	aim_rng=MMFEnemyBallistics.rng_for([game.session.seed_name,"raider-shells"])
	loot_view.setup(game)
	boarding.setup(game)
	mission.setup(game)
	scout.setup(game)
	guardian.setup(self)
	nav=NavigationRegion3D.new()
	var mesh=NavigationMesh.new()
	mesh.agent_radius=0.4
	mesh.agent_height=2.0
	mesh.agent_max_climb=0.45
	mesh.agent_max_slope=50
	mesh.cell_size=0.2
	mesh.cell_height=0.05
	NavigationServer3D.map_set_cell_size(game.get_world_3d().navigation_map,0.2)
	NavigationServer3D.map_set_cell_height(game.get_world_3d().navigation_map,0.05)
	mesh.geometry_parsed_geometry_type=NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS
	# Fabric has camera-only obstruction, not a walkable rooftop or enemy cover.
	mesh.geometry_collision_mask &= ~MMFMachineCanopy.CAMERA_LAYER
	mesh.geometry_source_geometry_mode=NavigationMesh.SOURCE_GEOMETRY_GROUPS_WITH_CHILDREN
	mesh.geometry_source_group_name="navigation_source"
	mesh.filter_baking_aabb=AABB(Vector3(-20,7,-20),Vector3(40,16,40))
	nav.navigation_mesh=mesh
	add_child(nav)
	game.world.add_to_group("navigation_source")
	game.building.add_to_group("navigation_source")
	nav.bake_navigation_mesh(true)

func spawn(kind: String,at: Vector3,inactive: bool=false) -> MMFEnemy:
	var enemy=MMFEnemy.new()
	add_child(enemy)
	enemy.setup(game,kind)
	enemy_serial+=1
	enemy.aim_rng=MMFEnemyBallistics.rng_for([game.session.seed_name,"enemy",kind,enemy_serial])
	enemy.position=at
	enemy.inactive=inactive
	enemies.append(enemy)
	encounter_had_enemies=true
	return enemy

func active_threat() -> bool:
	if guardian.enabled:return true
	if scout.active():return true
	if ship_state not in ["none","retreat"]: return true
	return has_live_boarders()

func has_live_boarders() -> bool:
	for enemy in enemies:
		if is_instance_valid(enemy) and not enemy.dead and (not enemy.inactive or boarding.leap_detached(enemy)): return true
	return false

# Shared read-only scheduling facts. An encounter already in progress is never
# erased by opening a menu, extending the hull or entering a sanctuary.
func scheduling_state() -> Dictionary:
	var s=game.session
	var optional=s.contacts.active
	var sanctuary=s.story.phase in ["docked","braking","ending-journey","arrival","finale-docked"] or (optional.get("state","") in ["committed","docked","visited"] and optional.atDistanceM-s.distance<70)
	var reason=""
	if active_threat() or ship_state!="none":reason="Encounter in progress"
	elif not s.opening_done or s.scanner.phase!="consumed":reason="Opening progression"
	elif s.recovery.phase=="service":reason="Chassis service in progress"
	elif sanctuary:reason="Protected destination approach"
	elif s.story.phase=="finale-link":reason="Final receiving-link operation"
	elif s.health<35:reason="Player recovering"
	elif not game.aboard():reason="Player away from Nomad"
	elif game.menu_open or game.cinematic!="":reason="Interface or cinematic"
	elif s.clock<game.journey.quiet_until:reason="Protected briefing"
	return {"allowed":reason=="","reason":reason,"sanctuary":sanctuary,"phase":s.threat.phase,"remaining_distance":s.threat.remaining}

func begin_ship(kind: String="skiff",tutorial: bool=false,radio: bool=false,direction: String="",side_override: int=0) -> bool:
	if game.session.story.phase in ["ending-journey","arrival","finale-docked"]:return false
	if ship_state!="none" or active_threat() or game.session.recovery.phase=="service": return false
	game.building.cancel()
	ship_kind=kind
	tutorial_ship=tutorial;disabled_time=0.0
	ship=MMFRaiderCraft.model(kind)
	add_child(ship)
	var roster=MMFRandom.new()
	raid_wave=int(game.session.threat.get("radioWave",0))
	if radio: game.session.threat.radioWave=raid_wave+1
	roster.seed=MMFRandom.hash_seed([game.session.seed_name,"radio-side",raid_wave])
	ship_side=side_override if side_override in [-1,1] else -1 if roster.randf()<0.5 else 1
	approach_direction=direction if direction in ["front","rear"] else ("rear" if raid_wave%2==0 else "front")
	# Hold the armored belt near deck height: descending shots from ordinary
	# front/rear guns otherwise hit the Nomad's own safety rails all approach.
	approach_start=Vector3(ship_side*23,15,68 if approach_direction=="rear" else -68)
	approach_end=Vector3(ship_side*(19 if kind=="gunboat" else 17),14.5,0)
	approach_duration=23.0 if kind=="gunboat" else 18.0
	ship.position=approach_start
	rewards_issued=false;tracking_disrupted=false;escape_time=0.0;ship_targets.clear()
	ship_state="approach"
	ship_health=420 if kind=="gunboat" else 220 if tutorial else 260
	engine_health=160
	weapon_health=120
	hook_health=45 if tutorial else 60
	ship_timer=0
	volley_timer=3
	craft.setup(self)
	crew.clear()
	var hull=MMFHitZone.new();hull.armor=6 if kind=="gunboat" else 5
	hull.health_reader=func():return ship_health
	hull.set_meta("ship_component","hull")
	hull.setup(ship,Vector3(0,1.2,0),Vector3(3.4,2.8,9) if kind=="gunboat" else Vector3(3,2,6),func(amount,point):
		ship_health=maxf(0,ship_health-maxf(0,amount-(6 if ship_kind=="gunboat" else 5)))
		if ship_health<=0: destroy_ship(point))
	ship_targets.append(hull)
	if kind=="gunboat":
		for subsystem in ["engine","weapon"]:
			var zone=MMFHitZone.new();zone.armor=4 if subsystem=="engine" else 2
			zone.health_reader=func():return engine_health if subsystem=="engine" else weapon_health
			zone.set_meta("ship_component",subsystem)
			var at=Vector3(0,3.2,2.8) if subsystem=="engine" else Vector3(0,3.4,-1.7)
			zone.setup(ship,at,Vector3(1.6,1.3,1.8),func(amount,point):
				var before=engine_health if subsystem=="engine" else weapon_health
				if subsystem=="engine": engine_health=maxf(0,engine_health-guardian.subsystem_damage(subsystem,amount))
				else: weapon_health=maxf(0,weapon_health-guardian.subsystem_damage(subsystem,amount))
				if before>0 and (engine_health<=0 if subsystem=="engine" else weapon_health<=0):
					game.effects.explosion(point,0.4)
				)
			ship_targets.append(zone)
	else:
		roster.seed=MMFRandom.hash_seed([game.session.seed_name,"radio-raids",int(raid_wave/2)])
		var bag=["revenant","warden","bastion","sovereign"]
		for i in range(3,0,-1):
			var j=roster.randi_range(0,i)
			var held=bag[i];bag[i]=bag[j];bag[j]=held
		for i in 2:
			var kind_id="raider" if tutorial else bag[(raid_wave%2)*2+i]
			var enemy=spawn(kind_id,boarding.start_position(i),true)
			boarding.prepare(enemy)
			crew.append(enemy)
	ship_marker=Label3D.new();ship_marker.position=Vector3(0,4.2,0);ship_marker.font_size=28;ship_marker.pixel_size=.009
	ship_marker.billboard=BaseMaterial3D.BILLBOARD_ENABLED;ship_marker.modulate=Color(1,.52,.26);ship.add_child(ship_marker)
	game.record_event("combat","encounter_started",{"kind":kind,"tutorial":tutorial,"radio":radio})
	return true

func encounter_status() -> String:
	if guardian.enabled:return guardian.status_text()
	if scout.active():return scout.status_text()
	if ship_state in ["none","retreat","destroying"]:return ""
	var distance=roundi(ship.position.distance_to(game.player.position))
	var direction="REAR" if ship.position.z>8 else "FRONT" if ship.position.z< -8 else "STARBOARD" if ship_side>0 else "PORT"
	var activity="APPROACH" if ship_state=="approach" else "GRAPPLE LAUNCH" if ship_state=="grapple_launch" else "BOARDING" if ship_state=="grapple" else "GUNBOAT"
	return "%s / %s / %dm%s" % [activity,direction,distance," / TRACKING LOST — CUT GRAPPLE" if tracking_disrupted else ""]

func update(dt: float):
	enemies=enemies.filter(func(e):return is_instance_valid(e))
	if game.cinematic!="": return
	if nav_dirty:
		nav_delay-=dt
		if nav_delay<=0 and not nav.is_baking(): nav.bake_navigation_mesh(true);nav_dirty=false
	mission.update(dt)
	scout.update(dt)
	var state=game.session
	update_director(dt)
	if ship_state!="none": update_ship(dt)
	scout.complete_escape_if_clear()
	for i in range(shells.size()-1,-1,-1):
		var shell=shells[i]
		shell.time-=dt
		if shell.time<=0:
			resolve_shell(shell)
			shell.marker.queue_free()
			shells.remove_at(i)
	loot_view.update()
	for i in range(loot.size()-1,-1,-1):
		var item=loot[i]
		if item.node.position.distance_to(game.player.position)<1.7:
			var before=int(item.count)
			item.count=state.add_resource(item.id,item.count)
			if game.ui:game.ui.loot_readout.record(item.id,before-int(item.count))
			if item.count==0:
				item.node.queue_free()
				loot.remove_at(i)
	# Hide collected instances in the same update that transfers their resources.
	if loot_view.previous_count!=loot.size():loot_view.update()
	update_turrets(dt)
	if encounter_had_enemies and not active_threat() and ship_state=="none":
		encounter_had_enemies=false
		state.facts.defenses+=1
		if "manual-turret" not in state.unlocks: state.unlocks.append("manual-turret")
		if state.story.phase=="raids": state.story.phase="route-selection"
		state.threat.phase="recovery"
		state.threat.remaining=maxf(250,guardian.take_recovery())
		state.threat.warning=false
		state.notify("Contact lost. Deck secure — time to recover." if tracking_disrupted else "Deck secure. Recovery interval — radio trace available.")

func update_director(dt: float):
	var s=game.session
	if not s.opening_done: return
	if not s.facts.get("tutorialStarted",false) and s.facts.defenses==0:
		var turret={}
		for p in s.structures:
			if p.definitionId=="turret-manual": turret=p;break
		if not turret.is_empty() and s.facts.get("defenseCrewed",false) and s.scanner.phase=="consumed":
			s.threat.tutorialWait=s.threat.get("tutorialWait",0.0)+dt
			if s.threat.tutorialWait>=15 and not active_threat() and ship_state=="none" and not game.menu_open and s.scanner.phase not in ["scanning","pending"]:
				if begin_ship("skiff",true):s.facts.tutorialStarted=true;return
	if s.scanner.phase!="consumed": return
	var t=s.threat
	var schedule=scheduling_state()
	if schedule.sanctuary:
		t.sanctuary=true
		return
	if t.get("sanctuary",false):
		t.sanctuary=false;t.phase="sanctuary-release";t.remaining=300
	if active_threat() or ship_state!="none": return
	var safe=schedule.allowed
	if safe: t.legacy=maxf(0,t.get("legacy",24.0)-dt)
	t.remaining=maxf(0,t.remaining-s.speed*dt)
	if t.remaining>0: return
	if t.phase=="recovery":
		var rng=MMFRandom.new();rng.seed=MMFRandom.hash_seed([s.seed_name,"threat-director"])
		var draw=0.0
		for i in int(t.get("draws",0))+1: draw=rng.randf()
		t.draws=t.get("draws",0)+1;t.phase="calm";t.remaining=400+draw*700
	elif t.phase=="sanctuary-release": t.phase="calm";t.remaining=400
	elif t.phase=="calm" and safe and t.legacy<=0:
		t.phase="buildup";t.remaining=140;t.warning=true
		# The director's future spawn is not a received radio signal. The actual
		# craft, search optic and grapple machinery announce their own presence.
	elif t.phase=="buildup" and safe and t.legacy<=0:
		if int(t.get("draws",0))%2==1 and s.facts.defenses>0:
			scout.begin()
			if scout.active():t.phase="engagement"
		elif begin_ship("skiff",false,true):t.phase="engagement"

func update_ship(dt: float):
	if not is_instance_valid(ship):guardian.finish();ship_state="none";return
	var previous_state=ship_state
	ship_timer+=dt
	# Detached leapers keep their original enemy actor and trajectory if the carrier dies.
	boarding.update_leaps(dt)
	if ship_state=="approach":
		var progress=clampf(ship_timer/approach_duration,0,1)
		ship.position=approach_start.lerp(approach_end,progress)
		ship.position.x+=ship_side*sin(progress*PI)*5
		for i in crew.size():
			if is_instance_valid(crew[i]) and not crew[i].dead:crew[i].position=boarding.start_position(i)
		if progress>=1 and ship.position.distance_to(approach_end)<.05:
			ship_state="attack" if ship_kind=="gunboat" else "grapple_launch"
			ship_timer=0
			if ship_state=="grapple_launch":
				hook=MMFHitZone.new();hook.health_reader=func():return hook_health
				hook.label=game.hint("Hold {key:use} to cut grapple")
				hook.setup(self,ship.position+Vector3.UP*2,Vector3(.55,.55,.55),func(amount,point):
					hook_health=maxf(0,hook_health-maxf(0,amount))
					if hook_health<=0:cut_hook(point))
				boarding.attach_hook(hook)
				game.audio.play_at("servo-load",ship.position,.18)
	elif ship_state=="grapple_launch":
		var launch_t=clampf(ship_timer/1.1,0,1)
		hook.position=(ship.position+Vector3.UP*2).lerp(Vector3(ship_side*11.6,16.25,0),launch_t)+Vector3.UP*sin(launch_t*PI)*2
		boarding.update_lines()
		if launch_t>=1:
			ship_state="grapple";ship_timer=0
			boarding.prepare_routes()
			game.audio.play_at("hook-catch",hook.global_position,.3)
	elif ship_state=="grapple":
		for i in crew.size():
			var enemy=crew[i]
			if not is_instance_valid(enemy) or enemy.dead or not enemy.inactive or boarding.leap_detached(enemy):continue
			var delay=(1.5 if tutorial_ship else 2.0)+i*1.75
			if enemy.kind=="revenant" and not tutorial_ship:
				if ship_timer>=delay:boarding.prepare_leap(enemy,i,dt)
			else:
				var t=clampf((ship_timer-delay)/3.5,0,1)
				var can_board=boarding.pose(enemy,i,t)
				if t>=1 and can_board:
					enemy.inactive=false;enemy.boarding_recovery=.6
					if i==0 and not tutorial_ship:mission.assign(enemy,raid_wave+1)
		boarding.update_lines()
		if ship_timer>13 and not mission.extraction_active() and not boarding.has_preparing_leap():retreat_ship(false)
	elif ship_state=="retreat":
		ship.position+=Vector3(ship_side*3,-.4,18)*dt
		for i in crew.size():
			if is_instance_valid(crew[i]) and crew[i].inactive and not crew[i].dead and not boarding.leap_detached(crew[i]):crew[i].position=boarding.start_position(i)
		if ship_timer>6 and not boarding.has_detached_leaps():finish_ship()
	elif ship_state=="destroying":
		craft.update_destruction(dt,ship_timer)
		if ship_timer>=4.5 and not boarding.has_detached_leaps():finish_ship()
	if not is_instance_valid(ship):return
	craft.update(dt)
	if is_instance_valid(ship_marker):
		ship_marker.text="%s / %dm" % [MMFCordonGuardian.TITLE if guardian.enabled else "ORDER "+ship_kind.to_upper(),roundi(ship.position.distance_to(game.player.position))]
		ship_marker.hide()
	if tracking_disrupted and ship_state in ["approach","attack"]:
		escape_time+=dt
		if escape_time>=3:retreat_ship(false)
	if ship_kind=="gunboat" and ship_state=="attack" and weapon_health<=0:
		disabled_time+=dt
		if disabled_time>=(5 if engine_health<=0 else 3):retreat_ship(false)
	guardian.update(dt)
	if ship_state in ["attack","grapple"] and weapon_health>0 and not guardian.enabled:
		volley_timer-=dt if ship_state==previous_state else 0.0
		if ship_kind=="gunboat" and volley_timer<1.2:game.effects.tracer(craft.shot_origin(),game.player.position+Vector3.UP,Color(.8,.35,.08))
		if volley_timer<=0:
			volley_timer=4 if ship_kind=="gunboat" else 3.5
			craft.fire()
			var shot_count=2 if ship_kind=="gunboat" or tutorial_ship else 3
			var aim=MMFEnemyBallistics.ground_point(craft.shot_origin(),game.player.position,aim_rng)
			for i in shot_count:
				queue_shell(aim+Vector3((i-1)*.7,0,0),(.9 if ship_kind=="gunboat" else .8)+i*.14,10 if ship_kind=="gunboat" else 8 if tutorial_ship else 12)

func queue_shell(target: Vector3,delay: float,damage: float,guardian_mark: bool=false):
	var origin=craft.shot_origin()
	var support=game.raycast(target+Vector3.UP*1.5,target-Vector3.UP*30,[],1)
	if support.is_empty():return
	var aim: Vector3=support.position
	var hit=MMFEnemyBallistics.trace(game,origin,aim,[],1)
	var impact: Vector3=hit.position if not hit.is_empty() else aim
	var normal: Vector3=hit.normal if not hit.is_empty() else Vector3.UP
	var marker=guardian.presentation.warning(impact) if guardian_mark else game.effects.warning_ring(impact)
	# A low wall may intercept a shell before its ground aim. Seat the existing
	# warning on that real face instead of floating a horizontal ring through it.
	if normal.length_squared()>.5:
		marker.position=impact+normal*.05
		marker.quaternion=Quaternion(Vector3.UP,normal)
	shells.append({"origin":origin,"aim":aim,"target":impact,"normal":normal,"time":delay,"damage":damage,"marker":marker})

func resolve_shell(shell: Dictionary):
	# Recheck the committed path: a newly built wall also stops an incoming shot.
	# Old fixture shells without an origin still obey the same blast cover check.
	var impact: Vector3=shell.get("aim",shell.target)
	var normal: Vector3=Vector3.UP if shell.has("aim") else shell.get("normal",Vector3.UP)
	if shell.has("origin"):
		var hit=MMFEnemyBallistics.trace(game,shell.origin,shell.aim,[],1)
		if not hit.is_empty():impact=hit.position;normal=hit.normal
	game.effects.explosion(impact,.45)
	var outside=impact+normal*.035
	if game.player.position.distance_to(impact)<2.0 and MMFEnemyBallistics.blast_clear(game,outside,game.player.position+Vector3.UP*.96):
		game.player.take_damage(shell.damage,impact)
	# Damage can remove a structure, so iterate a stable snapshot.
	for p in game.session.structures.duplicate():
		var center=game.building.center(p.cell)
		if center.distance_to(impact)<2.0 and MMFEnemyBallistics.blast_clear(game,outside,center+Vector3.UP*.3,p.instanceId):
			game.building.damage(p.instanceId,shell.damage,impact)

func cut_hook(point: Vector3):
	if ship_state not in ["grapple_launch","grapple"]:return
	game.effects.impact(point,Vector3.UP);hook_health=0
	for enemy in crew:
		if is_instance_valid(enemy) and enemy.inactive and not boarding.leap_detached(enemy):enemy.take_damage(10000,enemy.position)
	retreat_ship(false)
	game.session.notify("Grapple severed — carrier breaking contact. Detached boarders remain." if boarding.has_detached_leaps() else "Grapple severed — carrier breaking contact.")

func clear_hooks():
	boarding.clear()
	if is_instance_valid(hook):hook.collision_layer=0;hook.queue_free()
	hook=null;hook_health=0

func issue_ship_rewards(destroyed: bool):
	if rewards_issued:return
	rewards_issued=true
	# An escaped patrol leaves no cargo. Defeated ships have one bounded recovery.
	if not destroyed:return
	for spec in [["scrap",45 if ship_kind=="gunboat" else 30],["components",3 if ship_kind=="gunboat" else 2]]:
		var left=game.session.add_resource(spec[0],spec[1])
		if left>0:drop_loot(Vector3(ship_side*10,16.1,0),spec[0],left)

func destroy_ship(point: Vector3):
	if ship_state in ["none","destroying"]:return
	ship_health=0;ship_state="destroying";ship_timer=0;weapon_health=0;engine_health=0
	game.effects.explosion(point,2);game.audio.cue(45,.65,-15,true)
	mission.cancel()
	for enemy in crew:
		if is_instance_valid(enemy) and enemy.inactive and not boarding.leap_detached(enemy):enemy.take_damage(10000,enemy.position)
	clear_hooks();issue_ship_rewards(true)
	for zone in ship_targets:
		if is_instance_valid(zone):zone.collision_layer=0
	# Shell warnings owned by this carrier cease with its fire-control system.
	for shell in shells:
		if is_instance_valid(shell.marker):shell.marker.queue_free()
	shells.clear();craft.begin_destruction();encounter_had_enemies=true
	game.session.notify("Carrier destroyed. Surviving boarders still need dealing with." if boarding.has_detached_leaps() or crew.any(func(e):return is_instance_valid(e) and not e.dead and not e.inactive) else "Carrier destroyed before the crew could board.")

func retreat_ship(destroyed: bool):
	if destroyed:destroy_ship(ship.position);return
	if ship_state in ["none","retreat","destroying"]:return
	ship_state="retreat";ship_timer=0;mission.cancel();clear_hooks();craft.refresh_state()
	# Retreat stops attacks and new boarding, but the visible hull remains a real
	# projectile target until it leaves. A final shot can still destroy the craft.
	encounter_had_enemies=true

func finish_ship():
	guardian.finish()
	for enemy in crew:
		if is_instance_valid(enemy) and enemy.inactive and not enemy.dead and not boarding.leap_detached(enemy):enemy.queue_free()
	clear_hooks();boarding.reset_leaps()
	if is_instance_valid(ship):ship.queue_free()
	ship=null;ship_state="none";ship_targets.clear();crew.clear();craft.clear_debris()
	scout.complete_escape_if_clear()

func reset_encounter():
	guardian.reset()
	scout.reset();boarding.reset_leaps();clear_hooks();craft.clear_debris()
	tracking_disrupted=false;escape_time=0;ship_targets.clear()

func drop_loot(at: Vector3,id: String,count: int):
	id=MMFNativeProgression.RETIRED_ITEMS.get(id,id)
	if count<=0 or not game.data.ITEMS.has(id):return
	var node=Node3D.new();node.name="Recovered_"+id;add_child(node);node.position=at+Vector3.UP*.2
	var item={"node":node,"id":id,"count":count}
	loot_view.place(item);loot.append(item)

func killed(enemy): mission.recover(enemy)

func layout_changed():
	loot_view.invalidate()
	nav_dirty=true;nav_delay=0.3
	var bounds=AABB(Vector3(-20,7,-20),Vector3(40,20,40))
	for p in game.session.structures:
		var at=game.building.center(p.cell)
		bounds=bounds.expand(at+Vector3(2,5,2)).expand(at-Vector3(2,1,2))
	nav.navigation_mesh.filter_baking_aabb=bounds

func update_turrets(dt: float):
	var def=game.data.TURRETS["automatic-turret"]
	var candidates=enemies.duplicate()
	if ship_state not in ["none","destroying","retreat"]:candidates.append_array(ship_targets)
	if is_instance_valid(scout.target):candidates.append(scout.target)
	for p in game.session.structures:
		if p.definitionId!="turret-auto" or p.health<=0 or not game.session.powered.get(p.instanceId,false):continue
		var at=game.building.center(p.cell)+Vector3.UP*1.4
		var body=game.building.bodies.get(p.instanceId)
		var exclusions=[]
		if body:
			for collider in MMFAssets.of_type(body,"StaticBody3D"):exclusions.append(collider.get_rid())
		if not turret_aim.has(p.instanceId):turret_aim[p.instanceId]={"yaw":0.0,"pitch":0.0,"lock":0.0,"target":0,"clock":0.0}
		var aim=turret_aim[p.instanceId];aim.clock=maxf(0,aim.clock-dt)
		var selected=null;var selected_at=Vector3.ZERO;var best=INF
		var base=-int(p.rotation)*PI/2
		for candidate in candidates:
			if not is_instance_valid(candidate) or candidate.collision_layer==0:continue
			if candidate is MMFEnemy and candidate.dead:continue
			if candidate is MMFHitZone and candidate.health_reader.is_valid() and float(candidate.health_reader.call())<=0:continue
			var target=candidate.global_position+(Vector3.UP if candidate is MMFEnemy else Vector3.ZERO)
			var delta=target-at;var distance=delta.length()
			if distance>def.range:continue
			var pitch=atan2(delta.y,Vector2(delta.x,delta.z).length())
			var yaw=wrapf(atan2(-delta.x,-delta.z)-base,-PI,PI)
			if pitch<def.traverse.pitchMin or pitch>def.traverse.pitchMax or yaw<def.traverse.yawMin or yaw>def.traverse.yawMax:continue
			var hit=game.raycast(at,target,exclusions,5)
			if not hit.is_empty() and hit.collider!=candidate:continue
			var score=distance+(8 if candidate is MMFEnemy and candidate.inactive else 0)
			if score>=best:continue
			best=score;selected=candidate;selected_at=target
		if selected==null:aim.lock=0;aim.target=0;continue
		if aim.target!=selected.get_instance_id():aim.lock=0;aim.target=selected.get_instance_id()
		var delta=selected_at-at
		var target_yaw=wrapf(atan2(-delta.x,-delta.z)-base,-PI,PI)
		var target_pitch=atan2(delta.y,Vector2(delta.x,delta.z).length())
		aim.yaw+=clampf(wrapf(target_yaw-aim.yaw,-PI,PI),-def.yawSpeed*dt,def.yawSpeed*dt)
		aim.pitch=move_toward(aim.pitch,target_pitch,def.pitchSpeed*dt)
		if body:
			var yaw_node=MMFAssets.find_named(body,"TurretYaw");var pitch_node=MMFAssets.find_named(body,"TurretPitch")
			if yaw_node:yaw_node.rotation.y=aim.yaw
			if pitch_node:pitch_node.rotation.x=aim.pitch
		var aligned=absf(wrapf(target_yaw-aim.yaw,-PI,PI))<def.aimTolerance and absf(target_pitch-aim.pitch)<def.aimTolerance
		aim.lock=aim.lock+dt if aligned else 0.0
		if aim.lock>=def.lockDelay and aim.clock<=0:
			var mods=game.session.modifiers()
			var hit=game.raycast(at,selected_at+(selected_at-at).normalized()*.15,exclusions,5)
			if not hit.is_empty():
				var impact=MMFOwnedShot.resolve(hit,def.damage*mods.turretDamageMultiplier)
				MMFCombatFeedback.present(game,impact)
				game.effects.tracer(at,hit.position,Color(.2,.8,1))
			aim.clock=1.0/(def.fireRate*mods.turretRateMultiplier)
