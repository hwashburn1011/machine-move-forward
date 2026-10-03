class_name MMFArt200Decor
extends RefCounted
## Complete metre-scale furnishings. Cosmetic build pieces use the existing
## purchase, movement, damage, cutter refund and save paths; no fake simulation.

const PATH="res://art/art200-machine.glb"
const DATA="res://data/art200-machine.json"
const PIECES={
	"nomad2-card-table":true,
	"nomad2-instrument-bench":true,
	"nomad2-privacy-screen":true,
	"nomad2-book-cabinet":true,
	"nomad2-ration-pantry":true,
	"nomad2-folding-lounge":true,
	"nomad2-microscope-bench":true,
	"nomad2-paint-trolley":true,
	"nomad2-air-return-duct":true,
	"nomad2-sewing-station":true,
	"nomad2-record-console":true,
	"nomad2-typewriter-desk":true,
	"nomad2-clock-rack":true,
	"nomad2-tile-mural":true,
	"nomad2-observation-seat":true,
	"nomad2-chess-pedestal":true,
	"nomad2-exercise-rack":true,
	"nomad2-boot-care-stand":true,
	"nomad2-botanical-belljar":true,
	"nomad2-map-roll-rack":true,
	"nomad2-shade-awning":true,
	"nomad2-bagatelle-table":true,
	"nomad2-laundry-drum":true,
	"nomad2-rotary-fan":true,
	"nomad2-arrival-bell":true
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
