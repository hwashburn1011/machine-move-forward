class_name MMFWeaponPose
extends RefCounted

# The final solved grip is also the shot's launch pose. Damage, spread and
# timers remain in MMFPlayer; the camera supplies only the intended target.
var player
var skeleton: Skeleton3D
var bones={}
var anchors={}
var socket_local: Transform3D
var last_targets={}
var valid=false
var scripted_aim=false
var scripted_target=Vector3.ZERO
var scripted_recoil=0.0
var resolved_muzzle=Vector3.ZERO
var resolved_bore=Vector3.FORWARD
var resolved_origin=Vector3.ZERO
var resolved_body_yaw=0.0
var pose_ready=false

func setup(owner_player):
	player=owner_player
	var list=MMFAssets.of_type(player.visual,"Skeleton3D")
	if list.is_empty():return
	skeleton=list[0];socket_local=player.weapon_socket.transform
	for name in ["spine_02","upperarm_r","lowerarm_r","hand_r","upperarm_l","lowerarm_l","hand_l"]:bones[name]=skeleton.find_bone(name)
	valid=not bones.values().any(func(i):return i<0)
	for spec in [["rifle",player.rifle_mesh],["shotgun",player.shotgun_mesh]]:
		var model=spec[1];var markers={"model":model}
		for name in ["Muzzle","SupportGrip","MuzzleMount","BodyMount","GripOrigin"]:markers[name]=MMFAssets.find_named(model,name)
		anchors[spec[0]]=markers

func muzzle_position() -> Vector3:
	if player.equipment and is_instance_valid(player.equipment.muzzle):return player.equipment.muzzle.global_position
	var marker=anchors.get(player.game.session.current_weapon,{}).get("Muzzle")
	return marker.global_position if is_instance_valid(marker) else player.global_position+Vector3.UP*1.35-player.camera.global_basis.z*.6

func attachment_mount(body: bool) -> Node3D:
	return anchors[player.game.session.current_weapon].get("BodyMount" if body else "MuzzleMount")

func rotate_global(index: int,basis: Basis,weight: float):
	var parent=skeleton.get_bone_parent(index)
	var parent_basis=skeleton.get_bone_global_pose(parent).basis.orthonormalized() if parent>=0 else Basis.IDENTITY
	var local_rotation=parent_basis.get_rotation_quaternion().inverse()*basis.orthonormalized().get_rotation_quaternion()
	skeleton.set_bone_pose_rotation(index,skeleton.get_bone_pose_rotation(index).slerp(local_rotation,weight))

func solve_arm(side: String,target: Vector3,hand_basis: Basis,weight: float):
	var upper=bones["upperarm_"+side];var lower=bones["lowerarm_"+side];var hand=bones["hand_"+side]
	var a=skeleton.get_bone_global_pose(upper);var b=skeleton.get_bone_global_pose(lower);var c=skeleton.get_bone_global_pose(hand)
	var elbow=MMFGait.knee(a.origin,b.origin,c.origin,target)
	var q=Quaternion((b.origin-a.origin).normalized(),(elbow-a.origin).normalized())
	rotate_global(upper,Basis(q)*a.basis,weight)
	b=skeleton.get_bone_global_pose(lower);c=skeleton.get_bone_global_pose(hand)
	q=Quaternion((c.origin-b.origin).normalized(),(target-b.origin).normalized())
	rotate_global(lower,Basis(q)*b.basis,weight)
	rotate_global(hand,hand_basis,weight)

func apply():
	last_targets.clear()
	pose_ready=false
	if not valid:return
	var game=player.game
	var opening=scripted_aim and game.cinematic=="opening"
	if not game.started or game.menu_open or (game.cinematic!="" and not opening) or player.forced_motion or game.manual_turret!="" or game.session.health<=0:return
	if player.equipment and player.equipment.refuel_left>0:return
	var weight=1.0
	if player.reload_left>0:
		var fraction=clampf(1-player.reload_left/game.weapon_definition().reloadTime,0,1)
		weight=1-minf(smoothstep(0,.08,fraction),1-smoothstep(.92,1,fraction))
	if weight<.001:return
	var set=anchors[game.session.current_weapon];var model=set.model
	if not set.SupportGrip:return
	var scale=maxf(player.visual.scale.x,.01)
	var gun_basis=Basis(Vector3.UP,player.aim_yaw)*Basis(Vector3.RIGHT,-player.pitch)
	if opening:
		var direction=skeleton.global_basis.orthonormalized().inverse()*(scripted_target-player.global_position-Vector3.UP*1.4).normalized()
		# The hands can lead a turn only within a natural forward cone. The
		# previous full 162-degree override put the rifle through S-07's torso.
		var yaw_limit=deg_to_rad(30)
		var lead=clampf(atan2(direction.x,direction.z),-yaw_limit,yaw_limit)
		var lift=smoothstep(2.48,3.05,game.cinematics.time)
		gun_basis=Basis(Vector3.UP,lead*lift)*Basis(Vector3.RIGHT,-asin(clampf(direction.y,-1,1))*lift)
	var hand_basis=gun_basis*socket_local.basis.inverse()
	var spine=skeleton.get_bone_global_pose(bones.spine_02)
	var recoil=scripted_recoil if opening else player.recoil
	var right=spine.origin+Vector3.UP*.17+gun_basis*Vector3(.04,-.10,.23-recoil/scale)
	var gun_transform=Transform3D(hand_basis,right)*socket_local*model.transform
	var support_offset=(gun_transform*set.SupportGrip.position)-right
	# Both hands must be reachable, including steep aim and crouch. Translate
	# the shared hold slightly toward the shoulders if either arm would stretch.
	for iteration in 3:
		for side in ["r","l"]:
			var shoulder=skeleton.get_bone_global_pose(bones["upperarm_"+side]).origin
			var elbow=skeleton.get_bone_global_pose(bones["lowerarm_"+side]).origin
			var wrist=skeleton.get_bone_global_pose(bones["hand_"+side]).origin
			var reach=shoulder.distance_to(elbow)+elbow.distance_to(wrist)-.003
			var delta=right+(support_offset if side=="l" else Vector3.ZERO)-shoulder
			if delta.length()>reach:right-=delta.normalized()*(delta.length()-reach)
	var left=right+support_offset
	var old_left=skeleton.get_bone_global_pose(bones.hand_l).basis
	# Preserve the authored left fist roll while following the weapon's pitch.
	var previous_frame=skeleton.get_bone_global_pose(bones.hand_r).basis*socket_local.basis
	var left_basis=gun_basis*previous_frame.orthonormalized().inverse()*old_left
	solve_arm("r",right,hand_basis,weight);solve_arm("l",left,left_basis,weight)
	last_targets={"right":right,"left":left,"weight":weight}
	if weight>.99:
		# Read the solved bone in the modifier, before Godot restores authored
		# poses. Bone attachments may update after this callback, so derive the
		# exact gun transform rather than reading a previous frame's muzzle.
		var solved=skeleton.global_transform*skeleton.get_bone_global_pose(bones.hand_r)*socket_local*model.transform
		var marker=player.equipment.muzzle if player.equipment and is_instance_valid(player.equipment.muzzle) else set.Muzzle
		resolved_muzzle=solved*model.to_local(marker.global_position)
		resolved_bore=solved.basis.z.normalized()
		resolved_origin=player.global_position+Vector3.UP*(1.05 if player.crouched else 1.4)
		resolved_body_yaw=player.visual.rotation.y
		pose_ready=true

func can_fire() -> bool:
	if not pose_ready:return false
	if absf(wrapf(resolved_body_yaw-player.visual.rotation.y,-PI,PI))>deg_to_rad(3):return false
	if resolved_origin.distance_to(player.global_position+Vector3.UP*(1.05 if player.crouched else 1.4))>.2:return false
	return resolved_bore.angle_to(-player.camera.global_basis.z)<deg_to_rad(4)
