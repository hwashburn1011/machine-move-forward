class_name MMFBoardingPose
extends SkeletonModifier3D

var enemy
var progress=0.0
var limbs=[]
var arms=[]
var pelvis=-1
var gear_bones=[]
var gear: Node3D
var mount: BoneAttachment3D
var eye: Node3D
var grip_errors=[]

func setup(owner_enemy,model: Node3D):
	enemy=owner_enemy;gear=model
	var skeleton=get_skeleton();var modern=skeleton.find_bone("pelvis")>=0
	pelvis=skeleton.find_bone("pelvis" if modern else "Hips")
	for sign in [-1,1]:
		var suffix=("r" if sign<0 else "l") if modern else ("L" if sign<0 else "R")
		var hand=["upperarm_"+suffix,"lowerarm_"+suffix,"hand_"+suffix] if modern else ["UpperArm."+suffix,"Forearm."+suffix,"Hand."+suffix]
		var leg=["thigh_"+suffix,"calf_"+suffix,"foot_"+suffix] if modern else ["Thigh."+suffix,"Shin."+suffix,"Foot."+suffix]
		arms.append({"sign":sign,"bones":hand.map(func(n):return skeleton.find_bone(n))})
		limbs.append({"sign":sign,"bones":leg.map(func(n):return skeleton.find_bone(n))})
	for i in skeleton.get_bone_count():
		if skeleton.get_bone_name(i).begins_with("equipment_"):gear_bones.append(i)
	mount=BoneAttachment3D.new();mount.bone_idx=pelvis;skeleton.add_child(mount);mount.add_child(gear)
	eye=MMFAssets.find_named(gear,"TetherEye")
	position_gear(0);active=false

func rotate_global(bone: int,basis: Basis,weight: float):
	var sk=get_skeleton();var parent=sk.get_bone_parent(bone)
	var parent_basis=sk.get_bone_global_pose(parent).basis.orthonormalized() if parent>=0 else Basis.IDENTITY
	var rotation=parent_basis.get_rotation_quaternion().inverse()*basis.orthonormalized().get_rotation_quaternion()
	sk.set_bone_pose_rotation(bone,sk.get_bone_pose_rotation(bone).slerp(rotation,weight))

func solve(chain: Array,target: Vector3,pole: Vector3,weight: float) -> float:
	var sk=get_skeleton();var upper=chain[0];var lower=chain[1];var end=chain[2]
	var a=sk.get_bone_global_pose(upper);var b=sk.get_bone_global_pose(lower);var c=sk.get_bone_global_pose(end)
	var reach=a.origin.distance_to(b.origin)+b.origin.distance_to(c.origin)-.003
	var requested=target
	target=a.origin+(target-a.origin).limit_length(reach)
	var length_a=a.origin.distance_to(b.origin);var length_b=b.origin.distance_to(c.origin)
	var axis=(target-a.origin).normalized();var distance=maxf(.001,a.origin.distance_to(target))
	var bend=pole-a.origin;bend=(bend-axis*bend.dot(axis)).normalized()
	var along=(length_a*length_a-length_b*length_b+distance*distance)/(2*distance)
	var elbow=a.origin+axis*along+bend*sqrt(maxf(0,length_a*length_a-along*along))
	var q=Quaternion((b.origin-a.origin).normalized(),(elbow-a.origin).normalized())
	rotate_global(upper,Basis(q)*a.basis,weight)
	b=sk.get_bone_global_pose(lower);c=sk.get_bone_global_pose(end)
	q=Quaternion((c.origin-b.origin).normalized(),(target-b.origin).normalized())
	rotate_global(lower,Basis(q)*b.basis,weight)
	return sk.get_bone_global_pose(end).origin.distance_to(requested)

func position_gear(weight: float) -> Transform3D:
	var hip=get_skeleton().get_bone_global_pose(pelvis)
	var at=hip.origin+Vector3(0,.14,-.40).lerp(Vector3(0,.30,.31),weight)
	# Carry the winch around the waist; a straight blend hides it inside the torso.
	at.x+=.62*sin(PI*weight)
	var desired=Transform3D(Basis(Vector3.UP,PI*(1-weight)),at)
	gear.transform=hip.affine_inverse()*desired
	return desired

func set_phase(value: float):progress=value;active=value>0 and value<1

func finish():
	progress=0;position_gear(0);active=false

func _process_modification_with_delta(_dt: float):
	if not is_instance_valid(enemy) or enemy.dead or not enemy.inactive:finish();return
	var weight=smoothstep(0,.12,progress)*(1-smoothstep(.84,1,progress))
	var sk=get_skeleton();var tuck=smoothstep(.60,.76,progress)*(1-smoothstep(.83,.98,progress))
	var crouch=(.055+.12*tuck)*weight
	sk.set_bone_pose_position(pelvis,sk.get_bone_pose_position(pelvis)-Vector3.UP*crouch)
	var hip=sk.get_bone_global_pose(pelvis).origin
	# Weapons remain on the original equipment bones, slung clear of both hands.
	for i in gear_bones.size():
		var bone=gear_bones[i];var source=sk.get_bone_global_pose(bone)
		var offset=Vector3((-.30 if i==0 else .30),.48,-.46)
		if enemy.kind=="sovereign":offset=Vector3(.50,.92,-.30)
		var desired_basis=source.basis if enemy.kind=="sovereign" else Basis(Vector3.RIGHT,PI/2)*source.basis
		var at=source.origin.lerp(hip+offset,weight)
		if enemy.kind!="sovereign":at.x+=(-.65 if i==0 else .65)*sin(PI*weight)
		var desired=Transform3D(source.basis.slerp(desired_basis,weight),at)
		var parent=sk.get_bone_parent(bone);var local=sk.get_bone_global_pose(parent).affine_inverse()*desired
		sk.set_bone_pose_position(bone,local.origin);sk.set_bone_pose_rotation(bone,local.basis.orthonormalized().get_rotation_quaternion())
	var frame=position_gear(weight);grip_errors.clear()
	for arm in arms:
		var target=frame*Vector3(arm.sign*.19,.11,.07)
		var hand_basis=sk.get_bone_global_pose(arm.bones[2]).basis
		grip_errors.append(solve(arm.bones,target,hip+Vector3(arm.sign*.82,.30,.05),weight))
		rotate_global(arm.bones[2],hand_basis,weight)
	for leg in limbs:
		var foot=sk.get_bone_global_pose(leg.bones[2]);var width=.28 if enemy.kind=="bastion" else .17
		var lift=.22+.24*tuck+.025*sin(progress*TAU*3+leg.sign)
		var target=Vector3(leg.sign*width,.155+lift,.18+.19*tuck)
		solve(leg.bones,target,hip+Vector3(leg.sign*width,-.35,.75),weight)
		rotate_global(leg.bones[2],foot.basis,weight)
