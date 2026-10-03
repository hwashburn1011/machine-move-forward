extends RefCounted

static func removed(p: Vector3) -> bool:
	# Measured complete old assembly. The bake rejects partially selected faces.
	return p.x>3.410 and p.x<6.628 and p.y>12.059 and p.y<15.663 and p.z> -14.025 and p.z< -12.93
