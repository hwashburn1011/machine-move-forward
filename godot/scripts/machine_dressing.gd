class_name MMFMachineDressing
extends RefCounted

static func install(machine: Node3D) -> Node3D:
	# One combined trim removes old drums, case bodies and handles in a single
	# pass, retaining the underfloor pressure fittings from their shared batch.
	var manifest=MMFAssets.json("res://art/nomad-lockers.json")
	var fittings=MMFAssets.scene("res://art/nomad-pressure-fittings.glb")
	var drums=MMFAssets.scene("res://art/nomad-service-drums.glb")
	var locker=MMFAssets.scene("res://art/nomad-cargo-locker.glb")
	if MMFAssets.of_type(locker,"MeshInstance3D").is_empty() or not MMFAssets.find_named(drums,"ServiceDrum1"):
		push_error("Native deck dressing is missing its detailed models.")
		fittings.free();drums.free();locker.free();return null
	# Validate the complete replacement before removing anything from the bake.
	for entry in manifest.trim:
		if not MMFAssets.find_named(machine,entry.original) is MeshInstance3D or (entry.replacement!="" and not MMFAssets.find_named(fittings,entry.replacement) is MeshInstance3D):
			push_error("Native deck dressing is missing a required cargo batch.")
			fittings.free();drums.free();locker.free();return null
	for entry in manifest.trim:
		var previous=MMFAssets.find_named(machine,entry.original)
		if entry.replacement!="":
			var replacement=MMFAssets.find_named(fittings,entry.replacement)
			replacement.set_surface_override_material(0,previous.get_active_material(0))
			replacement.owner=null;replacement.get_parent().remove_child(replacement);machine.add_child(replacement)
		previous.get_parent().remove_child(previous);previous.free()
	fittings.free()
	drums.name="NativeDeckDressing";machine.add_child(drums)
	var cargo=Node3D.new();cargo.name="NativeCargoLockers";machine.add_child(cargo)
	for site in manifest.sites:
		# PackedScene instances share meshes/materials, while transforms remain
		# independent and grounded at the original three deck heights.
		var instance=locker.duplicate();instance.name=site.name;cargo.add_child(instance)
		instance.position=MMFAssets.v(site.position);instance.rotation.y=site.yaw
	locker.free()
	return drums
