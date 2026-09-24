extends SceneTree

# Observation fixture shared by before/after runs; it does not declare visual
# quality from clip names. The focused regression also checks evaluated bones.
var game
var label="before"
var report={"enemies":{},"scope":"Actual imported clips, live damage and one real controller tick; presentation only."}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-enemy-animation-audit/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false)
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	for kind in game.data.ENEMIES:
		var enemy=game.combat.spawn(kind,Vector3(0,16.05,5));enemy.set_physics_process(false)
		var entry={"clips":Array(enemy.animator.get_animation_list()),"requests":{}}
		for request in ["idle","walk","run","polish_attack","attack"]:
			enemy.play(request,true);enemy.animator.advance(.05);entry.requests[request]=enemy.animation
		enemy.mission="travel";enemy.mission_point=Vector3(0,16.05,-5);enemy.cooldown=100
		enemy.take_damage(8,enemy.position+Vector3.UP);entry.hitBeforeTick=enemy.animation
		enemy._physics_process(1.0/60);entry.hitAfterTick=enemy.animation
		enemy.take_damage(10000,enemy.position);enemy.animator.advance(.7);entry.death=enemy.animation
		report.enemies[kind]=entry;print("ENEMY_ANIMATION_AUDIT ",kind," ",entry)
		enemy.queue_free();await process_frame;game.combat.enemies.clear()
	var ranged=game.combat.spawn("warden",Vector3(50,16.05,0));ranged.set_physics_process(false)
	game.player.teleport(ranged.position+Vector3(0,0,4));ranged.cooldown=0
	ranged._physics_process(.01);report.rangedWindup={"seconds":ranged.windup,"animation":ranged.animation}
	ranged.queue_free();await process_frame;game.combat.enemies.clear()
	var file=FileAccess.open("res://../test-results/godot-native/enemy-animation-"+label+".json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
