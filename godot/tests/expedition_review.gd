extends "res://tests/physical_expeditions.gd"

# Fast final art inspection after the separate input-driven traversal suite.
func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	await frames(8)
	var fixture=preload("res://tests/expedition_fixture.gd")
	for preset in PRESETS:
		game.playtests.launch(preset);await frames(5)
		game.set_physics_process(false);game.player.set_physics_process(false)
		for instrument in MMFExpeditionMechanisms.SITES[game.campaign.expedition().id]:
			var first=MMFExpeditionMechanisms.STEPS[instrument][0]
			fixture.open_step(game,instrument,first);game.close_menu()
			var target=game.campaign.destination.to_global(MMFExpeditionMechanisms.control(instrument,first).at)
			var delta=target-game.player.position;game.player.yaw=atan2(-delta.x,-delta.z);game.player.visual.rotation.y=game.player.yaw+PI
			await capture(preset+"-"+instrument+"-final-art",target)
		for kind in ["journal","objective","unique"]:
			for point in game.campaign.points.duplicate():
				if point.entry.kind==kind and game.campaign.can_show(point.entry):check(await fixture.complete(game,point.entry),preset+": final art fixture remains functional")
		game.close_menu()
		for instrument in game.activity.view.movers:
			var spec=game.activity.view.movers[instrument]
			var target=game.activity.view.to_global(spec.to)
			var point=fixture.point(game,"mechanism-"+instrument+"-"+MMFExpeditionMechanisms.STEPS[instrument][0])
			fixture.stand_at(game,point)
			var delta=target-game.player.position;game.player.yaw=atan2(-delta.x,-delta.z);game.player.visual.rotation.y=game.player.yaw+PI
			await capture(preset+"-"+instrument+"-final-open",target)
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	print("EXPEDITION_FINAL_ART ",JSON.stringify({"checks":checks,"failures":failures}));quit(0 if failures.is_empty() else 1)
