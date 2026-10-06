class_name MMFArt100Materials
extends RefCounted

## Shared imported materials keep fine PBR detail readable at grazing angles.
## Set once per imported kit; all its instances keep sharing the same resources.
static func prepare(root: Node3D):
	for mesh in MMFAssets.of_type(root,"MeshInstance3D"):
		if not mesh.mesh:continue
		# Three shared pre-baked color refinements; no per-instance geometry work.
		if String(mesh.name) in ["art200-cinder-auto-lift","art200-rail-water-crane","art200-crosswind-compressor-house"]:
			mesh.mesh=wear_mesh(mesh.mesh,String(mesh.name))
		for index in mesh.mesh.get_surface_count():
			var material=mesh.get_active_material(index)
			if material is BaseMaterial3D:
				material.texture_filter=BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
				if mesh.mesh.surface_get_format(index)&Mesh.ARRAY_FORMAT_COLOR:
					material.vertex_color_use_as_albedo=true
				# Respect painted pigments and their existing roughness maps. Bare
				# structural metal and scoured fittings have different responses;
				# oxide, rubber, paper advertisements and concrete remain untouched.
				var name=String(material.resource_name).to_lower()
				if name=="art200 wasteland / steel":material.roughness=.66;material.metallic=.62
				elif name=="art200 wasteland / aged aluminium":material.roughness=.52;material.metallic=.74

static func wear_mesh(source: ArrayMesh,kind: String) -> ArrayMesh:
	var refined: ArrayMesh=load("res://art/roadside-wear/"+kind+".res")
	for surface in source.get_surface_count():refined.surface_set_material(surface,source.surface_get_material(surface))
	refined.shadow_mesh=source.shadow_mesh
	return refined
