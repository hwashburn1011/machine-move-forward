class_name MMFOpeningPerformance
extends SkeletonModifier3D

# Additive acting only; the authored animation retains hips, feet and grip.
# Disabled on every exit, including skip, before gameplay takes the skeleton.
var gaze=Vector2.ZERO
var brace=0.0
var compression=0.0
var contact_error=0.0
var clip: Dictionary={}
var clip_time=0.0
var wall_grips=[]
var grip_weight=0.0
var grip_error=0.0
var carry_equipment=true
var bone_indices=[]
var sampled_ankles=[]
var sampled_blade_tip=Vector3.ZERO
var sampled_head=Vector3.ZERO

func use_clip(data: Dictionary,seconds: float):
	if clip!=data:bone_indices.clear()
	clip=data;clip_time=seconds;active=true

func sample_clip(skeleton: Skeleton3D):
	if clip.is_empty():return
	if bone_indices.is_empty():
		for name in clip.bones:bone_indices.append(skeleton.find_bone(name))
	var cursor=clampf(clip_time*float(clip.fps),0,clip.frames.size()-1)
	var lo=int(cursor);var hi=mini(lo+1,clip.frames.size()-1);var blend=cursor-lo
	for i in bone_indices.size():
		if bone_indices[i]<0:continue
		var a=clip.frames[lo][i];var b=clip.frames[hi][i]
		var origin=Vector3(a[0],a[1],a[2]).lerp(Vector3(b[0],b[1],b[2]),blend)
		var rotation=Quaternion(a[3],a[4],a[5],a[6]).normalized().slerp(Quaternion(b[3],b[4],b[5],b[6]).normalized(),blend)
		set_global_pose(skeleton,bone_indices[i],Transform3D(Basis(rotation),origin))

func _process_modification_with_delta(_dt: float):
	var skeleton=get_skeleton()
	if not skeleton:return
	sample_clip(skeleton)
	var equipment=[]
	for side in ["r","l"]:
		var hand=skeleton.find_bone("hand_"+side)
		var item=skeleton.find_bone("equipment_0" if side=="r" else "equipment_1")
		if carry_equipment and hand>=0 and item>=0:equipment.append([hand,item,skeleton.get_bone_global_pose(hand).affine_inverse()*skeleton.get_bone_global_pose(item)])
	if compression>0:compress(skeleton)
	for entry in [["neck",.36],["neck_01",.36],["head",.64]]:
		var bone=skeleton.find_bone(entry[0])
		if bone>=0:
			var offset=Quaternion.from_euler(Vector3(gaze.y,gaze.x,0)*entry[1])
			skeleton.set_bone_pose_rotation(bone,(skeleton.get_bone_pose_rotation(bone)*offset).normalized())
	for name in ["spine_01","spine_02","chest"]:
		var bone=skeleton.find_bone(name)
		if bone>=0:skeleton.set_bone_pose_rotation(bone,(skeleton.get_bone_pose_rotation(bone)*Quaternion(Vector3.RIGHT,brace*.5)).normalized())
	grip_error=0
	for i in wall_grips.size():
		var side="r" if i==0 else "l"
		var upper=skeleton.find_bone("upperarm_"+side);var lower=skeleton.find_bone("lowerarm_"+side);var hand=skeleton.find_bone("hand_"+side)
		var shoulder=skeleton.get_bone_global_pose(upper);var elbow=skeleton.get_bone_global_pose(lower);var wrist=skeleton.get_bone_global_pose(hand)
		var target=wrist.origin.lerp(skeleton.to_local(wall_grips[i]),grip_weight)
		var bend=MMFGait.knee(shoulder.origin,elbow.origin,wrist.origin,target)
		turn_to(skeleton,upper,elbow.origin-shoulder.origin,bend-shoulder.origin)
		elbow=skeleton.get_bone_global_pose(lower);var moved=skeleton.get_bone_global_pose(hand)
		turn_to(skeleton,lower,moved.origin-elbow.origin,target-elbow.origin)
		moved=skeleton.get_bone_global_pose(hand);moved.basis=wrist.basis;set_global_pose(skeleton,hand,moved)
		grip_error=maxf(grip_error,moved.origin.distance_to(target))
	for item in equipment:set_global_pose(skeleton,item[1],skeleton.get_bone_global_pose(item[0])*item[2])
	# SkeletonModifier poses are restored after drawing. Capture contact evidence
	# here, while the actual rendered pose is still applied.
	if not clip.is_empty():
		sampled_ankles=[]
		for side in ["r","l"]:sampled_ankles.append(skeleton.to_global(skeleton.get_bone_global_pose(skeleton.find_bone("foot_"+side)).origin))
		sampled_head=skeleton.to_global(skeleton.get_bone_global_pose(skeleton.find_bone("head")).origin)
		sampled_blade_tip=skeleton.to_global(skeleton.get_bone_global_pose(skeleton.find_bone("equipment_0"))*Vector3(0,-.936,0))

func set_global_pose(skeleton: Skeleton3D,bone: int,pose: Transform3D):
	var parent=skeleton.get_bone_parent(bone)
	var local=skeleton.get_bone_global_pose(parent).affine_inverse()*pose if parent>=0 else pose
	skeleton.set_bone_pose_position(bone,local.origin)
	skeleton.set_bone_pose_rotation(bone,local.basis.orthonormalized().get_rotation_quaternion())

func turn_to(skeleton: Skeleton3D,bone: int,from: Vector3,to: Vector3):
	var pose=skeleton.get_bone_global_pose(bone)
	pose.basis=Basis(Quaternion(from.normalized(),to.normalized()))*pose.basis
	set_global_pose(skeleton,bone,pose)

func compress(skeleton: Skeleton3D):
	contact_error=0
	var contacts=[]
	for side in ["r","l"]:
		var hip=skeleton.find_bone("thigh_"+side);var knee=skeleton.find_bone("calf_"+side);var foot=skeleton.find_bone("foot_"+side)
		if mini(hip,mini(knee,foot))>=0:contacts.append([hip,knee,foot,skeleton.get_bone_global_pose(foot)])
	var pelvis=skeleton.find_bone("pelvis")
	if pelvis<0:return
	var pose=skeleton.get_bone_global_pose(pelvis);pose.origin+=Vector3(0,-compression,-compression*.35)
	set_global_pose(skeleton,pelvis,pose)
	for leg in contacts:
		var hip=skeleton.get_bone_global_pose(leg[0]);var knee=skeleton.get_bone_global_pose(leg[1]);var foot=skeleton.get_bone_global_pose(leg[2])
		var target=MMFGait.knee(hip.origin,knee.origin,foot.origin,leg[3].origin)
		turn_to(skeleton,leg[0],knee.origin-hip.origin,target-hip.origin)
		knee=skeleton.get_bone_global_pose(leg[1]);foot=skeleton.get_bone_global_pose(leg[2])
		turn_to(skeleton,leg[1],foot.origin-knee.origin,leg[3].origin-knee.origin)
		foot=skeleton.get_bone_global_pose(leg[2]);foot.basis=leg[3].basis;set_global_pose(skeleton,leg[2],foot)
		contact_error=maxf(contact_error,foot.origin.distance_to(leg[3].origin))

func clear():
	active=false;gaze=Vector2.ZERO;brace=0;compression=0;clip={};bone_indices.clear();wall_grips=[];grip_weight=0;carry_equipment=true
