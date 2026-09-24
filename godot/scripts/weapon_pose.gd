class_name MMFWeaponPose
extends RefCounted

# Presentation only: camera hitscan, damage, spread and reload timers stay in
# MMFPlayer. Authored anchors provide the hand, tracer and attachment locations.
var player
var skeleton: Skeleton3D
var bones={}
var anchors={}
var socket_local: Transform3D
var last_targets={}
var valid=false

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
	if not valid:return
	var game=player.game
	if not game.started or game.menu_open or game.cinematic!="" or player.forced_motion or game.manual_turret!="" or game.session.health<=0:return
	if player.equipment and player.equipment.refuel_left>0:return
	var weight=1.0
	if player.reload_left>0:
		var fraction=clampf(1-player.reload_left/game.weapon_definition().reloadTime,0,1)
		weight=1-minf(smoothstep(0,.08,fraction),1-smoothstep(.92,1,fraction))
	if weight<.001:return
	var set=anchors[game.session.current_weapon];var model=set.model
	if not set.SupportGrip:return
	var scale=maxf(player.visual.scale.x,.01)
	var gun_basis=Basis(Vector3.RIGHT,-player.pitch)
	var hand_basis=gun_basis*socket_local.basis.inverse()
	var spine=skeleton.get_bone_global_pose(bones.spine_02)
	var right=spine.origin+Vector3.UP*.17+gun_basis*Vector3(.04,-.10,.23-player.recoil/scale)
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
