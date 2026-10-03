extends SceneTree

var game
var failures=[]
var checks=0

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-interception-defenses/";call_deferred("run")

func check(value: bool,message: String):
	checks+=1
	if not value:failures.append(message);push_error(message)

func settle():await physics_frame;await physics_frame;await process_frame

func clear():
	game.combat.reset_encounter();game.combat.finish_ship()
	for enemy in game.combat.enemies:
		if is_instance_valid(enemy):enemy.queue_free()
	game.combat.enemies.clear();await settle()

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.cinematic="";game.session.opening_done=true;game.player.teleport(Vector3(10,16.1,0));await settle()
	for phase in ["grapple_launch","grapple","retreat"]:
		game.combat.begin_ship("skiff",true,false,"rear",1);game.combat.update_ship(game.combat.approach_duration)
		if phase!="grapple_launch":game.combat.update_ship(1.1)
		if phase=="retreat":game.combat.retreat_ship(false)
		check(game.combat.ship_state==phase,"Fixture reaches "+phase)
		var hull=game.combat.ship_targets[0]
		check(hull.take_damage(1000,hull.global_position)>0,"Visible hull remains shootable during "+phase)
		check(game.combat.ship_state=="destroying" and game.combat.crew.all(func(e):return e.dead),"Hull destruction removes attached crew during "+phase)
		check(not is_instance_valid(game.combat.hook) and game.combat.boarding.lines.multimesh.visible_instance_count==0,"Destruction clears hook and cables during "+phase)
		await clear()
	game.combat.begin_ship("skiff",false,false,"rear",1)
	for enemy in game.combat.crew:enemy.queue_free()
	game.combat.crew.clear()
	var leaper=game.combat.spawn("revenant",game.combat.boarding.start_position(0),true);leaper.set_physics_process(false)
	game.combat.boarding.prepare(leaper);game.combat.crew.append(leaper)
	game.combat.update_ship(game.combat.approach_duration);game.combat.update_ship(1.1)
	game.combat.ship_timer=2;game.combat.update_ship(.1)
	check(game.combat.boarding.has_preparing_leap() and not game.combat.boarding.leap_detached(leaper),"Sword launch has a distinct attached preparation")
	game.combat.destroy_ship(game.combat.ship.position)
	check(leaper.dead,"Destroying carrier during sword preparation defeats attached leaper")
	await clear()
	# Real powered automatic turret acquires a craft component through clear space.
	var turret=game.session.create_piece("turret-auto",{"x":5,"y":0,"z":3},0,{},true)
	game.building.add_visual(turret);game.session.powered[turret.instanceId]=true
	game.combat.begin_ship("gunboat",false,false,"rear",1);game.combat.ship.position=Vector3(25,14.5,18)
	await settle()
	var health=game.combat.ship_health+game.combat.weapon_health+game.combat.engine_health
	for i in 240:game.combat.update_turrets(1.0/60)
	check(game.combat.ship_health+game.combat.weapon_health+game.combat.engine_health<health,"Automatic defenses damage visible hostile hull/components")
	var wall=game.session.create_piece("wall",{"x":6,"y":0,"z":4},1,{},true);game.building.add_visual(wall);await settle()
	health=game.combat.ship_health+game.combat.weapon_health+game.combat.engine_health;var wall_health=wall.health
	for i in 300:game.combat.update_turrets(1.0/60)
	check(game.combat.ship_health+game.combat.weapon_health+game.combat.engine_health==health,"Owned cover blocks automatic targeting")
	check(wall.health==wall_health,"Automatic fire cannot damage owned cover")
	await clear()
	# A late decoy diverts tracking, but attached hooks remain a separate obstacle.
	game.combat.begin_ship("skiff",true,false,"rear",1);game.combat.update_ship(game.combat.approach_duration);game.combat.update_ship(1.1)
	game.session.add_resource("signal-decoy",1);check(game.combat.scout.deploy_decoy(),"Decoy can disrupt a carrier's tracking after contact")
	game.combat.scout.update(4.1)
	check(game.combat.ship_state=="grapple" and game.combat.tracking_disrupted,"Decoy alone does not erase an attached grapple")
	game.combat.cut_hook(game.combat.hook.position);game.combat.update_ship(6.1)
	check(game.combat.ship_state=="none" and not game.combat.active_threat(),"Cutting grapple after tracking disruption completes escape")
	await clear()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty()}
	var file=FileAccess.open("res://../test-results/godot-native/interception-defenses.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("INTERCEPTION_DEFENSES ",JSON.stringify(report))
	paused=true
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
