class_name MMFMachineDressing
extends RefCounted

static func install(machine: Node3D) -> Node3D:
	var manifest=MMFAssets.json("res://art/nomad-dressing.json")
	var fittings=MMFAssets.scene("res://art/nomad-cargo-fittings.glb")
	var drums=MMFAssets.scene("res://art/nomad-service-drums.glb")
	# Validate the complete replacement before removing anything from the bake.
	for entry in manifest.trim:
		if not MMFAssets.find_named(machine,entry.original) is MeshInstance3D or (entry.replacement!="" and not MMFAssets.find_named(fittings,entry.replacement) is MeshInstance3D):
			push_error("Native deck dressing is missing a required cargo batch.")
			fittings.free();drums.free();return null
	for entry in manifest.trim:
		var previous=MMFAssets.find_named(machine,entry.original)
		if entry.replacement!="":
			var replacement=MMFAssets.find_named(fittings,entry.replacement)
			replacement.set_surface_override_material(0,previous.get_active_material(0))
			replacement.owner=null;replacement.get_parent().remove_child(replacement);machine.add_child(replacement)
		previous.get_parent().remove_child(previous);previous.free()
	fittings.free()
	drums.name="NativeDeckDressing";machine.add_child(drums)
	return drums
