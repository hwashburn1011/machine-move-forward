extends SceneTree

var game
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-loot-deck-review/";call_deferred("run")

func capture(label: String):
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/loot-deck-"+label+".png"))

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.save_settings();game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	# Freeze only the campaign director and player movement. Use the real player
	# camera/spring arm, live HUD and real enemy death/reward path on the top deck.
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.teleport(Vector3(4,16.05,8));game.player.yaw=0;game.player.pitch=-.60;game.player.update_camera(1)
	game.player.play("armed_idle");game.effects.update(0);Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	game.session.inventory=MMFInventory.new(game.data.ITEMS,1);game.session.stores.clear()
	game.session.inventory.add("scrap",int(game.data.ITEMS.scrap.stackSize))
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var enemy=game.combat.spawn("warden",Vector3(5.2,16.05,5.5));enemy.set_physics_process(false)
	enemy.take_damage(10000,enemy.position)
	game.combat.loot_view.update()
	await create_timer(1.5).timeout
	await capture("aftermath")
	# Observe the existing corpse removal boundary before judging loose supplies.
	enemy._physics_process(5.1);game.combat.update(0)
	game.player.update_camera(1);await create_timer(.4).timeout
	await capture("full-storage")
	print("DECK_LOOT ",game.combat.loot_view.snapshot()," READOUT ",game.ui.loot_readout.label.text)
	game.session.inventory.remove("scrap",5)
	game.player.teleport(Vector3(4.6,16.05,6.8));game.player.update_camera(1);game.combat.update(0)
	await create_timer(.3).timeout
	await capture("partial-recovery")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
