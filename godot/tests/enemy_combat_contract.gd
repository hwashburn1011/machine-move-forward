extends SceneTree

# Record the preceding controller once with --source and --record. Normal runs
# compare every physics tick and real hit/shot event against that saved contract.
var game
var source_path="res://scripts/enemy.gd"
var record_path=""
var expected_path="res://tests/fixtures/enemy-combat.json"
var failures=[]
var checks=0

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-enemy-combat-contract/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--source="):source_path=arg.trim_prefix("--source=")
		if arg.begins_with("--record="):record_path=arg.trim_prefix("--record=")
	call_deferred("run")

func observed_script() -> GDScript:
	var code=FileAccess.get_file_as_string(source_path).replace("\r","").replace("class_name MMFEnemy\n","")
	code=code.replace("func hit_target(amount: float):","func hit_target(amount: float):\n\tevents.append([frame_index,\"hit\",amount])")
	code=code.replace("func shoot_committed():","func shoot_committed():\n\tevents.append([frame_index,\"shot\",definition.damage])")
	code+="\nvar events=[]\nvar frame_index=0\n"
	var script=GDScript.new();script.source_code=code
	if script.reload()!=OK:return null
	return script

func rounded(value: float):return snappedf(value,.000001)
func snapshot(e):
	return [e.phase,rounded(e.position.x),rounded(e.position.y),rounded(e.position.z),rounded(e.cooldown),rounded(e.windup),e.shots_left,rounded(game.session.health),rounded(game.session.subsystems.engine)]

func comparable(kind: String,key: String,value):
	# The old golden remains authoritative for movement, windup, shot cadence,
	# phases, subsystem hits, armour and loot. Ranged aim is deliberately changed;
	# its physical hits/misses, cover and dodge are tested by enemy_ballistics.gd.
	if kind not in ["warden","bastion","sovereign"]:return value
	if key=="events":return value.filter(func(event):return event[1]!="hit")
	if key=="states":
		var states=value.duplicate(true)
		for state in states:state[7]=0.0
		return states
	return value

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	MMFAssets.box(game,Vector3(24,1,24),Vector3(50,15.5,0))
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var script=observed_script()
	if script==null:quit(1);return
	var result={"scope":"Original 60 Hz movement, cooldown/windup/shot/phase, melee health, subsystem damage, armour and drops; six enemy types plus sabotage. Ranged hit frequency intentionally differs: each hit retains exact damage; seeded physical accuracy/cover/dodge tested separately by enemy_ballistics.gd. Original golden remains unchanged.","scenarios":{}}
	for kind in ["scavenger","raider","warden","revenant","bastion","sovereign","sabotage"]:
		var enemy=script.new();game.combat.add_child(enemy);enemy.setup(game,"raider" if kind=="sabotage" else kind);enemy.position=Vector3(50,16.04,0);enemy.set_physics_process(false)
		game.combat.enemies.append(enemy);game.session.health=10000;game.session.subsystems.engine=100
		enemy.cooldown=0;enemy.mission="sabotage" if kind=="sabotage" else "assault";enemy.mission_point=Vector3(50,16.04,1.8)
		game.player.teleport(Vector3(50,16.04,1.8));await physics_frame
		var states=[]
		for frame in 240:
			await physics_frame
			enemy.frame_index=frame;enemy._physics_process(1.0/60);states.append(snapshot(enemy))
		var hp=enemy.health;enemy.take_damage(20,enemy.position+Vector3.UP*1.4);var damage=hp-enemy.health
		game.session.rng.seed=701;enemy.take_damage(10000,enemy.position)
		var drops=[]
		for entry in game.combat.loot:drops.append([entry.id,entry.count]);entry.node.queue_free()
		game.combat.loot.clear()
		result.scenarios[kind]={"states":states,"events":enemy.events.duplicate(true),"armourDamage":damage,"drops":drops,"dead":enemy.dead,"collision":enemy.collision_layer}
		enemy.queue_free();await process_frame;game.combat.enemies.clear()
	if record_path!="":
		var file=FileAccess.open(record_path,FileAccess.WRITE);file.store_string(JSON.stringify(result));file.close()
	else:
		var expected=MMFAssets.json(expected_path)
		for kind in result.scenarios:
			if kind in ["warden","bastion","sovereign"]:
				checks+=1
				var health=10000.0;var exact=true
				for state in result.scenarios[kind].states:
					var damage=health-state[7]
					exact=exact and (is_zero_approx(damage) or is_equal_approx(damage,game.data.ENEMIES[kind].damage));health=state[7]
				if not exact:failures.append(kind+"/exact-per-hit-damage")
			for key in result.scenarios[kind]:
				checks+=1
				if JSON.parse_string(JSON.stringify(comparable(kind,key,result.scenarios[kind][key])))!=comparable(kind,key,expected.scenarios[kind][key]):failures.append(kind+"/"+key)
		var file=FileAccess.open("res://../test-results/godot-native/enemy-combat-contract.json",FileAccess.WRITE)
		file.store_string(JSON.stringify({"checks":checks,"failures":failures,"passed":failures.is_empty(),"ticks":1680,"scope":result.scope},"\t"));file.close()
		print("ENEMY_COMBAT_CONTRACT ",checks," checks; failures: ",failures)
	game.open_menu("Pause");var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit",0 if failures.is_empty() else 1)
