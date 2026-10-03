class_name MMFCrossfireRoute
extends RefCounted

const TRAVEL=44.2
const DEFAULT=Vector3(54,0,-76)
var origin=DEFAULT
var obstacles: Array=[]
var volumes: Array=[]
var hulls: Array=[]
var candidates=0
var raised_fallback=false
var elapsed_ms=0.0
var worker=Thread.new()
var prepared=false
var source_distance=0.0
var source_lateral=0.0
var reused=false

func join():
	if worker.is_started():worker.wait_to_finish();prepared=true

func adjusted(game) -> Vector3:
	return origin+Vector3(source_lateral-game.session.lateral,0,game.session.distance-source_distance)

func prepare(game,stage: Node3D):
	if worker.is_alive():return
	join()
	if prepared:
		var at=adjusted(game)
		if at.x>=50 and at.x<=230 and at.z<=-65:return
		prepared=false
	collect(game);configure(stage)
	source_distance=game.session.distance;source_lateral=game.session.lateral
	# Aim ahead of the remaining stabilizing interval. The final placement is
	# translated from this frozen world snapshot and revalidated at activation.
	var lead=game.session.speed*float(game.session.scanner.get("pendingDelayS",3))
	worker.start(compute.bind(source_distance,source_lateral,lead))

func reset():
	join();prepared=false;obstacles.clear();volumes.clear();hulls.clear()

func collect(game):
	obstacles.clear()
	for key in game.world.chunks:
		var offset=Vector3(key.y*256-game.session.lateral,0,key.x*64+game.session.distance)
		for box in game.world.chunks[key].get_meta("scenery_bounds",[]):
			obstacles.append(AABB(box.position+offset,box.size))
	# Player construction and an old restored destination must also be respected.
	for parent in [game.world.machine,game.building,game.campaign]:
		for node in MMFAssets.of_type(parent,"MeshInstance3D"):
			if node.is_visible_in_tree():obstacles.append(node.global_transform*node.get_aabb())

func configure(stage: Node3D):
	volumes.clear();hulls.clear()
	for name in ["HumanShip","RobotShip"]:
		var ship=stage.get_node(name);var box=ship.transform*MMFAssets.bounds(ship)
		hulls.append(box)
		volumes.append(box.merge(AABB(box.position+Vector3.BACK*TRAVEL,box.size)).grow(.7))
	# All visible establishing/approach/face-camera positions fit this corridor.
	# Deck-to-scene transitions are concealed cuts, not unsafe machine flythroughs.
	volumes.append(AABB(Vector3(-28.5,10.5,-4),Vector3(39,12,65)))

func clear_at(at: Vector3) -> bool:
	for local in volumes:
		var path=AABB(local.position+at,local.size)
		for obstacle in obstacles:
			if path.intersects(obstacle):return false
	return true

func floor_height(at: Vector3,distance: float,lateral: float) -> float:
	var height=-INF
	for hull in hulls:
		# Full swept footprint, including both hull ends. Two-metre terrain
		# sampling plus a generous crest margin keeps the belly above dunes.
		var steps_x=ceili(hull.size.x/2);var steps_z=ceili((hull.size.z+TRAVEL)/2)
		for x in range(steps_x+1):
			for z in range(steps_z+1):
				var px=at.x+hull.position.x+hull.size.x*x/steps_x+lateral
				var pz=at.z+hull.position.z+(hull.size.z+TRAVEL)*z/steps_z-distance
				height=maxf(height,MMFDunes.height_at(px,pz)+1.1-hull.position.y)
	return height

func choose(game,stage: Node3D):
	join();reused=false
	var candidate=adjusted(game)
	collect(game);configure(stage)
	if prepared and candidate.x>=50 and candidate.z<=-45 and clear_at(candidate):
		origin=candidate;prepared=false;reused=true;return
	prepared=false
	compute(game.session.distance,game.session.lateral,0)

func compute(distance: float,lateral: float,lead: float):
	# Worker-owned value arrays only: no scene tree, resources or render calls.
	var start=Time.get_ticks_usec();candidates=0;raised_fallback=false
	var sites=[]
	for x in range(13):
		for z in range(15):sites.append(Vector3(54+x*12,0,-76-lead-z*18))
	var target=DEFAULT-Vector3.BACK*lead
	sites.sort_custom(func(a,b):return (a-target).length_squared()<(b-target).length_squared())
	for site in sites:
		candidates+=1
		# Reject tall obstructions cheaply before evaluating the dune footprint.
		# Dune heights are bounded above by 6.5 m, so Y=6 safely bounds the
		# highest ordinary terrain-following hull placement for this asset.
		if not clear_at(site+Vector3.UP*6):continue
		site.y=floor_height(site,distance,lateral)
		if clear_at(site):
			origin=site;elapsed_ms=(Time.get_ticks_usec()-start)/1000.0;return
	# Extremely dense/edited scenery: lift the existing formation just above
	# intersecting objects, without hiding scenery or blocking story progress.
	origin=target;origin.y=floor_height(origin,distance,lateral)
	for local in volumes:
		var path=AABB(local.position+origin,local.size)
		for obstacle in obstacles:
			if path.position.x<obstacle.end.x and path.end.x>obstacle.position.x and path.position.z<obstacle.end.z and path.end.z>obstacle.position.z:
				origin.y=maxf(origin.y,obstacle.end.y-local.position.y+.7)
	raised_fallback=true;elapsed_ms=(Time.get_ticks_usec()-start)/1000.0
