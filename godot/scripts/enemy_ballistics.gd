class_name MMFEnemyBallistics
extends RefCounted

# Private streams keep aim draws out of loot, encounters and salvage randomness.
# Samples are real points, never a chance roll applied after a cover ray.
static func rng_for(seed_parts: Array) -> MMFRandom:
	var rng=MMFRandom.new()
	rng.seed=MMFRandom.hash_seed(["enemy-ballistics-v1"]+seed_parts)
	return rng

static func spread_radius(distance_m: float,profile: String="rifle") -> float:
	var distance=maxf(0,distance_m)
	if profile=="shell":return 1.9+distance*tan(deg_to_rad(minf(8,1.4+.012*distance)))
	return .42+distance*tan(deg_to_rad(minf(8,.55+.015*distance)))

static func disk(rng: MMFRandom) -> Vector2:
	var angle=rng.randf()*TAU
	var radius=sqrt(rng.randf())
	return Vector2(cos(angle),sin(angle))*radius

static func aim_point(origin: Vector3,committed: Vector3,rng: MMFRandom,profile: String="rifle") -> Vector3:
	var forward=(committed-origin).normalized()
	if forward.length_squared()<.5:forward=Vector3.FORWARD
	var reference=Vector3.UP if absf(forward.y)<.98 else Vector3.RIGHT
	var right=forward.cross(reference).normalized()
	var up=right.cross(forward).normalized()
	var offset=disk(rng)*spread_radius(origin.distance_to(committed),profile)
	return committed+right*offset.x+up*offset.y*.7

static func direction(origin: Vector3,committed: Vector3,rng: MMFRandom,profile: String="rifle") -> Vector3:
	return (aim_point(origin,committed,rng,profile)-origin).normalized()

# Artillery keeps its readable ground pattern; the whole pattern commits around
# this imperfect centre before the warning starts. Marks never chase a dodge.
static func ground_point(origin: Vector3,committed: Vector3,rng: MMFRandom) -> Vector3:
	var offset=disk(rng)*spread_radius(origin.distance_to(committed),"shell")
	return committed+Vector3(offset.x,0,offset.y)

static func trace(game,origin: Vector3,target: Vector3,exclude: Array=[],mask: int=3) -> Dictionary:
	var query=PhysicsRayQueryParameters3D.create(origin,target,mask)
	query.exclude=exclude;query.hit_back_faces=true;query.hit_from_inside=true
	return game.get_world_3d().direct_space_state.intersect_ray(query)

static func blast_clear(game,origin: Vector3,target: Vector3,piece_id: String="") -> bool:
	var hit=trace(game,origin,target,[],1)
	return hit.is_empty() or (piece_id!="" and hit.collider.get_meta("piece_id","")==piece_id)
