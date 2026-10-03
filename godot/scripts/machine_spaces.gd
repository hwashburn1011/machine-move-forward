class_name MMFMachineSpaces
extends RefCounted

# Shared authored space contract. Loading an older save never calls these
# placement rules; only new construction, moves and explicit safe undo do.
static var cached={}

static func data() -> Dictionary:
	if cached.is_empty():cached=MMFAssets.json("res://data/machine-spaces.json")
	return cached

static func deck_y(level: int) -> float:return 16.03+3.6*level

static func vector(values: Array) -> Vector3:return Vector3(values[0],values[1],values[2])

static func box(entry: Dictionary) -> AABB:
	return AABB(vector(entry.min),vector(entry.max)-vector(entry.min))

static func bay(id: String) -> Dictionary:return data().get("bays",{}).get(id,{}).duplicate(true)

static func bay_refusal(spec: Dictionary) -> String:
	var entry=bay(spec.get("definitionId",""))
	if entry.is_empty():return ""
	if spec.get("cell",{})!=entry.cell or int(spec.get("rotation",0))!=int(entry.rotation):
		return "Use the "+entry.name+" connection on the "+entry.deckName+"."
	return ""

static func bay_candidate(id: String) -> Dictionary:
	var entry=bay(id)
	return {} if entry.is_empty() else {"definitionId":id,"cell":entry.cell,"rotation":int(entry.rotation)}

static func bay_note(id: String) -> String:
	var entry=bay(id)
	return "" if entry.is_empty() else entry.name+" / "+entry.deckName+" / fixed service connection"

static func bay_service(id: String) -> Vector3:
	var entry=bay(id)
	return vector(entry.service) if not entry.is_empty() else Vector3.INF

static func deployed_crane(spec: Dictionary) -> bool:
	return spec.get("definitionId","")=="salvage-crane" and bay_refusal(spec)==""

static func crane_tip_local(spec: Dictionary) -> Vector3:
	return Vector3(0,2.25,-3.25 if deployed_crane(spec) else -.65)

static func piece_colliders(spec: Dictionary,runtime) -> Array:
	var parts=runtime.pieceColliders[spec.definitionId]
	if spec.definitionId=="floor":return MMFFloorSurfaces.colliders(spec,parts)
	if not deployed_crane(spec):return parts
	parts=parts.duplicate(true)
	# Connected riser and telescopic jib. The narrow terminal cable guide is
	# intentionally beyond the solid beam, so the actual cable ray starts clear.
	parts.append({"offset":{"x":0,"y":2.05,"z":-.64},"half":{"x":.18,"y":.23,"z":.26}})
	parts.append({"offset":{"x":0,"y":2.2175,"z":-1.935},"half":{"x":.18,"y":.1425,"z":1.215}})
	return parts

static func fixed_ports(level: int) -> Array:
	var result=[]
	for entry in data().get("routes",[]):
		if int(entry.deck)==level:result.append({"name":entry.name,"at":vector(entry.at),"radius":float(entry.get("radius",1.1))})
	for id in data().get("bays",{}):
		var entry=bay(id)
		if int(entry.cell.y)==level:result.append({"name":entry.name+" service position","at":vector(entry.service),"radius":.9})
	return result
