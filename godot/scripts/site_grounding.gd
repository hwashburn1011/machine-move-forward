class_name MMFSiteGrounding
extends RefCounted
## Closed, authored lower buildings join the unmodified elevated walking deck.
## A site is assembled once. Passing/steering never stretches its facades.

const PATH="res://art/native-site-grounding.glb"
const DATA="res://data/site-grounding.json"
const TERRAIN_MIN=-6.5
const TERRAIN_MAX=6.5
const EMBEDDED_BOTTOM=-6.7
const ROOTS={
	"wreck-one":"WakeRelayPodium", "relay-foundry":"FoundryLowerWorks",
	"quiet-array":"ArrayServiceBunker", "glass-orchard":"OrchardServiceVault",
	"last-garden-meridian":"MeridianCivicBase", "fuel-cache":"FuelPumpHouse",
	"salvage-wreck":"SalvageDepotBase", "memorial":"MemorialListeningPlinth",
	"repair-depot":"RepairBayBlock", "friendly-refuge":"RefugeResidentialBase",
	"rooftop-workshop":"WorkshopLowerShop", "gear-salvage-crane":"RecoveryLoadingTower",
	"gear-battery-bank":"RecoveryLoadingTower", "gear-quiet-drive":"RecoveryLoadingTower",
	"mission-stranded-courier":"RefugeResidentialBase", "mission-roof-supplies":"DispatchStoreBase",
	"mission-quiet-watch":"QuietWatchBase", "receiving-berth":"ReceivingCaisson",
	"meridian-horizon":"HorizonBermSkirt", "opening-rooftop":"FoundationUnit"
}
static var _models: Dictionary={}
static var _data: Dictionary={}

static func _owned(root: Node,node: Node):
	for child in node.get_children():
		child.owner=root
		_owned(root,child)

static func prepare_models():
	if not _models.is_empty():return
	_data=MMFAssets.json(DATA)
	var kit=MMFAssets.scene(PATH)
	MMFArt100Materials.prepare(kit)
	for name in _data.models:
		var part=MMFAssets.find_named(kit,name)
		if not part:push_error("Missing authored lower building: "+name);continue
		_owned(part,part)
		var packed=PackedScene.new()
		if packed.pack(part)==OK:_models[name]=packed
	kit.free()

static func model(name: String) -> Node3D:
	prepare_models()
	return _models[name].instantiate() if _models.has(name) else Node3D.new()

static func add_solid(parent: Node3D,at: Vector3,size: Vector3):
	var shape=CollisionShape3D.new();var box=BoxShape3D.new();box.size=size
	shape.shape=box;shape.position=at;parent.add_child(shape)

static func terrain_samples(parent: Node3D,foot: Dictionary,session) -> Array:
	var result=[];var center=Vector2(foot.center[0],foot.center[1]);var size=Vector2(foot.size[0],foot.size[1])+Vector2.ONE*.26
	for dx in [-.5,0,.5]:
		for dz in [-.5,0,.5]:
			var render=parent.to_global(Vector3(center.x+dx*size.x,0,center.y+dz*size.y))
			var world=Vector2(render.x+session.lateral,render.z-session.distance)
			result.append({"worldX":world.x,"worldZ":world.y,"height":MMFDunes.height_at(world.x,world.y)})
	return result

static func attach(parent: Node3D,site_id: String,game) -> Node3D:
	if not ROOTS.has(site_id):return null
	if parent.has_node("GroundedSiteStructure"):return parent.get_node("GroundedSiteStructure")
	prepare_models()
	var name=ROOTS[site_id];var definition=_data.models[name]
	if site_id=="opening-rooftop":
		# The original opening asset already contains its full 20 m facade. Only
		# its y=0 footing needs a buried continuation; never duplicate that shell.
		definition={"colliders":[],"foundations":[{"center":[19.5,0],"size":[9.82,9.82],"top":.12}]}
	var node=Node3D.new();node.name="GroundedSiteStructure";parent.add_child(node)
	node.set_meta("site_grounding",site_id)
	if site_id!="opening-rooftop":node.add_child(model(name))
	var body=StaticBody3D.new();body.name="LowerBuildingSolids";body.collision_layer=1;body.collision_mask=0;node.add_child(body)
	for spec in definition.colliders:add_solid(body,MMFAssets.v(spec.at),MMFAssets.v(spec.size))
	var samples=[]
	# Shader noise is a convex interpolation of values in [-1,1]. Its normalized
	# positive octave weights stay in that interval. Broad noise contributes
	# +/-5.2, squared ridged noise contributes +/-1.3. Corridor blending mixes
	# that bounded value with h*.08-.55, itself [-1.07,-.03]. Thus [-6.5,6.5]
	# is conservative everywhere, not merely at today's sampled corners.
	var bottom=EMBEDDED_BOTTOM-parent.global_position.y
	for foot in definition.foundations:
		var size=Vector2(foot.size[0],foot.size[1]);var center=Vector2(foot.center[0],foot.center[1]);var top=float(foot.top)
		var foundation=model("FoundationUnit");foundation.name="ContinuousBuriedCaisson"
		foundation.position=Vector3(center.x,bottom,center.y);foundation.scale=Vector3(size.x,top-bottom,size.y);node.add_child(foundation)
		add_solid(body,Vector3(center.x,(top+bottom)*.5,center.y),Vector3(size.x,top-bottom,size.y))
		var measured=terrain_samples(parent,foot,game.session);samples.append(measured)
		var low=TERRAIN_MAX;var high=TERRAIN_MIN
		for point in measured:low=minf(low,point.height);high=maxf(high,point.height)
		# Broad collars touch the actual nine sampled dune points. The full-depth
		# caisson behind them closes every corner/slope and survives lateral drift.
		var collar_bottom=low-.45-parent.global_position.y
		var collar_top=high+.16-parent.global_position.y
		var collar=model("GradeCollar");collar.name="TerrainSeatedGradeCollar"
		collar.position=Vector3(center.x,collar_bottom,center.y);collar.scale=Vector3(size.x+.26,collar_top-collar_bottom,size.y+.26);node.add_child(collar)
		add_solid(body,Vector3(center.x,(collar_bottom+collar_top)*.5,center.y),Vector3(size.x+.26,collar_top-collar_bottom,size.y+.26))
	node.set_meta("terrain_samples",samples)
	node.set_meta("terrain_world_origin",Vector2(parent.global_position.x+game.session.lateral,parent.global_position.z-game.session.distance))
	node.set_meta("embedded_world_bottom",EMBEDDED_BOTTOM)
	return node

static func clear_cache():
	_models.clear();_data.clear()
