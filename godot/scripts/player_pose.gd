class_name MMFPlayerPose
extends SkeletonModifier3D

var player
var foot_hits={}
var reload_animation: Animation
var reload_tracks=[]
var terminal_blend=0.0
var tool_clock=0.0

func sample_feet():
	var skeleton=get_skeleton()
	if not skeleton or not player or not player.is_on_floor(): foot_hits.clear();return
	for side in ["l","r"]:
		var index=skeleton.find_bone("foot_"+side)
		if index<0: continue
		var at=skeleton.to_global(skeleton.get_bone_global_pose(index).origin)
		foot_hits[side]=player.game.raycast(at+Vector3.UP*0.25,at-Vector3.UP*0.25,[player.get_rid()])

func begin_reload(clip: Animation):
	reload_animation=clip;reload_tracks.clear()
	if not clip: return
	var skeleton=get_skeleton()
	for index in clip.get_track_count():
		if clip.track_get_type(index)!=Animation.TYPE_ROTATION_3D: continue
		var name=String(clip.track_get_path(index)).get_slice(":",1)
		if name=="" or name in ["root","pelvis"] or name.begins_with("thigh") or name.begins_with("calf") or name.begins_with("foot") or name.begins_with("ball"): continue
		var bone=skeleton.find_bone(name)
		if bone>=0: reload_tracks.append({"track":index,"bone":bone})

func _process_modification_with_delta(dt: float):
	if not player: return
	var skeleton=get_skeleton()
	if not skeleton: return
	var terminal=player.game.ui.terminal if player.game.ui else null
	terminal_blend=terminal.blend if terminal else 0.0
	if reload_animation and player.reload_left>0:
		var duration=player.game.weapon_definition().reloadTime
		var fraction=clampf(1-player.reload_left/duration,0,1)
		var weight=minf(smoothstep(0,0.08,fraction),1-smoothstep(0.92,1,fraction))
		for entry in reload_tracks:
			var q=reload_animation.rotation_track_interpolate(entry.track,fraction*reload_animation.length)
			skeleton.set_bone_pose_rotation(entry.bone,skeleton.get_bone_pose_rotation(entry.bone).slerp(q,weight))
	for name in ["spine_01","spine_02"]:
		var index=skeleton.find_bone(name)
		if index>=0:
			var yaw=player.get("aim_yaw")
			var turn=float(yaw)*.2 if yaw!=null and terminal_blend<=0 and player.game.cinematic=="" and player.reload_left<=0 else 0.0
			skeleton.set_bone_pose_rotation(index,skeleton.get_bone_pose_rotation(index)*Quaternion.from_euler(Vector3(clampf(-player.pitch*.3,-.32,.32)*.5,turn,0)))
	if terminal_blend>0:
		if player.weapon_pose:
			player.weapon_pose.last_targets.clear();player.weapon_pose.pose_ready=false
		apply_terminal(skeleton,terminal_blend)
	elif player.equipment and player.equipment.salvage_selected():
		if player.weapon_pose:
			player.weapon_pose.last_targets.clear();player.weapon_pose.pose_ready=false
		apply_cutter(skeleton,dt)
	elif player.weapon_pose:player.weapon_pose.apply()
	if not player.is_on_floor() or player.game.cinematic!="": return
	for side in ["l","r"]:
		var hit=foot_hits.get(side,{})
		if hit.is_empty() or hit.normal.y<0.55: continue
		var hip=skeleton.find_bone("thigh_"+side);var knee=skeleton.find_bone("calf_"+side);var ankle=skeleton.find_bone("foot_"+side)
		if hip<0 or knee<0 or ankle<0: continue
		var hip_pose=skeleton.get_bone_global_pose(hip);var knee_pose=skeleton.get_bone_global_pose(knee);var ankle_pose=skeleton.get_bone_global_pose(ankle)
		var world_ankle=skeleton.to_global(ankle_pose.origin)
		var correction=clampf(hit.position.y+0.10-world_ankle.y,-0.18,0.18)
		# Airborne feet keep the authored gait; only support contacts get IK.
		var weight=1-smoothstep(0.12,0.25,world_ankle.y-player.position.y)
		if player.locomotion:weight*=player.locomotion.contact_weight(side)
		if weight<=0 or absf(correction)<0.001: continue
		var target=skeleton.to_local(world_ankle+Vector3.UP*correction*weight)
		var solved=MMFGait.knee(hip_pose.origin,knee_pose.origin,ankle_pose.origin,target)
		var q=Quaternion((knee_pose.origin-hip_pose.origin).normalized(),(solved-hip_pose.origin).normalized())
		var parent=skeleton.get_bone_parent(hip)
		var parent_basis=skeleton.get_bone_global_pose(parent).basis.orthonormalized()
		skeleton.set_bone_pose_rotation(hip,parent_basis.get_rotation_quaternion().inverse()*q*hip_pose.basis.get_rotation_quaternion())
		knee_pose=skeleton.get_bone_global_pose(knee);ankle_pose=skeleton.get_bone_global_pose(ankle)
		q=Quaternion((ankle_pose.origin-knee_pose.origin).normalized(),(target-knee_pose.origin).normalized())
		parent_basis=skeleton.get_bone_global_pose(hip).basis.orthonormalized()
		skeleton.set_bone_pose_rotation(knee,parent_basis.get_rotation_quaternion().inverse()*q*knee_pose.basis.get_rotation_quaternion())

func apply_terminal(skeleton: Skeleton3D,weight: float):
	if not player.weapon_pose or not player.weapon_pose.valid:return
	var scale=maxf(player.visual.scale.x,.01)
	var spine=skeleton.get_bone_global_pose(skeleton.find_bone("spine_02"))
	# Raise the forearm across the chest, then pronate the wrist to read its
	# dorsal instrument. The same IK uses the actual standing/crouching rig.
	var hand=skeleton.get_bone_global_pose(skeleton.find_bone("hand_l"))
	var target=spine.origin+Vector3(.10,.05,.52)/scale
	player.weapon_pose.solve_arm("l",target,hand.basis*Basis(Vector3.UP,.28),weight)
	var forearm_index=skeleton.find_bone("lowerarm_l")
	var forearm=skeleton.get_bone_global_pose(forearm_index)
	var wrist=skeleton.get_bone_global_pose(skeleton.find_bone("hand_l"))
	var along=(wrist.origin-forearm.origin).normalized()
	var normal=(Vector3.UP-along*along.dot(Vector3.UP)).normalized()
	# Pronate the arm as part of the gesture: the cuff stays attached and the
	# display faces the robot's eyes instead of hiding under his other arm.
	player.weapon_pose.rotate_global(forearm_index,Basis(normal,along,normal.cross(along)).orthonormalized(),weight)
	var right=skeleton.get_bone_global_pose(skeleton.find_bone("hand_r"))
	player.weapon_pose.solve_arm("r",spine.origin+Vector3(-.27,-.36,.10)/scale,right.basis,weight)

func apply_cutter(skeleton: Skeleton3D,dt: float):
	var tool=player.game.building.get("salvage_tool")
	if not tool or not player.weapon_pose or not player.weapon_pose.valid:return
	tool_clock+=dt
	var work=tool.working()
	var cycle=sin(tool_clock*18)*.035 if work else 0.0
	var spine=skeleton.get_bone_global_pose(skeleton.find_bone("spine_02"))
	var scale=maxf(player.visual.scale.x,.01)
	var right=skeleton.get_bone_global_pose(skeleton.find_bone("hand_r"))
	player.weapon_pose.solve_arm("r",spine.origin+Vector3(-.15,-.13,.31+cycle)/scale,right.basis*Basis(Vector3.RIGHT,cycle*2),1.0)
