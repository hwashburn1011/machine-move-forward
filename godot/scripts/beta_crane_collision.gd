class_name MMFBetaCraneCollision
extends RefCounted

# The frozen physics batch also contains decks, rails and workshop equipment.
# Only the connected triangles matched to CargoCrane_Yaw by the offline bake
# may be removed. Keep immutable originals for loading an unrepaired campaign.
var target: CollisionShape3D
var original: ConcavePolygonShape3D
var repaired: ConcavePolygonShape3D
var removed_triangles=0

func install(world: Node3D) -> bool:
	var body=MMFAssets.find_named(world,"NativeWorkshopCollision")
	if body==null:return false
	for child in body.get_children():
		if child is CollisionShape3D and child.shape is ConcavePolygonShape3D:target=child;break
	if target==null:return false
	original=target.shape
	var manifest=MMFAssets.json("res://art/beta-crane-collision.json")
	var faces=original.get_faces()
	var hash=HashingContext.new();hash.start(HashingContext.HASH_SHA256);hash.update(faces.to_byte_array())
	if faces.size()!=int(manifest.faceVertexCount) or hash.finish().hex_encode()!=manifest.facesSha256:
		push_error("Crane collision source changed; rebuild with tools/bake_beta_crane_collision.gd.")
		target=null;original=null;return false
	var retained=PackedVector3Array();var start=0
	for span in manifest.removedRanges:
		retained.append_array(faces.slice(start,int(span[0])));start=int(span[1])
	retained.append_array(faces.slice(start))
	removed_triangles=(faces.size()-retained.size())/3
	repaired=original.duplicate();repaired.set_faces(retained)
	return true

func set_repaired(enabled: bool):
	if is_instance_valid(target):target.shape=repaired if enabled else original
