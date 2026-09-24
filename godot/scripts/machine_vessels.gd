class_name MMFMachineVessels
extends RefCounted

static func install(machine: Node3D) -> Node3D:
	var manifest=MMFAssets.json("res://art/nomad-vessels.json")
	var retained=MMFAssets.scene("res://art/nomad-vessels-retained.glb")
	var vessel=MMFAssets.scene("res://art/nomad-pressure-vessel.glb")
	if MMFAssets.of_type(vessel,"MeshInstance3D").size()!=5:
		push_error("Native pressure vessel is missing its authored material batches.")
		retained.free();vessel.free();return null
	# Validate everything before mutating the frozen assembly. The retained
	# geometry is authored in world metres and reuses the original materials.
	for entry in manifest.trim:
		if not MMFAssets.find_named(machine,entry.original) is MeshInstance3D or (entry.replacement!="" and not MMFAssets.find_named(retained,entry.replacement) is MeshInstance3D):
			push_error("Native vessel replacement is missing a workshop batch.")
			retained.free();vessel.free();return null
	for entry in manifest.trim:
		var previous=MMFAssets.find_named(machine,entry.original)
		if entry.replacement!="":
			var replacement=MMFAssets.find_named(retained,entry.replacement)
			replacement.set_surface_override_material(0,previous.get_active_material(0))
			replacement.owner=null;replacement.get_parent().remove_child(replacement);machine.add_child(replacement)
		previous.get_parent().remove_child(previous);previous.free()
	retained.free()
	var bank=Node3D.new();bank.name="NativePressureVessels";machine.add_child(bank)
	for site in manifest.sites:
		var instance=vessel.duplicate();instance.name=site.name;bank.add_child(instance)
		instance.position=MMFAssets.v(site.position)
	vessel.free()
	return bank
