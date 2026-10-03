class_name MMFArt200Story
extends RefCounted

# New environmental storytelling only. Existing interaction/state ownership stays
# with campaign and receiving-berth systems. Dormant robots are static props.
const PATH="res://art/art200-story.glb"
const MANIFEST="res://art/art200-story-manifest.json"
const SITES={
	"wreck-one":[
		["Story2ScoutRepairStand",Vector3(-4.65,0,5.5),0.0],
		["Story2CargoManifestLectern",Vector3(-3.65,0,-7.5),0.0],
		["Story2SplitDriveAxle",Vector3(-1,0,8.0),0.0],
		["Story2EmergencyShadeStation",Vector3(-3.85,0,-4.7),0.0]],
	"relay-foundry":[
		["Story2ServoPress",Vector3(5.8,0,2.7),-PI/2],
		["Story2LimbAssemblyJig",Vector3(-4.9,0,3.6),PI],
		["Story2QuenchManifold",Vector3(5.55,0,-4.0),0.0],
		["Story2MagneticSortingDrum",Vector3(-1.2,0,-4.05),0.0],
		["Story2WaterReclamationStill",Vector3(-1.8,0,3.8),PI]],
	"quiet-array":[
		["Story2AzimuthTrackingDish",Vector3(-6.8,0,6.6),0.0],
		["Story2FerriteTuningBench",Vector3(5.9,0,8.8),PI],
		["Story2ReceiverRepairBot",Vector3(-6.8,0,3.5),0.0],
		["Story2CableRoutingArch",Vector3(-3.5,0,6.6),0.0]],
	"glass-orchard":[
		["Story2PneumaticSeedSorter",Vector3(.2,0,3.25),0.0],
		["Story2ClimateBellChamber",Vector3(7.5,0,-3.4),0.0],
		["Story2FamilyMemorialTableau",Vector3(-5,0,7.5),PI],
		["Story2RootIrrigationCart",Vector3(.1,0,-3.6),0.0],
		["Story2CommunalGalleyModule",Vector3(-5,0,-7.6),0.0]],
	"last-garden-meridian":[
		["Story2ArchiveReelLibrary",Vector3(-7.1,0,3.55),0.0],
		["Story2PassengerBaggageTrolley",Vector3(0,0,8.3),PI],
		["Story2DeadPatrolTorso",Vector3(6.9,0,3.0),0.0],
		["Story2SignalVerificationGate",Vector3(-1,0,0),PI/2]]}
const BERTH=[
	["Story2JourneyCartographyTable",Vector3(-2.1,0,2.25),0.0],
	["Story2DormantStewardCradle",Vector3(-4.65,0,1.6),0.0],
	["Story2MissionPlaqueRack",Vector3(4.65,0,5.65),PI]]
static var parts={}
static var entries={}

static func clear_cache():
	parts.clear();entries.clear()

static func own_descendants(node: Node,owner_root: Node):
	for child in node.get_children():
		child.owner=owner_root
		own_descendants(child,owner_root)

static func part(id: String) -> Node3D:
	if parts.is_empty():
		for entry in MMFAssets.json(MANIFEST).models:entries[entry.id]=entry
		var kit=MMFAssets.scene(PATH)
		MMFArt100Materials.prepare(kit)
		for child in kit.get_children():
			if not child is Node3D:continue
			own_descendants(child,child)
			var packed=PackedScene.new()
			if packed.pack(child)==OK:parts[String(child.name)]=packed
		kit.free()
	if not parts.has(id):
		push_error("Missing Art200 story assembly: "+id)
		return Node3D.new()
	var model=parts[id].instantiate();model.set_meta("art200_id",id)
	return model

static func collider(model: Node3D,id: String):
	var body=StaticBody3D.new();body.name="AuthoredCompoundCollision";model.add_child(body)
	for spec in entries[id].collision_shapes:
		var node=CollisionShape3D.new();body.add_child(node)
		match spec.type:
			"box":
				var shape=BoxShape3D.new();shape.size=MMFAssets.v(spec.size);node.shape=shape;node.position=MMFAssets.v(spec.at)
			"sphere":
				var shape=SphereShape3D.new();shape.radius=spec.radius;node.shape=shape;node.position=MMFAssets.v(spec.at)
			"cylinder":
				var a=MMFAssets.v(spec.a);var b=MMFAssets.v(spec.b)
				var shape=CylinderShape3D.new();shape.radius=spec.radius;shape.height=a.distance_to(b);node.shape=shape
				node.position=(a+b)*.5;node.basis=Basis(Quaternion(Vector3.UP,(b-a).normalized()))

static func place(parent: Node3D,id: String,at: Vector3,turn: float=0.0) -> Node3D:
	var model=part(id);parent.add_child(model);model.position=at;model.rotation.y=turn
	collider(model,id)
	return model

static func decorate_destination(game):
	var destination=game.campaign.destination
	if not is_instance_valid(destination) or destination.has_node("Art200Destination"):return
	var group=Node3D.new();group.name="Art200Destination";destination.add_child(group)
	for spec in SITES.get(game.campaign.destination_id,[]):place(group,spec[0],spec[1],spec[2])

static func decorate_berth(berth: Node3D):
	if berth.has_node("Art200Berth"):return
	var group=Node3D.new();group.name="Art200Berth";berth.add_child(group)
	for spec in BERTH:place(group,spec[0],spec[1],spec[2])
