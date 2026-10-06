extends RefCounted

# CPU skinning makes this check available with the headless dummy renderer too.
# Select actual foot/ball-weighted vertices rather than an ankle or equipment AABB.
static func heights(actor: Node3D) -> Array:
	var skeletons=MMFAssets.of_type(actor,"Skeleton3D")
	if skeletons.is_empty():return []
	var sk=skeletons[0];var soles=[INF,INF]
	for mesh in MMFAssets.of_type(actor,"MeshInstance3D"):
		if not mesh.skin or not mesh.mesh:continue
		var transforms=[];var sides=[]
		for bind in mesh.skin.get_bind_count():
			var bone=mesh.skin.get_bind_bone(bind)
			if bone<0:bone=sk.find_bone(mesh.skin.get_bind_name(bind))
			transforms.append(sk.get_bone_global_pose(bone)*mesh.skin.get_bind_pose(bind))
			var name=sk.get_bone_name(bone)
			sides.append(0 if name in ["foot_r","ball_r"] else 1 if name in ["foot_l","ball_l"] else -1)
		for surf in mesh.mesh.get_surface_count():
			var arrays=mesh.mesh.surface_get_arrays(surf);var vertices=arrays[Mesh.ARRAY_VERTEX];var bones=arrays[Mesh.ARRAY_BONES];var weights=arrays[Mesh.ARRAY_WEIGHTS]
			if weights.is_empty():continue
			var stride=weights.size()/vertices.size()
			for v in vertices.size():
				var foot_weights=[0.0,0.0];var position=Vector3.ZERO
				for b in stride:
					var weight=weights[v*stride+b];var bind=bones[v*stride+b]
					if weight<=0:continue
					if sides[bind]>=0:foot_weights[sides[bind]]+=weight
					position+=(transforms[bind]*vertices[v])*weight
				for side in 2:
					if foot_weights[side]>.5:soles[side]=minf(soles[side],actor.get_parent().to_local(sk.to_global(position)).y)
	return soles
