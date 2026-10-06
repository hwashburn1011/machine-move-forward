extends "res://tests/narrative_delivery.gd"

# Prepared real-page fixtures; not a claim of earned progression or human discovery.
const OUT="res://../test-results/v1-playthrough-ui-20261005/"
var prefix="headless"

func contracts():
	for site in game.data.STORY_EXPEDITIONS:
		for entry in site.interactables:
			if entry.kind=="departure" and site.id!="wreck-one":check(entry.label=="Gangway / Nomad","Neutral usable gangway: "+site.id)
	for id in MMFExpeditionMechanisms.STEPS:
		for action in MMFExpeditionMechanisms.STEPS[id]:
			if id=="power" and action=="bus" or id=="array" and action!="lock":continue
			var help=MMFExpeditionActivity.mechanism_help(id,action)
			check(help.contains("service sweep")==MMFExpeditionMechanisms.moving_step(id,action),"Clearance advice matches actual movement: "+id+"/"+action)
	check(MMFMeridianFinale.POLICIES.relay.contains("Fewer strangers") and MMFMeridianFinale.POLICIES.relay.contains("longer") and MMFMeridianFinale.POLICIES.relay.contains("off the open channel") and MMFMeridianFinale.POLICIES.relay.contains("does not depend"),"Relay prose retains reach, delay, privacy and independence consequences")

func labels() -> String:
	return "\n".join(MMFAssets.of_type(game.ui.content,"Label").map(func(label):return label.text))

func button(prefix_text: String) -> Button:
	for item in MMFAssets.of_type(game.ui.content,"Button"):
		if item.text.begins_with(prefix_text):return item
	return null

func press(item: Button):
	check(is_instance_valid(item) and not item.disabled,"Available keyboard action")
	if not is_instance_valid(item) or item.disabled:return
	await frames(3) # Allow the page's deferred default focus to settle first.
	game.ui.scroller.ensure_control_visible(item);item.grab_focus();await frames(2)
	var key=InputEventKey.new();key.keycode=KEY_ENTER;key.physical_keycode=KEY_ENTER;key.pressed=true
	Input.parse_input_event(key);await frames(2);key=key.duplicate();key.pressed=false;Input.parse_input_event(key);await frames(4)

func capture(name: String):
	if DisplayServer.get_name()=="headless":return
	await frames(5);await RenderingServer.frame_post_draw
	var path=OUT+prefix+"-"+name+".png"
	check(root.get_texture().get_image().save_png(path)==OK,"Capture: "+name)
	captures.append(ProjectSettings.globalize_path(path))

func page_review(name: String,station: bool=true):
	await frames(6)
	var ui=game.ui
	if station:
		check(ui.device_frame.visible and ui.device_frame.station_link and not ui.terminal.active and ui.panel.get_parent()==ui.root,"Linked device presentation preserves station ownership: "+name)
		check(ui.panel.theme==ui.device_frame.screen_theme,"Muted shared station controls: "+name)
	check(ui.panel.get_global_rect().grow(2).encloses(ui.return_button.get_global_rect()),"Persistent close control fits: "+name)
	if DisplayServer.get_name()!="headless":
		check(ui.root.get_global_rect().grow(2).encloses(ui.panel.get_global_rect()),"Panel fits viewport: "+name)
		var horizontal=ui.scroller.get_h_scroll_bar()
		check(horizontal.max_value<=horizontal.page+1,"No horizontal overflow: "+name)
	ui.scroller.scroll_vertical=0;await capture(name)
	for action in MMFAssets.of_type(ui.content,"Button"):
		ui.scroller.ensure_control_visible(action);await frames(2)
		check(ui.scroller.get_global_rect().grow(2).encloses(action.get_global_rect()),"Scroll reaches full control: "+action.text)
	ui.scroller.scroll_vertical=0

func reader(id: String,checkpoint: String):
	check(game.playtests.launch(checkpoint),"Reader fixture: "+id);await frames(5)
	var fact=MMFNativeNarrativeData.BEATS[id].fact
	if fact not in game.session.story.uniques:game.session.story.uniques.append(fact)
	game.narrative.observe()
	var point=game.campaign.points.filter(func(p):return p.entry.get("beat","")==id)[0]
	check(preload("res://tests/expedition_fixture.gd").stand_at(game,point),"Supported reader position: "+id)
	game.campaign.interact(point.entry);await frames(3)
	if id=="array-false-corridor":
		check(not game.story_voice.play(id),"Comparison gate remains closed before comparison")
		await press(button("COMPARE BOTH REFERENCES"))
		check(game.narrative.comparison and is_instance_valid(button("REVIEW COMPARISON")),"Completed comparison offers review instead of a fresh comparison")
	check(game.story_voice.play(id),"Voluntary local playback: "+id)
	game.story_voice.toggle_pause();await frames(2)
	check(labels().count("ANNIKA")==1,"Recording speaker identity appears once: "+id)
	check(labels().count(MMFNativeNarrativeData.BEATS[id].text)==1,"Complete transcript appears once: "+id)
	check(game.story_voice.caption.text.begins_with("PAUSED · 0:"),"Playback reports status without duplicating spoken sentences")
	await page_review(id)
	game.close_menu();await frames(3);check(game.story_voice.beat_id=="","Closing reader still stops audio")

func world_tests():
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	var sizes=[Vector2i(1440,810),Vector2i(1024,768)] if DisplayServer.get_name()!="headless" else [Vector2i.ZERO]
	for size in sizes:
		if size!=Vector2i.ZERO:DisplayServer.window_set_size(size);prefix="%dx%d"%[size.x,size.y];await frames(8)
		check(game.playtests.launch("story-wake-link"),"Workshop fixture");await frames(5)
		var bench=game.session.structures.filter(func(p):return p.definitionId=="workbench")[0]
		local_station("Workshop","workbench",game.building.center(bench.cell)+Vector3(0,0,1),bench.instanceId)
		await page_review("workshop")
		check(game.ui.preferred_focus.get_theme_stylebox("normal").bg_color==Color("405443"),"Workshop selection uses the muted device palette")
		check(game.ui.return_button.text.contains("ENTER"),"Interactive station keeps keyboard navigation hint")
		game.open_station("Signal","receiver");await page_review("signal")
		var contact=game.opportunities.make_contact(2);contact.kind="fuel-cache";contact.atDistanceM=game.session.distance-100;contact.worldX=game.session.lateral+40;contact.expiresAtM=game.session.distance+180
		game.session.contacts.active=contact;game.ui.refresh();await frames(5)
		check(labels().contains("PASSED SIGNAL") and labels().contains("108 m away · BEHIND THE NOMAD"),"Passed contact UI displays true distance and direction")
		await page_review("signal-passed")
		contact.atDistanceM=game.session.distance+400;contact.worldX=game.session.lateral;contact.expiresAtM=game.session.distance-1;game.ui.refresh();await frames(5)
		check(game.opportunities.preview().reachable and game.opportunities.preview().window_closed and button("INTERCEPT").disabled,"Ahead contact with expired window cannot be intercepted")
		await capture("signal-window-closed")
		game.session.contacts.active={};game.session.scanner.phase="scanning";game.session.facts.salvage=true;game.ui.refresh();await frames(4)
		check(labels().contains(game.hint(game.guidance.current_task().action)),"Receiver shows current scan action guidance")
		await capture("signal-scanning")
		game.close_menu();game.ui.show_record("Relay note",game.data.STORY_EXPEDITIONS[1].journals[0].text);await frames(6)
		check(not game.ui.return_button.text.contains("ENTER") and game.ui.return_button.text.contains("CLOSE"),"Read-only note advertises close only")
		check(game.ui.terminal.active and game.ui.panel.get_parent()==game.ui.terminal.display_root,"Personal note stays on physical wrist")
		await create_timer(.65).timeout
		await capture("read-only-note")
		game.close_menu();game.manual_turret="fixture-mounted";game.ui._process(0)
		check(game.ui.prompt.text.contains("Dismount") and not game.ui.prompt.text.to_lower().contains("hook") and not game.ui.prompt.text.contains("Wrist"),"Mounted footer offers fire/dismount and no unavailable salvage/wrist controls")
		check(game.ui.hud.text.contains("MANUAL DECK GUN") and not game.ui.hud.text.contains("Scrapline"),"Mounted HUD names the gun being operated")
		await capture("mounted-footer");game.manual_turret=""
		await reader("wake-dispatch","story-wake-link")
		await reader("array-false-corridor","story-array-comparison")
		check(game.playtests.launch("orchard-caretaker"),"Service fixture");await frames(5)
		var expedition=game.campaign.expedition()
		for fact in expedition.requiredUniques:
			if fact not in game.session.story.uniques:game.session.story.uniques.append(fact)
		for fact in expedition.get("requiredObjectives",[]):
			if fact not in game.session.story.objectives:game.session.story.objectives.append(fact)
		var bay=game.engineering.bay();check(not bay.is_empty(),"Prepared completed site provides service bay")
		empty(game.session);game.session.inventory.add("fuel",4);game.session.inventory.add("scrap",100);game.session.fuel=98
		local_station("Service","service-bay",bay.at)
		await page_review("service")
		check(labels().contains("pack / storage") and labels().contains("pump → machine tank"),"Service distinguishes owned fuel items and direct pump supply")
		await press(button("TRANSFER 5 FUEL ITEMS"))
		check(game.session.fuel==100 and total(game.session,"fuel")==2,"Transfer action still consumes only owned whole items that fit")
		game.session.fuel=90;game.ui.refresh();var stock=game.session.recovery.stock[bay.id];var scrap=total(game.session,"scrap")
		await press(button("FILL TANK +5"))
		check(game.session.fuel==95 and total(game.session,"fuel")==2 and game.session.recovery.stock[bay.id]==stock-5 and total(game.session,"scrap")==scrap-5*MMFMachineService.FUEL_PRICE,"Pump purchase still fills tank directly at unchanged cost and stock")
		check(game.playtests.launch("meridian-quiet"),"Mechanism fixture");await frames(5)
		check(preload("res://tests/expedition_fixture.gd").open_step(game,"archive","verify"),"Reach actual archive verification control")
		check(labels().contains("preserved memory is intact") and not labels().contains("service sweep"),"Verification explains this stationary task")
		await page_review("archive-verify")
		check(game.playtests.launch("finale-transfer"),"Ending fixture");await frames(4)
		game.session.finale.merge({"stage":"aftermath","powered":true,"seeds":true,"archive":true,"policy":"relay","completion":1},true)
		game.session.narrative.known.append("berth-keep-the-channel");game.finale.berth.sync();berth_station("transmitter")
		await page_review("relay-aftermath")
		check(labels().contains(MMFNativeNarrativeData.BEATS["berth-keep-the-channel"].text),"Ending retains unchanged spoken transcript")

func finish():
	var report={"checks":checks,"failures":failures,"source_hash":source,"source_hash_end":MMFPlaytestRecorder.source_fingerprint(),"captures":captures,"prepared_fixtures":true,"human_test":false}
	FileAccess.open(OUT+("headless" if DisplayServer.get_name()=="headless" else "native")+".json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	print("PLAYTHROUGH_UI_RESULT ",JSON.stringify(report))
	game.close_menu();while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
