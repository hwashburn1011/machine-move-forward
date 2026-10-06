extends "res://tests/narrative_delivery.gd"

# Prepared scene fixtures for reader layout and production authorization only.
func contracts():pass

func narrow_capture(id: String):
	DisplayServer.window_set_size(Vector2i(1024,768));await frames(6)
	check(game.ui.device_frame.visible,"Wrist housing visible: "+id)
	var rect=game.ui.panel.get_global_rect()
	check(root.get_visible_rect().encloses(rect),"Reader panel within narrow viewport: "+id)
	var buttons=game.ui.content.find_children("*","Button",true,false)
	for button in buttons:
		game.ui.scroller.ensure_control_visible(button);await frames(2)
		check(game.ui.scroller.get_global_rect().intersects(button.get_global_rect()),"Narrow scroll reaches "+button.text)
	game.ui.scroller.scroll_vertical=0;await frames(3)
	await capture("story-voice-"+id+"-narrow")
	DisplayServer.window_set_size(Vector2i(1440,900));await frames(5)

func world_tests():
	for pair in [["story-wake-link","wake-dispatch"],["story-array-comparison","array-false-corridor"]]:
		check(game.playtests.launch(pair[0]),"Reader fixture: "+pair[0]);await frames(5)
		var fact=MMFNativeNarrativeData.BEATS[pair[1]].fact
		if fact not in game.session.story.uniques:game.session.story.uniques.append(fact)
		game.narrative.observe()
		var point=game.campaign.points.filter(func(p):return p.entry.get("kind","")=="narrative")[0]
		check(preload("res://tests/expedition_fixture.gd").stand_at(game,point),"Reader supported position: "+pair[1])
		game.campaign.interact(point.entry);await frames(3)
		if pair[1]=="array-false-corridor":
			check(not game.story_voice.play(pair[1]),"Production Array reader requires comparison")
			game.narrative.comparison=true;game.ui.refresh()
		check(game.story_voice.play(pair[1]),"Production reader starts: "+pair[1])
		await create_timer(1.0).timeout
		await capture("story-voice-"+pair[1])
		await narrow_capture(pair[1])
		game.open_menu("Inventory");await frames(3)
		check(game.story_voice.beat_id=="","Changing wrist page stops recording")
	check(game.playtests.launch("finale-transfer"),"Berth layout fixture");await frames(4)
	# Layout-only completed state; the earned campaign actor proves the real transfer.
	game.session.finale.merge({"stage":"aftermath","powered":true,"seeds":true,"archive":true,"policy":"relay","completion":1},true)
	game.session.narrative.known.append("berth-keep-the-channel");game.finale.berth.sync()
	berth_station("transmitter");await frames(3)
	check(game.story_voice.play("berth-keep-the-channel"),"Production completed berth starts")
	await create_timer(1.0).timeout;await capture("story-voice-berth")
	await narrow_capture("berth")
	game.close_menu();await frames(3);check(game.story_voice.beat_id=="","Close berth reader stops recording")

func finish():
	var report={"checks":checks,"failures":failures,"source_hash":source,"source_hash_end":MMFPlaytestRecorder.source_fingerprint(),"renderer":RenderingServer.get_video_adapter_name(),"captures":captures,"human_test":false}
	var path="res://../test-results/story-voice/native-review.json"
	var file=FileAccess.open(path,FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	print("STORY_VOICE_REVIEW_RESULT ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
