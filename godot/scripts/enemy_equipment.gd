class_name MMFEnemyEquipment
extends RefCounted

# Keep the imported skeleton, scale, skin, materials and complete body buffers.
# The offline mesh only excludes the original equipment_0 drone triangles.
const SOVEREIGN_BODY=preload("res://art/sovereign-body.res")
var muzzle: Node3D
var palm: BoneAttachment3D

func setup(enemy):
	muzzle=MMFAssets.find_named(enemy.visual,"EnemyMuzzle")
	if enemy.kind!="sovereign":return
	var body=MMFAssets.find_named(enemy.visual,"sovereign_CombatBody")
	var original: Mesh=body.mesh
	body.mesh=SOVEREIGN_BODY
	for i in original.get_surface_count():body.set_surface_override_material(i,original.surface_get_material(i))
	var mount=muzzle.get_parent()
	enemy.drone_visual=MMFAssets.scene("res://art/sovereign-drone.glb")
	mount.add_child(enemy.drone_visual)
	# equipment_0's local basis is a quarter-turn from the export's +Z front.
	enemy.drone_visual.rotation.x=PI/2
	muzzle=MMFAssets.find_named(enemy.drone_visual,"DroneMuzzle")
	enemy.drone=MMFHitZone.new()
	# Retain the original generous 55 cm target, at the actual animated orb.
	# All authored equipment poses retain the same uniform character scale.
	var fit=enemy.visual.scale.x
	enemy.drone.setup(mount,Vector3.ZERO,Vector3.ONE*.55/fit,func(amount,_point):
		if enemy.dead or enemy.drone_health<=0:return
		enemy.drone_health=maxf(0,enemy.drone_health-maxf(0,amount))
		if enemy.drone_health<=0:disable_drone(enemy))
	var skeleton=MMFAssets.of_type(enemy.visual,"Skeleton3D")[0]
	palm=BoneAttachment3D.new();palm.name="CommandPalm";palm.bone_name="hand_l";skeleton.add_child(palm)

func disable_drone(enemy):
	if not enemy.drone or enemy.drone.collision_layer==0:return
	enemy.drone_health=0
	enemy.drone.collision_layer=0
	enemy.drone_visual.hide()
	enemy.game.effects.explosion(enemy.drone.global_position,.3)

func shot_origin(enemy) -> Vector3:
	# Losing the shield drone does not remove the commander's existing attack.
	if enemy.kind=="sovereign" and enemy.drone_health<=0:return palm.global_position
	if muzzle:return muzzle.global_position
	return enemy.position+Vector3.UP*1.4

func show_shot(enemy,hit: Dictionary,direction: Vector3) -> Vector3:
	var origin=shot_origin(enemy)
	var endpoint: Vector3=hit.position if not hit.is_empty() else enemy.committed
	# A long barrel can extend past nearby cover. Do not draw a backwards line
	# through that cover; the original chest-based damage ray remains decisive.
	if (endpoint-origin).dot(direction)>.001:
		var visible_hit=enemy.game.raycast(origin,endpoint,[enemy.get_rid()],1)
		if not visible_hit.is_empty():endpoint=visible_hit.position
		enemy.game.effects.tracer(origin,endpoint,Color(1,.1,.04))
	return origin
