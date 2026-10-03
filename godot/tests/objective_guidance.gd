extends SceneTree

var game
var checks=0
var failures=[]

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-objective-guidance-tests/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(n: int=3):
	for i in n:await process_frame

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	await frames(5)
	var s=game.session
	var before=s.native_snapshot()
	for i in 10:s.objective()
	check(before==s.native_snapshot(),"Objective rendering has no progression side effects")
	check(MMFObjectiveGuide.describe(s).id=="salvage","Fresh campaign directs to salvage")
	s.facts.salvage=true;s.scanner.phase="awaiting-module"
	check(MMFObjectiveGuide.describe(s).id=="build-refinery","Receiver recovery directs to refinery")
	var refinery=s.create_piece("refinery",{"x":-3,"y":0,"z":-3},0,{},true)
	check(s.facts.refineryBuilt,"A build transaction records the historical refinery fact")
	check(MMFObjectiveGuide.describe(s).id=="refine","Working refinery directs to component crafting")
	refinery.health=0
	check(MMFObjectiveGuide.describe(s).id=="build-refinery" and s.facts.refineryBuilt,"Destroyed refinery requests recovery without clearing history")
	refinery.health=s.data.BUILD_PIECES.refinery.maxHealth;s.facts.refined=12
	check(MMFObjectiveGuide.describe(s).id=="refine","Spent historical components do not imply an affordable workbench")
	s.inventory.add("components",4);s.facts.refined=0
	check(MMFObjectiveGuide.describe(s).id=="build-workbench","Recovered components fund workbench without a refining quota")
	refinery.health=0
	check(MMFObjectiveGuide.describe(s).id=="build-workbench","Recovered components bypass an unnecessary refinery rebuild")
	refinery.health=s.data.BUILD_PIECES.refinery.maxHealth
	var bench=s.create_piece("workbench",{"x":-3,"y":0,"z":-1},0,{},true)
	check(MMFObjectiveGuide.describe(s).id=="craft-scanner","Workbench directs to scanner module recipe")
	s.inventory.add("scanner-replacement-module",1)
	check(MMFObjectiveGuide.describe(s).id=="install-scanner","Already carried module directs to physical receiver")
	s.inventory.remove("scanner-replacement-module",1)
	var guide=game.guidance
	var state_before_pin=s.native_snapshot()
	guide.toggle_pin("recipe","craft-scanner-replacement-module")
	var list=guide.checklist()
	check(list.manual and list.station=="workbench","Manual recipe pin identifies its physical station")
	check(list.items.size()==2,"Recipe checklist uses real recipe inputs")
	state_before_pin.polish["pin"]={"kind":"recipe","id":"craft-scanner-replacement-module"}
	check(s.native_snapshot()==state_before_pin,"Pinning neither crafts nor spends resources")
	var restored=MMFSession.new(game.data)
	check(restored.restore_native(s.native_snapshot()) and restored.polish.pin.id=="craft-scanner-replacement-module","Pin identity survives native save validation")
	var invalid=s.native_snapshot();invalid.polish.pin.id="missing-recipe"
	var restored_before=restored.native_snapshot()
	check(not restored.restore_native(invalid) and restored.native_snapshot()==restored_before,"Unknown pin fails before live save mutation")
	var legacy=s.native_snapshot();legacy.polish.erase("pin")
	check(restored.restore_native(legacy) and restored.polish.pin.is_empty(),"Legacy saves default to no manual pin")
	guide.toggle_pin("build","crate")
	check(guide.is_pinned("build","crate") and guide.checklist().kind=="build","One manual build pin replaces a recipe pin")
	guide.clear_pin()
	check(s.polish.pin.is_empty() and not guide.checklist().manual,"Clearing pin resumes suggested requirements")
	s.update_power()
	check(guide.checklist().reason=="","Powered workbench requirement is truthful")
	s.fuel=0;s.update_power()
	# Workbench itself has no base power draw; refinery does.
	guide.toggle_pin("recipe","refine-components")
	check(guide.checklist().reason.contains("Power"),"Unpowered refinery checklist explains the requirement")
	s.fuel=60;s.update_power()
	guide.clear_pin()
	game.started=true;s.opening_done=true;game.close_menu()
	game.settings.objective_markers=true
	guide.update(1)
	check(is_instance_valid(guide.marker) and not guide.marker.text.is_empty(),"Optional target marker resolves the current station")
	var camera_before=game.player.camera.global_transform
	game.player.camera.make_current();game.player.camera.look_at(guide.marker.global_position);game.player.camera.reset_physics_interpolation();await frames();guide.fit_marker()
	check(guide.marker.visible,"Centered target marker fits the safe viewport area")
	game.player.camera.rotate_y(PI);guide.fit_marker()
	check(not guide.marker.visible,"Behind-camera marker cannot clip into HUD")
	game.player.camera.global_transform=camera_before
	game.settings.objective_markers=false;guide.update(1)
	check(not guide.marker.visible,"Marker preference hides world guidance")
	game.settings.objective_markers=true
	bench.health=0;guide.refresh_left=0;guide.update(1)
	check(guide.target().is_empty(),"Removing prerequisite clears freed/missing station target")
	bench.health=s.data.BUILD_PIECES.workbench.maxHealth
	game.open_station("Workshop","workbench",bench.instanceId)
	check(game.ui.panel.get_parent()==game.ui.root and not game.ui.terminal.active,"Recipe pins keep the station interface independent of wrist")
	game.open_menu("Inventory")
	check(game.ui.terminal.active,"Personal pack remains on wrist computer")
	game.close_menu();await frames()
	check(game.player.camera.current and not game.ui.terminal.presenting(),"Closing personal menu returns camera immediately")
	s.scanner.phase="consumed";s.story.phase="route-selection"
	check(not s.objective().contains("wrist") and s.objective().contains("helm"),"Later route guidance names the physical navigation helm")
	for entry in game.playtests.PRESETS:
		var checkpoint=MMFSession.new(game.data)
		check(checkpoint.restore_native(game.playtests.payload(entry.id).session),"Checkpoint remains valid: "+entry.id)
		var old=checkpoint.native_snapshot();var task=MMFObjectiveGuide.describe(checkpoint)
		check(not task.id.is_empty() and checkpoint.native_snapshot()==old,"Pure objective at checkpoint: "+entry.id)
	var output="res://../test-results/beta-next/objective-guidance.json"
	var file=FileAccess.open(output,FileAccess.WRITE)
	if file:file.store_string(JSON.stringify({"checks":checks,"failures":failures,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"human_test":false},"  "))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)
