class_name MMFMachinePumps
extends RefCounted

static func install(machine: Node3D) -> Node3D:
	var manifest=MMFAssets.json("res://art/nomad-pumps.json")
	var retained=MMFAssets.scene("res://art/nomad-pumps-retained.glb")
	var pump=MMFAssets.scene("res://art/nomad-service-pump.glb")
	if MMFAssets.of_type(pump,"MeshInstance3D").size()!=5:
		push_error("Native service pump is missing its authored geometry.")
		retained.free();pump.free();return null
	# Validate all replacements before changing any shared machine batch.
	for entry in manifest.trim:
		if not MMFAssets.find_named(machine,entry.original) is MeshInstance3D or (entry.replacement!="" and not MMFAssets.find_named(retained,entry.replacement) is MeshInstance3D):
			push_error("Native service pumps are missing shared workshop batch: "+entry.original)
			retained.free();pump.free();return null
	for entry in manifest.trim:
		var previous=MMFAssets.find_named(machine,entry.original)
		var replacement: MeshInstance3D
		if entry.replacement!="":
			replacement=MMFAssets.find_named(retained,entry.replacement)
			replacement.set_surface_override_material(0,previous.get_active_material(0))
			replacement.owner=null;replacement.get_parent().remove_child(replacement)
		previous.get_parent().remove_child(previous);previous.free()
		if replacement:machine.add_child(replacement)
	retained.free()
	var root=Node3D.new();root.name="NativeServicePumps";machine.add_child(root)
	for site in manifest.sites:
		var instance=pump.duplicate();instance.name=site.name;root.add_child(instance)
		instance.position=MMFAssets.v(site.position)
	pump.free()
	return root

static func install_collision(world):
	var source=MMFAssets.scene("res://art/nomad-pump-collision.glb")
	var mesh=MMFAssets.find_named(source,"PumpCollisionSurface")
	assert(mesh is MeshInstance3D,"Missing authored pump collision")
	var shape=mesh.mesh.create_trimesh_shape()
	# The collision export is authored in game metres with an identity transform.
	# A single shared low-detail shape serves both stationary service assemblies.
	for site in MMFAssets.json("res://art/nomad-pumps.json").sites:
		var body=StaticBody3D.new();body.name=site.name+"Collision";world.add_child(body)
		body.position=MMFAssets.v(site.position);body.transform=body.transform*mesh.transform
		var collider=CollisionShape3D.new();collider.shape=shape;body.add_child(collider)
	source.free()
