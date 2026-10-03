extends SceneTree

var game
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-compact-terminal-review/";call_deferred("run")

func capture(label: String):
	await create_timer(.7).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://../test-results/godot-native/compact-terminal-"+label+".png")

func run():
	Engine.max_fps=60;DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.teleport(Vector3(0,16.1,-1));game.player.visual.rotation.y=PI;game.player.play("armed_idle")
	game.session.inventory.slots.fill(null)
	for item in [["water",4],["rations",3],["repair-kit",2],["scrap",80],["components",12],["fuel",8]]:game.session.inventory.add(item[0],item[1])
	game.session.health=78;game.session.hydration=62;game.session.nourishment=85
	game.ui.pack_view.selected="water"
	for page in ["Inventory","Workshop","Build","Machine","Signal","Records"]:
		game.open_menu(page);await capture(page.to_lower())
	for expedition in game.data.STORY_EXPEDITIONS.slice(0,2):
		if not expedition.journals.is_empty():game.session.story.journals.append(expedition.journals[0].id)
	game.session.polish.log=[{"speaker":"L–12","text":"Keep moving. I'll watch the rear approach."},{"speaker":"Unknown relay","text":"The shelter still has power."}]
	game.open_menu("Records");await capture("records-populated")
	for category in ["RESEARCH","WEAPONS"]:
		game.ui.workshop_view.category=category;game.ui.workshop_view.selected="";game.open_menu("Workshop");await capture(category.to_lower())
	game.ui.pack_view.filter="SUPPLIES";game.open_menu("Inventory");await capture("supplies")
	DisplayServer.window_set_size(Vector2i(1200,900));game.settings.terminal_text_scale=1.3;game.ui.terminal.apply_preferences();await capture("large-4x3")
	game.ui.workshop_view.category="CRAFT";game.ui.workshop_view.selected="";game.open_menu("Workshop");await capture("craft-large-4x3")
	paused=true
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit()
