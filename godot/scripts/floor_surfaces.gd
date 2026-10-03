class_name MMFFloorSurfaces
extends RefCounted

# Saved cell/state and permanent deck heights remain unchanged. A constructed
# floor on the hull is a seated 12 mm wear plate; a partially outboard tile
# retains structural depth below that cap. Free extensions keep the stock slab.
const CAP_HEIGHT=.012
const HALF_WIDTH=.998
const SLAB_DEPTH=.16
static var footprint={}
static var modes={}

static func rectangles(level: int) -> Array:
	if footprint.is_empty():footprint=MMFAssets.json("res://art/nomad-floor-footprint.json")
	return footprint.levels.get(str(level),[])

static func subtract(rect: Rect2,cut: Rect2) -> Array[Rect2]:
	if not rect.intersects(cut):return [rect]
	var overlap=rect.intersection(cut)
	var choices=[Rect2(rect.position,Vector2(overlap.position.x-rect.position.x,rect.size.y)),Rect2(Vector2(overlap.end.x,rect.position.y),Vector2(rect.end.x-overlap.end.x,rect.size.y)),Rect2(Vector2(overlap.position.x,rect.position.y),Vector2(overlap.size.x,overlap.position.y-rect.position.y)),Rect2(Vector2(overlap.position.x,overlap.end.y),Vector2(overlap.size.x,rect.end.y-overlap.end.y))]
	var result: Array[Rect2]=[]
	for item in choices:
		if item.size.x>.00001 and item.size.y>.00001:result.append(item)
	return result

static func mode(spec: Dictionary) -> String:
	if spec.get("definitionId","")!="floor" or not spec.has("cell"):return "slab"
	var cell=spec.cell;var key="%d:%d:%d"%[cell.x,cell.y,cell.z]
	if modes.has(key):return modes[key]
	var rectangle=Rect2(Vector2(cell.x*2-HALF_WIDTH,cell.z*2-HALF_WIDTH),Vector2.ONE*HALF_WIDTH*2)
	var remaining: Array[Rect2]=[rectangle]
	var overlap=false
	for bounds in rectangles(int(cell.y)):
		var cut=Rect2(Vector2(bounds[0],bounds[2]),Vector2(bounds[1]-bounds[0],bounds[3]-bounds[2]))
		if rectangle.intersects(cut):overlap=true
		var next: Array[Rect2]=[]
		for item in remaining:next.append_array(subtract(item,cut))
		remaining=next
		if remaining.is_empty():break
	var result="cap" if remaining.is_empty() else "edge" if overlap else "slab"
	# Bounded across cancelled previews and wandering at arbitrary grid cells.
	if modes.size()>=128:modes.erase(modes.keys()[0])
	modes[key]=result
	return result

static func model() -> Node3D:
	var result=Node3D.new();result.name="ConstructedFloor"
	var surface=MMFAssets.scene("runtime/floor.glb");surface.name="FloorSurface";result.add_child(surface)
	return result

static func configure_model(root: Node3D,spec: Dictionary):
	var surface=root.get_node_or_null("FloorSurface")
	if not surface:return
	var kind=mode(spec)
	surface.position.y=0 if kind=="slab" else CAP_HEIGHT
	surface.scale.y=CAP_HEIGHT/SLAB_DEPTH if kind=="cap" else 1.0+CAP_HEIGHT/SLAB_DEPTH if kind=="edge" else 1.0
	root.set_meta("floor_surface",kind)

static func colliders(spec: Dictionary,original: Array) -> Array:
	var kind=mode(spec)
	if kind=="slab":return original
	var result=original.duplicate(true)
	for part in result:
		var low=0.0 if kind=="cap" else float(part.offset.y)-float(part.half.y)
		part.offset.y=(low+CAP_HEIGHT)*.5;part.half.y=(CAP_HEIGHT-low)*.5
	return result
