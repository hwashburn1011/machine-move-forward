extends SceneTree

var game
var checks=0
var failures=[]
var report={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-turbine-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func ray(node: Node3D,a: Vector3,b: Vector3):return game.raycast(node.global_transform*a,node.global_transform*b,[],1)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.session.story.phase="locked";game.session.scanner.phase="consumed"
	for frame in 2:await physics_frame
	await process_frame
	var bank=game.world.native_intake;var manifest=MMFAssets.json("res://art/nomad-intake.json")
	check(bank!=null and MMFAssets.find_named(game.world.machine,"Front_Turbine_Housing")==null,"Complete old intake is replaced exactly once")
	if bank==null:quit(1);return
	check(bank.position.is_equal_approx(MMFAssets.v(manifest.position)) and bank.basis.is_equal_approx(Basis.IDENTITY),"Intake keeps its original footprint with a deck-based origin")
	var bounds=MMFAssets.bounds(bank);var total=bank.transform*bounds;var allowed=manifest.originalBox
	check(absf(bounds.position.y)<.001,"Mounting shoes contact the middle deck")
	check(total.position.x>=allowed.min[0] and total.end.x<=allowed.max[0] and total.position.z>=allowed.min[2] and total.end.z<=allowed.max[2] and total.end.y<=allowed.max[1],"Detailed assembly remains within the original upper envelope and footprint")
	var meshes=MMFAssets.of_type(bank,"MeshInstance3D");var tris=0;var collapsed=0;var maps={};var housing=MMFAssets.find_named(bank,"IntakeHousing");var transforms={}
	for mesh in meshes:
		if mesh.get_parent()==housing:transforms[mesh]=mesh.global_transform
		for s in mesh.mesh.get_surface_count():
			var material=mesh.get_active_material(s)
			if material is StandardMaterial3D and material.normal_enabled:maps[material]=true
			var a=mesh.mesh.surface_get_arrays(s);var points=a[Mesh.ARRAY_VERTEX];var indices=a[Mesh.ARRAY_INDEX];tris+=indices.size()/3
			for j in range(0,indices.size(),3):
				if (points[indices[j+1]]-points[indices[j]]).cross(points[indices[j+2]]-points[indices[j]]).length_squared()<1e-18:collapsed+=1
	check(meshes.size()==9 and maps.size()==3 and tris<165000 and collapsed==0,"Nine batched meshes retain three PBR material sets without degenerate imported triangles")
	check(MMFAssets.of_type(bank,"Light3D").is_empty() and MMFAssets.of_type(bank,"CollisionObject3D").is_empty(),"Detailed render art adds no lights or high-resolution physics")
	var collision=MMFAssets.find_named(game.world,"NativeIntakeCollision");var collision_manifest=MMFAssets.json("res://art/nomad-intake-collision.json")
	check(collision.get_child(0).shape.get_faces().size()/3==int(collision_manifest.replacementTriangles) and collision_manifest.replacementTriangles<800,"Walking and camera use the separate simplified collision")
	var front=ray(bank,Vector3(.8,1.54,-1),Vector3(.8,1.54,0));var rear=ray(bank,Vector3(.8,1.54,1),Vector3(.8,1.54,0))
	check(not front.is_empty() and front.collider==collision and absf((front.position-bank.position).z+.491*.95)<.002,"Front guard collision matches the visible guard plane")
	check(not rear.is_empty() and rear.collider==collision and absf((rear.position-bank.position).z-.393*.95)<.002,"Rear guard collision matches the visible guard plane")
	for x in [-1.02,1.02]:
		var foot=ray(bank,Vector3(x,.3,-.32)*.95,Vector3(x,0,-.32)*.95)
		check(not foot.is_empty() and foot.collider==collision and absf(foot.position.y-bank.position.y-.064*.95)<.002,"Mounting shoe has fitted contact collision: "+str(x))
	check(ray(bank,Vector3(0,.028,-.65),Vector3(0,.028,.6)).is_empty(),"Raised casing removes obsolete disk collision at floor level")
	var raw=game.runtime.colliders[int(collision_manifest.sourceCollider)];var retained=MMFAssets.find_named(game.world,"NativeWorkshopCollision").get_child(0).shape.get_faces()
	var prior=MMFAssets.json("res://art/nomad-benches-collision.json");var removed=0;var earlier=0;var cursor=0;var changed=0
	for j in range(0,raw.indices.size(),3):
		var tri=[]
		for k in [0,2,1]:
			var i=int(raw.indices[j+k])*3;tri.append(Vector3(raw.vertices[i],raw.vertices[i+1],raw.vertices[i+2]))
		if tri.all(func(p):return preload("res://tests/intake_trim.gd").removed(p)):removed+=1;continue
		if not prior.retainedIndexRanges.any(func(pair):return pair[0]<=j and j<pair[1]):earlier+=1;continue
		for p in tri:
			if cursor>=retained.size() or not retained[cursor].is_equal_approx(p):changed+=1
			cursor+=1
	check(removed==12724 and earlier==5656 and cursor==retained.size() and changed==0,"Every unrelated frozen collision triangle and its winding remains exact")
	var rotor=game.world.rotor;var center=rotor.global_position
	check(center.distance_to(bank.position+Vector3(0,manifest.centerHeight,0))<.001 and rotor.global_basis.z.is_equal_approx(Vector3.BACK),"Rotor shaft uses the intended game Z axis")
	for distance in [0.0,1.25,3.8,7.0,15.3]:
		game.session.distance=distance;game.world.update(0)
		var expected=Basis(Vector3.BACK,-fposmod(distance*.8,TAU))
		check(rotor.basis.is_equal_approx(expected) and rotor.global_position.distance_to(center)<.0001,"Rotor turns around a fixed shaft using existing travel phase: "+str(distance))
	check(transforms.keys().all(func(mesh):return mesh.global_transform.is_equal_approx(transforms[mesh])),"Guards, drive, lighting and feet remain fixed during rotor movement and gait")
	var snapshot=game.session.native_snapshot();var phase=rotor.basis
	game.session.distance=0;game.world.update(0);game.session.restore_native(snapshot);game.world.update(0)
	check(rotor.basis.is_equal_approx(phase),"Existing saved distance restores identical rotor phase without new save fields")
	game.open_menu("Pause");game.set_physics_process(true)
	for frame in 8:await physics_frame
	game.set_physics_process(false)
	check(rotor.basis.is_equal_approx(phase),"Opening the menu freezes the rotor with the game")
	game.close_menu();report.approaches=[]
	# The intake faces out past the deck edge. Exercise the actual rear service
	# aisle and side passage rather than inventing a front walking platform.
	for approach in [[Vector3.BACK,1.75,0.0,.64,1.1],[Vector3.RIGHT,2.25,PI/2,1.65,2.05]]:
		var side=approach[0];var at=bank.position+side*approach[1]+Vector3.UP*.05;game.player.teleport(at);game.player.yaw=approach[2]
		check(game.player.boundary.fits(at),"Service approach has real deck support: "+str(side))
		game.player.set_physics_process(true);Input.action_press("forward")
		for frame in 38:await physics_frame
		Input.action_release("forward");game.player.set_physics_process(false)
		var offset=(game.player.position-bank.position).dot(side)
		check(offset>approach[3] and offset<approach[4] and absf(game.player.position.y-bank.position.y)<.08,"Actual player stops outside the guard or casing: "+str(side))
		report.approaches.append({"side":str(side),"stopM":offset,"height":game.player.position.y})
	report.render={"triangles":tris,"collapsedTriangles":collapsed,"batches":meshes.size()};report.physics={"removedIntakeTriangles":removed,"priorRemoved":earlier,"replacementTriangles":collision_manifest.replacementTriangles,"changedUnrelatedVertices":changed}
	meshes.clear();maps.clear();transforms.clear();game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Clean intake test shutdown")
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/turbine-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("TURBINE_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
