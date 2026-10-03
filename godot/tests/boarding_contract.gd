extends SceneTree
var game
var source=""
var record=""
var failures=[]
var checks=0
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-boarding-contract/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--source="):source=arg.trim_prefix("--source=")
		if arg.begins_with("--record="):record=arg.trim_prefix("--record=")
	call_deferred("run")
func rounded(x):return snappedf(x,.000001)
func snapshot():
	var c=game.combat
	return [c.ship_state,rounded(c.ship_timer),c.ship_health,c.hook_health,c.weapon_health,c.engine_health,rounded(c.volley_timer),game.session.health,
		c.crew.map(func(e):return [e.kind,e.inactive,e.dead,e.mission,e.mission_subsystem]),
		c.shells.map(func(s):return [rounded(s.time),s.damage]),c.mission.phase,game.session.count_resource("scrap"),game.session.count_resource("components")]
func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	var script=MMFCombat
	if source!="":
		script=GDScript.new();script.source_code=FileAccess.get_file_as_string(source)
		if script.reload()!=OK:quit(1);return
	var result={"scope":"Six original ship scenarios, 720 ticks each: state/timing, crew activation/missions, shell timing/damage, health and rewards. Route/pose, disabled hook hit target and dead-body cleanup deliberately differ.","scenarios":{}}
	for scenario in ["raid","tutorial","cut","destroy","gunboatWeapon","gunboatBoth"]:
		while game.combat.nav.is_baking():await create_timer(.02).timeout
		game.combat.queue_free();await process_frame
		game.session=MMFSession.new(game.data);game.session.health=10000;game.session.opening_done=true
		game.combat=script.new();game.add_child(game.combat);game.combat.setup(game)
		while game.combat.nav.is_baking():await create_timer(.02).timeout
		game.combat.begin_ship("gunboat" if scenario.begins_with("gunboat") else "skiff",scenario=="tutorial",true)
		game.combat.ship.position=Vector3(game.combat.ship_side*17,6,0)
		for enemy in game.combat.crew:enemy.set_physics_process(false)
		var states=[]
		for frame in 720:
			if frame==180:
				if scenario=="cut":game.combat.cut_hook(game.combat.hook.position)
				elif scenario=="destroy":game.combat.destroy_ship(game.combat.ship.position)
				elif scenario.begins_with("gunboat"):
					game.combat.weapon_health=0
					if scenario=="gunboatBoth":game.combat.engine_health=0
			game.combat.update(1.0/60);states.append(snapshot())
			await physics_frame
		var drops=game.combat.loot.map(func(e):return [e.id,e.count])
		result.scenarios[scenario]={"states":states,"drops":drops,"defenses":game.session.facts.defenses}
	if record!="":
		var f=FileAccess.open(record,FileAccess.WRITE);f.store_string(JSON.stringify(result));f.close()
	else:
		var expected=MMFAssets.json("res://tests/fixtures/boarding-contract.json")
		for scenario in result.scenarios:
			for key in result.scenarios[scenario]:
				checks+=1
				if JSON.parse_string(JSON.stringify(result.scenarios[scenario][key]))!=expected.scenarios[scenario][key]:failures.append(scenario+"/"+key)
		var f=FileAccess.open("res://../test-results/godot-native/boarding-contract.json",FileAccess.WRITE);f.store_string(JSON.stringify({"checks":checks,"failures":failures,"passed":failures.is_empty(),"ticks":4320,"scope":result.scope},"\t"));f.close()
	print("BOARDING_CONTRACT ",checks," comparisons; failures ",failures)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit",0 if failures.is_empty() else 1)
