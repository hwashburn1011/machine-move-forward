extends SceneTree

var game
var checks=0
var failures=[]
var report={"cube":[],"drums":[]}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-imported-collision/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	# Produce a known two-metre solid in source CCW convention. The retained
	# legacy fixture reproduces the missing conversion without a runtime switch.
	var cube=BoxMesh.new();cube.size=Vector3(2,2,2)
	var native_faces=cube.get_faces();var raw={"vertices":[],"indices":[],"position":{"x":50,"y":1000,"z":0}}
	for base in range(0,native_faces.size(),3):
		for offset in [0,2,1]:
			var p=native_faces[base+offset];raw.indices.append(raw.indices.size());raw.vertices.append_array([p.x,p.y,p.z])
	var fixed=MMFAssets.collider(game,raw)
	var legacy=StaticBody3D.new();game.add_child(legacy);legacy.position=Vector3(60,1000,0)
	var old_shape=ConcavePolygonShape3D.new();var old_faces=PackedVector3Array()
	for i in raw.indices:old_faces.append(Vector3(raw.vertices[i*3],raw.vertices[i*3+1],raw.vertices[i*3+2]))
	old_shape.set_faces(old_faces);var old_col=CollisionShape3D.new();old_col.shape=old_shape;legacy.add_child(old_col)
	var body=CharacterBody3D.new();game.add_child(body);body.collision_layer=0;body.collision_mask=1
	var shape=CollisionShape3D.new();var sphere=SphereShape3D.new();sphere.radius=.25;shape.shape=sphere;body.add_child(shape)
	for i in 2:await physics_frame
	await process_frame
	for axis in [Vector3.RIGHT,Vector3.LEFT,Vector3.UP,Vector3.DOWN,Vector3.FORWARD,Vector3.BACK]:
		var old_hit=game.raycast(legacy.position+axis*1.6,legacy.position-axis*1.6,[],1)
		var new_hit=game.raycast(fixed.position+axis*1.6,fixed.position-axis*1.6,[],1)
		check(not old_hit.is_empty() and old_hit.position.distance_to(legacy.position-axis)<.001,"Reproduce old far-face collision on axis "+str(axis))
		check(not new_hit.is_empty() and new_hit.position.distance_to(fixed.position+axis)<.001 and new_hit.normal.dot(axis)>.999,"Source mesh blocks at its near surface on axis "+str(axis))
		var params=PhysicsTestMotionParameters3D.new();params.from=Transform3D(Basis.IDENTITY,fixed.position+axis*1.6);params.motion=-axis;params.margin=.001
		var result=PhysicsTestMotionResult3D.new();var contact=PhysicsServer3D.body_test_motion(body.get_rid(),params,result)
		check(contact and absf(result.get_travel().length()-.35)<.015,"Character-sized sphere stops outside imported solid on axis "+str(axis))
		report.cube.append({"axis":str(axis),"oldRayHit":str(old_hit.get("position")),"newRayHit":str(new_hit.get("position")),"travelM":result.get_travel().length()})
	# Real frozen machine cylinders exercise its entire legacy triangle import,
	# not only the synthetic converter fixture. Query close enough to exclude
	# neighbouring cargo lockers while covering both sides, ends and top.
	for at in [Vector3(9.625,16.4675,7.8),Vector3(-9.625,16.4675,-6.5),Vector3(5.5,16.4675,10.4)]:
		for axis in [Vector3.RIGHT,Vector3.LEFT,Vector3.FORWARD,Vector3.BACK,Vector3.UP]:
			var extent=.2625 if axis.x!=0 else .28 if axis.z!=0 else .4375
			var hit=game.raycast(at+axis*.5,at-axis*.5,[],1)
			var error=hit.position.distance_to(at+axis*extent) if not hit.is_empty() else INF
			check(error<.004,"Real machine near-face collision at "+str(at)+" axis "+str(axis))
			report.drums.append({"center":str(at),"axis":str(axis),"surfaceErrorM":error})
	# Exercise the real controller against each refined prop on the deck.
	game.invulnerable=true
	for site in [Vector3(9.625,16.03,7.8),Vector3(-9.625,16.03,-6.5),Vector3(5.5,16.03,10.4)]:
		# The port drum's negative-Z side is occupied by an existing cargo locker.
		# Approach its open aisle rather than starting the capsule inside a crate.
		var direction=-1 if site.x<0 else 1
		game.player.teleport(site+Vector3(0,.05,-1.3*direction));game.player.yaw=PI if direction==1 else 0
		check(game.player.boundary.fits(game.player.position),"Walking probe starts on a supported, unoccupied approach: "+str(site))
		game.player.set_physics_process(true);Input.action_press("forward")
		for i in 45:await physics_frame
		Input.action_release("forward");game.player.set_physics_process(false)
		var stop=(game.player.position.z-site.z)*direction
		check(stop<-.57 and stop>-.70 and absf(game.player.position.y-site.y)<.1,"Real player walking stops outside drum at "+str(site))
		report.drums.append({"site":str(site),"approachDirectionZ":direction,"playerStoppedOffsetZ":stop,"playerPosition":str(game.player.position)})
	check(fixed.get_child(0).shape.get_faces().size()==native_faces.size(),"Correct conversion preserves triangle count")
	check(not fixed.get_child(0).shape.backface_collision,"Correct surfaces do not require double-sided collision")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Clean shutdown after physics checks")
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/imported-collision.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	call_deferred("quit",0 if failures.is_empty() else 1)
