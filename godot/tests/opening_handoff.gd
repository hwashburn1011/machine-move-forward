extends SceneTree

var game
var checks=0
var failures=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-opening-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count=3):
	for i in count:await process_frame

func prepare() -> bool:
	var start=Time.get_ticks_msec()
	while not game.cinematics.opening_stage.prepared() and Time.get_ticks_msec()-start<15000:await process_frame
	return game.cinematics.opening_stage.prepared()

func run():
	Engine.max_fps=240
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	var s=game.session;var c=game.cinematics;var helper=c.opening_stage
	var before=s.native_snapshot();var rng=s.rng.state
	check(paused and not game.started,"The title starts with simulation paused")
	game.new_game();game.new_game()
	check(helper.requested and not game.started and paused and game.ui.page=="Departure","Immediate and repeated New Game clicks leave simulation paused behind loading UI")
	check(not game.ui.tabs.visible and game.ui.return_button.visible,"Pending departure exposes a way back without gameplay tabs")
	var escape=InputEventAction.new();escape.action="pause";escape.pressed=true;game._input(escape)
	check(not helper.requested and game.ui.page=="Title" and not game.started,"Escape cancels the pending start and returns to title")
	game.open_menu("Settings")
	check(await prepare(),"Opening finishes background preparation while settings remain usable")
	check(game.ui.page=="Settings" and not game.started and game.cinematic=="","A cancelled start does not launch after its resources arrive")
	check(s.native_snapshot()==before and s.rng.state==rng,"Title preparation preserves campaign state and gameplay RNG")
	var prepared=helper.stage
	check(not prepared.visible and prepared.process_mode==Node.PROCESS_MODE_DISABLED,"Prepared geometry is hidden and actors do not animate")
	check(prepared.get_child_count()==3 and MMFAssets.of_type(prepared,"AnimationPlayer").size()==2,"Set contains the original rooftop and exactly two animated pursuers")
	check(MMFAssets.of_type(prepared,"CollisionObject3D").is_empty(),"Hidden opening introduces no invisible physics obstacles")
	for id in ["warden","revenant"]:
		var actor=prepared.get_node(id)
		check(is_equal_approx(MMFAssets.bounds(actor).size.y*actor.scale.y,1.92),"Original pursuer scale: "+id)
	var roof=prepared.get_node("Rooftop");var model_ids=[prepared.get_node("warden").get_instance_id(),prepared.get_node("revenant").get_instance_id()]
	game.open_menu("Title");game.new_game()
	check(game.started and not paused and game.cinematic=="opening" and not game.ui.panel.visible,"Prepared New Game enters the existing cinematic and closes the title")
	check(c.scenery==prepared and c.rooftop==roof and roof.get_parent()==c,"Activation reuses the prepared set and preserves the departing rooftop")
	check([c.actors[0].get_instance_id(),c.actors[1].get_instance_id()]==model_ids and helper.stage==null,"Both prepared actors are reused without duplicate instances")
	c.update(1.0/60)
	var sample=c.timeline.samples[1]
	check(game.player.position.is_equal_approx(MMFAssets.v(sample.player.position)-Vector3.UP*.96),"The chase starts at the original first timeline sample")
	for i in 2:check(c.actors[i].position.is_equal_approx(MMFAssets.v(sample.pursuers[i].position)-Vector3.UP*.96),"Original pursuer chase placement "+str(i))
	# Step the existing timeline at its intended rate, without rendering sleeps.
	var explosions=game.effects.explosion_cursor
	for i in 607:c.update(1.0/60);game.effects.update(1.0/60)
	check(game.cinematic=="opening" and not s.opening_done,"The opening does not finish early")
	check(game.effects.explosion_cursor==explosions+2 and not c.actors[0].visible and not c.actors[1].visible,"Both original kill events retain their explosions and defeated pursuers")
	for i in 5:c.update(1.0/60)
	check(game.cinematic=="" and s.opening_done and game.player.camera.current,"The original 10.2-second handoff restores player control")
	check(game.player.position==Vector3(10,16.1,0) and game.player.velocity==Vector3.ZERO,"Handoff keeps the original landing position and stationary velocity")
	await frames()
	check(not is_instance_valid(prepared) and is_instance_valid(roof) and c.actors.is_empty(),"Finishing removes actors while the rooftop remains to recede")
	s.distance=c.rooftop_departure+161;c.update(0);await frames()
	check(c.rooftop==null and not is_instance_valid(roof),"The old rooftop leaves behind the machine and is released at the existing distance")
	# A pending request must not override Continue or a library restore.
	game.started=false;game.open_menu("Title");helper.set_process(true)
	MMFAssets.cache.erase(MMFOpeningStage.PATHS[0]);helper._process(0)
	check(helper.pending!="","Cancellation fixture has an actual engine loading request")
	helper.request()
	var payload={"session":s.native_snapshot(),"player":{"position":{"x":0,"y":16.1,"z":5},"yaw":0,"pitch":0},"cargo":[]}
	game.load_payload(payload);await frames(30)
	check(game.started and game.cinematic=="" and game.session.opening_done and not helper.requested and helper.stage==null,"Loading a completed-opening campaign cancels preparation without replaying the chase")
	var deadline=Time.get_ticks_msec()+15000
	while helper.pending!="" and Time.get_ticks_msec()<deadline:await process_frame
	check(helper.pending=="" and not helper.is_processing(),"Superseded request is consumed and the idle helper stops processing")
	payload.session.openingDone=false
	game.load_payload(payload)
	check(game.cinematic=="opening" and c.actors.size()==2 and c.rooftop!=null,"An unfinished-opening save retains its immediate complete fallback")
	c.finish();await frames()
	check(game.session.opening_done and game.cinematic=="","Skipping the restored opening retains the normal handoff")
	var previous_game_id=game.get_instance_id()
	game.new_game();await frames(1)
	game=current_scene;game.set_physics_process(false);game.player.set_physics_process(false)
	c=game.cinematics;helper=c.opening_stage
	deadline=Time.get_ticks_msec()+15000
	while game.cinematic!="opening" and Time.get_ticks_msec()<deadline:await process_frame
	check(game.get_instance_id()!=previous_game_id and game.cinematic=="opening" and c.actors.size()==2,"New Campaign from an existing session reloads once and prepares the new opening")
	check(not has_meta("new_native_campaign") and not game.session.opening_done,"Reload consumes its launch request and resets the old campaign")
	c.finish();await frames()
	game.started=false;game.open_menu("Title");MMFAssets.cache.erase(MMFOpeningStage.PATHS[0]);helper.set_process(true);helper._process(0)
	check(helper.pending!="","Shutdown fixture has an outstanding engine request")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear()
	var report={"checks":checks,"failures":failures,"scope":"Paused-title preparation, early/repeated clicks, cancellation, hidden physics/state invariants, original opening events/handoff, Continue and incomplete-save fallback, and shutdown with an engine request."}
	var file=FileAccess.open("res://../test-results/godot-native/opening-handoff.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("OPENING_HANDOFF_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
