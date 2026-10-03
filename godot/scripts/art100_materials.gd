class_name MMFArt100Materials
extends RefCounted

## Shared imported materials keep fine PBR detail readable at grazing angles.
## Set once per imported kit; all its instances keep sharing the same resources.
static func prepare(root: Node3D):
	for mesh in MMFAssets.of_type(root,"MeshInstance3D"):
		if not mesh.mesh:continue
		for index in mesh.mesh.get_surface_count():
			var material=mesh.get_active_material(index)
			if material is BaseMaterial3D:
				material.texture_filter=BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
				if mesh.mesh.surface_get_format(index)&Mesh.ARRAY_FORMAT_COLOR:
					material.vertex_color_use_as_albedo=true
