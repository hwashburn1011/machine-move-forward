extends SceneTree

var game
var checks=0
var failures=[]
var samples=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-crossfire-clearance/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func actual_obstacles():
	var boxes=[]
	# Read rendered instance transforms independently of the cached CPU routing
	# metadata. This suite deliberately requires the real rendering backend.
	for chunk in game.world.chunks.values():
		for node in MMFAssets.of_type(chunk,"MeshInstance3D"):
			if node.name!="LowSandDrift":boxes.append(node.global_transform*node.get_aabb())
		for node in MMFAssets.of_type(chunk,"MultiMeshInstance3D"):
			for i in node.multimesh.instance_count:boxes.append(node.global_transform*node.multimesh.get_instance_transform(i)*node.multimesh.mesh.get_aabb())
	return boxes

func prepare_route():
	game.session.scanner.phase="contact-ready";game.session.scanner.pendingDelayS=3
	var start=Time.get_ticks_msec()
	while not game.cinematics.signal_route.prepared and Time.get_ticks_msec()-start<15000:
		game.cinematics.signal_stage.update();await process_frame
	return game.cinematics.signal_route.prepared

func run():
	if DisplayServer.get_name()=="headless":push_error("Crossfire clearance needs real MultiMesh transforms");quit(1);return
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	check(game.cinematics.transition.get_parent().layer<game.ui.layer and game.cinematics.transition.mouse_filter==Control.MOUSE_FILTER_IGNORE,"Transition preserves subtitles, pause-menu visibility and input")
	var scenarios=[["first",0.0,0.0],["nomad",425.0,0.0],["ruins",1216.3,262.4],["crosswind",3900.0,-271.3],["industrial",8491.8,51.2],["last",20567.0,523.0]]
	for spec in scenarios:
		game.session.seed_name="clearance-"+spec[0];game.session.distance=spec[1];game.session.lateral=spec[2]
		game.world.refresh_chunks(true);game.world.update(0);await process_frame
		var before=game.session.native_snapshot();var random=game.session.rng.state
		game.cinematics.begin_signal();var c=game.cinematics;var r=c.signal_route
		var obstacles=actual_obstacles();var collisions=0;var minimum_ground=INF;var camera_hits=0
		for frame in range(171):
			var t=frame*.1;c.time=t;c.update(0)
			if t>=17:break
			for i in range(2):
				var ship=c.human_ship if i==0 else c.robot_ship
				var bounds=ship.global_transform*MMFAssets.bounds(ship)
				for box in obstacles:
					if bounds.intersects(box):collisions+=1
				# Different, finer grid than the planner's two-metre samples.
				if frame%10==0:
					for x in range(ceili(bounds.size.x)+1):
						for z in range(ceili(bounds.size.z)+1):
							var at=bounds.position+Vector3(x,0,z)
							minimum_ground=minf(minimum_ground,at.y-MMFDunes.height_at(at.x+spec[2],at.z-spec[1]))
			if t>=.26 and t<16.6:
				var eye=AABB(c.camera.global_position-Vector3.ONE*.15,Vector3.ONE*.3)
				for box in obstacles:
					if eye.intersects(box):camera_hits+=1
		check(collisions==0,spec[0]+": full ship envelopes avoid rendered ruins/scatter throughout the scene")
		check(minimum_ground>.4,spec[0]+": full hull footprints clear independently sampled dunes")
		check(camera_hits==0,spec[0]+": visible battle camera stays clear of actual scenery")
		check(random==game.session.rng.state and before.distance==game.session.distance,spec[0]+": route planning consumes no gameplay RNG or travel")
		check(not r.raised_fallback,spec[0]+": ordinary landscape has a low route without elevated fallback")
		samples.append({"scenario":spec,"origin":MMFAssets.dict_v(r.origin),"planningMs":r.elapsed_ms,"candidates":r.candidates,"fallback":r.raised_fallback,"collisions":collisions,"cameraHits":camera_hits,"minimumGroundM":minimum_ground})
		await process_frame
	# Three decks, both shoulders and extreme saved FOVs. No camera translation
	# through the machine is exposed between the two full-opacity plateaus.
	for at in [Vector3(0,16.1,5),Vector3(5,12.5,4),Vector3(-5,8.9,3)]:
		for shoulder in [-1,1]:
			game.player.teleport(at);game.player.shoulder=shoulder;game.player.yaw=.5;game.player.pitch=-.12;game.settings.fov=100 if shoulder==1 else 45
			game.player.update_camera(1);await physics_frame;await physics_frame
			var c=game.cinematics;c.begin_signal();var from=game.player.camera.global_transform
			c.time=.19;c.update(0);check(c.camera.global_transform.is_equal_approx(from),"Entry holds safe player view before concealed cut: "+str([at,shoulder]))
			for t in [.22,.259,.26,.30,16.51,16.599,16.6,16.69]:
				c.time=t;c.update(0);check(is_equal_approx(c.transition.color.a,1),"Camera cut is concealed at "+str(t))
			c.time=16.9;c.update(0);check(c.camera.global_transform.is_equal_approx(game.player.camera.global_transform),"Return reveals actual shoulder camera: "+str([at,shoulder]))
			c.finish();check(not c.transition.visible,"Skip/finish releases blackout overlay")
	game.cinematic="";game.session.seed_name="clearance-preparation";game.session.distance=425;game.session.lateral=0
	game.world.refresh_chunks(true);game.world.update(0)
	var state=game.session.rng.state
	check(await prepare_route(),"Route finishes in the existing scanner preparation interval")
	var planned=game.cinematics.signal_route.origin
	game.session.distance+=18;game.session.lateral+=2;game.world.update(0)
	game.cinematics.begin_signal()
	check(game.cinematics.signal_route.reused and game.cinematics.signal_route.origin.distance_to(planned+Vector3(-2,0,18))<.001,"Prepared world route follows intervening travel and steering")
	check(game.cinematics.signal_route.clear_at(game.cinematics.signal_route.origin),"Translated prepared route is revalidated against the current world")
	check(state==game.session.rng.state,"Background planner preserves gameplay random sequence")
	game.cinematics.finish();await process_frame
	check(await prepare_route(),"A fresh plan is available after finishing the prior scene")
	planned=game.cinematics.signal_route.origin
	var blocker=MMFAssets.box(game.building,Vector3(16,30,24),planned+Vector3(-17,15,0),null,false)
	game.cinematics.begin_signal()
	check(not game.cinematics.signal_route.reused and game.cinematics.signal_route.clear_at(game.cinematics.signal_route.origin),"New construction invalidates an obstructed prepared route safely")
	game.cinematics.finish();blocker.queue_free();await process_frame
	game.session.scanner.phase="contact-ready";game.session.scanner.pendingDelayS=3
	while game.cinematics.signal_stage.part_index<7:game.cinematics.signal_stage.build_part()
	game.cinematics.signal_route.prepare(game,game.cinematics.signal_stage.stage)
	check(game.cinematics.signal_route.worker.is_started(),"Cancellation fixture owns a live route-search handle")
	game.cinematics.clear_scene()
	check(not game.cinematics.signal_route.worker.is_started() and not game.cinematics.signal_route.prepared,"Campaign reset joins and discards the route worker")
	# Deliberately fill the search region: preserve the scene via a clear upper
	# flight path instead of deleting scenery or leaving intersecting models.
	var fixture=MMFAssets.box(game.building,Vector3(260,30,430),Vector3(140,15,-150),null,false)
	game.cinematics.begin_signal();var route=game.cinematics.signal_route
	check(route.raised_fallback and route.clear_at(route.origin),"Dense edited-world fallback remains above all intersecting geometry")
	game.cinematics.clear_scene();check(not game.cinematics.transition.visible,"Campaign reset clears transition overlay")
	fixture.queue_free()
	var report={"checks":checks,"failures":failures,"samples":samples,"scope":"Six seeded routes, full 17-second ship/camera envelopes against actual rendered MultiMeshes, finer dune grid, all-deck concealed cuts and crowded-world fallback."}
	var file=FileAccess.open("res://../test-results/godot-native/crossfire-clearance.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("CROSSFIRE_CLEARANCE_RESULT ",checks," checks, ",failures.size()," failures")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	await create_timer(.1).timeout;MMFAssets.cache.clear();call_deferred("quit",0 if failures.is_empty() else 1)
