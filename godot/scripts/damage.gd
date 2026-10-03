class_name MMFDamage
extends RefCounted

static func compute(base_damage: float,distance: float,range_m: float,falloff_start: float,armor: float=0) -> float:
	if distance>range_m: return 0
	var after_armor=maxf(0,base_damage-armor)
	if distance<=falloff_start or range_m<=falloff_start: return after_armor
	return after_armor*maxf(0,1-(distance-falloff_start)/(range_m-falloff_start))
