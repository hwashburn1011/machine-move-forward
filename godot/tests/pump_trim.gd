extends RefCounted

# Independent geometry comparisons still use the frozen machine as their
# source. Only the nine measured original pump batches may lose these regions.
static func removed(p: Vector3,original_name: String,manifest: Dictionary) -> bool:
	if not manifest.trim.any(func(entry):return entry.frozen==original_name):return false
	for box in manifest.originalBoxes:
		if p.x>box.min[0]-.003 and p.x<box.max[0]+.003 and p.y>box.min[1]-.003 and p.y<box.max[1]+.003 and p.z>box.min[2]-.003 and p.z<box.max[2]+.003:return true
	return false
