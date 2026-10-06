class_name MMFRoadsideComposition
extends RefCounted

# These are remnants of a use, not a second encounter/economy generator.
# The first member is already the route's non-repeating foreground landmark.
const GROUPS = [
	{"name":"motor-service", "anchors":["wasteland-service-station","art200-cinder-auto-lift","art200-billboard-morrow-motors","art200-billboard-open-road-retreads"], "props":["art200-cinder-auto-lift","wreck-pickup","air-compressor"]},
	{"name":"last-light-stop", "anchors":["art200-dustmile-motel-office","art200-billboard-last-light-lodging","art200-billboard-goodnight-mattress"], "props":["art200-dustmile-motel-office","wreck-car","street-lamp"]},
	{"name":"parcel-yard", "anchors":["art200-parcel-post-depot","art200-billboard-paperbird-post","art200-billboard-parcel-plain"], "props":["art200-parcel-post-depot","wreck-forklift","cargo-pallet"]},
	{"name":"maintenance-convoy", "anchors":["wasteland-survey-rover","survey-rover","fuel-trailer","wreck-pickup"], "props":["fuel-trailer","diesel-generator","cable-spool"]},
	{"name":"old-checkpoint", "anchors":["wasteland-checkpoint-gate","art200-rook-ticket-booth","road-barrier"], "props":["art200-rook-ticket-booth","road-barrier","light-tower"]},
	{"name":"pump-service", "anchors":["art200-rail-water-crane","art200-crosswind-compressor-house","wasteland-pipeline-valve"], "props":["wasteland-pipeline-valve","air-compressor","cable-spool"]}
]

static func for_anchor(kind: String) -> Dictionary:
	for group in GROUPS:
		if kind in group.anchors:return group
	return {}

static func road_yaw(kind: String) -> float:
	# These authored openings look along +Z. An approaching machine is still
	# behind the shop as well as to its right; a quarter turn hides Cinder's lift
	# behind its solid side wall until the machine is already alongside it.
	if kind in ["art200-cinder-auto-lift","art200-dustmile-motel-office","art200-parcel-post-depot","art200-rook-ticket-booth","art200-crosswind-compressor-house"]:return PI/4
	return .12 if kind.begins_with("wreck") or kind=="fuel-trailer" else PI/2

static func quiet(seed_name: String,chunk: int) -> bool:
	# Two or three adjacent quiet rows, offset differently in each nine-row
	# region. No accumulated state: reverse travel and resume remain identical.
	var block=int(floor(chunk/9.0));var local=posmod(chunk,9)
	var value=absi(MMFRandom.hash_seed([seed_name,"roadside-rest",block]))
	var start=2+posmod(value,4);var length=2+posmod(value/4,2)
	return local>=start and local<start+length

static func compose(layout,anchor: Dictionary,specs: Dictionary,used: Dictionary,allowed: Dictionary) -> bool:
	var group=for_anchor(anchor.kind)
	if group.is_empty():return false
	anchor["composition"]=group.name
	# Service fronts face the road. The associated vehicle keeps a small parked
	# angle, rather than every object inheriting an unrelated cardinal rotation.
	anchor.yaw=road_yaw(anchor.kind)
	anchor.tilt=0.0
	var slot=0
	for kind in group.props:
		if used.has(kind) or not allowed.get(kind,true):continue
		var width=float(specs[kind][1]);var radius=width*.75
		for attempt in 6:
			var x=anchor.x-(11.0+float(attempt/2)*8.0)
			var z=clampf(anchor.z+(-1 if (slot+attempt)%2==0 else 1)*7.0,-30+radius,30-radius)
			if x-radius < -124:continue
			var clear=true
			for other in layout.result:
				if Vector2(x-other.x,z-other.z).length()<radius+float(other.width)*.75+2:clear=false;break
			if not clear:continue
			layout.result.append({"kind":kind,"x":x,"z":z,"width":width,"yaw":road_yaw(kind),"burial":.035,"tilt":0.0,"tint":1.0,"composition":group.name})
			used[kind]=true;slot+=1;break
	return true
