class_name MMFSceneryChunk
extends RefCounted

# Build the unchanged scenery contract in small, resumable pieces. The root
# stays outside the scene tree until the complete chunk becomes active.
const SCATTER=[["rocks","rock",11,0.8,3.4,-1,0.25],["slabs","slab",4,1.2,3.0,-1,0.25],["debris","debris",3,0.5,1.4,-1,0.25],["scrap","scrap",2,0.7,1.8,-1,0.25],["scrub","scrub",1,0.55,1.35,-1,0.25],["nearField","near",22,0.35,1.1,-1,0.25],["wreck-wreck","wreck-wreck",1,9,17,0.34,0.26],["wreck-containers","wreck-containers",3,4,7.5,0.26,0.16],["wreck-debris","wreck-debris",5,1.6,3.4,0.2,0.3]]
var world
var key: Vector2i
var root=Node3D.new()
var seed_name: String
var placements: Array
var clearance_bounds: Array=[]
var phase=0
var complete=false

func _init(owner_world,chunk_key: Vector2i):
	world=owner_world;key=chunk_key
	seed_name=world.game.session.seed_name if key.y==0 else world.game.session.seed_name+":x-band:"+str(key.y)
	placements=world.layout.generate(seed_name,key.x)

func step() -> bool:
	if complete:return true
	if phase<placements.size():
		landmark(placements[phase])
	elif phase<placements.size()+SCATTER.size():
		scatter(SCATTER[phase-placements.size()])
	elif phase==placements.size()+SCATTER.size():
		world.atmosphere.place(root,seed_name,key.x,key.y,clearance_bounds)
	else:
		world.atmosphere.desert_life.place(root,seed_name,key.x,key.y,clearance_bounds);complete=true
	phase+=1
	return complete

func finish() -> Node3D:
	while not complete:step()
	return root

func landmark(p: Dictionary):
	if not world.prototypes.has(p.kind):return
	var original: MeshInstance3D=world.prototypes[p.kind]
	var part=original.duplicate();var b=original.get_aabb()
	var size=p.width/maxf(maxf(b.size.x,b.size.z),0.01)
	part.scale=Vector3.ONE*size;part.rotation_order=EULER_ORDER_XYZ
	part.rotation=Vector3(0,p.yaw,p.tilt)
	var site_x=key.y*256+p.x;var site_z=key.x*64+p.z
	var ground=MMFDunes.height_at(site_x,site_z);var half=p.width*0.32
	for dx in [-half,half]:
		for dz in [-half,half]:ground=minf(ground,MMFDunes.height_at(site_x+dx,site_z+dz))
	part.position=Vector3(p.x,ground-b.size.y*size*p.burial,p.z)-part.basis*Vector3(b.get_center().x,b.position.y,b.get_center().z)
	part.visibility_range_end=620;root.add_child(part)
	clearance_bounds.append(part.transform*b)

func scatter(spec: Array):
	var source=world.scatter_prototypes.get(spec[0])
	if not source:return
	var transforms=MMFDesertLayout.scatter(seed_name,key.x,key.y,spec[1],spec[2],spec[3],spec[4],spec[5],spec[6])
	var batch=MultiMeshInstance3D.new();var multimesh=MultiMesh.new()
	multimesh.transform_format=MultiMesh.TRANSFORM_3D;multimesh.mesh=source.mesh;multimesh.instance_count=transforms.size()
	for i in transforms.size():multimesh.set_instance_transform(i,transforms[i])
	var bounds=source.mesh.get_aabb()
	for transform in transforms:clearance_bounds.append(transform*bounds)
	batch.multimesh=multimesh;batch.visibility_range_end=620
	if spec[0] not in ["rocks","slabs","wreck-wreck"]:batch.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(batch)
