class_name MMFBoarding
extends RefCounted

const KIT=preload("res://art/boarding-hardware.glb")
var game
var lines: MultiMeshInstance3D
var fairleads=[]
var anchors=[]
var routes=[]
var transforms=[]
var buffer_updates=0
var seat_ship: Node3D
var seats={}
var leaps={}

func setup(owner_game):
	game=owner_game
	lines=MultiMeshInstance3D.new();lines.name="BoardingCables"
	# Endpoints are already sampled in render space after skeletal interpolation.
	lines.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	var mesh=CylinderMesh.new();mesh.top_radius=.017;mesh.bottom_radius=.017;mesh.height=1;mesh.radial_segments=10;mesh.rings=1
	mesh.material=MMFAssets.material(Color(.10,.115,.105));mesh.material.metallic=.7;mesh.material.roughness=.58
	var mm=MultiMesh.new();mm.transform_format=MultiMesh.TRANSFORM_3D;mm.mesh=mesh;mm.instance_count=2;mm.visible_instance_count=0;lines.multimesh=mm
	game.combat.add_child(lines)
	RenderingServer.frame_pre_draw.connect(update_lines)
	lines.tree_exiting.connect(dispose,CONNECT_ONE_SHOT)

func dispose():
	if RenderingServer.frame_pre_draw.is_connected(update_lines):RenderingServer.frame_pre_draw.disconnect(update_lines)

func part(name: String) -> Node3D:
	var kit=KIT.instantiate();var node=MMFAssets.find_named(kit,name);node.get_parent().remove_child(node);kit.free();return node

func start_position(index: int) -> Vector3:
	var name="CrewSeatLeft" if (index==0)==(game.combat.ship_side>0) else "CrewSeatRight"
	if not is_instance_valid(seat_ship) or seat_ship!=game.combat.ship:
		seat_ship=game.combat.ship;seats.clear()
		for key in ["CrewSeatLeft","CrewSeatRight"]:seats[key]=MMFAssets.find_named(seat_ship,key)
	var marker=seats.get(name)
	return marker.global_position+Vector3.UP*.024 if marker else game.combat.ship.position+Vector3(0,1.224,.35)

func prepare(enemy):
	var sk=MMFAssets.of_type(enemy.visual,"Skeleton3D")[0]
	enemy.animator.advance(0)
	enemy.boarding_pose=MMFBoardingPose.new();sk.add_child(enemy.boarding_pose);enemy.boarding_pose.setup(enemy,part("BoardingAscender"))

func attach_hook(hook):
	var model=part("BoardingClamp");hook.add_child(model)
	model.rotation.y=0 if game.combat.ship_side>0 else PI
	fairleads.clear()
	for name in ["Fairlead_A","Fairlead_B"]:fairleads.append(MMFAssets.find_named(model,name))
	# A rotation mirrors Z on the port side; preserve the two landing lanes.
	if game.combat.ship_side<0:fairleads.reverse()
	anchors=[]
	for i in game.combat.crew.size():anchors.append(start_position(i))
	prepare_routes()

static func bezier(a: Vector3,b: Vector3,c: Vector3,d: Vector3,t: float) -> Vector3:
	var s=1-t;return a*s*s*s+b*3*s*s*t+c*3*s*t*t+d*t*t*t

func curve(start: Vector3,index: int,lane=0.0) -> Array:
	var side=game.combat.ship_side;var z=index*2-1+lane
	# The port staircase projects farther out than the starboard catwalk.
	var b=start+Vector3(-.5 if side<0 else 0,2,0)
	var c=Vector3(side*(17.4 if side<0 else 14.4),15.9,z)
	var apex=Vector3(side*13.2,17.6,z)
	var finish=Vector3(side*10,16.1,z)
	return [start,b,c,apex,apex+(apex-c)*(.3/.7),finish,finish]

static func sample(points: Array,t: float) -> Vector3:
	if t<=.7:return bezier(points[0],points[1],points[2],points[3],t/.7)
	return bezier(points[3],points[4],points[5],points[6],(t-.7)/.3)

func path(start: Vector3,index: int,t: float) -> Vector3:
	return sample(routes[index] if index<routes.size() and not routes[index].is_empty() else curve(start,index),t)

func prepare_routes():
	routes.clear()
	var space=game.get_world_3d().direct_space_state
	for index in game.combat.crew.size():
		var enemy=game.combat.crew[index];var chosen=[]
		var query=PhysicsShapeQueryParameters3D.new();query.shape=enemy.get_child(0).shape;query.collision_mask=1;query.margin=.035
		for lane in [0.,-2.,2.,-4.,4.,-6.,6.]:
			var points=curve(anchors[index],index,lane);var clear=true
			var floor_hit=game.raycast(points[6]+Vector3.UP*.05,points[6]-Vector3.UP*.2,[],1)
			if floor_hit.is_empty() or floor_hit.normal.y<.7:continue
			for step in range(1,71):
				query.transform=Transform3D(Basis.IDENTITY,sample(points,step/70.0)+Vector3.UP*.96)
				if not space.intersect_shape(query,1).is_empty():clear=false;break
			if clear:chosen=points;break
		routes.append(chosen)

func leap_detached(enemy) -> bool:
	return is_instance_valid(enemy) and leaps.has(enemy.get_instance_id()) and leaps[enemy.get_instance_id()].phase=="flight"

func has_detached_leaps() -> bool:
	return leaps.values().any(func(l):return l.phase=="flight" and is_instance_valid(l.enemy) and not l.enemy.dead)

func has_preparing_leap() -> bool:
	return leaps.values().any(func(l):return l.phase=="prepare" and is_instance_valid(l.enemy) and not l.enemy.dead)

static func leap_sample(start: Vector3,finish: Vector3,t: float) -> Vector3:
	return start.lerp(finish,t)+Vector3.UP*sin(t*PI)*5.0

func leap_route(enemy,index: int) -> Dictionary:
	var start=start_position(index)
	var query=PhysicsShapeQueryParameters3D.new();query.shape=enemy.get_child(0).shape;query.collision_mask=1;query.margin=.02
	var space=game.get_world_3d().direct_space_state
	for lane in [0.,-2.,2.,-4.,4.,-6.,6.]:
		var finish=Vector3(game.combat.ship_side*10,16.1,index*2-1+lane)
		var floor_hit=game.raycast(finish+Vector3.UP*.1,finish-Vector3.UP*.2,[],1)
		if floor_hit.is_empty() or floor_hit.normal.y<.7:continue
		finish.y=floor_hit.position.y+.055
		var clear=true
		for step in range(1,81):
			query.transform=Transform3D(Basis.IDENTITY,leap_sample(start,finish,step/80.0)+Vector3.UP*.96)
			if not space.intersect_shape(query,1).is_empty():clear=false;break
		if clear:return {"start":start,"finish":finish}
	return {}

func prepare_leap(enemy,index: int,dt: float):
	var id=enemy.get_instance_id()
	if not leaps.has(id):
		var route=leap_route(enemy,index)
		if route.is_empty():
			leaps[id]={"enemy":enemy,"phase":"aborted"};return
		leaps[id]={"enemy":enemy,"phase":"prepare","time":0.0,"start":route.start,"finish":route.finish}
		enemy.hp_label.text="▰".repeat(maxi(1,int(ceil(enemy.health/35))))
		enemy.boarding_pose.set_leap(0,true)
		game.audio.play_at("servo-load",enemy.position,.16)
	var flight=leaps[id]
	if flight.phase!="prepare":return
	flight.time+=dt;enemy.position=start_position(index)
	enemy.visual.rotation.y=-game.combat.ship_side*PI/2
	if flight.time<1.1:return
	# Recheck after the windup: freshly placed construction must block commitment.
	var route=leap_route(enemy,index)
	if route.is_empty():flight.phase="aborted";enemy.boarding_pose.finish();return
	flight.start=route.start;flight.finish=route.finish;flight.phase="flight";flight.time=0
	enemy.boarding_pose.set_leap(0,false)
	game.audio.play_at("footfall",enemy.position,.4)

func update_leaps(dt: float):
	for id in leaps.keys():
		var flight=leaps[id];var enemy=flight.enemy
		if not is_instance_valid(enemy) or enemy.dead:leaps.erase(id);continue
		if flight.phase!="flight":continue
		flight.time+=dt
		var t=clampf(flight.time/1.65,0,1)
		var next=leap_sample(flight.start,flight.finish,t)
		var query=PhysicsShapeQueryParameters3D.new();query.shape=enemy.get_child(0).shape;query.collision_mask=1;query.margin=.01
		query.transform=Transform3D(Basis.IDENTITY,enemy.position+Vector3.UP*.96);query.motion=next-enemy.position
		var result=game.get_world_3d().direct_space_state.cast_motion(query)
		if result[0]<.999:
			enemy.take_damage(10000,enemy.position);leaps.erase(id);continue
		enemy.position=next;enemy.boarding_pose.set_leap(t,false)
		if t>=1:
			enemy.boarding_pose.finish();enemy.inactive=false;enemy.boarding_recovery=.95
			enemy.phase="idle";enemy.timer=0;enemy.cooldown=maxf(enemy.cooldown,1.2);enemy.play("idle",true)
			game.audio.play_at("footfall",enemy.position,.6);game.effects.impact(enemy.position,Vector3.UP)
			leaps.erase(id)

func reset_leaps():
	for flight in leaps.values():
		if is_instance_valid(flight.enemy) and flight.enemy.boarding_pose:flight.enemy.boarding_pose.finish()
	leaps.clear()

func pose(enemy,index: int,t: float) -> bool:
	if not enemy.boarding_pose:prepare(enemy)
	if index>=routes.size() or routes[index].is_empty():
		enemy.position=start_position(index);return false
	var next=path(anchors[index] if index<anchors.size() else start_position(index),index,t)
	if t>0:
		var query=PhysicsShapeQueryParameters3D.new();query.shape=enemy.get_child(0).shape;query.collision_mask=1;query.margin=.01
		query.transform=Transform3D(Basis.IDENTITY,enemy.position+Vector3.UP*.96);query.motion=next-enemy.position
		if game.get_world_3d().direct_space_state.cast_motion(query)[0]<.999:
			routes[index]=[];enemy.take_damage(10000,enemy.position);return false
	enemy.position=next
	enemy.visual.rotation.y=-game.combat.ship_side*PI/2
	enemy.boarding_pose.set_phase(t)
	if t>=1:
		enemy.boarding_pose.finish();enemy.play("idle",true)
	return true

func update_lines():
	var combat=game.combat;var count=0
	if combat.ship_state in ["grapple_launch","grapple"] and is_instance_valid(combat.hook) and fairleads.size()==combat.crew.size():
		for i in combat.crew.size():
			var enemy=combat.crew[i]
			if not is_instance_valid(enemy) or enemy.dead or not enemy.inactive or not enemy.boarding_pose:continue
			if enemy.kind=="revenant" and not combat.tutorial_ship:continue
			if not is_instance_valid(fairleads[i]):continue
			var start=fairleads[i].get_global_transform_interpolated().origin
			var end=enemy.boarding_pose.eye.get_global_transform_interpolated().origin
			var delta=end-start
			if delta.length()<.001:continue
			var basis=Basis(Quaternion(Vector3.UP,delta.normalized()))*Basis.from_scale(Vector3(1,delta.length(),1))
			var placement=game.combat.global_transform.affine_inverse()*Transform3D(basis,(start+end)/2)
			if count>=transforms.size():transforms.append(Transform3D.IDENTITY)
			if not transforms[count].is_equal_approx(placement):
				transforms[count]=placement;lines.multimesh.set_instance_transform(count,placement);buffer_updates+=1
			count+=1
	lines.multimesh.visible_instance_count=count

func clear():
	lines.multimesh.visible_instance_count=0;fairleads.clear();anchors.clear();routes.clear();transforms.clear()
