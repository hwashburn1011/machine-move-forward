class_name MMFMachineIntake
extends RefCounted

static func install(machine: Node3D) -> Node3D:
	var manifest=MMFAssets.json("res://art/nomad-intake.json")
	var source=MMFAssets.scene("res://art/nomad-main-intake.glb")
	var previous=MMFAssets.find_named(machine,manifest.originalNode)
	if not previous or not MMFAssets.find_named(source,"Turbine_Rotor") or MMFAssets.of_type(source,"MeshInstance3D").size()!=9:
		push_error("Native intake is missing its complete housing or articulated rotor.")
		source.free();return null
	previous.get_parent().remove_child(previous);previous.free()
	source.name="NativeMainIntake";machine.add_child(source)
	source.position=MMFAssets.v(manifest.position)
	return source

static func install_collision(world):
	var source=MMFAssets.scene("res://art/nomad-intake-collision.glb")
	var mesh=MMFAssets.find_named(source,"IntakeCollisionSurface")
	assert(mesh is MeshInstance3D,"Missing authored intake collision")
	var body=StaticBody3D.new();body.name="NativeIntakeCollision";world.add_child(body)
	body.position=MMFAssets.v(MMFAssets.json("res://art/nomad-intake.json").position)
	body.transform=body.transform*mesh.transform
	var collider=CollisionShape3D.new();collider.shape=mesh.mesh.create_trimesh_shape();body.add_child(collider)
	source.free()
