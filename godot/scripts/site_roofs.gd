class_name MMFSiteRoofs
extends RefCounted
## Authored shelters add no floor, interaction or progression state. Physical
## triangles follow the retained panels and framing, including the torn gap.

const PATH="res://art/native-site-roofs.glb"
const DATA="res://data/site-roofs.json"
const ROOTS={"rooftop-workshop":"WorkshopCanopy","quiet-array":"ArrayVaultRoof","glass-orchard":"OrchardArchiveRoof","last-garden-meridian":"MeridianGardenSign"}
const SITES=["relay-foundry","rooftop-workshop","quiet-array","glass-orchard","wreck-one","last-garden-meridian"]
const SHAPE_PATHS=["res://data/site-roofs/relay-foundry.res","res://data/site-roofs/rooftop-workshop.res","res://data/site-roofs/quiet-array.res","res://data/site-roofs/glass-orchard.res","res://data/site-roofs/wreck-one.res","res://data/site-roofs/last-garden-meridian.res"]
static var _models: Dictionary={}
static var _shapes: Dictionary={}

static func _owned(root: Node,node: Node):
	for child in node.get_children():
		child.owner=root
		_owned(root,child)

static func prepare_models():
	if not _models.is_empty():return
	var kit=MMFAssets.scene(PATH)
	MMFArt100Materials.prepare(kit)
	for id in ROOTS:
		var part=MMFAssets.find_named(kit,ROOTS[id])
		if part:
			_owned(part,part)
			var packed=PackedScene.new()
			if packed.pack(part)==OK:_models[id]=packed
	kit.free()

static func prepare_shape(index: int):
	if index<0 or index>=SITES.size() or _shapes.has(SITES[index]):return
	var shape=load(SHAPE_PATHS[index])
	if shape is ConcavePolygonShape3D:_shapes[SITES[index]]=shape
	else:push_error("Missing authored site roof collision: "+SITES[index])

static func model(site_id: String) -> Node3D:
	if not ROOTS.has(site_id):return Node3D.new()
	prepare_models()
	return _models[site_id].instantiate() if _models.has(site_id) else Node3D.new()

static func attach(parent: Node3D,site_id: String) -> Node3D:
	if site_id not in SITES:return null
	if parent.has_node("AuthoredSiteRoof"):return parent.get_node("AuthoredSiteRoof")
	var node=Node3D.new();node.name="AuthoredSiteRoof";parent.add_child(node)
	node.set_meta("site_roof",site_id)
	if ROOTS.has(site_id):node.add_child(model(site_id))
	# Foundry roof meshes are already in its original model so its roof root is
	# never duplicated. Prepare their portable materials through the same path.
	else:
		var foundry=MMFAssets.find_named(parent,"FoundryRoof")
		if foundry:MMFArt100Materials.prepare(foundry)
	prepare_shape(SITES.find(site_id))
	if _shapes.has(site_id):
		var body=StaticBody3D.new();body.name="RoofStructureCollision";body.collision_layer=1;body.collision_mask=0
		body.set_meta("site_roof",site_id);node.add_child(body)
		var collider=CollisionShape3D.new();collider.shape=_shapes[site_id];body.add_child(collider)
	return node

static func clear_cache():
	_models.clear()
	_shapes.clear()
