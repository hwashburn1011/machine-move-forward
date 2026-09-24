class_name MMFEnemyHitPose
extends SkeletonModifier3D

# The Blender reaction is absolute. Apply its delta from the first sample only
# to chest/neck/head rotations, preserving walking, planted legs and attack pose.
var clip: Animation
var tracks=[]
var elapsed=0.0

func setup(animation: Animation):
	clip=animation;var skeleton=get_skeleton()
	for index in clip.get_track_count():
		if clip.track_get_type(index)!=Animation.TYPE_ROTATION_3D:continue
		var name=String(clip.track_get_path(index)).get_slice(":",1)
		if not (name.begins_with("spine") or name.begins_with("chest") or name in ["neck","head"]):continue
		var bone=skeleton.find_bone(name)
		if bone>=0:tracks.append({"track":index,"bone":bone,"reference":clip.rotation_track_interpolate(index,0)})
	active=false

func begin():elapsed=0;active=not tracks.is_empty()
func clear():active=false;elapsed=0

func _process_modification_with_delta(dt: float):
	if not clip:return
	elapsed=minf(clip.length,elapsed+dt)
	var skeleton=get_skeleton()
	for entry in tracks:
		var delta=entry.reference.inverse()*clip.rotation_track_interpolate(entry.track,elapsed)
		skeleton.set_bone_pose_rotation(entry.bone,(skeleton.get_bone_pose_rotation(entry.bone)*delta).normalized())
	if elapsed>=clip.length:active=false
