class_name MMFEffects
extends Node3D

var objects: Array = []
var flash = 0.0
var spark_mesh = SphereMesh.new()
var explosion_pool=[]
var explosion_cursor=0
var smoke_material: StandardMaterial3D
var fire_material: StandardMaterial3D
var exhausts=[]
var dust_emitters=[]

func machine_atmosphere(game):
	for name in ["Exhaust_A","Exhaust_B"]:
		var anchor=MMFAssets.find_named(game.world.machine,name)
		if not anchor: continue
		var smoke=emitter(anchor,42,7,smoke_material,false)
		smoke.one_shot=false;smoke.explosiveness=0;smoke.local_coords=false
		smoke.process_material.gravity=Vector3(0.25,0.65,0.45)
		smoke.process_material.initial_velocity_min=1.0;smoke.process_material.initial_velocity_max=2.0
		smoke.preprocess=4;smoke.emitting=true;exhausts.append(smoke)
	for side in [-1,1]:
		var dust=emitter(self,70,3.5,smoke_material,false)
		dust.position=Vector3(side*8,0.5,2)
		dust.one_shot=false;dust.explosiveness=0;dust.local_coords=false
		dust.process_material.gravity=Vector3(0,0.15,1.4)
		dust.process_material.scale_min=1.5;dust.process_material.scale_max=3.5
		var gradient=Gradient.new();gradient.offsets=PackedFloat32Array([0,0.2,1]);gradient.colors=PackedColorArray([Color(0.65,0.43,0.24,0),Color(0.65,0.43,0.24,0.35),Color(0.68,0.48,0.3,0)])
		var texture=GradientTexture1D.new();texture.gradient=gradient;dust.process_material.color_ramp=texture
		dust.emitting=true;dust_emitters.append(dust)

func burning(parent: Node3D,at: Vector3):
	var fire=emitter(parent,22,1.6,fire_material,true)
	fire.position=at;fire.one_shot=false;fire.explosiveness=0;fire.emitting=true
	var smoke=emitter(parent,22,5.0,smoke_material,false)
	smoke.position=at;smoke.one_shot=false;smoke.explosiveness=0;smoke.emitting=true

func _ready():
	fire_material=billboard_material(true)
	smoke_material=billboard_material(false)
	for i in 8:
		var root=Node3D.new();add_child(root)
		var fire=emitter(root,32,1.1,fire_material,true)
		var smoke=emitter(root,18,4.8,smoke_material,false)
		var light=OmniLight3D.new();root.add_child(light)
		light.light_color=Color(1,0.42,0.07);light.omni_range=12;light.light_energy=0
		explosion_pool.append({"node":root,"fire":fire,"smoke":smoke,"light":light,"time":-1.0})
		# Prime both particle pipelines during loading, away from the playable set.
		root.position=Vector3(0,-500,0)
		fire.restart();smoke.restart()

func billboard_material(flame: bool) -> StandardMaterial3D:
	var texture_image=Image.create_empty(64,64,false,Image.FORMAT_RGBA8)
	var noise=FastNoiseLite.new();noise.seed=7321;noise.frequency=0.13
	for y in 64:
		for x in 64:
			var r=Vector2(x-31.5,y-31.5).length()/31.5
			var alpha=pow(maxf(0,1-r),1.2)*(0.6+noise.get_noise_2d(x,y)*0.4)
			texture_image.set_pixel(x,y,Color(1,1,1,alpha))
	var material=StandardMaterial3D.new()
	material.albedo_texture=ImageTexture.create_from_image(texture_image)
	material.vertex_color_use_as_albedo=true
	material.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	material.billboard_mode=BaseMaterial3D.BILLBOARD_ENABLED
	material.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	material.disable_receive_shadows=true
	material.depth_draw_mode=BaseMaterial3D.DEPTH_DRAW_DISABLED
	if flame:
		material.blend_mode=BaseMaterial3D.BLEND_MODE_ADD
	return material

func emitter(parent: Node3D,amount: int,life: float,material: Material,flame: bool) -> GPUParticles3D:
	var particles=GPUParticles3D.new()
	particles.amount=amount;particles.lifetime=life
	particles.one_shot=true;particles.explosiveness=0.93;particles.emitting=false
	particles.visibility_aabb=AABB(Vector3(-15,-5,-15),Vector3(30,35,30))
	var mesh=QuadMesh.new();mesh.size=Vector2.ONE;mesh.material=material
	particles.draw_pass_1=mesh
	particles.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var process=ParticleProcessMaterial.new()
	process.direction=Vector3.UP;process.spread=75
	process.gravity=Vector3(0,0.65,0)
	process.initial_velocity_min=1.5 if flame else 0.6
	process.initial_velocity_max=5 if flame else 2.6
	process.scale_min=0.8 if flame else 2.3;process.scale_max=2.4 if flame else 4.3
	process.angle_min=-180;process.angle_max=180
	var color=Gradient.new()
	color.offsets=PackedFloat32Array([0,0.18,0.5,1])
	color.colors=PackedColorArray([Color(4,2.8,1,0.9),Color(3,0.7,0.08,1),Color(0.8,0.12,0.01,0.6),Color(0.12,0.015,0,0)]) if flame else PackedColorArray([Color(0.19,0.16,0.13,0),Color(0.19,0.16,0.13,0.55),Color(0.3,0.27,0.22,0.35),Color(0.37,0.32,0.26,0)])
	var ramp=GradientTexture1D.new();ramp.gradient=color;process.color_ramp=ramp
	var scale_curve=Curve.new();scale_curve.add_point(Vector2(0,0.4));scale_curve.add_point(Vector2(1,1))
	var curve_texture=CurveTexture.new();curve_texture.curve=scale_curve;process.scale_curve=curve_texture
	particles.process_material=process
	parent.add_child(particles)
	return particles

func _init():
	spark_mesh.radius = 0.05
	spark_mesh.height = 0.1

func tracer(a: Vector3,b: Vector3,color: Color):
	var mesh = ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_LINES)
	mesh.surface_add_vertex(a)
	mesh.surface_add_vertex(b)
	mesh.surface_end()
	var node = MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = MMFAssets.material(color,3)
	add_child(node)
	objects.append({"node":node,"remaining":0.075,"life":0.075,"velocity":Vector3.ZERO,"grow":0.0})

func impact(at: Vector3,normal: Vector3):
	for i in 4:
		particle(at,normal*randf_range(1,3)+Vector3(randf_range(-1,1),randf(),randf_range(-1,1)),Color(1,0.6,0.15),0.04,0.25)

func particle(at: Vector3,velocity: Vector3,color: Color,size: float,life: float,grow: float=0):
	var node = MeshInstance3D.new()
	node.mesh = spark_mesh
	node.scale = Vector3.ONE*size/0.05
	node.material_override = MMFAssets.material(color,2)
	node.position = at
	add_child(node)
	objects.append({"node":node,"remaining":life,"life":life,"velocity":velocity,"grow":grow})

func explosion(at: Vector3,size: float=1):
	if explosion_pool.is_empty(): return
	var entry=explosion_pool[explosion_cursor]
	explosion_cursor=(explosion_cursor+1)%explosion_pool.size()
	entry.node.position=at;entry.node.scale=Vector3.ONE*size;entry.time=0
	entry.fire.restart();entry.smoke.restart()
	for i in 12: particle(at,Vector3(randf_range(-4,4),randf_range(0,7),randf_range(-4,4))*size,Color(1,0.65,0.12),0.025*size,randf_range(0.3,0.8))

func hit_flash(): flash=0.22

func warning_ring(at: Vector3) -> MeshInstance3D:
	var marker=MeshInstance3D.new();var ring=TorusMesh.new()
	ring.inner_radius=0.65;ring.outer_radius=0.72;ring.rings=32;ring.ring_segments=6
	marker.mesh=ring;marker.position=at+Vector3.UP*0.05
	marker.material_override=MMFAssets.material(Color(1,0.12,0.02),1.0)
	marker.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(marker);return marker

func update(dt: float):
	flash=maxf(0,flash-dt)
	for entry in explosion_pool:
		if entry.time<0: continue
		entry.time+=dt
		entry.light.light_energy=maxf(0,8*(1-entry.time/0.3))
		if entry.time>5: entry.time=-1
	for i in range(objects.size()-1,-1,-1):
		var p=objects[i]
		p.remaining-=dt
		if p.remaining<=0:
			p.node.queue_free()
			objects.remove_at(i)
			continue
		p.node.position+=p.velocity*dt
		if p.node is MeshInstance3D:
			p.node.transparency=1-p.remaining/p.life
			p.node.scale+=Vector3.ONE*p.grow*dt
