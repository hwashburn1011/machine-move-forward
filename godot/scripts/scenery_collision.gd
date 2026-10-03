class_name MMFSceneryCollision
extends RefCounted

# Exact triangle chunks retain openings while bounding first-use physics work.
const ENTER_DISTANCE=72.0
const LEAVE_DISTANCE=96.0
const URGENT_DISTANCE=3.0
const CACHE_LIMIT=32
const BAKED_MANIFEST="res://data/scenery-collision.json"
var world
var elapsed=.25
var pending: Array=[]
var shapes={}
var order: Array=[]
var baked_models={}
var loading_path=""
var loading_kind=""
var loading_index=-1
var loading_failures={}
var requests_started=0
var requests_collected=0
var active_part: WeakRef
var working_kind=""
var working_shapes: Array=[]
var last_scan_position=Vector3.INF

func setup(owner_world):
	world=owner_world
	if FileAccess.file_exists(BAKED_MANIFEST):baked_models=MMFAssets.json(BAKED_MANIFEST).get("models",{})

func chunks_for(kind: String) -> Array:return baked_models.get(kind,{}).get("chunks",[])

func shape_for(part: MeshInstance3D,_kind: String) -> ConcavePolygonShape3D:
	# Future/unbaked models retain their exact immediate fallback.
	var shape=part.mesh.create_trimesh_shape();shape.backface_collision=true
	return shape

func cache_shape(kind: String,complete: Array):
	if not shapes.has(kind):order.append(kind)
	shapes[kind]=complete.duplicate()
	if order.size()>CACHE_LIMIT:shapes.erase(order.pop_front())

func loading_status() -> int:return ResourceLoader.load_threaded_get_status(loading_path)

func collect_shape(keep: bool=true):
	if loading_path=="":return
	# Exactly one get for this controller's accepted request. Normal updates only
	# collect terminal status; explicit immediate calls and clear may join work.
	var shape=ResourceLoader.load_threaded_get(loading_path)
	var kind=loading_kind;var index=loading_index
	loading_path="";loading_kind="";loading_index=-1;requests_collected+=1
	if not keep:return
	if shape is ConcavePolygonShape3D and kind==working_kind and index==working_shapes.size():working_shapes.append(shape)
	else:loading_failures[kind+":"+str(index)]=true

func request_shape(kind: String,index: int=0) -> bool:
	var chunks=chunks_for(kind)
	if index>=chunks.size() or loading_failures.has(kind+":"+str(index)):return false
	if loading_path!="":return true
	var path=String(chunks[index].path)
	if not ResourceLoader.exists(path):return false
	if ResourceLoader.load_threaded_request(path,"ConcavePolygonShape3D")==OK:
		loading_path=path;loading_kind=kind;loading_index=index;requests_started+=1;return true
	loading_failures[kind+":"+str(index)]=true
	return false

func distance_to(part: MeshInstance3D) -> float:
	var at=world.game.player.global_position;var bounds=part.global_transform*part.get_aabb()
	return at.distance_to(at.clamp(bounds.position,bounds.end))

func is_complete(part: MeshInstance3D) -> bool:
	var body=part.get_node_or_null("LandmarkCollision")
	return body!=null and not body.is_queued_for_deletion() and body.get_meta("collision_complete",false)

func body_for(part: MeshInstance3D) -> StaticBody3D:
	var body=part.get_node_or_null("LandmarkCollision")
	if not body:
		body=StaticBody3D.new();body.name="LandmarkCollision"
		body.collision_layer=1;body.collision_mask=0
		body.set_meta("landmark_kind",part.get_meta("landmark_kind",""));body.set_meta("collision_complete",false)
		part.add_child(body)
	return body

func reset_work():active_part=null;working_kind="";working_shapes=[]

func begin_part(part: MeshInstance3D):
	active_part=weakref(part);working_kind=String(part.get_meta("landmark_kind",""));working_shapes=[]
	if shapes.has(working_kind):working_shapes=shapes[working_kind].duplicate()
	else:
		var body=part.get_node_or_null("LandmarkCollision")
		if body:
			for child in body.get_children():working_shapes.append(child.shape)

func install_chunk(part: MeshInstance3D,shape: ConcavePolygonShape3D,index: int,total: int):
	var body=body_for(part)
	var collider=CollisionShape3D.new();collider.name="TriangleChunk%03d"%index;collider.shape=shape
	body.add_child(collider)
	if index+1==total:body.set_meta("collision_complete",true)

func attach(part: MeshInstance3D):
	# Immediate explicit callers, tests and teleports within 3 m require complete
	# collision now. Ordinary travel uses only the bounded staged path below.
	if is_complete(part):return
	if loading_path!="":collect_shape()
	var kind=String(part.get_meta("landmark_kind",""));var complete: Array=[]
	if shapes.has(kind):complete=shapes[kind].duplicate()
	elif working_kind==kind:complete=working_shapes.duplicate()
	else:
		var existing=part.get_node_or_null("LandmarkCollision")
		if existing:
			for child in existing.get_children():complete.append(child.shape)
	var chunks=chunks_for(kind)
	if chunks.is_empty():
		if complete.is_empty():complete.append(shape_for(part,kind))
	else:
		for index in range(complete.size(),chunks.size()):complete.append(load(chunks[index].path))
	cache_shape(kind,complete)
	var body=body_for(part)
	for index in range(body.get_child_count(),complete.size()):install_chunk(part,complete[index],index,complete.size())
	body.set_meta("collision_complete",true)
	if active_part and active_part.get_ref()==part:reset_work()

func scan():
	elapsed=0;pending.clear();last_scan_position=world.game.player.global_position
	for chunk in world.chunks.values():
		for part in chunk.get_children():
			if not part is MeshInstance3D or not part.has_meta("landmark_kind"):continue
			var distance=distance_to(part);var body=part.get_node_or_null("LandmarkCollision")
			if body and distance>LEAVE_DISTANCE:body.queue_free()
			elif distance<ENTER_DISTANCE and not is_complete(part) and (not body or not body.is_queued_for_deletion()):pending.append(weakref(part))
	pending.sort_custom(func(a,b):return distance_to(a.get_ref())<distance_to(b.get_ref()))

func active_is_near() -> bool:
	var part=active_part.get_ref() if active_part else null
	return is_instance_valid(part) and part.is_inside_tree() and distance_to(part)<ENTER_DISTANCE

func update(dt: float):
	elapsed+=dt
	if elapsed>=.25 or world.game.player.global_position.distance_to(last_scan_position)>URGENT_DISTANCE:scan()
	# A teleport cannot leave an unfinished nearby surface passable. This is the
	# explicit safety exception to the ordinary one-chunk-per-tick limit.
	for reference in pending:
		var urgent=reference.get_ref()
		if is_instance_valid(urgent) and urgent.is_inside_tree() and not is_complete(urgent) and distance_to(urgent)<URGENT_DISTANCE:
			attach(urgent);return
	if active_is_near() and distance_to(active_part.get_ref())<URGENT_DISTANCE:
		attach(active_part.get_ref());return
	if loading_path!="":
		if loading_status()==ResourceLoader.THREAD_LOAD_IN_PROGRESS:return
		var keep=active_is_near();collect_shape(keep)
		if not keep:reset_work();return
		# Collection and activation refer to this one newly completed chunk.
		advance_part(false);return
	if not active_is_near():reset_work()
	if not active_part:
		while not pending.is_empty():
			var part=pending.pop_front().get_ref()
			if not is_instance_valid(part) or not part.is_inside_tree() or is_complete(part) or distance_to(part)>=ENTER_DISTANCE:continue
			begin_part(part);break
	if active_part:advance_part(true)

func advance_part(may_request: bool):
	var part=active_part.get_ref();var chunks=chunks_for(working_kind)
	var body=part.get_node_or_null("LandmarkCollision");var index=body.get_child_count() if body else 0
	var total=chunks.size() if not chunks.is_empty() else 1
	if index<working_shapes.size():
		install_chunk(part,working_shapes[index],index,total)
		if index+1==total:cache_shape(working_kind,working_shapes);reset_work()
		return
	if not may_request:return
	if request_shape(working_kind,index):return
	# Only an unbaked future model or damaged/missing resource reaches here.
	# Keep its physical safety; all shipped prototypes take the bounded path.
	attach(part)

func clear():
	if loading_path!="":collect_shape(false)
	reset_work();pending.clear();shapes.clear();order.clear();baked_models.clear();loading_failures.clear();world=null
