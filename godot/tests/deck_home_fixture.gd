extends "res://tests/deck_home_performance.gd"

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.playtests.launch("scanner");game.invulnerable=true
	game.set_physics_process(false);game.player.set_physics_process(false)
	var floors=game.session.structures.filter(func(p):return p.definitionId=="floor").size()
	placed_count=await furnisher()
	var current_floors=game.session.structures.filter(func(p):return p.definitionId=="floor").size()
	var passed=placed_count==50 and dock_ids.size()==3 and floors==current_floors
	for level in [-2,-1,0]:passed=passed and workload.placed.any(func(p):return p.cell.y==level)
	var report={"passed":passed,"furnishings":placed_count,"docks":dock_ids.size(),"added_floors":current_floors-floors,"workload":workload}
	var directory="res://../test-results/deck-audio/fixture-preflight/";DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
	FileAccess.open(directory+"native-home.json",FileAccess.WRITE).store_string(JSON.stringify(report,"\t"))
	print("PASS " if passed else "FAIL ","Native home fixture has50 furnishings,3docks and no expansion floors")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	call_deferred("quit",0 if passed else 1)
