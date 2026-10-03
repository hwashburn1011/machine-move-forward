class_name MMFArt100Decor
extends RefCounted
## Complete metre-scale furnishings. Cosmetic build pieces use the existing
## purchase, movement, damage, cutter refund and save paths; no fake simulation.

const PATH="res://art/art100-machine.glb"
const DATA="res://data/art100-machine.json"
const PIECES={
	"nomad-tool-drawers":true,
	"nomad-service-cart":true,
	"nomad-field-chair":true,
	"nomad-sleeping-berth":true,
	"nomad-radio-cabinet":true,
	"nomad-repair-trestle":true,
	"nomad-parts-organizer":true,
	"nomad-charging-cabinet":true,
	"nomad-expedition-trunk":true,
	"nomad-archive-vitrine":true,
	"nomad-chart-desk":true,
	"nomad-survey-floodlight":true,
	"nomad-machinist-lamp":true,
	"nomad-coat-rack":true,
	"nomad-cable-reel":true,
	"nomad-boots-locker":true,
	"nomad-galley-sideboard":true,
	"nomad-ceramic-basin":true,
	"nomad-navigation-stool":true,
	"nomad-patchwork-bench":true,
	"nomad-spare-track-stand":true,
	"nomad-air-filter-tower":true,
	"nomad-canister-caddy":true,
	"nomad-signal-pennant":true,
	"nomad-memory-board":true
}
static var _data: Dictionary={}
static var _models: Dictionary={}

static func clear_cache():
	_models.clear()
	_data.clear()

static func catalog() -> Dictionary:
	if _data.is_empty():_data=MMFAssets.json(DATA)
	return _data

static func apply(data: Dictionary):
	for id in PIECES:
		data.BUILD_PIECES[id]=catalog().pieces[id].duplicate(true)
		if id not in data.BUILD_PIECE_ORDER:data.BUILD_PIECE_ORDER.append(id)

static func runtime_contract(runtime: Dictionary):
	for id in PIECES:runtime.pieceColliders[id]=catalog().colliders[id].duplicate(true)

static func _owned(root: Node,node: Node):
	for child in node.get_children():
		child.owner=root
		_owned(root,child)

static func prepare_models():
	# Split the imported palette kit once. Previews and placements instantiate
	# just their own furnishing, never the entire 25-piece collection.
	if _models.is_empty():
		var kit=MMFAssets.scene(PATH)
		MMFArt100Materials.prepare(kit)
		for key in PIECES:
			var part=MMFAssets.find_named(kit,key)
			if part:
				_owned(part,part)
				var packed=PackedScene.new()
				if packed.pack(part)==OK:_models[key]=packed
		kit.free()

static func model(id: String) -> Node3D:
	if not PIECES.has(id):return Node3D.new()
	prepare_models()
	if not _models.has(id):
		push_error("Missing authored Nomad furnishing: "+id)
		return Node3D.new()
	return _models[id].instantiate()
