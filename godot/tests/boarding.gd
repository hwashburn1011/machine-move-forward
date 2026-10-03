extends SceneTree
var game
var checks=0
var failures=[]
var observations={}
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-boarding-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func frames(n=3):
	for i in n:await physics_frame
func clear():
	game.combat.reset_encounter()
	for enemy in game.combat.enemies:
		if is_instance_valid(enemy):enemy.queue_free()
	game.combat.enemies.clear();game.combat.crew.clear()
	for node in [game.combat.hook,game.combat.ship]:
		if is_instance_valid(node):node.queue_free()
	game.combat.hook=null;game.combat.ship=null;game.combat.ship_state="none"
	await frames()
func begin(side: int,tutorial=false):
	game.combat.begin_ship("skiff",tutorial,true,"rear",side);game.combat.weapon_health=0
	# This suite isolates grapple traversal; Revenant leap has its own fixture.
	for enemy in game.combat.crew:enemy.queue_free()
	game.combat.crew.clear()
	for i in 2:
		var enemy=game.combat.spawn("raider",game.combat.boarding.start_position(i),true)
		enemy.set_physics_process(false);game.combat.boarding.prepare(enemy);game.combat.crew.append(enemy)
	game.combat.update_ship(game.combat.approach_duration)
	game.combat.update_ship(1.1);await frames()
func advance_to(time: float):
	var remaining=maxf(0,time-game.combat.ship_timer)
	while remaining>.000001:
		var dt=minf(1.0/60,remaining);game.combat.update_ship(dt);remaining-=dt
func fits(enemy,at: Vector3) -> Array:
	var query=PhysicsShapeQueryParameters3D.new();query.shape=enemy.get_child(0).shape;query.collision_mask=1
	query.transform=Transform3D(Basis.IDENTITY,at+Vector3.UP*.96);query.margin=.005
	return game.get_world_3d().direct_space_state.intersect_shape(query,16)
func geometry():
	var kit=MMFBoarding.KIT.instantiate();var faces=0;var bad=0
	for mesh in MMFAssets.of_type(kit,"MeshInstance3D"):
		for s in mesh.mesh.get_surface_count():
			var arrays=mesh.mesh.surface_get_arrays(s);var p=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX]
			for i in range(0,indices.size(),3):
				faces+=1
				if (p[indices[i+1]]-p[indices[i]]).cross(p[indices[i+2]]-p[indices[i]]).length_squared()<1e-24:bad+=1
	check(faces>30000 and faces<55000 and bad==0,"Detailed imported boarding kit retains valid triangles under its geometry budget")
	check(MMFAssets.of_type(kit,"Light3D").is_empty() and MMFAssets.of_type(kit,"CollisionObject3D").is_empty(),"Boarding art adds no lights or blocking collision")
	var clamp=MMFAssets.find_named(kit,"BoardingClamp");var bounds=MMFAssets.bounds(clamp)
	check(absf(bounds.position.y+.22)<.002,"Clamp contact soles match the existing deck at hook Y minus 22 cm")
	observations.geometry={"triangles":faces,"collapsed":bad};kit.free()
func routes():
	var errors=[]
	for side in [-1,1]:
		await begin(side)
		for index in 2:
			var enemy=game.combat.crew[index];var start=game.combat.boarding.anchors[index]
			check(absf(start.y-15.724)<.001 and absf(start.z-.35)<.001,"Crew starts on the authored skiff standing plane, side %d crew %d"%[side,index])
			var blocked=[]
			for i in 101:
				var at=game.combat.boarding.path(start,index,i/100.0)
				var hits=fits(enemy,at)
				if not hits.is_empty():blocked.append({"phase":i/100.0,"at":str(at),"body":str(hits[0].collider.name)})
			check(blocked.is_empty(),"Full capsule route clears actual decks and rails, side %d crew %d"%[side,index]);errors.append(blocked)
			var at=game.combat.boarding.path(start,index,1)
			check(at.is_equal_approx(Vector3(side*10,16.1,index*2-1)),"Unobstructed boarding retains its existing combat entry")
		advance_to(5.5-.001)
		check(game.combat.crew[0].inactive,"First ordinary boarder remains inactive until 5.5 seconds")
		game.combat.update_ship(.0011);check(not game.combat.crew[0].inactive and game.combat.crew[1].inactive,"First boarder activates at existing 5.5-second boundary")
		advance_to(7.26)
		check(not game.combat.crew[1].inactive,"Second ordinary boarder activates at 7.25-second traversal boundary")
		await clear()
	observations.routeFailures=errors
	await begin(1,true)
	advance_to(5.01);check(not game.combat.crew[0].inactive and game.combat.crew[1].inactive,"Tutorial first boarder retains five-second activation")
	advance_to(6.76);check(not game.combat.crew[1].inactive,"Tutorial second boarder retains 6.75-second activation")
	await clear()
func poses():
	for kind in game.data.ENEMIES:
		var enemy=game.combat.spawn(kind,Vector3(50,16,0),true);enemy.set_physics_process(false);game.combat.boarding.prepare(enemy)
		var feet=[]
		enemy.boarding_pose.modification_processed.connect(func():
			feet.clear()
			for leg in enemy.boarding_pose.limbs:feet.append(enemy.boarding_pose.get_skeleton().get_bone_global_pose(leg.bones[2]).origin))
		enemy.boarding_pose.set_phase(.45);await frames()
		var pose=enemy.boarding_pose;var errors=pose.grip_errors.duplicate();observations[kind]={"gripErrors":errors}
		check(errors.size()==2 and errors.all(func(e):return e<.006),kind+" wrists reach both real ascender grips without stretching arms")
		check(pose.active and enemy.animation.to_lower().ends_with("idle"),kind+" uses a supported hoist pose instead of air walking")
		var sk=pose.get_skeleton();var hip=sk.get_bone_global_pose(pose.pelvis).origin
		check(feet.size()==2 and feet.all(func(p):return p.y>.30),kind+" bends both knees while suspended")
		pose.finish();await frames()
		check(not pose.active and pose.gear.global_position.distance_to(sk.to_global(hip+Vector3(0,.14,-.40)))<.10,kind+" releases the pose and stows the harness for combat")
		enemy.queue_free();await frames()
func heavy_routes():
	for side in [-1,1]:
		await begin(side)
		for i in 2:
			game.combat.crew[i].queue_free()
			game.combat.crew[i]=game.combat.spawn("bastion",game.combat.boarding.start_position(i),true)
			game.combat.crew[i].set_physics_process(false)
		await frames();game.combat.boarding.prepare_routes()
		for i in 2:
			var clear_route=not game.combat.boarding.routes[i].is_empty()
			if clear_route:
				for step in 101:
					if not fits(game.combat.crew[i],game.combat.boarding.path(game.combat.boarding.anchors[i],i,step/100.0)).is_empty():clear_route=false
			check(clear_route,"Wider Bastion capsule clears the full route, side %d crew %d"%[side,i])
		await clear()
func route_cost(label: String):
	var times=[]
	for i in 15:
		var started=Time.get_ticks_usec();game.combat.boarding.prepare_routes();times.append((Time.get_ticks_usec()-started)/1000.0)
	times.sort();observations[label]={"medianMs":times[7],"maxMs":times[-1],"samples":times.size(),"scope":"One-time two-crew route preparation, real physics world; not gameplay FPS"}
func cables_and_cut():
	await begin(1)
	route_cost("clearRoutePreparation")
	advance_to(3.75);await frames()
	game.combat.boarding.update_lines();var mm=game.combat.boarding.lines.multimesh
	check(mm.visible_instance_count==2,"Each climber has one persistent solid cable")
	check(game.combat.boarding.lines.physics_interpolation_mode==Node.PHYSICS_INTERPOLATION_MODE_OFF,"Render-space cables avoid double physics interpolation")
	for i in 2:
		var saved=game.combat.boarding.transforms[i]
		var tr=game.combat.global_transform*(mm.get_instance_transform(i) if DisplayServer.get_name()!="headless" else saved)
		var a=tr*Vector3(0,-.5,0);var b=tr*Vector3(0,.5,0)
		check(a.distance_to(game.combat.boarding.fairleads[i].global_position)<.002 and b.distance_to(game.combat.crew[i].boarding_pose.eye.global_position)<.002,"Cable endpoints meet actual fairlead and body harness %d"%i)
	var writes=game.combat.boarding.buffer_updates
	for i in 100:game.combat.boarding.update_lines()
	check(game.combat.boarding.buffer_updates==writes,"Unchanged cable endpoints do not upload repeated instance transforms")
	var snapshot=game.combat.crew.map(func(e):return e.position);game.open_menu("Pause");await create_timer(.05).timeout
	check(game.combat.crew.map(func(e):return e.position)==snapshot,"Pausing holds the boarding positions")
	game.close_menu();var crew=game.combat.crew.duplicate();var before=game.session.count_resource("scrap")
	game.combat.cut_hook(game.combat.hook.position);var reward=game.session.count_resource("scrap")-before
	check(game.combat.ship_state=="retreat" and crew.all(func(e):return e.dead and e.boarding_fall),"Severing grapple drops both inactive boarders and retreats the skiff")
	check(mm.visible_instance_count==0 and not is_instance_valid(game.combat.hook),"Cut cable and anchor hit target disable immediately")
	game.combat.retreat_ship(false);check(game.session.count_resource("scrap")-before==reward,"Repeated retreat does not duplicate the existing reward")
	for enemy in crew:
		var y=enemy.position.y;enemy._physics_process(.2);check(enemy.position.y<y,"Detached boarder falls instead of hanging forever")
		enemy._physics_process(5.1)
	await frames();check(crew.all(func(e):return not is_instance_valid(e)),"Inactive dead boarders release their bodies and harnesses at corpse expiry")
	await clear()
func fallen_boarder():
	await begin(1)
	var enemy=game.combat.crew[0];enemy.position=Vector3(5,18,3);enemy.take_damage(10000,enemy.position)
	enemy.velocity=Vector3.ZERO;enemy.set_physics_process(true)
	await frames(65)
	check(enemy.is_on_floor() and enemy.position.y>16 and enemy.position.y<16.2,"A killed airborne boarder lands on the actual top deck instead of falling through it")
	await clear()
func blocked_routes():
	# A real solid wall across the normal landing forces a different entry lane.
	var wall=MMFAssets.box(game,Vector3(2,3,2),Vector3(10,17.5,-1));await frames()
	await begin(1)
	check(not game.combat.boarding.routes[0].is_empty() and absf(game.combat.boarding.routes[0][6].z+1)>1.5,"A blocked normal entry selects a clear lane instead of teleporting into equipment")
	await clear();wall.queue_free();await frames()
	wall=MMFAssets.box(game,Vector3(6,8,24),Vector3(10,19,0));await frames();await begin(1)
	route_cost("blockedRoutePreparation")
	check(game.combat.boarding.routes.all(func(r):return r.is_empty()),"A fully fortified side reports no clear boarding route")
	advance_to(8)
	check(game.combat.crew.all(func(e):return e.inactive and e.position.y<16),"Blocked boarders stay on their actual skiff seats")
	advance_to(13.1);var crew=game.combat.crew.duplicate();game.combat.update_ship(1)
	check(game.combat.ship_state=="retreat" and crew.all(func(e):return e.position.z>10),"Blocked living crew leave with the retreating craft")
	game.combat.update_ship(5.1);await frames()
	check(crew.all(func(e):return not is_instance_valid(e)),"Escaping unboarded crew do not leave invisible actors behind")
	wall.queue_free();await clear()
func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	await geometry();await routes();await heavy_routes();await poses();await cables_and_cut();await fallen_boarder();await blocked_routes()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"observations":observations}
	var file=FileAccess.open("res://../test-results/godot-native/boarding-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("BOARDING_RESULT ",checks," checks, ",failures.size()," failures")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit",0 if failures.is_empty() else 1)
