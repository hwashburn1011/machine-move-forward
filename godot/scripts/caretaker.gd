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

func setup(owner_game):
	game=owner_game
	collision_layer=8
	collision_mask=1
	floor_snap_length=0.4
	var shape=CapsuleShape3D.new()
	shape.radius=0.28;shape.height=1.0
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
	agent=NavigationAgent3D.new()
	agent.path_desired_distance=0.25;agent.target_desired_distance=0.5
	add_child(agent)
	visible=false

func dock() -> Dictionary:
	for p in game.session.structures:
		if p.definitionId=="caretaker-dock" and p.health>0: return p
	return {}

func service_point(p: Dictionary) -> Vector3:
	var center=game.building.center(p.cell)
	for offset in [Vector3(0,0,1.3),Vector3(1.3,0,0),Vector3(-1.3,0,0),Vector3(0,0,-1.3)]:
		var at=center+offset
		if game.raycast(at+Vector3.UP*0.4,at+Vector3.UP*1.0).is_empty(): return at
	return center

func reachable(p: Dictionary) -> bool:
	var map=get_world_3d().navigation_map
	if NavigationServer3D.map_get_iteration_id(map)==0: return false
	var at=service_point(p)
	var path=NavigationServer3D.map_get_path(map,position,at,true)
	return not path.is_empty() and path[path.size()-1].distance_to(at)<0.75

func choose_job() -> Dictionary:
	var water=[]
	var outputs=[]
	var pieces=game.session.structures.duplicate()
	pieces.sort_custom(func(a,b):return a.instanceId<b.instanceId)
	for p in pieces:
		if p.health<=0 or not reachable(p): continue
		if p.definitionId=="seed-garden" and p.state.get("water",0)<2:
			for id in game.session.stores:
				var source=game.session.find_piece(id)
				if not source.is_empty() and game.session.stores[id].count_item("water")>0 and reachable(source):
					water.append({"kind":"water-garden","source":id,"target":p.instanceId,"item":"water"})
		if p.definitionId in ["condenser","planter","seed-garden"] and p.state.get("stored",0)>0:
			var item="water" if p.definitionId=="condenser" else "greens"
			for id in game.session.stores:
				var target=game.session.find_piece(id)
				if not target.is_empty() and game.session.stores[id].room_for(item)>0 and reachable(target): outputs.append({"kind":"store-output","source":p.instanceId,"target":id,"item":item})
	var lists=[outputs,water] if game.session.caretaker.priority=="outputs" else [water,outputs]
	for list in lists:
		if not list.is_empty(): return list[0]
	return {}

func update(dt: float):
	if not game.session.caretaker.recovered: visible=false;return
	if not spawned:
		position=game.player.position+Vector3(0.8,0.1,1)
		spawned=true
	visible=true
	var blend=1-exp(-6*dt)
	var head=MMFAssets.find_named(visual,"L12Sensor")
	if head: head.rotation.y=lerpf(head.rotation.y,sin(game.session.clock*0.65)*0.16,blend);head.rotation.x=lerpf(head.rotation.x,0.2 if phase=="service" else 0.02,blend)
	for name in ["L12ArmLeft","L12ArmRight"]:
		var arm=MMFAssets.find_named(visual,name)
		if arm: arm.rotation.x=lerpf(arm.rotation.x,-0.35 if phase=="service" else 0,blend)
	var home=dock()
	var safe=not game.combat.active_threat() and game.session.attack_recent<=0
	var can_work=not home.is_empty() and game.session.powered.get(home.instanceId,false) and safe
	if game.session.caretaker.mode=="companion":
		job={};phase="idle"
		status="Following"
		destination=game.player.position+game.player.visual.global_basis.z*1.5
	elif not can_work:
		job={};phase="idle"
		status="Deck unsafe" if not safe else ("Build a caretaker dock" if home.is_empty() else "Dock unpowered")
		destination=position
	else:
		wait_time=maxf(0,wait_time-dt)
		if phase=="idle" and wait_time<=0:
			job=choose_job()
			if not job.is_empty(): phase="to-source"
			else: status="No reachable work";wait_time=2
		if not job.is_empty():
			var source=game.session.find_piece(job.source)
			var target=game.session.find_piece(job.target)
			if source.is_empty() or target.is_empty() or not reachable(source) or not reachable(target):
				job={};phase="idle";status="Route blocked";return
			status=job.kind+" / "+phase
			destination=service_point(source if phase in ["to-source","service-source"] else target)
			if phase.begins_with("to-") and position.distance_to(destination)<0.6:
				phase="service-source" if phase=="to-source" else "service-target"
				service_time=2
			elif phase.begins_with("service-"):
				service_time-=dt
				if service_time<=0:
					if phase=="service-source": phase="to-target"
					else:
						# Commit once after both visits; cancellation cannot strand or duplicate stock.
						if job.kind=="water-garden" and target.state.get("water",0)<2 and game.session.stores[source.instanceId].count_item("water")>0:
							game.session.stores[source.instanceId].remove("water",1)
							target.state.water+=1
						elif job.kind=="store-output" and source.state.get("stored",0)>0 and game.session.stores[target.instanceId].room_for(job.item)>0:
							source.state.stored-=1
							game.session.stores[target.instanceId].add(job.item,1)
						job={};phase="idle";wait_time=2
	if phase.begins_with("service-"): destination=position
	if position.distance_to(destination)>0.6:
		agent.target_position=destination
		var next=agent.get_next_path_position() if not agent.is_navigation_finished() else position
		var direction=(next-position)*Vector3(1,0,1)
		if direction.length()>0.05:
			direction=direction.normalized()
			velocity.x=direction.x*1.35;velocity.z=direction.z*1.35
			visual.rotation.y=lerp_angle(visual.rotation.y,atan2(direction.x,direction.z),1-exp(-5*dt))
	else: velocity.x=0;velocity.z=0
	velocity.y=-0.1 if is_on_floor() else velocity.y-22*dt
	move_and_slide()
