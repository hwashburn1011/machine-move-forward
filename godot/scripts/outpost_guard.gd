class_name MMFOutpostGuard
extends StaticBody3D

# A stationed Warden reuses the authored rig and hit feedback without joining
# the raid director. Its real capsule remains shootable through clear sightlines.
const MAX_HEALTH=60.0
const RANGE=70.0
const WINDUP=1.05
var game
var controller
var state: Dictionary
var index=0
var kind="warden"
var health=MAX_HEALTH
var dead=false
var visual: Node3D
var animator: AnimationPlayer
var meshes=[]
var presentation=MMFEnemyAnimation.new()
var equipment=MMFEnemyEquipment.new()
var phase="idle"
var committed=Vector3.ZERO
var cooldown=3.5
var windup=0.0
var shots_fired=0
var last_ray={}
var death_elapsed=0.0
var death_start_position=Vector3.ZERO
var death_start_yaw=0.0

func setup(owner_game,owner_controller,receipt: Dictionary,guard_index: int):
	game=owner_game;controller=owner_controller;state=receipt;index=guard_index
	name="StationedWarden%d"%index;collision_layer=4;collision_mask=0;set_meta("hostile_target",true)
	health=float(state.health[index]);cooldown=3.5+index*1.6
	var capsule=CapsuleShape3D.new();capsule.radius=.36;capsule.height=1.92
	var col=CollisionShape3D.new();col.shape=capsule;col.position.y=.96;add_child(col)
	visual=MMFAssets.scene(MMFEnemyModels.path(kind));add_child(visual)
	var bounds=MMFAssets.bounds(visual);var fit=1.92/maxf(.01,visual.get_meta("original_fit_height",bounds.size.y))
	visual.scale*=fit;visual.position.y=-bounds.position.y*fit
	var animations=MMFAssets.of_type(visual,"AnimationPlayer")
	if not animations.is_empty():animator=animations[0]
	presentation.setup(animator,visual);presentation.play("idle");presentation.ground_idle(visual,kind)
	equipment.setup(self);MMFArt100RobotDetails.apply(self)
	if health<=0:fall(true)

func update(dt: float,permitted: bool):
	presentation.tick(dt)
	if dead:
		death_elapsed+=dt;seat_death_pose();return
	if presentation.action_left<=0:presentation.play("idle")
	if not permitted:
		windup=0;cooldown=maxf(cooldown,2.0);phase="idle";return
	var target=game.player.global_position+Vector3.UP
	var delta=target-global_position
	var local_direction=get_parent().global_basis.inverse()*delta
	visual.rotation.y=lerp_angle(visual.rotation.y,atan2(local_direction.x,local_direction.z),1-exp(-5*dt))
	cooldown=maxf(0,cooldown-dt)
	if windup>0:
		windup=maxf(0,windup-dt)
		if windup<=0:shoot_committed();cooldown=4.6+index*.55;phase="idle"
		return
	if cooldown>0 or delta.length()>RANGE or not game.aboard():return
	var origin=equipment.shot_origin(self)
	# A target can leave cover during a windup; actual damage still uses only
	# the frozen committed position plus the visible, physical spread ray.
	if not MMFEnemyBallistics.trace(game,origin,target,[get_rid()],1).is_empty():return
	committed=target;windup=WINDUP;phase="lock"
	game.audio.play_at("servo-load",origin,.10,.86)

func shoot_committed():
	if dead:return
	presentation.play("polish_attack",true)
	var origin=equipment.shot_origin(self)
	var rng=MMFEnemyBallistics.rng_for([game.session.seed_name,"roadside-guard-v1",int(state.slot),index,int(state.shots[index])])
	state.shots[index]=mini(1000000,int(state.shots[index])+1)
	var direction=MMFEnemyBallistics.direction(origin,committed,rng)
	var endpoint=origin+direction*RANGE
	# The visible barrel cannot protrude through nearby parapets and fire from
	# their far side. This safety segment and the shot retain world collision.
	var chest=global_position+Vector3.UP*1.35
	var hit=MMFEnemyBallistics.trace(game,chest,origin,[get_rid()],1)
	if hit.is_empty():hit=MMFEnemyBallistics.trace(game,origin,endpoint,[get_rid()],3)
	last_ray={"origin":origin,"end":endpoint if hit.is_empty() else hit.position,"hit":hit}
	if (last_ray.end-origin).dot(direction)>.001:game.effects.tracer(origin,last_ray.end,Color(.88,.33,.16))
	if not hit.is_empty():
		if hit.collider==game.player:game.player.take_damage(5,global_position)
		elif hit.collider.has_method("take_damage"):hit.collider.take_damage(5,hit.position)
		game.effects.impact(hit.position,hit.get("normal",Vector3.UP))
	game.audio.play_at("rifle",origin,.15,.94);shots_fired+=1

func impact_profile(_point: Vector3) -> Dictionary:return {"category":"enemy","armor":1.0,"health":health,"exposed":false}

func take_weapon_damage(amount: float,point: Vector3,distance: float,range_m: float,falloff_start: float) -> float:
	return take_damage(MMFDamage.compute(amount,distance,range_m,falloff_start,1)+1,point)

func take_damage(amount: float,point: Vector3) -> float:
	if dead:return 0.0
	var before=health;health=maxf(0,health-maxf(0,amount-1));state.health[index]=health
	if health<before:
		presentation.play("polish_hit",true)
		if presentation.hit_pose:presentation.hit_pose.direct(visual.to_local(point).x,false)
	if health<=0:fall(false)
	return before-health

func fall(restored: bool):
	dead=true;collision_layer=0;windup=0;phase="dead"
	death_start_position=visual.position;death_start_yaw=visual.rotation.y
	presentation.play("polish_death",true)
	if restored and animator:
		animator.advance(0)
		var clip=animator.get_animation(presentation.current)
		if clip:animator.seek(clip.length,true);animator.pause()
	seat_death_pose()

func seat_death_pose():
	if not animator:return
	var clip=animator.get_animation(presentation.current)
	if not clip:return
	var settle=smoothstep(0,.9,animator.current_animation_position/maxf(.01,clip.length))
	# The retained Warden fall extends 1.697 m along local +X. Fold each
	# defeated guard into a separate interior bay, never through the side rail.
	# Its evaluated final low point is -0.11925 m relative to standing boots.
	var shift=-.75 if int(state.variant)==0 else (-.70 if index==0 else -.60)
	visual.position=death_start_position+Vector3(shift,.122,0)*settle
	visual.rotation.y=lerp_angle(death_start_yaw,0,settle)
