extends SceneTree

var game
var checks=0
var failures=[]
var captures=[]
var output="res://../test-results/deck-audio/wrist/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://quiet-wrist-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count: int=3):
	for i in count:await process_frame

func button_named(prefix: String):
	for child in game.ui.content.find_children("*","Button",true,false):
		if child.text.begins_with(prefix):return child
	return null

func shot(name: String):
	if DisplayServer.get_name()=="headless":return
	await create_timer(.65).timeout;await frames(4);await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+name+".png");captures.append(name+".png")

func run():
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	Engine.max_fps=60
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false);await frames(8)
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.player.teleport(Vector3(0,16.07,3));game.player.yaw=0;game.player.pitch=-.06;game.player.update_camera(1)
	var s=game.session;var ui=game.ui
	var legacy=s.native_snapshot();legacy.polish.erase("receipts")
	var restored=MMFSession.new(game.data)
	check(restored.restore_native(legacy) and restored.polish.get("receipts",[]).is_empty(),"Old saves open with an empty local activity log")
	s.polish.log=[{"speaker":"ANNIKA","text":"Keep the names safe."}];s.polish.receipts=[]
	for i in 40:MMFWristLog.append(s,"Recovered supply %d"%i)
	check(s.polish.receipts.size()==32 and s.polish.receipts.front().text=="Recovered supply 8","Local receipts are bounded and retain the most recent activity")
	check(s.polish.log.size()==1 and s.polish.log[0].speaker=="ANNIKA","Repeated collection cannot evict story transmissions")
	MMFWristLog.append(s,"Recovered supply 39");MMFWristLog.append(s," ")
	check(s.polish.receipts.size()==32,"Immediate duplicate and blank receipts do not crowd the log")
	check(restored.restore_native(JSON.parse_string(JSON.stringify(s.native_snapshot()))) and restored.polish.receipts.size()==32,"Local receipts round-trip through JSON saves")
	for invalid in [[{"text":"x","at":-1}],[{"text":"x","at":"now"}],[{"text":7,"at":0}],[{"text":"x".repeat(2049),"at":0}],"bad"]:
		var broken=s.native_snapshot();broken.polish.receipts=invalid
		var before=restored.native_snapshot()
		check(not restored.restore_native(broken) and restored.native_snapshot()==before,"Malformed receipts reject without partially restoring campaign")
	s.polish.receipts=[];game.journey.reset();game.journey.practical_left=10000
	game.journey.enqueue("narrative/quiet-wrist-test","ANNIKA","A name is a place to return to.")
	game.journey.update(.01);ui._process(0)
	check(s.polish.log.back().text=="A name is a place to return to.","New story transmission is actually delivered to the saved archive")
	game.journey.current.clear();game.journey.enqueue("hint","SERVICE NOTE","Inspect the coupling when ready.",true)
	game.journey.update(.01)
	check(s.polish.receipts.back().text=="Service note · Inspect the coupling when ready.","Optional idle service guidance is retained even without an on-screen transmission")
	check(not ui.transmission.visible and not ui.toast.visible and not ui.boarding.visible,"Ordinary play shows no transmission, toast or encounter banner")
	check(not ui.objective.visible,"Task checklist lives in the wrist by default")
	game.settings.field_objectives=true;ui._process(0)
	check(ui.objective.visible,"Players can opt into a persistent field task readout")
	game.settings.field_objectives=false
	game.session.notify("Recovery receipt · [{key:reel}] hook secured.");ui._process(0)
	check(not ui.toast.visible and "hook secured" in s.polish.receipts.back().text,"Outside-menu receipts are silent and retained in local memory")
	ui.combat_hit("EXPOSED HIT");ui._process(0)
	check(not ui.hit_readout.visible,"Hits use the reticle without floating command words")
	await shot("field-1440")
	game.open_menu("Records");await frames(5)
	check(ui.terminal.physical_page("Records") and "S–07" in ui.terminal_title.text and "LOCAL MEMORY" in ui.link_status.text,"Personal log uses the physical wrist display and local source identity")
	check(button_named("ANNIKA")!=null and button_named("Recovery receipt")!=null,"Both narrative and local receipts are reachable from the wrist log")
	check(button_named("Machine spaces")!=null,"Deck connection and open-building guidance is reachable in the log")
	await shot("log-1440")
	button_named("Recovery receipt").pressed.emit();await frames(4)
	check(ui.page=="Record" and "hook secured" in ui.record_text,"Selecting a local receipt opens its complete content")
	await shot("receipt-1440")
	game.close_menu();game.player.teleport(game.world.helm_model.root.global_position+Vector3(0,0,1.2));game.player.update_camera(1)
	game.open_station("Helm","helm");await frames(4)
	check(ui.page=="Helm" and "S–07" in ui.terminal_title.text and "NEAR-FIELD" in ui.link_status.text,"Reached helm is a linked equipment view with wrist identity")
	game.session.notify("Operation unavailable: restore propulsion first.");ui._process(0)
	check(ui.action_status.visible and "restore propulsion" in ui.action_status.text and ui.panel.is_ancestor_of(ui.action_status),"Explicit action failure remains readable inside the equipment panel")
	await shot("helm-1440")
	game.open_menu("Build");await frames(3)
	check("CONSTRUCTION LINK" in ui.link_status.text,"Build catalogue identifies its construction link")
	check(not ui.action_status.visible,"Equipment results do not follow the player into an unrelated page")
	await shot("build-1440")
	if DisplayServer.get_name()!="headless":
		DisplayServer.window_set_size(Vector2i(1200,675));await frames(6)
		await shot("build-1200")
		game.open_menu("Records");await shot("log-1200")
		game.close_menu();game.open_station("Helm","helm");await shot("helm-1200")
	game.close_menu();game.journey.current.clear();s.threat={"phase":"calm","remaining":0.0,"warning":false,"legacy":0.0,"draws":0};s.scanner.phase="consumed";s.facts.defenses=1;s.story.phase="approach"
	var count=s.polish.receipts.size();game.combat.update_director(.01)
	check(s.polish.receipts.size()==count,"Future encounter scheduling does not invent a radio warning")
	var first_bench=s.create_piece("workbench",{"x":-3,"y":0,"z":-3},0,{},true)
	var second_bench=s.create_piece("workbench",{"x":-2,"y":0,"z":-3},0,{},true)
	game.open_station("Workshop","workbench",first_bench.instanceId);s.notify("First bench needs components.");ui._process(0)
	check(ui.action_status.visible,"Station result belongs to the first reached workbench")
	game.close_menu();game.open_station("Workshop","workbench",second_bench.instanceId);ui._process(0)
	check(not ui.action_status.visible,"A different station using the same page cannot inherit another station's result")
	game.open_menu("Pause");s.notify("Previous campaign action.");ui._process(0)
	check(ui.action_status.visible,"Pre-load action feedback is actually active in the old session")
	game.load_payload(game.playtests.payload("scanner"))
	check(game.session!=s,"Valid campaign replacement succeeds")
	game.open_menu("Pause");ui._process(0)
	check(ui.toast_time==0 and ui.toast_source.is_empty() and not ui.action_status.visible and not game.session.polish.get("receipts",[]).any(func(entry):return entry.text=="Previous campaign action."),"Loading another campaign clears transient feedback and old local receipts")
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.1).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();await frames(4);MMFAssets.cache.clear()
	check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Quiet interface shutdown releases audio streams")
	var report={"passed":failures.is_empty(),"checks":checks,"failures":failures,"captures":captures,"renderer":RenderingServer.get_video_adapter_name(),"source_hash":MMFPlaytestRecorder.source_fingerprint()}
	FileAccess.open(output+"report.json",FileAccess.WRITE).store_string(JSON.stringify(report,"\t"))
	call_deferred("quit",0 if failures.is_empty() else 1)
