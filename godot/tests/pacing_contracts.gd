extends SceneTree

var game
var checks=0
var failures=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-pacing-contract-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	for i in 4:await process_frame
	var s=game.session
	for fraction in [0.0,.4,1.0]:
		var old=s.native_snapshot();old.scanner.phase="scanning";old.scanner.elapsedS=180*fraction;old.scanner.erase("durationS")
		var restored=MMFSession.new(game.data)
		check(restored.restore_native(old) and is_equal_approx(restored.scan_fraction(),fraction),"Legacy scan preserves completion fraction "+str(fraction))
		old.scanner.durationS=90;old.scanner.elapsedS=90*fraction
		check(restored.restore_native(old) and is_equal_approx(restored.scan_fraction(),fraction),"Changed-duration scan migrates proportionally "+str(fraction))
	var bad=s.native_snapshot();bad.scanner.durationS=0
	check(not MMFSession.new(game.data).restore_native(bad),"Zero scan duration rejected before division")
	s.facts.salvage=true;s.scanner.phase="scanning";s.scanner.elapsedS=0;s.update_power()
	s.tick(1,false,true);check(s.scanner.elapsedS==0,"Unstable encounter pauses eligible scanner time")
	s.tick(1,true,false);check(s.scanner.elapsedS==0,"Leaving machine pauses eligible scanner time")
	s.tick(1,true,true);check(s.scanner.elapsedS==1,"Only stable aboard powered time advances scanner")
	check(MMFObjectiveGuide.describe(s).pin.get("id","")=="turret-manual","Scanning offers useful preparation without shortening timer")
	s.scanner.phase="consumed";s.opening_done=true;game.started=true;game.close_menu();s.story.phase="route-selection";s.story.index=1
	s.health=100;s.clock=500;game.journey.quiet_until=0
	var before=s.native_snapshot();var gate=game.combat.scheduling_state()
	check(gate.allowed and before==s.native_snapshot(),"Encounter eligibility query is pure")
	s.health=20;check(game.combat.scheduling_state().reason=="Player recovering","Low health gives a readable encounter hold")
	s.health=100;game.journey.quiet_until=600
	check(game.combat.scheduling_state().reason=="Protected briefing","Briefing interval blocks random scheduling")
	game.journey.quiet_until=0;s.story.phase="docked"
	check(game.combat.scheduling_state().sanctuary and not game.combat.scheduling_state().allowed,"Docked expedition preserves sanctuary")
	s.story.phase="route-selection"
	game.combat.scout.begin()
	check(not game.combat.scheduling_state().allowed,"Active scout occupies encounter slot")
	game.combat.begin_ship("skiff")
	check(game.combat.ship_state=="none","Second carrier cannot stack onto active scout")
	game.combat.scout.clear_visuals()
	var scripted=game.data.FOUNDRY_ROUTES.filter(func(route):return route.scriptedVehicle!=null)[0]
	s.story.index=1;s.story.routeId=scripted.id;s.story.phase="approach";s.story.scripted="not-due";s.story.arrival=s.distance+scripted.scriptedVehicleRemainingM-1
	game.combat.ship_state="retreat";game.campaign.update(0)
	check(s.story.scripted=="not-due","Retreating carrier cannot consume a scheduled route fight")
	game.combat.ship_state="none";game.campaign.update(0)
	check(s.story.scripted=="queued" and game.combat.ship_state=="approach","Scheduled route fight retries when the encounter slot clears")
	game.combat.reset_encounter();s.story.phase="route-selection"
	s.contacts.active={"kind":"salvage-wreck","salvageMode":""}
	game.combat.ship_state="retreat";game.opportunities.choose_salvage("broadcast")
	check(s.contacts.active.salvageMode=="","Refused broadcast does not consume the salvage choice")
	game.combat.ship_state="none";game.opportunities.choose_salvage("broadcast")
	check(s.contacts.active.salvageMode=="broadcast" and game.combat.ship_state=="approach","Broadcast commits only after its carrier starts")
	game.combat.reset_encounter();s.contacts.active={}
	s.expedition_gear.recovered=["battery-bank","quiet-drive"]
	var battery=s.create_piece("battery-bank",{"x":2,"y":0,"z":2},0,{},true);battery.state.charge=120
	s.create_piece("quiet-drive",{"x":3,"y":0,"z":2},0,{},true);s.story.uniques.append("course-gyro");s.update_power()
	before=s.native_snapshot()
	var backup=MMFNativeProgression.battery_preview(s)
	check(backup.draw==2 and backup.seconds==60,"Charged bank reports current receiver+helm reserve")
	check(before==s.native_snapshot(),"Reserve preview does not cut generation or drain charge")
	var normal=MMFNativeProgression.drive_preview(s)
	s.expedition_gear.quiet=true;s.update_power()
	var quiet=MMFNativeProgression.drive_preview(s)
	check(normal==quiet and normal.normal_generation-normal.quiet_generation==4,"Drive comparison agrees from either live mode")
	check(normal.quiet_speed_ratio==.65 and normal.quiet_detection_ratio==.5,"Comparison preserves existing speed/detection tradeoff")
	var report={"checks":checks,"failures":failures,"scope":"Synthetic correctness fixtures; no human pacing or campaign balance claim","scan_duration_seconds":MMFSession.SCAN_DURATION_SECONDS,"source_hash":MMFPlaytestRecorder.source_fingerprint()}
	var file=FileAccess.open("res://../docs/godot-port/results/pacing-contracts-2026-09-28.json",FileAccess.WRITE)
	if file:file.store_string(JSON.stringify(report,"  "))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)
