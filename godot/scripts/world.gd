class_name MMFWorld
extends Node3D

var game
var terrain_material: ShaderMaterial
var chunks = {}
var library: Node3D
var prototypes = {}
var scatter_library: Node3D
var layout=MMFDesertLayout.new()
var last_chunk=Vector2i(999999,999999)
var progress_signature=""
var bearing_needle: Node3D
var receiver: Node3D
var receiver_body: StaticBody3D
var receiver_module: Node3D
var receiver_progress: Node3D
var receiver_lamp: Node3D
var atmosphere=MMFWorldAtmosphere.new()

func sync_progress():
	var signature=",".join(game.session.story.uniques)
	if signature==progress_signature: return
	progress_signature=signature
	var helm=MMFAssets.find_named(machine,"HelmRoot")
	if not helm: return
	var old=MMFAssets.find_named(helm,"NativeProgressHardware")
	if old: old.queue_free()
	var hardware=Node3D.new();hardware.name="NativeProgressHardware";helm.add_child(hardware)
	var kit=MMFAssets.scene("models/authored/nomad-progress.glb")
	for entry in [["course-actuator","HelmActuator"],["vector-governor","HelmGovernor"],["meridian-solution","HelmMeridian"]]:
		if entry[0] not in game.session.story.uniques: continue
		var original=MMFAssets.find_named(kit,entry[1])
		if original:
			var part=original.duplicate();hardware.add_child(part);part.position=Vector3.ZERO
	bearing_needle=null
	if "course-gyro" in game.session.story.uniques:
		var pivot=Node3D.new();hardware.add_child(pivot);pivot.position=Vector3(-0.17,1.276,0.01);pivot.rotation.x=0.41
		for name in ["HelmDialFace","HelmBearingNeedle"]:
			var original=MMFAssets.find_named(kit,name)
			if original:
				var part=original.duplicate();pivot.add_child(part);part.position=Vector3.ZERO
				if name=="HelmBearingNeedle": bearing_needle=part
	kit.free()
var machine: Node3D
var parts = []
var rotor: Node3D
var seed_value = 0
var world_environment: WorldEnvironment
var gait=MMFGait.new()

func setup(owner_game):
	game = owner_game
	seed_value = game.session.seed_name.hash()
	machine = MMFAssets.scene("runtime/machine.glb")
	add_child(machine)
	gait.setup(game,machine)
	for raw in game.runtime.colliders: MMFAssets.collider(self, raw)
	# The receiver is hidden in the initial browser scene and is therefore absent
	# from the visible-only machine bake. Restore its authored model and lifecycle.
	receiver=MMFAssets.scene("models/authored/salvaged-radio.glb")
	machine.add_child(receiver);receiver.position=Vector3(1,16.03,-9.8);receiver.hide()
	receiver_module=MMFAssets.find_named(receiver,"ScannerModule")
	receiver_progress=MMFAssets.find_named(receiver,"ScanProgress")
	receiver_lamp=MMFAssets.find_named(receiver,"SignalLamp")
	receiver_body=MMFAssets.collider(self,{"position":{"x":1,"y":16.75,"z":-9.8},"half":{"x":0.45,"y":0.72,"z":0.28}})
	receiver_body.collision_layer=0
	rotor = MMFAssets.find_named(machine, "Turbine_Rotor")
	for source in ["FrontRight", "FrontLeft", "RearRight", "RearLeft"]:
		var upper = MMFAssets.find_named(machine, "Leg_"+source+"_Upper")
		var lower = MMFAssets.find_named(machine, "Leg_"+source+"_Lower")
		var foot = MMFAssets.find_named(machine, "Leg_"+source+"_Foot")
		if upper and lower and foot: parts.append({"upper": upper, "lower": lower, "foot": foot, "u": upper.transform, "l": lower.transform, "f": foot.transform})
	lighting()
	var terrain = MeshInstance3D.new()
	var plane = PlaneMesh.new()
	plane.size = Vector2(1000, 1400)
	plane.subdivide_width = 288
	plane.subdivide_depth = 288
	terrain.mesh = plane
	terrain.position = Vector3(0,0,-200)
	terrain.custom_aabb = AABB(Vector3(-500,-30,-700),Vector3(1000,70,1400))
	terrain_material = ShaderMaterial.new()
	terrain_material.shader = load("res://shaders/desert.gdshader")
	for entry in [["uDuneScale",62.0],["uDuneHeight",5.2],["uRidgeHeight",2.6],["uCorridorInner",10.0],["uCorridorOuter",30.0]]:
		terrain_material.set_shader_parameter(entry[0],entry[1])
	terrain_material.set_shader_parameter("uSandMap", load("res://assets/textures/sand/diffuse.jpg"))
	terrain_material.set_shader_parameter("uSandNormalMap", load("res://assets/textures/sand/normal.jpg"))
	terrain_material.set_shader_parameter("uSandArmMap", load("res://assets/textures/sand/arm.jpg"))
	for pair in [["uSandLit","d9a463"],["uSandShadow","7d6248"],["uSandDeep","5a4130"],["uSandCrest","e8c493"]]: terrain_material.set_shader_parameter(pair[0],Color.html(pair[1]).srgb_to_linear())
	for pair in [["uRippleStrength",0.42],["uMacroStrength",0.08],["uSandBlotch",0.34],["uSandGrain",0.9],["uSandNormalStrength",0.55]]: terrain_material.set_shader_parameter(pair[0],pair[1])
	terrain_material.set_shader_parameter("uSunDir",Vector3(0.78,0.5,0.37).normalized())
	terrain_material.set_shader_parameter("uTerrainSeed",float(posmod(MMFRandom.hash_seed([game.session.seed_name,"terrain-macro"]),100000))/100000)
	terrain_material.set_shader_parameter("uRippleOrientation",float(posmod(MMFRandom.hash_seed([game.session.seed_name,"terrain-ripple"]),100000))/100000*TAU)
	terrain.material_override = terrain_material
	add_child(terrain)
	var ground = MMFAssets.collider(self, {"position": {"y": -0.8}, "half": {"x": 400,"y":0.4,"z":600}})
	ground.name = "RadioactiveDesert"
	library = MMFAssets.scene("models/props/ruins/desert-ruins.glb")
	var nodes = MMFAssets.of_type(library, "MeshInstance3D")
	for node in nodes:
		if "__lod" in node.name: continue
		prototypes[String(node.name)] = node
	scatter_library=MMFAssets.scene("runtime/scatter.glb")
	atmosphere.setup(game)
	refresh_chunks()

func lighting():
	world_environment = WorldEnvironment.new()
	var env = Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky = Sky.new()
	var mat = ShaderMaterial.new()
	mat.shader=load("res://shaders/sky.gdshader")
	for entry in [["uSunDirection",Vector3(0.78,0.5,0.37).normalized()],["uTurbidity",3.5],["uRayleigh",1.05],["uMieCoefficient",0.014],["uMieDirectionalG",0.76],["uDustAmount",0.72],["uDustColor",Color.html("daa06a").srgb_to_linear()],["uExposure",0.11],["uSunIntensity",1.0]]:
		mat.set_shader_parameter(entry[0],entry[1])
	sky.sky_material = mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.65
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color(0.65,0.46,0.28)
	env.fog_density = 0.0018
	env.fog_sky_affect = 0.0
	env.glow_enabled = true
	env.glow_intensity = 0.6
	env.ssao_enabled = true
	env.ssao_radius = 1.2
	world_environment.environment = env
	add_child(world_environment)
	var sun = DirectionalLight3D.new()
	sun.position=Vector3(0.78,0.5,0.37)*100
	sun.look_at_from_position(sun.position,Vector3.ZERO)
	sun.light_color = Color(1,0.77,0.48)
	sun.light_energy = 1.65
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 100
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	add_child(sun)
	for y in [10.3,13.9]:
		var light = OmniLight3D.new()
		light.position = Vector3(0,y,0)
		light.light_color = Color(1,0.64,0.33)
		light.light_energy = 2
		light.omni_range = 12
		add_child(light)

func refresh_chunks(force: bool=false):
	var current=int(floor(game.session.distance/64))
	var band=int(floor(game.session.lateral/256))
	if not force and last_chunk==Vector2i(current,band): return
	last_chunk=Vector2i(current,band)
	if force:
		for node in chunks.values(): node.queue_free()
		chunks.clear()
	for key in chunks.keys():
		if key.x < -current-6 or key.x > -current+2 or absi(key.y-band)>1:
			chunks[key].queue_free();chunks.erase(key)
	for chunk_index in range(-current-6,-current+3):
		for band_index in range(band-1,band+2):
			var key=Vector2i(chunk_index,band_index)
			if chunks.has(key): continue
			# Set the initial transform before entering the tree: title/load frames
			# must not pile all scenery at the origin or interpolate it outward.
			var chunk=Node3D.new()
			chunk.position=Vector3(band_index*256-game.session.lateral,0,game.session.distance+chunk_index*64)
			add_child(chunk);chunks[key]=chunk
			var seed_name=game.session.seed_name if band_index==0 else game.session.seed_name+":x-band:"+str(band_index)
			for p in layout.generate(seed_name,chunk_index):
				if not prototypes.has(p.kind): continue
				var original: MeshInstance3D=prototypes[p.kind]
				var part=original.duplicate();var b=original.get_aabb()
				var size=p.width/maxf(maxf(b.size.x,b.size.z),0.01)
				part.scale=Vector3.ONE*size;part.rotation_order=EULER_ORDER_XYZ
				part.rotation=Vector3(0,p.yaw,p.tilt)
				var site_x=band_index*256+p.x;var site_z=chunk_index*64+p.z
				var ground=MMFDunes.height_at(site_x,site_z);var half=p.width*0.32
				for dx in [-half,half]:
					for dz in [-half,half]: ground=minf(ground,MMFDunes.height_at(site_x+dx,site_z+dz))
				part.position=Vector3(p.x,ground-b.size.y*size*p.burial,p.z)-part.basis*Vector3(b.get_center().x,b.position.y,b.get_center().z)
				part.visibility_range_end=620
				chunk.add_child(part)
			for spec in [["rocks","rock",11,0.8,3.4,-1,0.25],["slabs","slab",4,1.2,3.0,-1,0.25],["debris","debris",3,0.5,1.4,-1,0.25],["scrap","scrap",2,0.7,1.8,-1,0.25],["scrub","scrub",1,0.55,1.35,-1,0.25],["nearField","near",22,0.35,1.1,-1,0.25],["wreck-wreck","wreck-wreck",1,9,17,0.34,0.26],["wreck-containers","wreck-containers",3,4,7.5,0.26,0.16],["wreck-debris","wreck-debris",5,1.6,3.4,0.2,0.3]]:
				var source=MMFAssets.find_named(scatter_library,spec[0])
				if not source or not source is MeshInstance3D: continue
				var transforms=MMFDesertLayout.scatter(seed_name,chunk_index,band_index,spec[1],spec[2],spec[3],spec[4],spec[5],spec[6])
				var batch=MultiMeshInstance3D.new();var multimesh=MultiMesh.new()
				multimesh.transform_format=MultiMesh.TRANSFORM_3D;multimesh.mesh=source.mesh;multimesh.instance_count=transforms.size()
				for i in transforms.size(): multimesh.set_instance_transform(i,transforms[i])
				batch.multimesh=multimesh;batch.visibility_range_end=620
				if spec[0] not in ["rocks","slabs","wreck-wreck"]: batch.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				chunk.add_child(batch)
			atmosphere.place(chunk,seed_name,chunk_index,band_index)

func update(dt: float):
	sync_progress()
	atmosphere.update(dt)
	var scanner=game.session.scanner
	receiver.visible=game.session.facts.salvage
	var receiver_layer=1 if receiver.visible else 0
	if receiver_body.collision_layer!=receiver_layer:
		receiver_body.collision_layer=receiver_layer
		game.combat.layout_changed()
	if receiver_module: receiver_module.visible=scanner.phase not in ["awaiting-receiver","awaiting-module"]
	if receiver_progress: receiver_progress.scale.x=maxf(0.001,scanner.elapsedS/180)
	if receiver_lamp: receiver_lamp.visible=game.session.powered.get("fixed-radio",false)
	if bearing_needle: bearing_needle.rotation.y=-deg_to_rad(game.session.course)
	var distance = game.session.distance
	terrain_material.set_shader_parameter("distance_m", distance)
	terrain_material.set_shader_parameter("lateral_m", game.session.lateral)
	refresh_chunks()
	for key in chunks:
		chunks[key].position.z = distance+key.x*64
		chunks[key].position.x = key.y*256-game.session.lateral
	if rotor: rotor.rotation.y = distance*0.8
	gait.update(distance,game.session.lateral)
	world_environment.environment.fog_density = 0.0018+game.session.weather.intensity*0.018

func _exit_tree():
	atmosphere.clear()
	if is_instance_valid(library): library.free()
	if is_instance_valid(scatter_library): scatter_library.free()

func set_dock_open(open: bool):
	var gate = MMFAssets.find_named(machine,"ExpeditionGate")
	if gate: gate.visible = not open
	# Disable only the exported safety rail collider at the actual gangway opening.
	for node in get_children():
		if node is StaticBody3D and absf(node.position.x-12)<0.4 and absf(node.position.z)<1.2 and node.position.y>16:
			node.collision_layer = 0 if open else 1
