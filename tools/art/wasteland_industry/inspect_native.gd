extends SceneTree

func _initialize():
	var packed=load("res://art/wasteland-industry.glb")
	var kit=packed.instantiate()
	for child in kit.find_children("*","MeshInstance3D",true,false):
		for surface in child.mesh.get_surface_count():
			var mat=child.mesh.surface_get_material(surface)
			var colors=child.mesh.surface_get_arrays(surface)[Mesh.ARRAY_COLOR]
			print("NATIVE_MATERIAL ",child.name," ",surface," ",mat.resource_name," vertex_use=",mat.vertex_color_use_as_albedo," srgb=",mat.vertex_color_is_srgb," albedo=",mat.albedo_color," color_count=",colors.size()," sample=",colors[0] if colors.size()>0 else Color.WHITE)
	kit.free();quit()
