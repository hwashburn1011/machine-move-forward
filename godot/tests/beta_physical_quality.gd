extends SceneTree

var game
var failures=[]
var checks=0
var metrics={"grounding":[],"recovery":[],"crane":{}}
var suffix="before" if "--before" in OS.get_cmdline_user_args() else "after"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-beta-physical-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count: int=3):
	for i in count:await physics_frame

func ray(a: Vector3,b: Vector3,exclude: Array=[]):
	return game.raycast(a,b,exclude,1)

func walk_to(target: Vector3,seconds: float=4.0) -> bool:
	game.close_menu();game.player.set_physics_process(true)
	for tick in int(seconds*60):
		var delta=(target-game.player.position)*Vector3(1,0,1)
		if delta.length()<.14:break
		game.player.yaw=atan2(-delta.x,-delta.z);Input.action_press("forward");await physics_frame
	Input.action_release("forward");await frames(5);game.player.set_physics_process(false)
	return Vector2(target.x-game.player.position.x,target.z-game.player.position.z).length()<.35

func capture(label: String,eye: Vector3,target: Vector3):
	if DisplayServer.get_name()=="headless":return
	var camera=Camera3D.new();game.add_child(camera);camera.position=eye;camera.look_at(target);camera.fov=52;camera.make_current();game.ui.root.hide()
	await frames(8);await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://../test-results/godot-native/beta-physical-"+label+"-"+suffix+".png")
	camera.queue_free();game.player.camera.make_current();game.ui.root.show()

func supported(model: Node3D,local_foot: Vector3,exclude: Array,label: String):
	var bottom=model.to_global(local_foot)
	var hit=ray(bottom+Vector3.UP*.002,bottom-Vector3.UP*.9,exclude)
	var gap=bottom.y-hit.position.y if not hit.is_empty() else 999.0
	metrics.grounding.append({"part":label,"gap_m":gap})
	check(absf(gap)<.005,label+": physically supported within 5 mm")

func surface_matches(model: Node3D,a: Vector3,b: Vector3,label: String):
	# Probe imported visible triangles as well as physics, so the expectation
	# follows the authored silhouette rather than copying collider dimensions.
	var start=model.to_global(a);var end=model.to_global(b);var nearest=INF
	for mesh in MMFAssets.of_type(model,"MeshInstance3D"):
		if not mesh.is_visible_in_tree() or not mesh.mesh:continue
		var local_a=mesh.to_local(start);var local_b=mesh.to_local(end)
		for i in mesh.mesh.get_surface_count():
			var arrays=mesh.mesh.surface_get_arrays(i);var vertices=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX]
			for t in range(0,indices.size(),3):
				var hit=Geometry3D.segment_intersects_triangle(local_a,local_b,vertices[indices[t]],vertices[indices[t+1]],vertices[indices[t+2]])
				if hit!=null:nearest=minf(nearest,start.distance_to(mesh.to_global(hit)))
	var physical=ray(start,end)
	check(nearest<INF and not physical.is_empty() and absf(start.distance_to(physical.position)-nearest)<.006,label+": physical near face matches visible triangles within 6 mm")

func berth_checks():
	check(game.playtests.launch("finale-transfer"),"Final receiving berth checkpoint loads")
	game.set_physics_process(false);game.player.set_physics_process(false);await frames(5)
	var berth=game.finale.berth
	var group=berth.get_node("Art100Berth")
	var reservoirs=group.get_children().filter(func(n):return n.get_meta("art100_id","")=="PreservationReservoir")
	check(reservoirs.size()==2,"Both visible authored preservation reservoirs replace the primitive tanks")
	for tank in reservoirs:
		var label="Berth reservoir "+str(tank.position.z)
		check(tank.is_visible_in_tree() and absf(MMFAssets.bounds(tank).position.y)<.005,label+": visible feet reach the model floor")
		for x in [-.168,.168]:supported(tank,Vector3(x,0,0),[tank.get_node("ReservoirCollision").get_rid()],label+" foot "+str(x))
		surface_matches(tank,Vector3(.32,.75,0),Vector3(-.01,.75,0),label+" shell")
		surface_matches(tank,Vector3(.32,1.36,0),Vector3(-.01,1.36,0),label+" upper rim")
	var bench=group.get_node("SeedPropagationBench")
	check(bench.is_visible_in_tree() and absf(MMFAssets.bounds(bench).position.y)<.005,"Authored propagation bench has grounded visible feet")
	for i in 6:
		var x=-1+i*.4;var cup=bench.get_node("SeedCupCollision"+str(i))
		supported(bench,Vector3(x,.87,0),[cup.get_rid()],"Seed cup "+str(i)+" receiving seat")
		surface_matches(bench,Vector3(x+.225,.98,0),Vector3(x-.01,.98,0),"Seed cup "+str(i))
	for i in 5:
		var x=-.8+i*.4
		check(ray(bench.to_global(Vector3(x,.98,.24)),bench.to_global(Vector3(x,.98,-.24))).is_empty(),"Gap between seed cups "+str(i)+" and "+str(i+1)+" has no invisible collision")
	for id in ["OpenChannelMast","RelayChallengeMast"]:
		var mast=group.get_node(id)
		check(mast.is_visible_in_tree() and absf(MMFAssets.bounds(mast).position.y)<.005,id+": visible support plate reaches the floor")
		supported(mast,Vector3.ZERO,[mast.get_node("MastCollision").get_rid()],id+" support plate")
		surface_matches(mast,Vector3(-.3,1.5,0),Vector3(.3,1.5,0),id+" stem")
		if id=="OpenChannelMast":surface_matches(mast,Vector3(.3,1.5,0),Vector3(-.3,1.5,0),id+" clipped feeder")
	var retired=true
	for mesh in berth.get_children():
		if not mesh is MeshInstance3D:continue
		if String(mesh.name).begins_with("SeedCup_") or String(mesh.name).begins_with("BerthReservoir_") or mesh in [berth.public_mast,berth.relay_mast]:
			retired=retired and not mesh.visible
			for body in MMFAssets.of_type(mesh,"StaticBody3D"):retired=retired and body.collision_layer==0
	check(retired,"Replaced primitive tanks, cups and masts stay hidden with collision disabled")
	game.player.teleport(berth.to_global(Vector3(5.5,.06,-2.1)));await frames()
	check(game.player.boundary.fits(game.player.position),"Reservoir walk starts with supported capsule clearance")
	check(not await walk_to(berth.to_global(Vector3(4.8,.02,-2.1)),.5) and berth.to_local(game.player.position).x>5.35,"Actual S-07 controller stops outside the reservoir")
	var recoveries=game.player.boundary.recoveries
	game.player.teleport(Vector3(10,16.09,0));await frames()
	for at in [Vector3(14,16.06,0),Vector3(19,16.06,0),Vector3(19,16.06,-3.25),Vector3(20.6,16.06,-3.25),Vector3(19,16.06,-3.25),Vector3(19,16.06,0),Vector3(10,16.06,0)]:
		check(await walk_to(at),"Berth supported walking route "+str(at))
	check(game.player.boundary.recoveries==recoveries,"Berth equipment leaves round-trip route clear without fall recovery")
	await capture("berth-equipment",Vector3(26.5,20.7,-.1),Vector3(20.5,17,-4.3))

func gear_checks():
	for pair in [["crane","salvage-crane"],["battery","battery-bank"],["quiet-drive","quiet-drive"]]:
		check(game.playtests.launch(pair[0]),"Equipment checkpoint loads: "+pair[0]);game.set_physics_process(false);game.player.set_physics_process(false);await frames(5)
		var site=game.opportunities.survivor_site;var root_site=game.opportunities.site
		var face=root_site.to_global(Vector3(2.5,.85,-1.6))
		check(not ray(face+Vector3.BACK,face).is_empty(),pair[1]+": unrecovered equipment blocks the body")
		var control=root_site.to_global(Vector3(.2,.65,2))
		check(not ray(control-Vector3.BACK*.4,control).is_empty(),pair[1]+": release-control cabinet has physical collision")
		for z in [-2.6,2.6]:
			var rail=root_site.to_global(Vector3(-5.9,1,z))
			check(not ray(rail+Vector3.RIGHT*.3,rail-Vector3.RIGHT*.3).is_empty(),pair[1]+": entry-side rail blocks at "+str(z))
		# Recover via the public local interaction sequence, never grant a recovered flag.
		for action in ["gear-isolate","gear-release","gear-recover"]:
			var point=game.opportunities.points.filter(func(p):return p.id==action)[0]
			game.player.teleport(root_site.to_global(point.at)-Vector3.UP);site.interact(action)
		await frames()
		check(pair[1] in game.session.expedition_gear.recovered and not site.device.visible,pair[1]+": local recovery hides the removed device")
		check(ray(face+Vector3.BACK,face).is_empty(),pair[1]+": removed device leaves no invisible collision")
		game.player.teleport(root_site.to_global(Vector3(2.5,.06,-.5)));await frames()
		var before=game.player.boundary.recoveries
		check(await walk_to(root_site.to_global(Vector3(2.5,.02,-2.7))),pair[1]+": S-07 walks through the empty recovery cradle")
		check(before==game.player.boundary.recoveries,pair[1]+": empty-cradle route stays on supported deck")
		metrics.recovery.append({"module":pair[1],"finish":str(root_site.to_local(game.player.position))})
		if pair[0]=="battery":await capture("empty-cradle",root_site.to_global(Vector3(7,4,3)),root_site.to_global(Vector3(1,.5,-.3)))

func crane_audit():
	for name in ["CargoCrane_Yaw","Crane_Jib","Hoist_Load"]:
		var node=MMFAssets.find_named(game.world.machine,name)
		if node:
			var bounds=MMFAssets.bounds(node)
			metrics.crane[name]={"origin":str(node.global_position),"transform":str(node.global_transform),"local_bounds":str(bounds),"world_bounds":str(node.global_transform*bounds)}
	print("CRANE_AUDIT ",JSON.stringify(metrics.crane))

func run():
	Engine.max_fps=60
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,900))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game;game.invulnerable=true
	game.set_physics_process(false);game.player.set_physics_process(false);await frames(5)
	crane_audit();await berth_checks();await gear_checks()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await drain.finish(self,refs),"Native physics review shuts down cleanly")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"metrics":metrics,"renderer":DisplayServer.get_name()}
	var file=FileAccess.open("res://../test-results/godot-native/beta-physical-"+suffix+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("BETA_PHYSICAL_RESULT ",checks," checks, ",failures.size()," failures");quit(0 if failures.is_empty() else 1)
