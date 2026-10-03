class_name MMFMachineBenches
extends RefCounted

static func install(machine: Node3D) -> Node3D:
	var manifest=MMFAssets.json("res://art/nomad-benches.json")
	var retained=MMFAssets.scene("res://art/nomad-benches-retained.glb")
	var bench=MMFAssets.scene("res://art/nomad-service-bench.glb")
	if MMFAssets.of_type(bench,"MeshInstance3D").size()!=5:
		push_error("Native service bench is missing its authored geometry.")
		retained.free();bench.free();return null
	for entry in manifest.trim:
		if not MMFAssets.find_named(machine,entry.original) is MeshInstance3D or (entry.replacement!="" and not MMFAssets.find_named(retained,entry.replacement) is MeshInstance3D):
			push_error("Native service benches are missing shared workshop batch: "+entry.original)
			retained.free();bench.free();return null
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
	var root=Node3D.new();root.name="NativeServiceBenches";machine.add_child(root)
	for site in MMFMachineComposition.sites(manifest):
		var instance=bench.duplicate();instance.name=site.name;root.add_child(instance)
		instance.position=MMFAssets.v(site.position);instance.rotation.y=site.yaw
	bench.free()
	return root

static func install_collision(world):
	var source=MMFAssets.scene("res://art/nomad-bench-collision.glb")
	var mesh=MMFAssets.find_named(source,"BenchCollisionSurface")
	assert(mesh is MeshInstance3D,"Missing authored bench collision")
	var shape=mesh.mesh.create_trimesh_shape()
	for site in MMFMachineComposition.sites(MMFAssets.json("res://art/nomad-benches.json")):
		var body=StaticBody3D.new();body.name=site.name+"Collision";world.add_child(body)
		body.position=MMFAssets.v(site.position);body.rotation.y=site.yaw;body.transform=body.transform*mesh.transform
		var collider=CollisionShape3D.new();collider.shape=shape;body.add_child(collider)
	source.free()
