extends SceneTree

var game
var events=[]
var failures=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-journey-pacing-tests/"
	call_deferred("run")

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true
	game.session.facts.merge({"salvage":true,"refineryBuilt":true,"workbenchBuilt":true,"defenseCrewed":true,"tutorialStarted":true,"defenses":1},true)
	game.session.scanner.phase="consumed";game.session.story.phase="route-selection";game.session.story.index=1
	game.session.threat={"phase":"calm","remaining":0.0,"legacy":0.0,"warning":false}
	game.session.fuel=100;game.session.update_power();game.close_menu()
	var route=game.campaign.routes().filter(func(r):return r.scriptedVehicle==null)[0]
	game.campaign.begin_route(route.id)
	game.session.story.scripted="resolved"
	game.journey.reset();game.journey.last_phase="route-selection"
	# Let actual physics/render frames advance; no accelerated game ticks.
	var start=Time.get_ticks_msec();var clock_start=game.session.clock
	var previous_phase="";var protected_until=0.0;var message_started=-1.0;var attack_started=-1.0
	var frames_ms=[];var previous=start
	while Time.get_ticks_msec()-start<65000:
		await process_frame
		var now=Time.get_ticks_msec();frames_ms.append(now-previous);previous=now
		if not game.journey.current.is_empty() and message_started<0:
			message_started=game.session.clock-clock_start;protected_until=game.journey.quiet_until
			events.append({"atSeconds":message_started,"event":"departure transmission","quietUntil":protected_until-clock_start})
		if game.session.threat.phase!=previous_phase:
			previous_phase=game.session.threat.phase;events.append({"atSeconds":game.session.clock-clock_start,"event":previous_phase})
		if game.combat.active_threat() and attack_started<0:
			attack_started=game.session.clock-clock_start;events.append({"atSeconds":attack_started,"event":"boarding craft"})
			if game.session.clock<protected_until: failures.append("Random attack interrupted protected departure briefing")
	if message_started<0: failures.append("Departure transmission was never delivered")
	if attack_started<0: failures.append("Random boarding remained suppressed after quiet interval")
	if absf(game.session.clock-clock_start-65)>4: failures.append("Smoke run did not maintain normal simulation speed")
	var report={"passed":failures.is_empty(),"failures":failures,"wallSeconds":(Time.get_ticks_msec()-start)/1000.0,"simulationSeconds":game.session.clock-clock_start,"events":events,"renderer":RenderingServer.get_video_adapter_name(),"scope":"65 second real-time automated route/boarding pacing sample; not a whole campaign playthrough"}
	var file=FileAccess.open("res://../test-results/godot-native/journey-pacing.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print(JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking(): await create_timer(.1).timeout
	game.queue_free()
	for i in 4: await physics_frame
	MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
