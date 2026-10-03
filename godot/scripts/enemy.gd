class_name MMFEnemy
extends CharacterBody3D

const TACTICAL_RING=preload("res://art/enemy-warning-ring.res")
const WARNING_READY=preload("res://art/enemy-warning-ready.tres")
const WARNING_DANGER=preload("res://art/enemy-warning-danger.tres")
const WARNING_VULNERABLE=preload("res://art/enemy-warning-vulnerable.tres")

var game
var kind = "warden"
var definition: Dictionary
var health = 100.0
var visual: Node3D
var animator: AnimationPlayer
var presentation=MMFEnemyAnimation.new()
var equipment=MMFEnemyEquipment.new()
var tells=MMFEnemyTells.new()
var agent: NavigationAgent3D
var cooldown = 1.0
var windup = 0.0
var committed = Vector3.ZERO
var phase = "idle"
var timer = 0.0
var lunge_direction = Vector3.ZERO
var drone_health = 35.0
var drone: MMFHitZone
var drone_visual: Node3D
var dead = false
var inactive = false
var hp_label: Label3D
var animation = ""
var shots_left = 0
var flash_left = 0.0
var mission = "assault"
var mission_subsystem="engine"
var mission_point=Vector3.ZERO
var stolen = {}
var next_path = 0.0
var meshes: Array = []
var tactical_marker: MeshInstance3D
var blocked_los=0.0
var flank_left=0.0
var flank_point=Vector3.ZERO
var cue_phase=""
var step_clock=0.0
var boarding_pose: MMFBoardingPose
var boarding_fall=false
var boarding_recovery=0.0
var aim_rng: MMFRandom

func find_flank(player_target: Vector3):
	var nearest=INF
	for x in range(-4,5):
		for z in range(-4,5):
			var candidate=position+Vector3(x*2,0,z*2)
			var distance=position.distance_to(candidate)
			if distance<1 or distance>8 or distance>=nearest: continue
			var floor_hit=game.raycast(candidate+Vector3.UP*0.5,candidate-Vector3.UP*0.6,[get_rid()],1)
			if floor_hit.is_empty(): continue
			candidate.y=floor_hit.position.y+0.02
			if not game.raycast(candidate+Vector3.UP*1.4,player_target+Vector3.UP,[get_rid()],1).is_empty(): continue
			if game.raycast(position+Vector3.UP,candidate+Vector3.UP,[get_rid()],1).is_empty(): continue
			var path=NavigationServer3D.map_get_path(get_world_3d().navigation_map,position,candidate,true)
			if path.is_empty() or path[-1].distance_to(candidate)>0.8: continue
			nearest=distance;flank_point=candidate;flank_left=1.5
	blocked_los=0.0

func setup(owner_game,id: String):
	game = owner_game
	kind = id
	definition = game.data.ENEMIES[id]
	aim_rng=MMFEnemyBallistics.rng_for([game.session.seed_name,"enemy",id])
	if definition.targetPriority=="engine":
		mission="sabotage";mission_subsystem="engine";mission_point=MMFAssets.v(game.data.SUBSYSTEMS.engine.repairAt)
	health = definition.maxHealth
	collision_layer = 4
	set_meta("hostile_target",true)
	collision_mask = 1
	floor_snap_length = 0.4
	floor_max_angle = deg_to_rad(50)
	safe_margin = 0.02
	var shape=CapsuleShape3D.new()
	shape.radius=definition.get("capsuleRadius",0.36)
	shape.height=1.92
	var collision=CollisionShape3D.new()
	collision.shape=shape
	collision.position.y=0.96
	add_child(collision)
	visual=MMFAssets.scene(MMFEnemyModels.path(id))
	var bounds=MMFAssets.bounds(visual)
	var fit=1.92/maxf(0.01,float(visual.get_meta("original_fit_height",bounds.size.y)))
	visual.scale*=fit
	visual.position.y=-bounds.position.y*fit
	add_child(visual)
	meshes=MMFAssets.of_type(visual,"MeshInstance3D")
	var players=MMFAssets.of_type(visual,"AnimationPlayer")
	if not players.is_empty():
		animator=players[0]
	presentation.setup(animator,visual)
	play("idle")
	presentation.ground_idle(visual,kind)
	agent=NavigationAgent3D.new()
	agent.path_desired_distance=0.08
	agent.target_desired_distance=1.0
	agent.radius=shape.radius
	add_child(agent)
	hp_label=Label3D.new()
	hp_label.position.y=2.2
	hp_label.font_size=32
	hp_label.pixel_size=0.008
	hp_label.modulate=Color(1,0.25,0.1)
	hp_label.billboard=BaseMaterial3D.BILLBOARD_ENABLED
	add_child(hp_label)
	equipment.setup(self)
	MMFArt100RobotDetails.apply(self)
	tactical_marker=MeshInstance3D.new()
	tactical_marker.mesh=TACTICAL_RING
	tactical_marker.material_override=WARNING_READY
	tactical_marker.position.y=0.025
	tactical_marker.visible=false
	add_child(tactical_marker)
	tells.setup(self)

func play(wanted: String,force: bool=false):
	animation=presentation.play(wanted,force)

func _physics_process(dt):
	if not game or game.cinematic!="": return
	if inactive and not dead:return
	if boarding_recovery>0 and not dead:
		boarding_recovery=maxf(0,boarding_recovery-dt)
		velocity=Vector3(0,-.1,0);move_and_slide();return
	presentation.tick(dt)
	timer+=dt
	if dead:
		if boarding_fall:
			if not is_on_floor():velocity.y-=22*dt
			else:velocity.y=0
			move_and_slide()
		if timer>5: queue_free()
		return
	flash_left=maxf(0,flash_left-dt)
	var target=game.player.global_position
	if mission=="sabotage" and game.session.subsystems.get(mission_subsystem,0)<=0: mission="assault"
	if mission in ["sabotage","travel"]: target=mission_point
	flank_left=maxf(0,flank_left-dt)
	if kind=="warden" and mission=="assault" and position.distance_to(target)<=definition.detectRange:
		if game.raycast(position+Vector3.UP*1.4,target+Vector3.UP,[get_rid()],1).is_empty(): blocked_los=0
		else: blocked_los+=dt
		if blocked_los>=1.25 and flank_left<=0: find_flank(target)
		if flank_left>0 and position.distance_to(flank_point)<0.7: flank_left=0
		if flank_left>0: target=flank_point
	var delta=target-position
	var range=Vector2(delta.x,delta.z).length()
	var same_level=absf(delta.y)<1.8
	cooldown=maxf(0,cooldown-dt)
	var movement=Vector3.ZERO
	var walking=false
	var can_attack=range<=definition.attackRange and same_level and mission!="travel" and flank_left<=0
	if mission=="sabotage": can_attack=range<=2.5 and same_level
	if kind=="revenant" and mission=="assault":
		if phase=="telegraph" and timer>=0.55:
			phase="lunge"
			timer=0
			play("polish_attack",true)
		if phase=="lunge":
			movement=lunge_direction*(4.5/0.38)
			if timer>=0.38:
				if range<definition.attackRange+0.5 and same_level and lunge_direction.dot(Vector3(delta.x,0,delta.z).normalized())>=0.35: hit_target(definition.damage)
				phase="recovery"
				timer=0
		elif phase=="recovery" and timer>=0.75:
			phase="idle"
		if phase=="idle" and range<6 and same_level and cooldown<=0:
			phase="telegraph"
			timer=0
			lunge_direction=Vector3(delta.x,0,delta.z).normalized()
			cooldown=definition.attackCooldown
		tactical_marker.visible=phase in ["telegraph","lunge"]
	if mission=="sabotage" and can_attack and cooldown<=0:
		hit_target(definition.damage);cooldown=definition.attackCooldown;play("polish_attack",true)
	if mission=="assault" and definition.has("ranged") and (can_attack or windup>0 or shots_left>0):
		if windup>0:
			windup-=dt
			if windup<=0:
				shots_left=int(definition.ranged.shots)
				cooldown=0
		elif shots_left>0 and cooldown<=0:
			shoot_committed()
			shots_left-=1
			cooldown=definition.ranged.shotInterval if shots_left>0 else definition.attackCooldown
			if shots_left==0 and kind=="bastion":
				phase="vent"
				timer=0
		elif cooldown<=0:
			var hit=MMFEnemyBallistics.trace(game,position+Vector3.UP*1.4,target+Vector3.UP*1.0,[get_rid()],1)
			if hit.is_empty():
				committed=target+Vector3.UP
				windup=definition.ranged.windup
				play("idle")
			else: can_attack=false
		if kind=="bastion" and phase=="vent" and timer>1.8: phase="idle"
		tactical_marker.visible=windup>0 or phase=="vent"
	elif mission=="assault" and not definition.has("ranged") and kind!="revenant" and can_attack and cooldown<=0:
		hit_target(definition.damage)
		play("attack",true)
		cooldown=definition.attackCooldown
	if not can_attack and phase not in ["telegraph","lunge","recovery"] and windup<=0:
		next_path-=dt
		if next_path<=0:
			agent.target_position=target
			next_path=0.35
		var waypoint=target
		if NavigationServer3D.map_get_iteration_id(get_world_3d().navigation_map)>0: waypoint=agent.get_next_path_position()
		elif absf(delta.y)>2:
			waypoint=Vector3(-12,position.y,-3 if delta.y>0 else 3)
			if position.distance_to(waypoint)<1.0: waypoint=Vector3(-12,target.y,3 if delta.y>0 else -3)
		movement=(waypoint-position)*Vector3(1,0,1)
		movement=movement.limit_length(definition.moveSpeed*dt)/maxf(dt,0.000001)
		# Separation keeps melee groups from collapsing into a single capsule.
		for other in game.combat.enemies:
			if not is_instance_valid(other) or other==self or other.dead: continue
			var away=position-other.position
			away.y=0
			if away.length_squared()<0.7 and away.length_squared()>0.001: movement+=away.normalized()*1.2
		walking=true
	elif windup<=0 and phase=="idle" and cooldown<definition.attackCooldown-0.6: play("idle")
	velocity.x=movement.x
	velocity.z=movement.z
	if not is_on_floor(): velocity.y-=22*dt
	else: velocity.y=-0.1
	if is_on_floor() and movement.length()>0.1 and test_move(global_transform,movement*dt):
		var raised=global_transform
		raised.origin.y+=0.44
		if not test_move(raised,movement*dt):
			var floor_hit=game.raycast(raised.origin+movement*dt,raised.origin+movement*dt-Vector3.UP*0.52,[get_rid()])
			if not floor_hit.is_empty() and floor_hit.normal.y>0.65: position.y=floor_hit.position.y+0.025
	var before_slide=position
	MMFDeckMotion.slide(self,dt)
	var travelled=(position-before_slide)*Vector3(1,0,1)
	var actual_speed=travelled.length()/maxf(dt,.000001)
	if walking:animation=presentation.motion(actual_speed,definition.moveSpeed)
	step_clock-=dt
	if actual_speed>1 and is_on_floor() and step_clock<=0:
		step_clock=.5 if kind=="bastion" else .38
		game.audio.play_at("footfall",global_position,.28 if kind=="bastion" else .14)
	tells.update(dt)
	var facing=travelled if walking and actual_speed>.08 and presentation.action_left<=0 else delta
	if facing.length_squared()>0.000001: visual.rotation.y=lerp_angle(visual.rotation.y,atan2(facing.x,facing.z),1-exp(-8*dt))
	if position.y<0: take_damage(10000,position)

func hit_target(amount: float):
	if mission=="sabotage":
		game.session.subsystems[mission_subsystem]=maxf(0,game.session.subsystems[mission_subsystem]-maxf(1,amount-game.data.SUBSYSTEMS[mission_subsystem].armor))
		game.session.attack_recent=5
	else: game.player.take_damage(amount,position)

func shoot_committed():
	play("polish_attack",true)
	var start=equipment.shot_origin(self)
	var dir=MMFEnemyBallistics.direction(start,committed,aim_rng)
	# A barrel may poke through a thin wall. Its body-to-muzzle segment must
	# also be clear; then damage and presentation share the same physical ray.
	var hit=MMFEnemyBallistics.trace(game,global_position+Vector3.UP*1.4,start,[get_rid()],1)
	if hit.is_empty():hit=MMFEnemyBallistics.trace(game,start,start+dir*definition.attackRange*1.4,[get_rid()],3)
	var visible_origin=equipment.show_shot(self,hit,dir)
	if not hit.is_empty() and hit.collider==game.player: hit_target(definition.damage)
	elif not hit.is_empty() and hit.collider.has_method("take_damage"): hit.collider.take_damage(definition.damage,hit.position)
	game.audio.play_at("rifle",visible_origin,.15)

func take_weapon_damage(amount: float,point: Vector3,distance: float,range_m: float,falloff_start: float) -> float:
	return take_damage(MMFDamage.compute(amount,distance,range_m,falloff_start,definition.armor)+definition.armor,point)

func impact_profile(point: Vector3) -> Dictionary:
	return {"category":"enemy","armor":float(definition.armor),"exposed":kind=="bastion" and phase=="vent" and point.y>position.y+1.1,"health":health}

func take_damage(amount: float,point: Vector3) -> float:
	if dead: return 0.0
	var before=health
	var armor=float(definition.armor)
	amount=maxf(0,amount-armor)
	if kind=="bastion" and phase=="vent" and point.y>position.y+1.1: amount*=2
	for other in game.combat.enemies:
		if is_instance_valid(other) and other!=self and other.kind=="sovereign" and other.drone_health>0 and not other.dead and other.position.distance_to(position)<=7:
			amount*=0.8
			break
	health=maxf(0,health-amount)
	game.session.attack_recent=5
	flash_left=0.12
	if amount>0:
		play("polish_hit",true)
		if presentation.hit_pose:
			var local_hit=visual.to_local(point)
			presentation.hit_pose.direct(local_hit.x,kind=="bastion" and phase=="vent" and point.y>position.y+1.1)
	if health<=0:
		boarding_fall=inactive and boarding_pose!=null
		if boarding_pose:boarding_pose.finish()
		if boarding_fall:velocity=Vector3(game.combat.ship_side*1.5,-1,0)
		dead=true
		timer=0
		collision_layer=0
		hp_label.visible=false
		tactical_marker.visible=false
		tells.clear()
		equipment.disable_drone(self)
		play("polish_death",true)
		for drop in definition.drops:
			if game.session.rng.randf()<=drop.get("chance",1): game.combat.drop_loot(position,drop.id,game.session.rng.randi_range(int(drop.min),int(drop.max)))
		game.combat.killed(self)
	return maxf(0,before-health)
