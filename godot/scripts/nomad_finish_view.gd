class_name MMFNomadFinishView
extends RefCounted
## A finish changes only authored pigment batches. Imported resources, labels,
## bare metal, UVs, normals, physical geometry and other instances stay intact.

const BASE_META="nomad_original_finish_materials"

static func plan(root: Node3D,spec: Dictionary,palette: Dictionary,finish: String) -> Array:
	var result=[]
	if not is_instance_valid(root):return result
	for mesh in MMFAssets.of_type(root,"MeshInstance3D"):
		if not mesh.mesh:continue
		var originals: Dictionary=mesh.get_meta(BASE_META,{})
		for index in range(mesh.mesh.get_surface_count()):
			var original=originals.get(index,mesh.get_active_material(index))
			if not original is StandardMaterial3D or not spec.has(original.resource_name):continue
			if not originals.has(index):originals[index]=original
			var material=original
			if finish!="original":
				if not palette.has(finish):return []
				material=original.duplicate()
				var source=spec[original.resource_name]
				var base: Color
				if source.has("source_linear"):
					var rgb=source.source_linear;base=Color(rgb[0],rgb[1],rgb[2])
				else:base=Color(source.source).srgb_to_linear()
				var target=Color(palette[finish][source.tone]).srgb_to_linear()
				var ratio=Color(target.r/maxf(base.r,.001),target.g/maxf(base.g,.001),target.b/maxf(base.b,.001))
				# Godot converts the sRGB color property to linear before multiplying
				# the decoded texture. Preserve authored light/dark wear variation.
				var authored=original.albedo_color.srgb_to_linear()
				material.albedo_color=(authored*ratio).linear_to_srgb()
				material.albedo_color.a=original.albedo_color.a
			result.append({"mesh":mesh,"surface":index,"material":material})
		mesh.set_meta(BASE_META,originals)
	return result

static func apply(plan: Array):
	for row in plan:
		if is_instance_valid(row.mesh):row.mesh.set_surface_override_material(row.surface,row.material)

static func study(parent: Control,source: Node3D,spec: Dictionary,palette: Dictionary,finish: String):
	# A small isolated still makes the selected finish visible inside the opaque
	# terminal. No physics, scripts or runtime children enter this preview world.
	if not is_instance_valid(source):return
	var container=SubViewportContainer.new();container.custom_minimum_size=Vector2(600,290);container.stretch=true;container.mouse_filter=Control.MOUSE_FILTER_IGNORE
	parent.add_child(container)
	var viewport=SubViewport.new();viewport.size=Vector2i(960,420);viewport.own_world_3d=true;viewport.render_target_update_mode=SubViewport.UPDATE_ONCE;container.add_child(viewport)
	var model=Node3D.new();viewport.add_child(model)
	for mesh in MMFAssets.of_type(source,"MeshInstance3D"):
		if not mesh.mesh:continue
		var copy=MeshInstance3D.new();copy.mesh=mesh.mesh;copy.transform=source.global_transform.affine_inverse()*mesh.global_transform
		var originals: Dictionary=mesh.get_meta(BASE_META,{})
		for index in mesh.mesh.get_surface_count():copy.set_surface_override_material(index,originals.get(index,mesh.get_active_material(index)))
		model.add_child(copy)
	apply(plan(model,spec,palette,finish))
	var environment=WorldEnvironment.new();var lighting=Environment.new();environment.environment=lighting
	lighting.background_mode=Environment.BG_COLOR;lighting.background_color=Color(.075,.085,.086)
	lighting.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;lighting.ambient_light_color=Color(.79,.83,.84);lighting.ambient_light_energy=.7
	var sky=Sky.new();var sky_material=ProceduralSkyMaterial.new();sky.sky_material=sky_material
	sky_material.sky_top_color=Color(.42,.46,.50);sky_material.sky_horizon_color=Color(.70,.70,.66)
	sky_material.ground_horizon_color=Color(.52,.49,.45);sky_material.ground_bottom_color=Color(.12,.14,.16)
	lighting.sky=sky;lighting.reflected_light_source=Environment.REFLECTION_SOURCE_SKY
	viewport.add_child(environment)
	var light=DirectionalLight3D.new();light.rotation_degrees=Vector3(-42,-35,0);light.light_energy=1.3;viewport.add_child(light)
	var bounds=MMFAssets.bounds(model);var center=bounds.get_center();var radius=maxf(.3,bounds.size.length()*.55)
	var facing=1.0 if spec.keys().any(func(key):return str(key).begins_with("N100_") or str(key).begins_with("N200_")) else -1.0
	var camera=Camera3D.new();camera.fov=38;viewport.add_child(camera);camera.position=center+Vector3(1.1,.66,facing*1.5).normalized()*radius*2.5;camera.look_at(center);camera.current=true
