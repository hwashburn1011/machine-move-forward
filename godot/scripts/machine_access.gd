class_name MMFMachineAccess
extends RefCounted

static func install(world) -> Node3D:
	var previous=MMFAssets.find_named(world.machine,"Gameplay_Decks_And_Access")
	if not previous:
		push_error("Native Nomad is missing its replaceable access module.")
		return null
	var materials={}
	for mesh in MMFAssets.of_type(previous,"MeshInstance3D"):
		for surface in mesh.mesh.get_surface_count():
			var material=mesh.get_active_material(surface)
			materials[material.resource_name]=material
	var access=MMFAssets.scene("res://art/nomad-access.glb")
	for mesh in MMFAssets.of_type(access,"MeshInstance3D"):
		for surface in mesh.mesh.get_surface_count():
			var name=mesh.get_active_material(surface).resource_name
			if not name.begins_with("Shared_"):continue
			var original=name.trim_prefix("Shared_")
			if not materials.has(original):
				push_error("Native access material missing: "+original)
				access.free();return null
			mesh.set_surface_override_material(surface,materials[original])
	# The derivative is authored directly in game metres. It must not inherit the
	# original asset's anisotropic scale or rotation a second time.
	previous.get_parent().remove_child(previous);previous.free()
	access.name="NativeDeckAccess";world.machine.add_child(access)
	install_cables(world.machine)
	var supports=Node3D.new();supports.name="AccessSupportColliders";access.add_child(supports)
	for spec in MMFAssets.json("res://art/nomad-access-collision.json"):
		if spec.has("a"):
			var a=MMFAssets.v(spec.a);var b=MMFAssets.v(spec.b)
			var body=StaticBody3D.new();body.name=spec.name;supports.add_child(body)
			body.look_at_from_position((a+b)*.5,b,Vector3.UP,true)
			var collision=CollisionShape3D.new();var box=BoxShape3D.new()
			box.size=Vector3(spec.width,spec.depth,a.distance_to(b));collision.shape=box;body.add_child(collision)
		else:
			var body=MMFAssets.collider(supports,spec);body.name=spec.name
	return access

static func install_cables(machine: Node3D):
	var kit=MMFAssets.scene("res://art/nomad-service-cables.glb")
	for pair in [["Secured_weatherproof_cargo_locker001_4","NativeCargoCables"],["Suspended_undercarriage_reduction_gearbox001_5","NativeSideWiring"]]:
		var previous=MMFAssets.find_named(machine,pair[0])
		var replacement=MMFAssets.find_named(kit,pair[1])
		assert(previous is MeshInstance3D and replacement is MeshInstance3D,"Missing service cable batch")
		replacement.set_surface_override_material(0,previous.get_active_material(0))
		replacement.owner=null
		replacement.get_parent().remove_child(replacement)
		machine.add_child(replacement)
		previous.get_parent().remove_child(previous);previous.free()
	kit.free()
