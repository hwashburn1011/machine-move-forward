class_name MMFWorld
extends Node3D

var game
var terrain_material: ShaderMaterial
var chunks = {}
var library: Node3D
var prototypes = {}
var scatter_library: Node3D
var scatter_prototypes={}
var streamer=MMFSceneryStream.new()
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
var native_access: Node3D
var native_dressing: Node3D
var canopy=MMFMachineCanopy.new()
var switchgear=MMFMachineSwitchgear.new()
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
	native_access=MMFMachineAccess.install(self)
	native_dressing=MMFMachineDressing.install(machine)
	MMFMachineVessels.install(machine)
	switchgear.install(machine)
	MMFMachinePumps.install(machine)
	canopy.install(machine)
	gait.setup(game,machine)
	var pump_collision=MMFAssets.json("res://art/nomad-pumps-collision.json")
	for index in game.runtime.colliders.size():
		var raw=game.runtime.colliders[index]
		var ranges=pump_collision.retainedIndexRanges if index==int(pump_collision.sourceCollider) else []
		if not ranges.is_empty():assert(raw.indices.size()==int(pump_collision.sourceIndexCount),"Pump collision bake changed; regenerate retained ranges")
		var body=MMFAssets.collider(self,raw,ranges)
		if not ranges.is_empty():body.name="NativeWorkshopCollision"
		# The frozen bake represents open rails with solid 1.04 m-high boxes.
		# Keep their safety collision, but identify them for HUD sight checks.
		if raw.has("half"):
			var half=MMFAssets.v(raw.half)
			if is_equal_approx(half.y,.52) and minf(half.x,half.z)<=.04:body.set_meta("open_railing",true)
	MMFMachinePumps.install_collision(self)
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
	for pair in [["uSandLit","c4b39a"],["uSandShadow","716658"],["uSandDeep","564638"],["uSandCrest","ddd0b6"]]: terrain_material.set_shader_parameter(pair[0],Color.html(pair[1]).srgb_to_linear())
	for pair in [["uRippleStrength",0.30],["uMacroStrength",0.12],["uSandBlotch",0.28],["uSandGrain",0.48],["uSandNormalStrength",0.38]]: terrain_material.set_shader_parameter(pair[0],pair[1])
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
	for spec in MMFSceneryChunk.SCATTER:
		var source=MMFAssets.find_named(scatter_library,spec[0])
		if source is MeshInstance3D:scatter_prototypes[spec[0]]=source
	atmosphere.setup(game)
	streamer.setup(self)
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
	streamer.refresh(force)

func update(dt: float):
	sync_progress()
	atmosphere.update(dt)
	canopy.update(dt,game.session.weather.intensity)
	switchgear.update(dt,game.session)
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
	streamer.prepare()
	if rotor: rotor.rotation.y = distance*0.8
	gait.update(distance,game.session.lateral)
	world_environment.environment.fog_density = 0.0018+game.session.weather.intensity*0.018

func _exit_tree():
	streamer.clear()
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
