class_name MMFConstructionAccess
extends RefCounted

# Half-metre standing samples use the real capsule and physical deck support.
# Baseline graphs are rebuilt only after a layout change. Candidate components
# are cached separately, so idle preview and player movement never rebuild them.
const STEP=.5
const FOOT_LIFT=.065
const RADIUS=.34
const HEIGHT=1.92
const MAX_IGNORED_CONTEXTS=2
var owner_reference: WeakRef
var builder:
	get:return owner_reference.get_ref() if owner_reference else null
var revision=-1
var graphs={}
var candidates={}
var support_cache={}
var obstacle_cache={}
var excluded_key=""
var excluded: Array[RID]=[]
var graph_builds=0
var candidate_builds=0
var last_graph_ms=0.0
var last_candidate_ms=0.0
var pending=[]
var queued={}
var last_work_ms=0.0
var ignored_contexts=[]

func setup(value):owner_reference=weakref(value)

func invalidate():
	revision=-1;graphs.clear();candidates.clear();support_cache.clear();obstacle_cache.clear();excluded_key="";pending.clear();queued.clear();ignored_contexts.clear()

func release_context(ignore_id: String):
	if ignore_id=="":return
	ignored_contexts.erase(ignore_id)
	for key in graphs.keys():
		if key.get_slice(":",1)==ignore_id:graphs.erase(key)
	for key in candidates.keys():
		if key.get_slice(":",1)==ignore_id:candidates.erase(key)
	for key in queued.keys():
		if key.get_slice(":",1)==ignore_id:queued.erase(key)
	pending=pending.filter(func(task):return task.ignore!=ignore_id)

func retain_context(ignore_id: String):
	# Base graphs remain reusable. At most two ignored-piece sets coexist:
	# current preview and a safe-undo/dismantle probe. Eviction drops candidate
	# references and unfinished physics work as well as the finished graph.
	if ignore_id=="":return
	ignored_contexts.erase(ignore_id);ignored_contexts.append(ignore_id)
	while ignored_contexts.size()>MAX_IGNORED_CONTEXTS:release_context(ignored_contexts.front())

func refresh():
	if revision==builder.layout_revision:return
	invalidate();revision=builder.layout_revision

func piece_exclusions(ignore_id: String="",all: bool=false) -> Array[RID]:
	var key=str(builder.layout_revision)+":"+ignore_id+":"+str(all)
	if key==excluded_key:return excluded
	excluded=[]
	var ignored=ignore_id.split("|")
	for id in builder.bodies:
		if not all and id not in ignored:continue
		for body in MMFAssets.of_type(builder.bodies[id],"CollisionObject3D"):
			excluded.append(body.get_rid())
	excluded_key=key
	return excluded

func permanent_support(cell: Dictionary) -> bool:
	if not builder.hull_support(cell):return false
	refresh()
	var key=MMFHome.key(cell)
	if support_cache.has(key):return support_cache[key]
	var at=builder.center(cell);var space=builder.get_world_3d().direct_space_state
	var skip=piece_exclusions("",true)
	var supported=true
	for delta in [Vector3.ZERO,Vector3(-.86,0,-.86),Vector3(.86,0,-.86),Vector3(-.86,0,.86),Vector3(.86,0,.86)]:
		var query=PhysicsRayQueryParameters3D.create(at+delta+Vector3.UP*.18,at+delta-Vector3.UP*.22,1,skip)
		var hit=space.intersect_ray(query)
		if hit.is_empty() or hit.normal.y<.7 or not builder.game.world.is_ancestor_of(hit.collider):supported=false;break
	support_cache[key]=supported
	return supported

func fixed_obstacle(cell: Dictionary) -> bool:
	refresh()
	var key=MMFHome.key(cell)
	if obstacle_cache.has(key):return obstacle_cache[key]
	var shape=BoxShape3D.new();shape.size=Vector3(1.30,1.8,1.30)
	var query=PhysicsShapeQueryParameters3D.new();query.shape=shape;query.transform=Transform3D(Basis.IDENTITY,builder.center(cell)+Vector3.UP*1.02);query.collision_mask=1;query.exclude=piece_exclusions("",true)
	var result=not builder.get_world_3d().direct_space_state.intersect_shape(query,1).is_empty()
	obstacle_cache[key]=result
	return result

func collider_boxes(spec: Dictionary) -> Array:
	var result=[];var transform_value=builder.piece_transform(spec)
	for part in MMFMachineSpaces.piece_colliders(spec,builder.game.runtime):
		var half=MMFAssets.v(part.half)
		var pose=transform_value*Transform3D(Basis(Vector3.RIGHT,float(part.get("rotX",0))),MMFAssets.v(part.offset))
		result.append({"transform":pose,"inverse":pose.affine_inverse(),"box":AABB(-half,half*2),"world":pose*AABB(-half,half*2)})
	return result

func standing_blocked(at: Vector3,solids: Array) -> bool:
	# A capsule's vertical centre segment swept by its radius. The expanded
	# oriented box is conservative at corners, but keeps doorway openings open.
	for part in solids:
		var a=part.inverse*(at+Vector3.UP*(RADIUS+FOOT_LIFT))
		var b=part.inverse*(at+Vector3.UP*(HEIGHT-RADIUS+FOOT_LIFT))
		var grown=part.box.grow(RADIUS)
		if grown.has_point(a) or grown.has_point(b) or grown.intersects_segment(a,b)!=null:return true
	return false

func solid_intersects(solids: Array,region: AABB) -> bool:
	for part in solids:
		if part.world.intersects(region):return true
	return false

func drone_volume(spec: Dictionary) -> AABB:
	var at=builder.piece_transform(spec).origin
	var cargo=builder.game.salvage.crate_bounds
	# home=.60, held drone=home+1.75, crate centre offset=-.90.
	# The loaded landing volume is larger than the dock's own .76m half-width.
	var half=Vector2(maxf(.91,maxf(absf(cargo.position.x),absf(cargo.end.x))+.08),maxf(.78,maxf(absf(cargo.position.z),absf(cargo.end.z))+.08))
	var bottom=minf(.40,1.45+cargo.position.y-.06)
	var top=maxf(4.0,1.45+cargo.end.y+.08)
	return AABB(at+Vector3(-half.x,bottom,-half.y),Vector3(half.x*2,top-bottom,half.y*2))

func crane_volume(spec: Dictionary) -> AABB:
	# Outboard hoist/held-load envelope. The actual long ground approach keeps
	# its raycast; this reserves the final cargo-sized landing/working space.
	var cargo=builder.game.salvage.heavy_bounds
	var half_x=maxf(absf(cargo.position.x),absf(cargo.end.x))+.10
	var half_z=maxf(absf(cargo.position.z),absf(cargo.end.z))+.10
	var at=builder.piece_transform(spec)*MMFMachineSpaces.crane_tip_local(spec)
	var bottom=-.70+cargo.position.y-.08
	var top=maxf(1.75,-.70+cargo.end.y+.08)
	return AABB(at+Vector3(-half_x,bottom,-half_z),Vector3(half_x*2,top-bottom,half_z*2))

func reservations(spec: Dictionary,ignore_id: String="",legacy_return: bool=false) -> String:
	var solids=collider_boxes(spec)
	for entry in MMFMachineSpaces.data().get("protectedVolumes",[]):
		if solid_intersects(solids,MMFMachineSpaces.box(entry)):return "Keep "+entry.name+" clear."
	for id in MMFMachineSpaces.data().get("bays",{}):
		if spec.definitionId==id or legacy_return:continue
		var entry=MMFMachineSpaces.bay(id)
		if solid_intersects(solids,MMFMachineSpaces.box(entry.reserved)):return "Reserved for the "+entry.name+" connection."
	for p in builder.game.session.structures:
		if p.instanceId==ignore_id:continue
		if MMFMachineSpaces.deployed_crane(p) and solid_intersects(solids,crane_volume(p)):
			return "Keep the heavy crane's outboard hoist and held-cargo space clear."
		if p.definitionId=="collector-auto" and solid_intersects(solids,drone_volume(p)):
			return "Keep the drone launch and held-cargo landing space clear."
		if p.definitionId=="stairs" and spec.definitionId not in ["floor","rug","lamp"]:
			var bounds=builder.piece_transform(p)*builder.build_preview.local_bounds("stairs")
			bounds.position.y+=.12;bounds.size.y+=HEIGHT-.12
			if solid_intersects(solids,bounds.grow(.15)):return "Keep the stair run and landings clear."
	if spec.definitionId=="collector-auto":
		var volume=drone_volume(spec);var shape=BoxShape3D.new();shape.size=volume.size
		var query=PhysicsShapeQueryParameters3D.new();query.shape=shape;query.transform=Transform3D(Basis.IDENTITY,volume.get_center());query.collision_mask=1
		query.exclude=piece_exclusions(ignore_id)
		if not builder.get_world_3d().direct_space_state.intersect_shape(query,1).is_empty():return "Drone dock needs open sky and room for its held cargo."
		for p in builder.game.session.structures:
			if p.instanceId!=ignore_id and p.definitionId=="collector-auto" and volume.intersects(drone_volume(p)):return "Leave separate landing space for each drone's held cargo."
	if MMFMachineSpaces.deployed_crane(spec):
		var volume=crane_volume(spec);var shape=BoxShape3D.new();shape.size=volume.size
		var query=PhysicsShapeQueryParameters3D.new();query.shape=shape;query.transform=Transform3D(Basis.IDENTITY,volume.get_center());query.collision_mask=1
		query.exclude=piece_exclusions(ignore_id)
		if not builder.get_world_3d().direct_space_state.intersect_shape(query,1).is_empty():return "Clear the heavy crane's outboard hoist and held-cargo space."
	if not legacy_return:
		var entry=MMFMachineSpaces.bay(spec.definitionId)
		if not entry.is_empty():
			var at=MMFMachineSpaces.vector(entry.service)
			if absf(builder.game.player.position.y-at.y)>1.4 or builder.game.player.position.distance_to(at)>3.4:return "Approach the "+entry.name+" service position on the "+entry.deckName+"."
	return ""

func label_components(points: Dictionary,blocked: Dictionary={}) -> Dictionary:
	var labels={};var next=0
	for first in points:
		if labels.has(first) or blocked.has(first):continue
		next+=1;var queue=[first];var cursor=0;labels[first]=next
		while cursor<queue.size():
			var key=queue[cursor];cursor+=1
			for delta in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
				var neighbor=key+delta
				if points.has(neighbor) and not labels.has(neighbor) and not blocked.has(neighbor):labels[neighbor]=next;queue.append(neighbor)
	return labels

func graph(level: int,ignore_id: String="") -> Dictionary:
	refresh()
	retain_context(ignore_id)
	var key=str(level)+":"+ignore_id
	if graphs.has(key):return graphs[key]
	if queued.has(key):return {"pending":true}
	var samples={}
	if level in [-2,-1,0]:
		for x in range(-30,27):
			for z in range(-30,31):samples[Vector2i(x,z)]=true
	for p in builder.game.session.structures:
		if p.instanceId in ignore_id.split("|") or p.definitionId!="floor" or int(p.cell.y)!=level:continue
		for x in range(int(p.cell.x)*4-2,int(p.cell.x)*4+3):
			for z in range(int(p.cell.z)*4-2,int(p.cell.z)*4+3):samples[Vector2i(x,z)]=true
	var task={"key":key,"level":level,"ignore":ignore_id,"samples":samples.keys(),"points":{},"cursor":0,"work_us":0,"ports":MMFMachineSpaces.fixed_ports(level)}
	for p in builder.game.session.structures:
		if p.instanceId in ignore_id.split("|"):continue
		if p.definitionId=="stairs":
			var cells=builder.stair_cells(p)
			for name in ["base","landing"]:
				if int(cells[name].y)==level:task.ports.append({"name":"built stair "+name,"at":builder.center(cells[name]),"radius":1.7})
		elif int(p.cell.y)==level and builder.game.data.BUILD_PIECES[p.definitionId].category=="station":task.ports.append({"name":builder.game.data.BUILD_PIECES[p.definitionId].name,"at":builder.center(p.cell),"radius":2.15})
	pending.append(task);queued[key]=true
	return {"pending":true}

func advance_budget(milliseconds: float=4.0):
	if pending.is_empty():return
	refresh()
	if pending.is_empty():return
	var started=Time.get_ticks_usec();var deadline=started+int(milliseconds*1000)
	var task=pending[0];var level=int(task.level)
	var space=builder.get_world_3d().direct_space_state;var skip=piece_exclusions(task.ignore)
	var capsule=CapsuleShape3D.new();capsule.radius=RADIUS;capsule.height=HEIGHT
	while task.cursor<task.samples.size() and Time.get_ticks_usec()<deadline:
		var cell=task.samples[task.cursor];task.cursor+=1
		var at=Vector3(cell.x*STEP,MMFMachineSpaces.deck_y(level),cell.y*STEP)
		var ray=PhysicsRayQueryParameters3D.create(at+Vector3.UP*.18,at-Vector3.UP*.23,1,skip)
		var support=space.intersect_ray(ray)
		if support.is_empty() or support.normal.y<.7 or builder.game.player.boundary.support_root(support.collider)!=builder.game:continue
		var query=PhysicsShapeQueryParameters3D.new();query.shape=capsule;query.transform=Transform3D(Basis.IDENTITY,at+Vector3.UP*(HEIGHT*.5+FOOT_LIFT));query.collision_mask=1;query.exclude=skip;query.margin=.001
		if space.intersect_shape(query,1).is_empty():task.points[cell]=at
	if task.cursor>=task.samples.size():
		graphs[task.key]={"points":task.points,"labels":label_components(task.points),"ports":task.ports}
		queued.erase(task.key);pending.pop_front();graph_builds+=1
	task.work_us+=Time.get_ticks_usec()-started
	last_graph_ms=task.work_us/1000.0;last_work_ms=(Time.get_ticks_usec()-started)/1000.0

func port_labels(port: Dictionary,points: Dictionary,labels: Dictionary) -> Dictionary:
	var result={}
	var origin=Vector2i(roundi(port.at.x/STEP),roundi(port.at.z/STEP));var steps=ceili(float(port.radius)/STEP)
	for x in range(origin.x-steps,origin.x+steps+1):
		for z in range(origin.y-steps,origin.y+steps+1):
			var key=Vector2i(x,z)
			if labels.has(key) and Vector2(points[key].x-port.at.x,points[key].z-port.at.z).length()<=port.radius:result[labels[key]]=true
	return result

func intersects_keys(a: Dictionary,b: Dictionary) -> bool:
	for key in a:
		if b.has(key):return true
	return false

func candidate_graph(spec: Dictionary,ignore_id: String,level: int) -> Dictionary:
	var base=graph(level,ignore_id)
	if base.get("pending",false):return base
	var key=str(level)+":"+ignore_id+":"+str(hash(spec))
	if candidates.has(key):return candidates[key]
	var started=Time.get_ticks_usec();var solids=collider_boxes(spec);var blocked={}
	for cell in base.points:
		if standing_blocked(base.points[cell],solids):blocked[cell]=true
	var labels=base.labels if blocked.is_empty() else label_components(base.points,blocked)
	var result={"base":base,"labels":labels,"blocked":blocked,"ports":[],"solids":solids}
	for port in base.ports:
		result.ports.append({"name":port.name,"before":port_labels(port,base.points,base.labels),"after":port_labels(port,base.points,labels)})
	if candidates.size()>=96:candidates.clear()
	candidates[key]=result;candidate_builds+=1;last_candidate_ms=(Time.get_ticks_usec()-started)/1000.0
	return result

func connectivity(spec: Dictionary,ignore_id: String="") -> String:
	var solids=collider_boxes(spec)
	for level in range(-2,3):
		var low=MMFMachineSpaces.deck_y(level)+FOOT_LIFT
		if not solids.any(func(part):return part.world.end.y>low and part.world.position.y<low+HEIGHT):continue
		var graph_value=candidate_graph(spec,ignore_id,level)
		if graph_value.get("pending",false):return "Checking walking access…"
		if graph_value.blocked.is_empty():continue
		# Compare connectivity before and after, rather than invalidating already
		# partitioned old saves. A doorway is valid if the remaining path survives.
		for i in graph_value.ports.size():
			var a=graph_value.ports[i]
			if not a.before.is_empty() and a.after.is_empty():return "Keep walking access to "+a.name+"."
			for j in range(i+1,graph_value.ports.size()):
				var b=graph_value.ports[j]
				if intersects_keys(a.before,b.before) and not intersects_keys(a.after,b.after):return "Keep a walking route between "+a.name+" and "+b.name+"."
		var player=builder.game.player.position
		if absf(player.y-MMFMachineSpaces.deck_y(level))>1.0:continue
		var port={"at":player,"radius":.9}
		var before=port_labels(port,graph_value.base.points,graph_value.base.labels)
		var after=port_labels(port,graph_value.base.points,graph_value.labels)
		for route in graph_value.ports:
			if intersects_keys(before,route.before) and not intersects_keys(after,route.after):return "This would seal your last walking exit. Leave a doorway or aisle."
	return ""

func link_components(adjacency: Dictionary,a: Dictionary,b: Dictionary,level_a: int,level_b: int):
	for label_a in a:
		var key_a=Vector2i(level_a,label_a)
		if not adjacency.has(key_a):adjacency[key_a]=[]
		for label_b in b:
			var key_b=Vector2i(level_b,label_b)
			if not adjacency.has(key_b):adjacency[key_b]=[]
			if key_b not in adjacency[key_a]:adjacency[key_a].append(key_b)
			if key_a not in adjacency[key_b]:adjacency[key_b].append(key_a)

func network_ports(levels: Dictionary,ignored: Array) -> Dictionary:
	var adjacency={};var targets={}
	for level in levels:
		var value=levels[level]
		for port in MMFMachineSpaces.fixed_ports(level):
			var labels=port_labels(port,value.points,value.labels)
			targets[str(level)+":"+port.name]=[]
			for label in labels:targets[str(level)+":"+port.name].append(Vector2i(level,label))
	for level in [-2,-1]:
		for x in [-2.0,-12.0]:
			var a={"at":Vector3(x,MMFMachineSpaces.deck_y(level),-3.7 if x==-2 else -4.0),"radius":1.05}
			var b={"at":Vector3(x,MMFMachineSpaces.deck_y(level+1),3.7 if x==-2 else 4.0),"radius":1.05}
			link_components(adjacency,port_labels(a,levels[level].points,levels[level].labels),port_labels(b,levels[level+1].points,levels[level+1].labels),level,level+1)
	for p in builder.game.session.structures:
		if p.instanceId in ignored or p.definitionId!="stairs":continue
		var cells=builder.stair_cells(p);var lower=int(cells.base.y);var upper=int(cells.landing.y)
		if not levels.has(lower) or not levels.has(upper):continue
		var a={"at":builder.center(cells.base),"radius":1.7};var b={"at":builder.center(cells.landing),"radius":1.7}
		link_components(adjacency,port_labels(a,levels[lower].points,levels[lower].labels),port_labels(b,levels[upper].points,levels[upper].labels),lower,upper)
	var player=builder.game.player.position;var level=clampi(roundi((player.y-16.03)/3.6),-2,2)
	var seeds=port_labels({"at":player,"radius":.9},levels[level].points,levels[level].labels)
	var seen={};var queue=[];var cursor=0
	for label in seeds:var key=Vector2i(level,label);seen[key]=true;queue.append(key)
	while cursor<queue.size():
		var key=queue[cursor];cursor+=1
		for next in adjacency.get(key,[]):
			if not seen.has(next):seen[next]=true;queue.append(next)
	var reachable={}
	for name in targets:
		if targets[name].any(func(key):return seen.has(key)):reachable[name]=true
	return reachable

func removal(doomed: Array) -> String:
	var structural=false
	for id in doomed:
		if builder.game.session.find_piece(id).get("definitionId","") in ["floor","stairs","boarding-extension"]:structural=true
	if not structural:return ""
	var ids=doomed.duplicate();ids.sort();var ignore_id="|".join(ids)
	var before={};var after={};var waiting=false
	for level in range(-2,3):
		before[level]=graph(level);after[level]=graph(level,ignore_id)
		if before[level].get("pending",false) or after[level].get("pending",false):waiting=true
	if waiting:return "Checking walking access…"
	var reachable_before=network_ports(before,[]);var reachable_after=network_ports(after,doomed)
	for name in reachable_before:
		if not reachable_after.has(name):return "This removes your safe return route. Keep a connected stair and supported walkway."
	return ""
