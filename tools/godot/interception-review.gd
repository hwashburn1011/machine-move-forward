extends SceneTree

var game
var failures=[]
var report={"scenarios":[],"scope":"Native real-time 60 Hz encounter update and held fire through actual mounted deck-gun handler; scripted aim follows hull center. 3-second mount allowance; not a human accuracy/playtest claim."}
var rendered=false

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-interception-review/";call_deferred("run")

func capture(label: String):
	if not rendered:return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/interception-"+label+".png"))

func cleanup():
	Input.action_release("fire");game.dismount_turret();game.combat.reset_encounter();game.combat.finish_ship()
	game.interaction_prompt=""
	for enemy in game.combat.enemies:
		if is_instance_valid(enemy):enemy.queue_free()
	game.combat.enemies.clear();game.combat.encounter_had_enemies=false
	for piece in game.session.structures.duplicate():
		if piece.definitionId in ["turret-manual","turret-auto"]:
			if game.building.bodies.has(piece.instanceId):game.building.bodies[piece.instanceId].queue_free();game.building.bodies.erase(piece.instanceId)
			game.session.structures.erase(piece)
	await physics_frame;await physics_frame

func stats(values: Array) -> Dictionary:
	if values.is_empty():return {}
	values.sort();return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"samples":values.size()}

func gun_run(kind: String,direction: String,side: int):
	var cell={"x":side*5,"y":0,"z":-4 if direction=="front" else 4}
	var piece=game.session.create_piece("turret-manual",cell,0 if direction=="front" else 2,{},true)
	game.building.add_visual(piece);game.session.powered[piece.instanceId]=true
	game.player.teleport(game.building.center(cell)+Vector3(-side*1.5,0,0));await physics_frame;await physics_frame
	game.combat.begin_ship(kind,false,false,direction,side)
	for enemy in game.combat.enemies:enemy.set_physics_process(false)
	var first_range=-1.0;var first_damage=-1.0;var destroyed=-1.0;var damage_events=0;var frame_times=[];var gpu_times=[];var blocked=[]
	var started=Time.get_ticks_usec();var previous=started
	for frame in 1800:
		await physics_frame
		var elapsed=frame/60.0
		game.combat.update_ship(1.0/60)
		game.effects.update(1.0/60)
		if not is_instance_valid(game.combat.ship):break
		var at=game.building.center(cell)+Vector3.UP*1.35
		var target=game.combat.ship_targets[0].global_position if not game.combat.ship_targets.is_empty() else game.combat.ship.position+Vector3.UP*1.2
		var delta=target-at
		if delta.length()<48 and first_range<0:first_range=elapsed
		if frame==180:game.service_piece(piece);Input.action_press("fire")
		if game.manual_turret!="":
			game.player.yaw=atan2(-delta.x,-delta.z);game.player.pitch=atan2(delta.y,Vector2(delta.x,delta.z).length())
			var before=game.combat.ship_health;game.update_manual_turret(1.0/60)
			if frame%120==0 and frame>300 and game.combat.ship_state=="approach":
				var ray=game.raycast(at,at+delta.normalized()*48,[game.player.get_rid()],5)
				blocked.append({"t":elapsed,"body":str(ray.collider.name) if not ray.is_empty() else "none","point":str(ray.position) if not ray.is_empty() else "","pitch":game.player.pitch,"yaw":game.player.yaw,"health":game.combat.ship_health})
			if game.combat.ship_health<before:
				damage_events+=1
				if first_damage<0:first_damage=elapsed;await capture(kind+"-"+direction+"-first-hit")
		if frame==270:await capture(kind+"-"+direction+"-approach")
		if game.combat.ship_state=="destroying" and destroyed<0:
			destroyed=elapsed;Input.action_release("fire");await capture(kind+"-"+direction+"-destroyed")
		if rendered:
			var now=Time.get_ticks_usec();frame_times.append((now-previous)/1000.0);previous=now
			gpu_times.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
		if destroyed>=0 and elapsed>destroyed+2:break
	var passed=destroyed>=0 and destroyed<game.combat.approach_duration+1.1
	if not passed:failures.append(kind+" "+direction+" failed pre-boarding interception")
	report.scenarios.append({"kind":kind,"direction":direction,"side":side,"firstInRangeS":first_range,"firstActualHullDamageS":first_damage,"hullDestroyedS":destroyed,"connectingHits":damage_events,"contactS":game.combat.approach_duration,"grappleAttachedS":game.combat.approach_duration+1.1,"mountAllowanceS":3,"wallElapsedS":(Time.get_ticks_usec()-started)/1000000.0,"frameMs":stats(frame_times),"gpuMs":stats(gpu_times),"passed":passed,"sampledRays":blocked})
	await cleanup()

func boarding_views():
	game.combat.begin_ship("skiff",false,false,"rear",1)
	for enemy in game.combat.crew:enemy.queue_free()
	game.combat.crew.clear()
	for i in 2:
		var enemy=game.combat.spawn("revenant" if i==0 else "warden",game.combat.boarding.start_position(i),true)
		enemy.set_physics_process(false);game.combat.boarding.prepare(enemy);game.combat.crew.append(enemy)
	game.combat.update_ship(game.combat.approach_duration)
	var camera=Camera3D.new();game.add_child(camera);camera.position=Vector3(8,21,13);camera.look_at(Vector3(15,15,0));camera.current=true;camera.fov=61
	for frame in 445:
		await physics_frame;game.combat.update_ship(1.0/60);game.effects.update(1.0/60)
		for enemy in game.combat.crew:
			if is_instance_valid(enemy) and not enemy.inactive:enemy.set_physics_process(true)
		if frame in [30,100,210,260,320]:await capture("boarding-"+str(frame))
	await capture("landed")
	game.combat.destroy_ship(game.combat.ship.position)
	for frame in 130:
		await physics_frame;game.combat.update_ship(1.0/60);game.effects.update(1.0/60)
		for enemy in game.combat.crew:
			if is_instance_valid(enemy) and enemy.dead:enemy.set_physics_process(true)
		if frame in [12,60,120]:await capture("breakup-"+str(frame))
	camera.queue_free();game.player.camera.current=true;await cleanup()

func scout_views():
	game.player.teleport(Vector3(10,16.1,0));game.combat.scout.begin()
	var camera=Camera3D.new();game.add_child(camera);camera.position=Vector3(13,22,0);camera.look_at(game.combat.scout.actor.position);camera.current=true;camera.fov=44
	for frame in 90:
		await physics_frame;game.combat.scout.update(1.0/60);game.effects.update(1.0/60)
	await capture("scout-search")
	game.session.add_resource("signal-decoy",1);game.combat.scout.deploy_decoy()
	for frame in 120:
		await physics_frame;game.combat.scout.update(1.0/60);game.effects.update(1.0/60)
		if is_instance_valid(game.combat.scout.actor):camera.look_at(game.combat.scout.actor.position)
	await capture("scout-decoy")
	camera.queue_free();game.player.camera.current=true;await cleanup()

func run():
	rendered=DisplayServer.get_name()!="headless";Engine.max_fps=60
	if not rendered:Engine.physics_ticks_per_second=600;Engine.max_fps=0
	if rendered:DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.cinematic="";game.session.opening_done=true;game.session.scanner.phase="consumed"
	if rendered:RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size)
	await cleanup()
	await gun_run("skiff","rear",1)
	await gun_run("gunboat","front",-1)
	if rendered:await boarding_views();await scout_views()
	report.failures=failures
	var file=FileAccess.open("res://../test-results/godot-native/interception-review.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("INTERCEPTION_REVIEW ",JSON.stringify(report))
	paused=true
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
