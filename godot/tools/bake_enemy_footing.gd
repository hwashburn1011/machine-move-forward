extends SceneTree

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-enemy-footing-bake/";call_deferred("run")
func run():
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var models={}
	for kind in game.data.ENEMIES:
		var enemy=game.combat.spawn(kind,Vector3.ZERO,true);enemy.set_physics_process(false)
		enemy.animator.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL;enemy.animator.seek(0,true)
		await physics_frame;await physics_frame
		var heights=preload("res://tests/enemy_sole_geometry.gd").foot_heights(enemy)
		assert(not heights.is_empty(),"No evaluated boot geometry: "+kind)
		models[kind]={"visualY":enemy.visual.position.y-float(heights.min()),"sourceSha256":FileAccess.get_sha256(MMFEnemyModels.path(kind))}
		enemy.queue_free();await process_frame
	var file=FileAccess.open("res://data/enemy-footing.json",FileAccess.WRITE);assert(file!=null)
	file.store_string(JSON.stringify({"models":models},"\t")+"\n");file.close();print("ENEMY_FOOTING_BAKED ",models.size())
	game.open_menu("Pause");var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
