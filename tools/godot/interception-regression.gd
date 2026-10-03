extends SceneTree

var game
var failures=[]
var report={"routes":[],"destruction":{},"leap":{},"scout":{},"scope":"Controlled real native object fixtures; fixed-rate lifecycle steps and real physics queries, not a manual playthrough"}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-interception-regression/";call_deferred("run")

func check(value: bool,message: String):
	if not value:failures.append(message);push_error(message)

func settle():
	await physics_frame;await physics_frame;await process_frame

func clear_encounter():
	game.combat.reset_encounter()
	game.combat.finish_ship()
	for enemy in game.combat.enemies:
		if is_instance_valid(enemy):enemy.queue_free()
	game.combat.enemies.clear();game.combat.encounter_had_enemies=false
	await settle()

func tick(seconds: float):
	for i in int(ceil(seconds*60)):
		game.combat.update_ship(1.0/60)
		if i%6==0:await physics_frame

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.cinematic="";game.session.opening_done=true;game.session.scanner.phase="consumed";game.player.teleport(Vector3(10,16.1,0))
	await settle()
	for direction in ["front","rear"]:
		for side in [-1,1]:
			game.combat.begin_ship("skiff",true,false,direction,side)
			for enemy in game.combat.enemies:enemy.set_physics_process(false)
			await tick(.5)
			check(game.combat.ship_state=="approach",direction+" must not board immediately")
			await tick(17.6)
			check(game.combat.ship_state=="grapple_launch",direction+" must finish by path duration")
			await tick(1.2)
			check(game.combat.ship_state=="grapple","Hook launch must visibly finish before traversal")
			report.routes.append({"direction":direction,"side":side,"shipY":game.combat.ship.position.y,"clearRoutes":game.combat.boarding.routes.map(func(r):return not r.is_empty())})
			check(game.combat.boarding.routes.any(func(r):return not r.is_empty()),"At least one authored boarding lane must be usable "+direction+str(side))
			game.combat.cut_hook(game.combat.hook.position)
			check(game.combat.crew.all(func(e):return e.dead),"Severing an uncommitted grapple must remove unboarded crew")
			await clear_encounter()
	game.combat.begin_ship("skiff",false,false,"rear",1)
	var hull=game.combat.ship_targets[0]
	var hits=0
	while game.combat.ship_state!="destroying" and hits<20:
		var dealt=hull.take_damage(42,hull.global_position);check(dealt>0,"Hull returns positive damage");hits+=1
	check(hits==8,"Normal carrier should require eight 42-damage deck gun hits")
	check(game.combat.crew.all(func(e):return e.dead),"Unboarded crew must die with hull")
	var scrap=game.session.count_resource("scrap")
	game.combat.destroy_ship(Vector3.ZERO)
	check(game.session.count_resource("scrap")==scrap,"Repeated destruction must not repeat rewards")
	report.destruction={"normalHits":hits,"state":game.combat.ship_state,"unboardedCrewDefeated":game.combat.crew.all(func(e):return e.dead)}
	await tick(4.7)
	check(game.combat.ship_state=="none","Wreck removal is bounded")
	await clear_encounter()
	# Preserve one actual Revenant from windup through detached flight and landing.
	game.combat.begin_ship("skiff",false,false,"front",1)
	for enemy in game.combat.crew:enemy.queue_free()
	game.combat.crew.clear()
	var leaper=game.combat.spawn("revenant",game.combat.boarding.start_position(0),true)
	leaper.set_physics_process(false);game.combat.boarding.prepare(leaper);game.combat.crew.append(leaper)
	await tick(19.2)
	await tick(3.25)
	var detached=game.combat.boarding.leap_detached(leaper)
	check(detached,"A clear Revenant lane should commit to a leap after preparation")
	var identity=leaper.get_instance_id();var health=leaper.health
	game.combat.destroy_ship(game.combat.ship.position)
	check(not leaper.dead,"A detached leaper survives carrier destruction")
	await tick(1.8)
	check(not leaper.dead and not leaper.inactive,"Detached actor lands on the Nomad")
	check(leaper.get_instance_id()==identity and leaper.health==health,"Leap preserves identity and health")
	check(leaper.boarding_recovery>0,"Landing has recovery before attacking")
	report.leap={"detached":detached,"identityPreserved":leaper.get_instance_id()==identity,"landed":not leaper.inactive,"healthPreserved":leaper.health==health,"position":MMFAssets.dict_v(leaper.position)}
	await clear_encounter()
	game.combat.scout.begin();await settle()
	check(game.combat.active_threat(),"Searching scout blocks saving and overlapping raids")
	game.combat.scout.target.take_damage(100,game.combat.scout.actor.position)
	check(not game.combat.scout.active() and game.session.scout_state.outcome=="disabled","Shooting the scout prevents its broadcast")
	game.combat.scout.begin();await settle()
	game.session.add_resource("signal-decoy",1)
	var before=game.session.count_resource("signal-decoy")
	check(game.combat.scout.deploy_decoy(),"A crafted decoy is usable during search")
	check(game.session.count_resource("signal-decoy")==before-1,"Decoy consumes one item")
	game.combat.scout.update(4.1)
	check(game.session.scout_state.outcome=="decoy" and game.combat.ship_state=="none","Decoy resolves without a raid")
	game.combat.scout.begin();game.session.story.uniques.append("course-actuator")
	game.session.target_course=-game.combat.scout.side*12
	game.combat.scout.update(.1)
	check(game.combat.scout.active(),"Selecting a heading alone cannot count as avoidance")
	game.session.lateral=game.combat.scout.start_lateral-game.combat.scout.side*17
	game.combat.scout.update(.1)
	check(game.session.scout_state.outcome=="avoided","Actual lateral displacement can clear search lane")
	report.scout={"outcome":game.session.scout_state.outcome,"resolved":game.session.scout_state.resolved,"quietDistance":game.session.threat.remaining}
	report.failures=failures
	var file=FileAccess.open("res://../test-results/godot-native/interception-regression.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("INTERCEPTION_REGRESSION ",JSON.stringify(report))
	paused=true
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
