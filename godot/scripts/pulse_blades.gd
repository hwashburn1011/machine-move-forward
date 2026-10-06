class_name MMFPulseBlades
extends RefCounted

static var material: ShaderMaterial
static var blade_mesh: ArrayMesh

static func attach(model: Node3D):
	# Shared geometry/material; two tiny skinned-weapon attachments per robot.
	# No timers, extra lights, particles, physics bodies or gameplay changes.
	for skeleton in MMFAssets.of_type(model,"Skeleton3D"):
		if skeleton.has_node("PulseBlade0"):continue
		for i in 2:
			var bone="equipment_"+str(i)
			if skeleton.find_bone(bone)<0:continue
			var socket=BoneAttachment3D.new();socket.name="PulseBlade"+str(i);socket.bone_name=bone
			skeleton.add_child(socket)
			var mesh=MeshInstance3D.new();mesh.name="BluePulseCore";mesh.mesh=geometry();mesh.material_override=surface()
			mesh.set_meta("exclude_fit_bounds",true)
			mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF;socket.add_child(mesh)

static func surface() -> ShaderMaterial:
	if material==null:
		material=ShaderMaterial.new();material.shader=preload("res://shaders/pulse_blade.gdshader")
	return material

static func geometry() -> ArrayMesh:
	if blade_mesh!=null:return blade_mesh
	# Both faces of the diamond-section metal blade; inset below its cutting edge.
	var vertices=PackedVector3Array();var indices=PackedInt32Array()
	for side in [-1.0,1.0]:
		var start=vertices.size()
		vertices.append_array(PackedVector3Array([Vector3(-.025,-.025,.0105*side),Vector3(.025,-.025,.0105*side),Vector3(.021,-.70,.008*side),Vector3(0,-.928,.002*side),Vector3(-.021,-.70,.008*side)]))
		for index in [0,1,2,0,2,4,4,2,3]:indices.append(start+index)
	var arrays=[];arrays.resize(Mesh.ARRAY_MAX);arrays[Mesh.ARRAY_VERTEX]=vertices;arrays[Mesh.ARRAY_INDEX]=indices
	blade_mesh=ArrayMesh.new();blade_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	return blade_mesh
