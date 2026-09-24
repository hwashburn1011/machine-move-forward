class_name MMFWorldAtmosphere
extends RefCounted

var game
var kit: Node3D
var rotors: Array=[]
var cloth_material: ShaderMaterial
var clean_clock=0.0
var worn_materials={}
const NAMES=["WindMast","WindVent","RoadBeacon"]

func setup(owner_game):
	game=owner_game
	kit=MMFAssets.scene("res://art/wind-worn-props.glb")
	cloth_material=ShaderMaterial.new();cloth_material.shader=load("res://shaders/wind_canvas.gdshader")

func place(chunk: Node3D,seed_name: String,index: int,band: int):
	if band!=0: return
	var rng=MMFRandom.new();rng.seed=MMFRandom.hash_seed([seed_name,"wind-worn-props",index])
	var id=NAMES[rng.randi_range(0,2)]
	var source=MMFAssets.find_named(kit,id)
	if not source: return
	# Existing route corridor and right-hand docking lane stay clear.
	var obstacles=[]
	for node in chunk.get_children():
		if node is MeshInstance3D: obstacles.append(node.transform*node.get_aabb())
		elif node is MultiMeshInstance3D:
			for i in node.multimesh.instance_count: obstacles.append(node.transform*node.multimesh.get_instance_transform(i)*node.multimesh.mesh.get_aabb())
	var site=Vector3.ZERO
	var found=false
	for attempt in 24:
		var x=-rng.randf_range(19,31 if attempt<12 else 44)
		var z=rng.randf_range(-24,24)
		var floor_y=MMFDunes.height_at(x,z+index*64)
		var clearance=AABB(Vector3(x-1,floor_y-.1,z-1),Vector3(2.8,3.7,2))
		if obstacles.any(func(box):return box.intersects(clearance)): continue
		site=Vector3(x,floor_y-.035,z);found=true;break
	if not found: return
	var model=source.duplicate();model.name=id;chunk.add_child(model)
	model.position=site
	model.rotate_y(rng.randf_range(-.35,.35))
	model.set_meta("ambient_kind",id)
	for mesh in MMFAssets.of_type(model,"MeshInstance3D"):
		mesh.visibility_range_end=240
		for surface in mesh.mesh.get_surface_count():
			var original=mesh.mesh.surface_get_material(surface)
			if not original is StandardMaterial3D or original.metallic<.1 or "Amber" in original.resource_name or "stencil" in original.resource_name: continue
			var key=original.get_instance_id()
			if not worn_materials.has(key):
				var weathered=ShaderMaterial.new();weathered.shader=load("res://shaders/oxidized_metal.gdshader")
				weathered.set_shader_parameter("base_color",original.albedo_color);weathered.set_shader_parameter("metalness",original.metallic)
				worn_materials[key]=weathered
			mesh.set_surface_override_material(surface,worn_materials[key])
	var cloth=MMFAssets.find_named(model,"WindCloth")
	if cloth:
		for mesh in MMFAssets.of_type(cloth,"MeshInstance3D"):
			mesh.material_override=cloth_material;mesh.extra_cull_margin=.3
	var rotor=MMFAssets.find_named(model,"WindRotor")
	if rotor: rotors.append({"node":rotor,"speed":rng.randf_range(.4,.95)})
	var lens=MMFAssets.find_named(model,"BeaconLens")
	if lens:
		var material=ShaderMaterial.new();material.shader=load("res://shaders/weathered_beacon.gdshader");material.set_shader_parameter("phase",rng.randf_range(0,4.7))
		for mesh in MMFAssets.of_type(lens,"MeshInstance3D"): mesh.material_override=material

func update(dt: float):
	var wind=1+game.session.weather.intensity*.8
	cloth_material.set_shader_parameter("wind_strength",wind)
	for rotor in rotors:
		if is_instance_valid(rotor.node): rotor.node.rotate_z(rotor.speed*wind*dt)
	clean_clock-=dt
	if clean_clock<=0:
		clean_clock=2
		rotors=rotors.filter(func(r):return is_instance_valid(r.node))

func clear():
	if is_instance_valid(kit): kit.free()
