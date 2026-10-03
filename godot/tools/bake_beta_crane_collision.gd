extends SceneTree

# Offline authoring only: identify the named frozen crane inside the shared
# concave collision batch. Runtime uses the resulting hash-checked ranges.
const CELL=.032
const VERTEX_TOLERANCE=.016
const SURFACE_TOLERANCE=.025
var cells={}
var space

func _initialize():call_deferred("run")

func key(point: Vector3) -> Vector3i:
	return Vector3i(roundi(point.x/CELL),roundi(point.y/CELL),roundi(point.z/CELL))

func matches(point: Vector3) -> bool:
	var cell=key(point)
	for x in range(-1,2):
		for y in range(-1,2):
			for z in range(-1,2):
				for candidate in cells.get(cell+Vector3i(x,y,z),[]):
					if candidate.distance_squared_to(point)<VERTEX_TOLERANCE*VERTEX_TOLERANCE:return true
	# Visual mesh quantization/retessellation can remove original cylinder
	# vertices. Surface probes still match that authored part, at 2.5 cm max.
	for axis in [Vector3.RIGHT,Vector3.UP,Vector3.BACK]:
		if not space.intersect_ray(PhysicsRayQueryParameters3D.create(point+axis*SURFACE_TOLERANCE,point-axis*SURFACE_TOLERANCE,16)).is_empty():return true
	return false

func run():
	var assembly=load("res://art/nomad-native.scn").instantiate();root.add_child(assembly)
	var crane=MMFAssets.find_named(assembly,"CargoCrane_Yaw")
	var collider=MMFAssets.find_named(assembly,"NativeWorkshopCollision").get_child(0)
	var bounds=(crane.global_transform*MMFAssets.bounds(crane)).grow(.005)
	var visual_physics=Node3D.new();root.add_child(visual_physics)
	for mesh in MMFAssets.of_type(crane,"MeshInstance3D"):
		var body=StaticBody3D.new();visual_physics.add_child(body);body.collision_layer=16;body.collision_mask=0;body.global_transform=mesh.global_transform
		var shape=CollisionShape3D.new();shape.shape=mesh.mesh.create_trimesh_shape();shape.shape.backface_collision=true;body.add_child(shape)
		for point in mesh.mesh.get_faces():
			point=collider.to_local(mesh.to_global(point))
			var cell=key(point)
			if not cells.has(cell):cells[cell]=[]
			if not cells[cell].has(point):cells[cell].append(point)
	for i in 3:await physics_frame
	space=assembly.get_world_3d().direct_space_state
	var faces=collider.shape.get_faces();var candidates={};var linked={};var seeds={}
	for base in range(0,faces.size(),3):
		if not [0,1,2].all(func(i):return bounds.has_point(collider.to_global(faces[base+i]))):continue
		candidates[base]=true
		for i in 3:
			var point=faces[base+i]
			if not linked.has(point):linked[point]=[]
			linked[point].append(base)
		if [0,1,2].all(func(i):return matches(faces[base+i])):seeds[base]=true
	# Complete each independently connected matched component. This recovers
	# rounded cylinder caps despite the visual/export tessellation difference.
	# Nearby unconnected deck/rail triangles never acquire a matching seed.
	var visited={};var removed={}
	for base in candidates:
		if visited.has(base):continue
		var pending=[base];var group=[];var has_seed=false;visited[base]=true
		while not pending.is_empty():
			var at=pending.pop_back();group.append(at);has_seed=has_seed or seeds.has(at)
			for i in 3:
				for neighbor in linked[faces[at+i]]:
					if not visited.has(neighbor):visited[neighbor]=true;pending.append(neighbor)
		if has_seed:
			for at in group:removed[at]=true
	var ranges=[];var begin=-1
	for base in range(0,faces.size(),3):
		if removed.has(base):
			if begin<0:begin=base
		elif begin>=0:ranges.append([begin,base]);begin=-1
	if begin>=0:ranges.append([begin,faces.size()])
	assert(not ranges.is_empty(),"Named crane did not match the compiled collision source")
	var hash=HashingContext.new();hash.start(HashingContext.HASH_SHA256);hash.update(faces.to_byte_array())
	var manifest={"source":"NativeWorkshopCollision","faceVertexCount":faces.size(),"facesSha256":hash.finish().hex_encode(),"vertexToleranceM":VERTEX_TOLERANCE,"surfaceToleranceM":SURFACE_TOLERANCE,"removedTriangles":removed.size(),"candidateTriangles":candidates.size(),"removedRanges":ranges}
	var file=FileAccess.open("res://art/beta-crane-collision.json",FileAccess.WRITE);file.store_string(JSON.stringify(manifest,"\t"));file.close();print("BETA_CRANE_COLLISION_BAKED ",JSON.stringify(manifest))
	assembly.queue_free();visual_physics.queue_free();await process_frame;MMFAssets.cache.clear();quit()
