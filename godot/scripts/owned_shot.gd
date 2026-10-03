class_name MMFOwnedShot
extends RefCounted

# All player/owned-gun hits retain world collision. Only explicitly hostile
# targets receive damage, so a gun cannot be used as a demolition tool.
static func damage(hit: Dictionary,amount: float,distance: float=0.0,range_m: float=100000.0,falloff_start: float=1.0) -> float:
	return resolve(hit,amount,distance,range_m,falloff_start).applied_damage

# Pre-hit state and actual applied damage form one detached presentation result.
# Existing damage callers retain their float return; the authority runs once.
static func resolve(hit: Dictionary,amount: float,distance: float=0.0,range_m: float=100000.0,falloff_start: float=1.0,source: String="owned_auto_turret") -> Dictionary:
	var resolved={"source":source,"collision":false,"hostile":false,"category":"world","point":hit.get("position",Vector3.ZERO),"normal":hit.get("normal",Vector3.UP),"armor":0.0,"exposed":false,"applied_damage":0.0,"blocked":true,"killed":false}
	if hit.is_empty() or not is_instance_valid(hit.get("collider")):return resolved
	resolved.collision=true
	var target=hit.collider
	if target.has_meta("piece_id") or not target.get_meta("hostile_target",false):return resolved
	resolved.hostile=true;resolved.category="hostile"
	var profile=target.impact_profile(resolved.point) if target.has_method("impact_profile") else {}
	resolved.armor=float(profile.get("armor",0));resolved.exposed=bool(profile.get("exposed",false));resolved.category=profile.get("category","hostile")
	if target is CollisionObject3D and target.collision_layer==0:return resolved
	var result
	if target.has_method("take_weapon_damage"):
		result=target.take_weapon_damage(amount,hit.position,distance,range_m,falloff_start)
	elif target.has_method("take_damage"):
		result=target.take_damage(MMFDamage.compute(amount,distance,range_m,falloff_start),hit.position)
	resolved.applied_damage=maxf(0.0,float(result)) if typeof(result) in [TYPE_INT,TYPE_FLOAT] else 0.0
	resolved.blocked=resolved.applied_damage<=0
	resolved.killed=resolved.applied_damage>0 and float(profile.get("health",INF))<=resolved.applied_damage
	return resolved

static func trace(game,muzzle: Vector3,camera_origin: Vector3,direction: Vector3,range_m: float,exclude: Array,safety_origin: Vector3=Vector3.INF) -> Dictionary:
	if safety_origin.is_finite():
		var cover=game.raycast(safety_origin,muzzle,exclude,1)
		if not cover.is_empty():return {"hit":cover,"end":cover.position,"origin":cover.position,"distance":safety_origin.distance_to(cover.position)}
	var intended=game.raycast(camera_origin,camera_origin+direction*range_m,exclude,5)
	var target=camera_origin+direction*range_m if intended.is_empty() else intended.position
	var delta=target-muzzle
	# A camera target behind the muzzle cannot make a projectile travel backward.
	if delta.dot(direction)<=0:
		return {"hit":{},"end":muzzle,"origin":muzzle,"distance":0.0}
	var path=delta.normalized()
	var length=minf(range_m,delta.length())
	# Slightly cross the intended surface so a ray endpoint on the collider
	# cannot miss it through floating-point error.
	var hit=game.raycast(muzzle,muzzle+path*(length+.025),exclude,5)
	var end=muzzle+path*length if hit.is_empty() else hit.position
	return {"hit":hit,"end":end,"origin":muzzle,"distance":muzzle.distance_to(end)}
