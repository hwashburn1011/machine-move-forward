extends RefCounted
## Preserve the authored gun textures and mesh; reuse finishes across instances.
## Pedestal steel is exposed, dusty equipment, while the barrel remains darker.
static var materials: Dictionary={}

static func apply(root: Node3D):
	for node in MMFAssets.of_type(root,"MeshInstance3D"):
		for surface in node.mesh.get_surface_count():
			var original=node.mesh.surface_get_material(surface)
			if not original is StandardMaterial3D:continue
			var kind=original.resource_name
			if kind not in ["Turret_Steel","Turret_Paint"]:continue
			var pedestal=String(node.name)=="Cylinder_1"
			var key=str(original.get_instance_id())+":"+str(pedestal)
			if not materials.has(key):
				var finish=original.duplicate() as StandardMaterial3D
				# Existing baked wear/normal maps remain; reduce bright metallic glare.
				finish.albedo_color*=Color(.61,.59,.55) if pedestal else Color(.80,.78,.73) if kind=="Turret_Steel" else Color(.88,.86,.80)
				finish.metallic*=.38 if pedestal else .62 if kind=="Turret_Steel" else .75
				finish.normal_scale=original.normal_scale*1.12
				finish.resource_name=kind+"_FieldFinish"+("_Pedestal" if pedestal else "")
				materials[key]=finish
			node.set_surface_override_material(surface,materials[key])
