extends RefCounted

# Additional whole source components removed by the sparse composition recipe.
# Geometry tests still independently reconstruct every surviving source face.
static func removed_offsets() -> Dictionary:
	var result={}
	for span in MMFAssets.json("res://art/nomad-spaces-collision.json").removedStaticIndexRanges:
		for offset in range(int(span[0]),int(span[1]),3):result[offset]=true
	return result
