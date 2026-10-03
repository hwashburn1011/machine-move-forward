extends RefCounted

static func foot_heights(enemy) -> Array:
	var result=[]
	for item in MMFAssets.of_type(enemy.visual,"MeshInstance3D"):
		if not item.skin:continue
		var sk=item.get_node(item.skeleton);var matrices=[];var feet=[]
		for b in item.skin.get_bind_count():
			var name=item.skin.get_bind_name(b);var bone=sk.find_bone(name) if name!=&"" else item.skin.get_bind_bone(b)
			matrices.append(sk.global_transform*sk.get_bone_global_pose(bone)*item.skin.get_bind_pose(b));feet.append("foot" in str(sk.get_bone_name(bone)).to_lower())
		var low=INF
		for s in item.mesh.get_surface_count():
			var data=item.mesh.surface_get_arrays(s);var points=data[Mesh.ARRAY_VERTEX];var bones=data[Mesh.ARRAY_BONES];var weights=data[Mesh.ARRAY_WEIGHTS]
			if bones==null:continue
			var count=bones.size()/points.size()
			for v in points.size():
				var at=Vector3.ZERO;var foot=0.
				for i in count:
					var index=v*count+i;var weight=weights[index];var bind=bones[index]
					at+=matrices[bind]*points[v]*weight
					if feet[bind]:foot+=weight
				if foot>.5:low=minf(low,at.y)
		if is_finite(low):result.append(low)
	return result
