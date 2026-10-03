class_name MMFPlayerLocomotion
extends RefCounted

signal foot_planted(side: String)

# Presentation follows displacement from the character controller. One shared
# phase drives all directions/gaits; no animation track moves the capsule.
const DIRECTIONS=["fwd","fwd_right","right","back_right","back","back_left","left","fwd_left"]
const GAITS=["walk","run","crouch_walk"]
var player
var tree: AnimationTree
var graph: AnimationNodeBlendTree
var nodes=[]
var profiles={}
var phase=0.0
var cycles_per_second=0.0
var speed=0.0
var run_weight=0.0
var crouch_weight=0.0
var move_weight=0.0
var blend_direction=0.0
var direction_indices=Vector2i(0,1)
var assigned_indices=Vector2i(-1,-1)
var cycle_distances=Vector3.ZERO
var duties=Vector3.ZERO
var direction_factors=[]
var direction_distance=1.0
var previous_phase=0.0
var phase_step=0.0
var motion_angle=0.0
var previous_angle=0.0
var previous_weights=Vector3.ZERO
var sampled_weights=Vector3.ZERO
var sampled_phase=0.0
var active=false

func setup(owner_player):
	player=owner_player
	if not player.animator:return
	player.animator.add_animation_library("locomotion",load("res://art/s07-locomotion.res"))
	for entry in MMFAssets.json("res://art/s07-locomotion.json"):profiles[entry.gait+"_"+entry.direction]=entry
	for i in GAITS.size():
		var entry=profiles[GAITS[i]+"_fwd"]
		duties[i]=entry.duty;cycle_distances[i]=entry.stride/entry.duty*player.visual.scale.x
	for direction in DIRECTIONS:direction_factors.append(profiles["walk_"+direction].stride/profiles.walk_fwd.stride)
	tree=AnimationTree.new();tree.name="GroundedLocomotion";player.visual.add_child(tree)
	tree.anim_player=tree.get_path_to(player.animator)
	tree.root_node=tree.get_path_to(player.animator.get_node(player.animator.root_node))
	tree.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	graph=AnimationNodeBlendTree.new()
	for gait in GAITS:
		var pair=[]
		for side in ["A","B"]:
			var clip=AnimationNodeAnimation.new();clip.animation="locomotion/"+gait+"_fwd"
			clip.use_custom_timeline=true;clip.timeline_length=1;clip.stretch_time_scale=true;clip.loop_mode=Animation.LOOP_LINEAR
			graph.add_node(gait+side,clip);pair.append(clip)
		nodes.append(pair)
		blend(gait,gait+"A",gait+"B")
	blend("Gait","walk","run");blend("Crouch","Gait","crouch_walk")
	var seek=AnimationNodeTimeSeek.new();graph.add_node("Phase",seek);graph.connect_node("Phase",0,"Crouch")
	for name in ["Idle","CrouchIdle"]:
		var clip=AnimationNodeAnimation.new();clip.animation="armed_idle" if name=="Idle" else "armed_crouch_idle"
		graph.add_node(name,clip)
	blend("Rest","Idle","CrouchIdle");blend("Movement","Rest","Phase")
	graph.connect_node("output",0,"Movement");tree.tree_root=graph;tree.active=false

func blend(name: String,a: String,b: String):
	# Phase seeks synchronize newly active clips, so zero-weight branches can
	# sleep instead of evaluating all eight skeletal animations every tick.
	var node=AnimationNodeBlend2.new()
	graph.add_node(name,node);graph.connect_node(name,0,a);graph.connect_node(name,1,b)

func release():
	if not active:return
	active=false;tree.active=false;player.animator.active=true
	move_weight=0;cycles_per_second=0;speed=0
	reset_interpolation()

func reset_interpolation():
	previous_phase=phase;phase_step=0;previous_angle=motion_angle
	previous_weights=Vector3(run_weight,crouch_weight,move_weight)

func direction_parameters(angle: float) -> Vector4:
	var sector=fposmod(angle,TAU)/(TAU/8)
	var a=int(floor(sector))%8;var b=(a+1)%8
	var theta=(sector-a)*TAU/8
	var ca=sin(TAU/8-theta)/float(direction_factors[a])
	var cb=sin(theta)/float(direction_factors[b])
	var amount=cb/maxf(.0001,ca+cb)
	var va=Vector2(sin(a*TAU/8),cos(a*TAU/8))*float(direction_factors[a])
	var vb=Vector2(sin(b*TAU/8),cos(b*TAU/8))*float(direction_factors[b])
	return Vector4(a,b,amount,va.lerp(vb,amount).length())

func update(dt: float,world_motion: Vector3):
	if not tree:return
	if not active:
		player.animator.pause();player.animator.active=false;tree.active=true;active=true
	previous_phase=phase;previous_angle=motion_angle
	previous_weights=Vector3(run_weight,crouch_weight,move_weight)
	var local=player.visual.global_basis.orthonormalized().inverse()*world_motion
	speed=Vector2(local.x,local.z).length()
	if speed>.04:
		# The imported rig faces +Z; its own right is -X.
		motion_angle=atan2(-local.x,local.z)
		direction_distance=direction_parameters(motion_angle).w
	# At 4.5 m/s the normal controller speed is a jog, not a slow walk. Lower
	# analogue/obstructed speeds retain walking; sprint uses the same running gait.
	run_weight=move_toward(run_weight,smoothstep(2.5,4.0,speed),dt*8)
	crouch_weight=move_toward(crouch_weight,1.0 if player.crouched else 0.0,dt*8)
	move_weight=move_toward(move_weight,1.0 if speed>.04 else 0.0,dt*10)
	var per_cycle=direction_distance*lerpf(lerpf(cycle_distances.x,cycle_distances.y,run_weight),cycle_distances.z,crouch_weight)
	cycles_per_second=speed/maxf(.01,per_cycle) if speed>.04 else 0.0
	phase_step=cycles_per_second*dt;phase=fposmod(phase+phase_step,1)
	player.animation="grounded_locomotion" if move_weight>0 else ("armed_crouch_idle" if player.crouched else "armed_idle")
	player.animation_speed=cycles_per_second
	# The authored right/left contacts begin at phase 0 / .5. Drive sound from
	# this same displacement-derived phase, including strafing and crouching.
	# A discontinuous diagnostic/relocation step must not create a sound burst.
	if phase_step>0 and phase_step<=.5:
		var contact=int(floor((previous_phase+phase_step)*2))
		if contact>int(floor(previous_phase*2)): foot_planted.emit("r" if contact%2==0 else "l")

func render(fraction: float,dt: float=0.0):
	if not active:return
	# Skeleton bones are sampled at render rate, following the same interpolation
	# interval as the capsule. Advancing only at 60 Hz visibly steps at 120/144 Hz.
	var weights=previous_weights.lerp(Vector3(run_weight,crouch_weight,move_weight),fraction)
	var direction=direction_parameters(lerp_angle(previous_angle,motion_angle,fraction))
	direction_indices=Vector2i(int(direction.x),int(direction.y));blend_direction=direction.z
	for i in GAITS.size():
		if assigned_indices!=direction_indices:
			nodes[i][0].animation="locomotion/"+GAITS[i]+"_"+DIRECTIONS[direction_indices.x]
			nodes[i][1].animation="locomotion/"+GAITS[i]+"_"+DIRECTIONS[direction_indices.y]
		tree.set("parameters/"+GAITS[i]+"/blend_amount",blend_direction)
	assigned_indices=direction_indices
	sampled_phase=fposmod(previous_phase+phase_step*fraction,1);sampled_weights=weights
	tree.set("parameters/Gait/blend_amount",weights.x);tree.set("parameters/Crouch/blend_amount",weights.y)
	tree.set("parameters/Rest/blend_amount",weights.y);tree.set("parameters/Movement/blend_amount",weights.z)
	tree.set("parameters/Phase/seek_request",sampled_phase);tree.advance(dt)

func contact_weight(side: String) -> float:
	if not active or move_weight<=0:return 1.0
	var foot_phase=fposmod(sampled_phase+(.5 if side=="l" else 0.0),1)
	var weights=Vector3.ZERO
	for i in 3:weights[i]=1-smoothstep(duties[i]-.035,duties[i]+.035,foot_phase)+smoothstep(.96,1,foot_phase)
	return lerpf(1.0,lerpf(lerpf(weights.x,weights.y,sampled_weights.x),weights.z,sampled_weights.y),sampled_weights.z)
