extends "res://tests/deck_freight_performance.gd"

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.playtests.launch("scanner");game.invulnerable=true
	game.set_physics_process(false);game.player.set_physics_process(false)
	placed_count=await furnisher()
	for step in 2700:
		camera_update(float(step)/60.0)
		game.salvage.update_cranes(1.0/60.0)
	var passed=placed_count==3 and int(freight.deliveries)>=2 and int(freight.cable_frames)>0
	var report={"passed":passed,"workload":freight}
	var directory="res://../test-results/deck-audio/fixture-preflight/";DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
	FileAccess.open(directory+"connected-freight.json",FileAccess.WRITE).store_string(JSON.stringify(report,"\t"))
	print("PASS " if passed else "FAIL ","Connected freight fixture builds three modules and transfers actual grounded loads ",freight)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	call_deferred("quit",0 if passed else 1)
