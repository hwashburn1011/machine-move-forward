class_name MMFCaretaker
extends CharacterBody3D

var game
var visual: Node3D
var job={}
var phase="idle"
var service_time=0.0
var wait_time=0.0
var destination=Vector3.ZERO
var agent: NavigationAgent3D
var status="Companion"
var spawned=false
var sensor: Node3D
var arms: Array=[]
var wheels: Array=[]
var service_query=PhysicsShapeQueryParameters3D.new()
var drive=MMFCaretakerDrive.new()

func setup(owner_game):
	game=owner_game
	collision_layer=8
	collision_mask=1
	floor_snap_length=0.4
	floor_max_angle=deg_to_rad(50)
	safe_margin=0.02
	var shape=CapsuleShape3D.new()
	shape.radius=0.28;shape.height=1.0
	var clearance_shape=CapsuleShape3D.new();clearance_shape.radius=.28;clearance_shape.height=.96
	service_query.shape=clearance_shape;service_query.collision_mask=1
	var collision=CollisionShape3D.new()
	collision.shape=shape;collision.position.y=0.5
	add_child(collision)
	var kit=MMFAssets.scene("models/authored/fieldwork-kit.glb")
	var part=MMFAssets.find_named(kit,"L12")
	if part: visual=part.duplicate()
	else: visual=Node3D.new()
	kit.free()
	visual.position=Vector3.ZERO
	add_child(visual)
	# The authored cleats sit above their scene origin. Seat their actual contact
	# plane at the physics feet, accounting for the body's floor safety margin.
	visual.position.y=-MMFAssets.bounds(visual).position.y-safe_margin
	sensor=MMFAssets.find_named(visual,"L12Sensor")
	for part_name in ["L12ArmLeft","L12ArmRight"]:
		var arm=MMFAssets.find_named(visual,part_name)
		if arm:arms.append(arm)
	for wheel in MMFAssets.of_type(visual,"Node3D"):
		if wheel.get_parent()==visual and String(wheel.name).begins_with("L12Wheel"):wheels.append(wheel)
	drive.setup(visual,wheels)
	if not drive.belts.is_empty():visual.position.y=-drive.contact_y-safe_margin
	agent=NavigationAgent3D.new()
	agent.path_desired_distance=0.08;agent.target_desired_distance=0.5
	add_child(agent)
	visible=false

func dock() -> Dictionary:
	for p in game.session.structures:
		if p.definitionId=="caretaker-dock" and p.health>0: return p
	return {}

func service_point(p: Dictionary) -> Vector3:
	var center=game.building.center(p.cell)
	var map=get_world_3d().navigation_map
	var navigation_ready=NavigationServer3D.map_get_iteration_id(map)>0
	var space=get_world_3d().direct_space_state
	for offset in [Vector3(0,0,1.3),Vector3(1.3,0,0),Vector3(-1.3,0,0),Vector3(0,0,-1.3)]:
		var at=center+offset
		# Check the body volume, including the case where a new wall encloses the
		# point before navigation finishes baking. Leave a small deck-contact gap.
		service_query.transform=Transform3D(Basis.IDENTITY,at+Vector3.UP*.54)
		if not space.intersect_shape(service_query,1).is_empty():continue
		# Retain side preference, but reject points above equipment or in its margin.
		if navigation_ready and NavigationServer3D.map_get_closest_point(map,at).distance_to(at)>.2:continue
		return at
	return Vector3.INF

func reachable(p: Dictionary) -> bool:
	var map=get_world_3d().navigation_map
	if NavigationServer3D.map_get_iteration_id(map)==0: return false
	var at=service_point(p)
	if not at.is_finite():return false
	var path=NavigationServer3D.map_get_path(map,position,at,true)
	return not path.is_empty() and path[path.size()-1].distance_to(at)<0.75

func choose_job() -> Dictionary:
	return {}

func _physics_process(dt: float):
	if game and game.cinematic=="": update(dt)

func update(dt: float):
	if not game.session.caretaker.recovered: visible=false;return
	if not spawned:
		position=game.player.position+Vector3(0.8,0.1,1)
		spawned=true
	visible=true
	var blend=1-exp(-6*dt)
	var servicing=phase.begins_with("service-")
	if sensor: sensor.rotation.y=lerpf(sensor.rotation.y,sin(game.session.clock*0.65)*0.16,blend);sensor.rotation.x=lerpf(sensor.rotation.x,0.2 if servicing else 0.02,blend)
	for arm in arms:arm.rotation.x=lerpf(arm.rotation.x,-0.35 if servicing else 0,blend)
	job={};phase="idle";status="Following"
	destination=game.player.position+game.player.visual.global_basis.z*1.5
	velocity.x=0;velocity.z=0
	if position.distance_to(destination)>0.6:
		agent.target_position=destination
		# Refresh the path after assigning a target before consuming its state.
		var next=agent.get_next_path_position() if NavigationServer3D.map_get_iteration_id(get_world_3d().navigation_map)>0 else position
		var direction=(next-position)*Vector3(1,0,1)
		var distance=direction.length()
		# Baked deck paths sit a few centimetres above physical feet. A 5 cm
		# horizontal dead zone can stop just outside the agent's 8 cm 3D waypoint
		# radius forever. Approach closer, capping travel at the waypoint so the
		# smaller threshold cannot cause overshoot at low physics rates.
		if distance>0.005:
			direction=direction.normalized()
			var speed=minf(1.35,distance/maxf(dt,.0001))
			velocity.x=direction.x*speed;velocity.z=direction.z*speed
			face_direction(direction,dt)
	velocity.y=0 if is_on_floor() else velocity.y-22*dt
	if is_on_floor() and Vector2(velocity.x,velocity.z).length_squared()>0.01:
		var motion=Vector3(velocity.x,0,velocity.z)*dt
		if test_move(global_transform,motion):
			var raised=global_transform;raised.origin.y+=0.44
			if not test_move(raised,motion):
				var floor_hit=game.raycast(raised.origin+motion,raised.origin+motion-Vector3.UP*0.52,[get_rid()])
				if not floor_hit.is_empty() and floor_hit.normal.y>0.65: position.y=floor_hit.position.y+0.025
	var before=position
	MMFDeckMotion.slide(self,dt)
	# Roll the authored wheel pivots from actual travel, so a blocked or parked
	# companion cannot keep spinning its drive. The model's front faces local -Z.
	if not drive.belts.is_empty():drive.update(visual.global_transform,is_on_floor())
	else:
		var travelled=Vector2(position.x-before.x,position.z-before.z).length()
		if is_on_floor() and travelled>.00001:
			for wheel in wheels:wheel.rotation.x-=travelled/.143

func face_direction(direction: Vector3,dt: float):
	if Vector2(direction.x,direction.z).length_squared()<.0001:return
	visual.rotation.y=lerp_angle(visual.rotation.y,atan2(-direction.x,-direction.z),1-exp(-5*dt))
