extends SceneTree

var game
var checks=0
var failures=[]
var output="res://../test-results/godot-native/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-atmosphere-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok: failures.append(label)

func frames(n: int):
	for i in n: await physics_frame

func capture(name: String):
	if DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path(output+name+".png"))

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	var initial_chunks_correct=true
	for key in game.world.chunks:
		initial_chunks_correct=initial_chunks_correct and game.world.chunks[key].position.is_equal_approx(Vector3(key.y*256-game.session.lateral,0,game.session.distance+key.x*64))
	check(initial_chunks_correct,"Scenery starts at its real location before the first simulation tick")
	await frames(10)
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.world.update(0)
	var test_ground=Vector3(70,0,-150)
	check(is_equal_approx(game.player.boundary.terrain_edge(test_ground),maxf(-.35,MMFDunes.height_at(test_ground.x+game.session.lateral,test_ground.z-game.session.distance))+.25),"Ground recovery uses the actual visible terrain elevation")
	var effects=game.effects;effects.update(10)
	var children=effects.get_child_count()
	var allocations=Time.get_ticks_usec()
	for i in 750:
		effects.particle(Vector3(i%30*.1,17,i/30*.1),Vector3(1,2,3),Color(1,.6,.2),.04,.5,.1)
		effects.tracer(Vector3(0,17,0),Vector3(i%30*.1,17.5,i/30*.1),Color(1,.6,.2))
	var enqueue_usec=Time.get_ticks_usec()-allocations
	check(effects.get_child_count()==children,"1500 transient effects create no new scene nodes")
	effects.update(.025)
	check(effects.spark_batch.multimesh.visible_instance_count==750,"Spark batching retains every live particle")
	check(effects.spark_capacity==1024,"Spark pool grows geometrically without dropping effects")
	check(effects.tracer_mesh.get_surface_count()==1 and effects.tracers.size()==750,"All tracers share one render surface")
	var p=effects.objects[0]
	check(p.at.is_equal_approx(Vector3(.025,17.05,.075)),"Batched particle preserves velocity integration")
	check(is_equal_approx(p.scale,.8025),"Batched particle preserves original size and growth")
	check(p.color.is_equal_approx(Color(1,.6,.2).srgb_to_linear()),"Instance colours preserve the original material's linear colour space")
	# Headless rendering has no GPU colour buffer; allow the renderer to flush first.
	await frames(2)
	if DisplayServer.get_name()!="headless": check(absf(effects.spark_batch.multimesh.get_instance_color(0).a-.95)<.0001,"Batched particle preserves lifetime opacity")
	check(is_equal_approx(effects.spark_previous[7],17) and is_equal_approx(effects.spark_buffer[7],17.05),"Previous and current particle transforms stay paired for interpolation")
	effects.update(1)
	check(effects.objects.is_empty() and effects.tracers.is_empty() and effects.spark_batch.multimesh.visible_instance_count==0,"Expired effects release all active instances")
	check(effects.get_child_count()==children,"Heavy effect burst leaves scene node count unchanged")
	effects.particle(Vector3(-20,0,0),Vector3.ZERO,Color.WHITE,.04,.01)
	effects.particle(Vector3(40,0,0),Vector3.RIGHT,Color.WHITE,.04,1)
	effects.update(.02)
	check(effects.objects.size()==1 and is_equal_approx(effects.spark_previous[3],40) and is_equal_approx(effects.spark_buffer[3],40.02),"Expired particle compaction never interpolates from another particle")
	effects.update(2)
	game.session.speed=0;game.session.fuel=0;effects.update_atmosphere(0)
	check(effects.dust_emitters.all(func(n):return not n.emitting),"Stopped machine stops raising travel dust")
	check(effects.exhausts.all(func(n):return is_equal_approx(n.amount_ratio,.03)),"Unfuelled engine only emits residual exhaust")
	game.session.fuel=100;game.session.speed=7.5;effects.update_atmosphere(0)
	check(effects.dust_emitters.all(func(n):return n.emitting) and effects.exhausts.all(func(n):return is_equal_approx(n.amount_ratio,1)),"Travel dust and exhaust respond to running speed")
	game.world.gait.planted=[false,false,false,false];effects.update_atmosphere(0)
	game.world.gait.planted[0]=true;game.world.gait.contact_points[0]=Vector3(-8,.05,2);effects.update_atmosphere(0)
	check(effects.contact_dust.size()==4 and effects.contact_dust[0].position.is_equal_approx(Vector3(-8,.05,2)),"Landing dust follows the actual leg contact")
	var feet_grounded=true
	for distance in [0.0,1000.0,15000.0]:
		for lateral in [-30.0,0.0,30.0]:
			game.world.gait.update(distance,lateral)
			for i in 4:
				var foot=game.world.gait.contact_points[i]
				if game.world.gait.planted[i]: feet_grounded=feet_grounded and absf(foot.y-MMFDunes.height_at(foot.x+lateral,foot.z-distance)-.04)<.001
	check(feet_grounded,"Planted machine feet meet the visible sand on straight and lateral routes")
	game.world.gait.update(game.session.distance,game.session.lateral)
	var props=[]
	for chunk in game.world.chunks.values():
		for node in chunk.get_children():
			if node.has_meta("ambient_kind"): props.append(node)
	check(props.size()>0 and props.size()<=9,"Wind-worn props remain sparse: at most one per central scenery chunk")
	check(props.all(func(p):return p.position.x<=-19 and p.position.x>=-44),"Ambient props preserve machine corridor and docking lane")
	var a=Node3D.new();game.add_child(a);var b=Node3D.new();game.add_child(b)
	game.world.atmosphere.place(a,"determinism-check",10,0);game.world.atmosphere.place(b,"determinism-check",10,0)
	check(a.get_child(0).get_meta("ambient_kind")==b.get_child(0).get_meta("ambient_kind") and a.get_child(0).transform.is_equal_approx(b.get_child(0).transform),"Ambient placement repeats exactly for a saved seed")
	a.queue_free();b.queue_free();await frames(2)
	game.world.atmosphere.update(3)
	check(game.world.atmosphere.rotors.all(func(r):return is_instance_valid(r.node)),"Unloaded ambient rotors are removed from animation list")
	if not game.world.atmosphere.rotors.is_empty():
		var rotor=game.world.atmosphere.rotors[0].node
		var at=rotor.global_position;var axis=rotor.global_basis.z
		game.world.atmosphere.update(.5)
		check(rotor.global_position.is_equal_approx(at) and rotor.global_basis.z.is_equal_approx(axis),"Wind turbine rotates around its bearing rather than tumbling")
	var pinned=false;var free_edge=false
	for p2 in props:
		var cloth=MMFAssets.find_named(p2,"WindCloth")
		if not cloth: continue
		for mesh in MMFAssets.of_type(cloth,"MeshInstance3D"):
			for surface in mesh.mesh.get_surface_count():
				for uv in mesh.mesh.surface_get_arrays(surface)[Mesh.ARRAY_TEX_UV]:
					if uv.y<.01: pinned=true
					if uv.y>.95: free_edge=true
	check(pinned and free_edge,"Authored cloth exports fixed seam and flexible hem weights")
	var camera=Camera3D.new();game.add_child(camera);camera.make_current();camera.fov=45
	game.player.visual.hide();game.ui.root.hide()
	var captured=[]
	props.sort_custom(func(a,b):return absf(a.global_position.z)<absf(b.global_position.z))
	for prop in props:
		var kind=prop.get_meta("ambient_kind")
		if kind in captured: continue
		captured.append(kind)
		camera.global_position=prop.global_position+Vector3(3,4,-5)
		camera.look_at(prop.global_position+Vector3(.2,1.4,0));camera.reset_physics_interpolation()
		await frames(3);await capture("atmosphere-"+kind)
	check(captured.size()==3,"All three new authored assemblies are present in the seeded world")
	camera.global_position=Vector3(22,9,-30);camera.look_at(Vector3(0,11,0));camera.reset_physics_interpolation()
	for i in 8: effects.tracer(Vector3(-5+i,17,0),Vector3(-5+i,18,-10),Color(1,.6,.2))
	effects.explosion(Vector3(0,16,-2),1);effects.update(.016)
	await frames(3);await capture("atmosphere-effects")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"enqueue1500EffectsUsec":enqueue_usec,"renderer":RenderingServer.get_video_adapter_name()}
	var file=FileAccess.open(output+"atmosphere-effects.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause")
	while game.combat.nav.is_baking(): await create_timer(.1).timeout
	game.queue_free();await frames(4);MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
