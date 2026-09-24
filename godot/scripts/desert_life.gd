class_name MMFDesertLife
extends RefCounted

# Small authored details have their own seeded stream, so existing wrecks,
# landmarks and gameplay contacts keep exactly the same placements.
const KINDS=["DryBrushA","DryBrushB","WindTuft","RootSnag","ScouredStoneA","ScouredStoneB","GravelFan"]
var kit: Node3D
var sources={}
var stone_material: StandardMaterial3D
var brush_material: ShaderMaterial
var drift_material: ShaderMaterial
var last_wind=-1.0

func setup():
	kit=MMFAssets.scene("res://art/desert-ground-life.glb")
	for kind in KINDS:sources[kind]=MMFAssets.find_named(kit,kind)
	# Imported GLTF colours exist in the vertex buffer, but the material's
	# vertex-colour toggle is not enabled by this importer. Preserve linear RGB.
	stone_material=sources.ScouredStoneA.get_active_material(0).duplicate()
	stone_material.vertex_color_use_as_albedo=true;stone_material.vertex_color_is_srgb=false
	brush_material=ShaderMaterial.new();brush_material.shader=load("res://shaders/desert_brush.gdshader")
	drift_material=ShaderMaterial.new();drift_material.shader=load("res://shaders/ground_drift.gdshader")

func update(wind: float):
	if is_equal_approx(wind,last_wind):return
	last_wind=wind
	brush_material.set_shader_parameter("wind_strength",wind)
	# A single shared material retains the compiled pipeline across chunk unloads.
	drift_material.set_shader_parameter("wind_strength",wind)

func place(chunk: Node3D,seed_name: String,index: int,band: int,obstacles: Array):
	# Outlying bands remain sparse; all batches have bounded draw distance.
	var rng=MMFRandom.new();rng.seed=MMFRandom.hash_seed([seed_name,"desert-ground-life",index,band])
	var group=Node3D.new();group.name="DesertGroundLife";group.set_meta("desert_life",true);chunk.add_child(group)
	var batches={};var occupied: Array=[];var sites=[]
	for cluster in (4 if band==0 else 2):
		var near_road=band==0 and cluster<2
		var center=Vector2(-rng.randf_range(20,38) if near_road else -rng.randf_range(45,105),rng.randf_range(-26,26))
		if band!=0 and rng.randf()>.5:center.x=-center.x
		for item in rng.randi_range(3,5):
			var x=center.x+rng.randf_range(-3.2,3.2);var z=center.y+rng.randf_range(-2.8,2.8)
			var world_x=x+band*256;var world_z=z+index*64
			# Keep the whole current travel lane and right-hand docking lane clear.
			if world_x>-17 and world_x<42:continue
			var ground=MMFDunes.height_at(world_x,world_z)
			var clearance=AABB(Vector3(x-.8,ground-.2,z-.8),Vector3(1.6,1.7,1.6))
			if obstacles.any(func(box):return box.intersects(clearance)) or occupied.any(func(box):return box.intersects(clearance)):continue
			var kind=KINDS[rng.randi_range(0,KINDS.size()-1)]
			var source=sources.get(kind)
			if not source is MeshInstance3D:continue
			var size=rng.randf_range(.8,1.35);var yaw=rng.randf_range(0,TAU)
			# Fit each root footprint to the dune slope. Buried mesh bases absorb
			# the remaining curvature; small props do not hover on a central point.
			var dx=(MMFDunes.height_at(world_x+.5,world_z)-MMFDunes.height_at(world_x-.5,world_z))
			var dz=(MMFDunes.height_at(world_x,world_z+.5)-MMFDunes.height_at(world_x,world_z-.5))
			var up=Vector3(-dx,1,-dz).normalized()
			var basis=Basis(Quaternion(Vector3.UP,up))*Basis(Vector3.UP,yaw)
			var transform=Transform3D(basis.scaled(Vector3.ONE*size),Vector3(x,ground-.045,z))
			if not batches.has(kind):batches[kind]=[]
			batches[kind].append([transform,rng.randf(),Vector2(world_x,world_z)])
			occupied.append(clearance);sites.append(Vector3(x,ground,z))
	for kind in batches:
		var entries=batches[kind];var batch=MultiMeshInstance3D.new();var multi=MultiMesh.new()
		multi.transform_format=MultiMesh.TRANSFORM_3D;multi.use_custom_data=true;multi.mesh=sources[kind].mesh;multi.instance_count=entries.size()
		for i in entries.size():
			multi.set_instance_transform(i,entries[i][0]);multi.set_instance_custom_data(i,Color(entries[i][1],0,0,1))
		batch.name=kind;batch.multimesh=multi;batch.visibility_range_end=160;batch.extra_cull_margin=.15
		batch.material_override=brush_material if kind in ["DryBrushA","DryBrushB","WindTuft","RootSnag"] else stone_material
		# Small ground details are already shaded by the world; prevent each tuft
		# adding cascaded shadow passes over a wide desert view.
		batch.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		batch.set_meta("ground_sites",entries);group.add_child(batch)
	if band==0 and not sites.is_empty():add_drift(group,sites[0],index)

func add_drift(parent: Node3D,site: Vector3,index: int):
	var vertices=PackedVector3Array();var uvs=PackedVector2Array();var normals=PackedVector3Array();var indices=PackedInt32Array()
	for z in 5:
		for x in 13:
			var p=Vector3(site.x+(x/12.0-.5)*18,0,site.z+(z/4.0-.5)*5)
			p.y=MMFDunes.height_at(p.x,p.z+index*64)+.16
			vertices.append(p);uvs.append(Vector2(x/12.0,z/4.0));normals.append(Vector3.UP)
	for z in 4:
		for x in 12:
			var n=z*13+x;indices.append_array(PackedInt32Array([n,n+1,n+13,n+1,n+14,n+13]))
	var arrays=[];arrays.resize(Mesh.ARRAY_MAX);arrays[Mesh.ARRAY_VERTEX]=vertices;arrays[Mesh.ARRAY_NORMAL]=normals;arrays[Mesh.ARRAY_TEX_UV]=uvs;arrays[Mesh.ARRAY_INDEX]=indices
	var mesh=ArrayMesh.new();mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	var sheet=MeshInstance3D.new();sheet.name="LowSandDrift";sheet.mesh=mesh;sheet.material_override=drift_material
	sheet.set_instance_shader_parameter("phase",float(posmod(index*17,97)))
	sheet.visibility_range_end=125;sheet.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(sheet)

func clear():
	if is_instance_valid(kit):kit.free()
