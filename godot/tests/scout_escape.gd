extends SceneTree

# Native encounter fixtures use real raycasts, inventory crafting, session
# steering and combat lifecycle. This is not a manual campaign playthrough.
var game
var failures=[]
var checks=0
var notices=[]
var navigation=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-scout-escape/";call_deferred("run")

func check(value: bool,message: String):
	checks+=1
	if not value:failures.append(message);push_error(message)

func settle():await physics_frame;await physics_frame;await process_frame

func tick(seconds: float,combat: bool=false,move: bool=false):
	for i in int(ceil(seconds*60)):
		if move:game.session.tick(1.0/60,true,true)
		if combat:game.combat.update(1.0/60)
		else:game.combat.scout.update(1.0/60)
		if i%30==0:await physics_frame

func clear():
	game.combat.reset_encounter();game.combat.finish_ship()
	for enemy in game.combat.enemies:
		if is_instance_valid(enemy):enemy.queue_free()
	game.combat.enemies.clear();game.combat.encounter_had_enemies=false
	for shell in game.combat.shells:
		if is_instance_valid(shell.marker):shell.marker.queue_free()
	game.combat.shells.clear();game.session.health=100;game.player.dead=false
	game.session.course=0;game.session.target_course=0;game.session.attack_recent=0
	game.session.threat.phase="calm";game.session.threat.remaining=10000
	await settle()

func begin_search():
	game.combat.scout.begin()
	game.player.teleport(Vector3(game.combat.scout.side*10,16.1,0))
	await settle()

func freeze_enemies():
	for enemy in game.combat.enemies:enemy.set_physics_process(false)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.cinematic="";game.session.opening_done=true;game.session.scanner.phase="consumed"
	game.session.story.phase="route-selection";game.session.facts.defenses=1;game.session.facts.tutorialStarted=true
	game.session.notice.connect(func(value):notices.append(value))
	await clear()
	var scout=game.combat.scout
	# A scheduled encounter remains silent until the actual scout arrives.
	var previous_notices=notices.size()
	game.session.threat.merge({"phase":"calm","remaining":0.0,"legacy":0.0,"draws":1},true)
	game.combat.update_director(.01)
	check(notices.size()==previous_notices and game.session.threat.phase=="buildup" and game.session.threat.remaining==140,"Director preserves the scout approach interval without an invented warning")
	game.session.threat.remaining=0;game.combat.update_director(.01)
	check(scout.active() and game.session.threat.phase=="engagement" and game.combat.ship_state=="none","Scheduled odd encounter still launches the actual scout rather than a boarding craft")
	await clear();await begin_search()
	check(game.combat.active_threat() and not game.safe_to_save(),"Search blocks saves and overlapping encounters")
	check("SCOUT SEARCH" in scout.status_text(),"Search warning reports detection progress")
	var resolved=int(game.session.scout_state.resolved)
	await tick(18.1)
	check(game.session.scout_state.phase=="tracking" and "BROADCAST IN" in scout.status_text(),"Unobstructed real search reaches a visible broadcast countdown")
	check(game.combat.ship_state=="none","Detection itself does not instantly spawn attackers")
	await tick(5.1)
	freeze_enemies()
	check(game.combat.ship_state=="approach" and game.combat.approach_direction=="rear","Uninterrupted broadcast starts the real visible carrier approach")
	check(game.session.scout_state.outcome=="reinforcements" and game.session.scout_state.resolved==resolved+1,"Broadcast records one resolved scout")
	var sequence=game.session.scout_state.sequence;scout.begin()
	check(game.session.scout_state.sequence==sequence,"A new scout cannot overlap its reinforcement carrier")
	# Craft through the actual station/resource transaction, then escape approach.
	game.session.pay({"signal-decoy":game.session.count_resource("signal-decoy")})
	check(not scout.deploy_decoy(),"A decoy cannot deploy without its inventory item")
	game.session.add_resource("scrap",4);game.session.add_resource("components",2)
	var station=game.session.create_piece("workbench",{"x":0,"y":0,"z":4},0,{},true)
	game.session.powered[station.instanceId]=true
	var scrap=game.session.count_resource("scrap");var components=game.session.count_resource("components")
	check(game.session.craft("craft-signal-decoy"),"Signal decoy crafts at the powered workbench")
	check(game.session.count_resource("scrap")==scrap-4 and game.session.count_resource("components")==components-2,"Crafting charges its four scrap and two components")
	resolved=int(game.session.scout_state.resolved)
	check(scout.deploy_decoy() and game.session.count_resource("signal-decoy")==0,"Deploying consumes the crafted decoy once")
	check(not scout.deploy_decoy(),"Repeated deployment cannot duplicate pursuit disruption")
	await tick(4.2,true)
	check(game.combat.ship_state=="retreat" and scout.active(),"False signal causes visible retreat but keeps the encounter active")
	check(game.session.scout_state.resolved==resolved and not game.safe_to_save(),"Beacon expiration is not an escaped outcome or a save opportunity")
	var defenses=game.session.facts.defenses
	await tick(6.2,true)
	check(game.combat.ship_state=="none" and not scout.active() and game.session.scout_state.outcome=="escaped","Carrier departure completes break-contact when no boarders remain")
	check(game.session.scout_state.resolved==resolved+1 and game.session.facts.defenses==defenses+1,"Pursuit resolves and credits defense exactly once")
	check(game.session.threat.phase=="recovery" and game.session.threat.remaining>200 and game.safe_to_save(),"Completed escape grants recovery and restores saving")
	await tick(.2,true)
	check(game.session.scout_state.resolved==resolved+1 and game.session.facts.defenses==defenses+1,"Idle updates cannot repeat escape credit")
	# Actual hostile damage disables the same scout; duplicate callbacks are inert.
	await clear();await begin_search();resolved=int(game.session.scout_state.resolved)
	var zone=scout.target;var hit={"collider":zone,"position":zone.global_position}
	check(MMFOwnedShot.damage(hit,100)>0,"Player-owned shot damages the visible hostile scout target")
	check(game.session.scout_state.outcome=="disabled" and game.combat.ship_state=="none","Destroying a scout prevents reinforcement")
	scout.finish("disabled")
	check(game.session.scout_state.resolved==resolved+1,"Scout destruction can only resolve once")
	check(game.session.threat.phase=="recovery" and game.session.threat.remaining==450,"Disabling patrol grants a quiet recovery distance")
	# Cover uses collision, including lock interruption near broadcast expiry.
	await clear();await begin_search();await tick(18.1)
	var wall=StaticBody3D.new();wall.collision_layer=1;game.add_child(wall)
	wall.position=Vector3(scout.side*18,20,-12)
	var shape=CollisionShape3D.new();var box=BoxShape3D.new();box.size=Vector3(1,20,50);shape.shape=box;wall.add_child(shape)
	await settle();scout.broadcast_left=2.5;scout.update(3.0)
	check(game.session.scout_state.phase=="searching" and game.combat.ship_state=="none","Solid cover breaks lock without a stale countdown broadcasting in the same update")
	await tick(39)
	check(game.session.scout_state.outcome=="avoided" and not scout.active(),"Sustained physical cover makes the scout give up")
	wall.queue_free();await clear()
	# A selected heading alone never wins. Both lanes are reachable through the
	# ordinary acceleration/course integration after the first steering upgrade.
	game.session.story.uniques.erase("course-actuator")
	await begin_search();game.session.lateral=scout.start_lateral-scout.side*17;scout.update(.01)
	check(scout.active(),"Steering avoidance is unavailable before its navigation upgrade")
	await clear();game.session.story.uniques.append("course-actuator")
	for desired_side in [1,-1]:
		game.session.scout_state.sequence=0 if desired_side==1 else 1
		await begin_search();game.session.fuel=100;game.session.speed=0
		game.session.target_course=-scout.side*game.session.navigation_limit();scout.update(.01)
		check(scout.active(),"Heading selection alone does not avoid side "+str(desired_side))
		var seconds=0.0
		while scout.active() and seconds<24:
			await tick(.25,false,true);seconds+=.25
		check(game.session.scout_state.outcome=="avoided" and game.combat.ship_state=="none","Actual unlocked steering clears search lane "+str(desired_side))
		navigation.append({"side":desired_side,"seconds":seconds,"lateralMovement":game.session.lateral-scout.start_lateral,"heading":game.session.course})
		check(absf(game.session.lateral-scout.start_lateral)>=16,"Avoidance requires at least 16m real lateral movement")
		await clear()
	# A late false signal neither cuts hooks nor deletes genuine transferred crew.
	game.combat.begin_ship("skiff",true,false,"rear",1);freeze_enemies()
	game.combat.update_ship(18);game.combat.update_ship(1.1)
	var boarder=game.combat.crew[0];var identity=boarder.get_instance_id();var health=boarder.health
	for i in 306:
		game.combat.update_ship(1.0/60)
		if i%30==0:await physics_frame
	check(not boarder.inactive and boarder.position.distance_to(Vector3(10,16.1,-1))<1,"A real crew actor completes the physical grapple traversal before disruption")
	game.session.add_resource("signal-decoy",1);resolved=int(game.session.scout_state.resolved)
	check(scout.deploy_decoy(),"Tracking can be disrupted after a boarder transfers")
	scout.update(4.1)
	check(game.combat.ship_state=="grapple" and "CUT THE GRAPPLE" in scout.status_text(),"Expired beacon still requires the attached grapple to be cut")
	check(game.session.scout_state.resolved==resolved,"A live grapple cannot complete pursuit")
	game.combat.cut_hook(game.combat.hook.position);game.combat.update_ship(6.1)
	check(not boarder.dead and boarder.get_instance_id()==identity and boarder.health==health,"Cutting contact preserves a transferred boarder's identity and health")
	check(scout.active() and "REMAINING BOARDERS" in scout.status_text() and not game.safe_to_save(),"Carrier departure leaves a visible unresolved-boarder warning and blocks saving")
	check(game.session.scout_state.resolved==resolved,"Living boarders prevent an escaped outcome")
	game.session.health=0;scout.update(3.1)
	check(scout.active() and not scout.can_decoy() and game.session.scout_state.resolved==resolved,"Death cannot complete pending escape or use a decoy")
	game.session.health=100;boarder.take_damage(10000,boarder.position);game.combat.update(.01)
	check(game.session.scout_state.outcome=="escaped" and game.session.scout_state.resolved==resolved+1 and not game.combat.active_threat(),"Resolving the surviving boarder finally completes escape")
	# Death and restoration clear only transient tracking, never prior outcomes.
	await clear();await begin_search();await tick(18.1);resolved=int(game.session.scout_state.resolved)
	game.session.health=0;scout.update(8)
	check(game.session.scout_state.phase=="searching" and game.session.scout_state.progress==0 and game.combat.ship_state=="none","Death resets live scout lock without spawning attackers during respawn")
	check(game.session.scout_state.resolved==resolved,"Death does not award avoided or escaped credit")
	game.session.health=100;scout.update(.1)
	check(game.session.scout_state.phase=="searching" and game.session.scout_state.progress<.01,"Respawn begins a fresh readable detection window")
	scout.reset()
	check(game.session.scout_state.phase=="idle" and not scout.active() and game.session.scout_state.resolved==resolved,"Explicit reset clears transient search without erasing resolved history")
	var payload={"session":game.session.native_snapshot(),"player":{"position":{"x":10,"y":16.1,"z":0},"yaw":0,"pitch":0}}
	game.combat.begin_ship("skiff",true,false,"rear",1);freeze_enemies();game.session.add_resource("signal-decoy",1);scout.deploy_decoy();scout.update(4.1)
	game.load_payload(payload);await settle()
	check(game.session.scout_state.phase=="idle" and game.session.scout_state.resolved==resolved,"Load restores persisted history and idle scout state")
	check(not scout.active() and not scout.pursuit_decoy and game.combat.ship_state=="none" and not game.combat.tracking_disrupted,"Load removes stale beacon, pursuit and carrier state together")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"navigation":navigation,"scope":"Headless native state, collision, inventory, steering and lifecycle regression; not a manual campaign playthrough"}
	var file=FileAccess.open("res://../test-results/godot-native/scout-escape.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("SCOUT_ESCAPE ",JSON.stringify(report))
	paused=true
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
