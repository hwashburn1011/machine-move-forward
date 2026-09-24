class_name MMFMachineCanopy
extends RefCounted

const CAMERA_LAYER=32
var root: Node3D
var fabric: ShaderMaterial
var clock=0.0

func install(machine: Node3D):
	var manifest=MMFAssets.json("res://art/nomad-canopy.json")
	var retained=MMFAssets.scene("res://art/nomad-canopy-retained.glb")
	var kit=MMFAssets.scene("res://art/nomad-canopy.glb")
	var canvas=MMFAssets.find_named(kit,"CanopyCanvas")
	if not canvas is MeshInstance3D:
		push_error("Detailed canopy is missing its fabric.");retained.free();kit.free();return
	var original=canvas.get_active_material(0)
	if not original is StandardMaterial3D or not original.albedo_texture or not original.normal_texture or not original.roughness_texture:
		push_error("Detailed canopy is missing its portable fabric maps.");retained.free();kit.free();return
	for entry in manifest.trim:
		if not MMFAssets.find_named(machine,entry.original) is MeshInstance3D or (entry.replacement!="" and not MMFAssets.find_named(retained,entry.replacement) is MeshInstance3D):
			push_error("Detailed canopy is missing a required replacement batch.");retained.free();kit.free();return
	fabric=ShaderMaterial.new();fabric.shader=load("res://shaders/nomad_canvas.gdshader")
	fabric.set_shader_parameter("base_map",original.albedo_texture)
	fabric.set_shader_parameter("normal_map",original.normal_texture)
	fabric.set_shader_parameter("orm_map",original.roughness_texture)
	canvas.material_override=fabric;canvas.extra_cull_margin=.06
	for entry in manifest.trim:
		var previous=MMFAssets.find_named(machine,entry.original)
		if entry.replacement!="":
			var replacement=MMFAssets.find_named(retained,entry.replacement)
			replacement.set_surface_override_material(0,previous.get_active_material(0))
			replacement.owner=null;replacement.get_parent().remove_child(replacement);machine.add_child(replacement)
		previous.get_parent().remove_child(previous);previous.free()
	retained.free();root=kit;root.name="NativeCanvasCanopy";machine.add_child(root)
	var envelope=MMFAssets.json("res://art/nomad-canopy-camera.json")
	var faces=PackedVector3Array();var columns=int(envelope.columns)+1
	for row in int(envelope.rows):
		for column in int(envelope.columns):
			var k=row*columns+column
			for i in [k,k+1,k+columns+1,k,k+columns+1,k+columns]:
				var p=envelope.points[i];faces.append(Vector3(p[0],p[1],p[2]))
	var body=StaticBody3D.new();body.name="CanopyCameraOnly";body.collision_layer=CAMERA_LAYER;body.collision_mask=0;root.add_child(body)
	var shape=ConcavePolygonShape3D.new();shape.backface_collision=true;shape.set_faces(faces)
	var collision=CollisionShape3D.new();collision.shape=shape;body.add_child(collision)

func update(dt: float,storm: float):
	if not fabric:return
	# Simulation time keeps the canvas still while the game is paused. Only two
	# uniforms change; deformation and its pinned anchors stay on the GPU.
	clock=fmod(clock+dt,TAU/.15)
	fabric.set_shader_parameter("cloth_time",clock)
	fabric.set_shader_parameter("wind_strength",lerpf(.45,1,clampf(storm,0,1)))
