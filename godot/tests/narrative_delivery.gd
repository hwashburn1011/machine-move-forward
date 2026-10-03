extends SceneTree

var game
var checks=0
var failures=[]
var captures=[]
var source=""

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://narrative-delivery-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(n: int=3):
	for i in n:await process_frame

func fresh(id: String):
	var s=MMFSession.new(game.data)
	check(s.restore_native(game.playtests.payload(id).session),"Fixture validates: "+id)
	return s

func apply(s,id: String,action: String) -> bool:
	return MMFMissionContracts.act(s,MMFMissionContracts.quote(s,id,action))

func total(s,id: String) -> int:
	var count=0
	for bag in s.containers():count+=bag.count_item(id)
	return count

func empty(s):
	for bag in s.containers():bag.slots.fill(null)

func local_station(page: String,kind: String,at: Vector3,id: String=""):
	game.close_menu();game.player.position=at;game.player.velocity=Vector3.ZERO;game.player.update_camera(1)
	game.open_station(page,kind,id)

func capture(name: String):
	if DisplayServer.get_name()=="headless":return
	await frames(5);await RenderingServer.frame_post_draw
	var path="res://../test-results/narrative-"+name+".png"
	root.get_texture().get_image().save_png(path)
	if path not in captures:captures.append(path)

func run():
	Engine.max_fps=60
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,900))
	source=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false);await frames(6)
	contracts()
	await world_tests()
	await finish()

func contracts():
	var count=0
	for chapter in game.data.STORY_EXPEDITIONS:count+=chapter.interactables.filter(func(p):return p.kind=="narrative").size()
	MMFNativeNarrativeData.apply(game.data)
	var second=0
	for chapter in game.data.STORY_EXPEDITIONS:second+=chapter.interactables.filter(func(p):return p.kind=="narrative").size()
	check(count==5 and second==count,"Five local evidence readers; overlay is idempotent")
	for entry in game.playtests.PRESETS:
		var trial=MMFSession.new(game.data)
		check(trial.restore_native(JSON.parse_string(JSON.stringify(game.playtests.payload(entry.id).session))),"Checkpoint JSON round-trip: "+entry.id)
	var s=fresh("mission-supply-relay");var r=s.missions.records["roof-supplies"]
	check(apply(s,"roof-supplies","accept"),"Mission can be accepted in its chapter")
	r.status="in_progress";empty(s);s.inventory.add("components",2);s.inventory.add("fuel",3)
	var state=s.native_snapshot()
	check(not apply(s,"roof-supplies","donate") and state==s.native_snapshot(),"Insufficient donation is atomic")
	s.inventory.add("fuel",1);var quote=MMFMissionContracts.quote(s,"roof-supplies","donate");var tank=s.fuel
	check(MMFMissionContracts.act(s,quote) and r.paid and total(s,"fuel")==0 and total(s,"components")==0 and s.fuel==tank,"Donation consumes exact items and leaves tank unchanged")
	check(not MMFMissionContracts.act(s,quote),"Repeated stale donation cannot pay twice")
	check(apply(s,"roof-supplies","restart") and s.missions.orchard_fuel==8,"Restart reserves eight Orchard fuel items")
	check(not apply(s,"roof-supplies","restart") and s.missions.orchard_fuel==8,"Repeated completion cannot refill reserve")
	var restored=MMFSession.new(game.data)
	check(restored.restore_native(s.native_snapshot()) and restored.missions==s.missions,"Completed donation and reserve survive load")
	s=fresh("mission-courier");r=s.missions.records["stranded-courier"];r.status="in_progress"
	check(apply(s,"stranded-courier","recover") and apply(s,"stranded-courier","connect"),"Courier completes with no material requirement")
	empty(s)
	for bag in s.containers():
		for i in bag.slots.size():bag.slots[i]={"itemId":"scrap","count":game.data.ITEMS.scrap.stackSize}
	state=s.native_snapshot()
	check(not apply(s,"stranded-courier","claim") and s.native_snapshot()==state,"Full bags leave the finite courier cache untouched")
	s.inventory.slots[0]=null
	check(apply(s,"stranded-courier","claim") and r.stock.values().reduce(func(a,b):return a+b,0)>0,"Partial cache transfer retains remainder")
	s.inventory.slots[1]=null;apply(s,"stranded-courier","claim")
	check(r.stock=={"fuel":0,"components":0} and not apply(s,"stranded-courier","claim"),"Finite cache cannot be farmed")
	for method in ["physical","decoy"]:
		s=fresh("mission-watch-relay");r=s.missions.records["quiet-watch"];r.status="in_progress";var before=total(s,"signal-decoy")
		if method=="physical":empty(s);check(apply(s,"quiet-watch","isolate") and apply(s,"quiet-watch","cut"),"Watch uplink has a free physical solution")
		else:check(apply(s,"quiet-watch","decoy") and total(s,"signal-decoy")==before-1,"Watch test port consumes one decoy")
		check(r.method==method and MMFMissionContracts.valid(s.missions),"Watch method validates: "+method)
	s=fresh("mission-courier");MMFMissionContracts.close_window(s)
	check(s.missions.records["stranded-courier"].status=="expired" and s.story.uniques==game.playtests.payload("mission-courier").session.story.uniques,"Skipping mission grants no required hardware")
	s=fresh("finale-no-support");var raw=s.native_snapshot()
	for phase in ["ending-ready","ending-journey","arrival","complete"]:
		var old=raw.duplicate(true);old.story.phase=phase
		old.erase("narrative");old.erase("missions");old.erase("finale")
		check(restored.restore_native(old) and restored.finale.mode==("new" if phase=="ending-ready" else "legacy") and restored.missions==MMFMissionContracts.defaults(),"Old save preserves ending disposition without invented help: "+phase)
	var preserved=restored.native_snapshot()
	var bad=raw.duplicate(true);bad.finale.stage="aftermath"
	check(not restored.restore_native(bad) and preserved==restored.native_snapshot(),"Impossible finale state rejects atomically")
	bad=raw.duplicate(true);bad.story.phase="finale-docked"
	check(not restored.restore_native(bad),"Finale and story phase mismatch rejects")
	bad=raw.duplicate(true);bad.missions.records["stranded-courier"].stock.fuel=0
	check(not restored.restore_native(bad),"Uncompleted mission cannot contain a claimed reward")
	bad=raw.duplicate(true);bad.narrative.known=["unknown-beat"]
	check(not restored.restore_native(bad),"Unknown narrative record rejects")
	bad=raw.duplicate(true);bad.missions.version=2
	check(not restored.restore_native(bad),"Unknown mission version rejects")
	var initial=s.native_snapshot();MMFNarrativeProgress.recap(s);MMFMissions.summary(s)
	check(initial==s.native_snapshot(),"Personal story and mission summaries are read-only")

func dock_mission(id: String):
	check(game.playtests.launch(id),"Mission checkpoint launches: "+id);await frames(4)
	var s=game.session;var mission=MMFMissions.contact_mission(s.contacts.active)
	local_station("Signal","receiver",game.world.receiver.global_position+Vector3(0,0,1))
	game.missions.offer_action(MMFMissionContracts.quote(s,mission,"accept"))
	check(s.missions.records[mission].status=="accepted","Reached receiver accepts: "+mission)
	local_station("Helm","helm",game.world.helm_model.root.global_position+Vector3(0,0,1))
	check(game.opportunities.commit(),"Helm intercepts: "+mission)
	for i in 3000:
		s.tick(.1);game.opportunities.update(.1)
		if s.contacts.active.state=="docked":break
	await frames(4)
	check(s.contacts.active.state=="docked" and is_instance_valid(game.opportunities.site),"Ordinary travel docks mission: "+mission)

func mission_console():
	var view=game.missions.site_view();var point=game.opportunities.points.filter(func(p):return p.id=="console")[0]
	local_station("Mission","mission",view.site.to_global(point.at)-Vector3.UP*.7,"console")
	return view

func world_tests():
	await dock_mission("mission-courier")
	check(game.session.navigation_limit()==0,"Courier is reachable before steering unlock")
	var view=game.missions.site_view();game.close_menu()
	game.player.position=view.site.to_global(Vector3(0,.07,1.8));game.player.update_camera(1)
	game.player.camera.global_basis=Basis.looking_at((view.coupling.global_position-game.salvage.hand_position()).normalized())
	game.salvage.throw_hook()
	for i in 160:game.salvage.update_hook(.025)
	check(view.record().step==1 and not game.salvage.busy(),"Physical salvage throw reels courier coupling")
	view=mission_console();check(view.authorized(),"Mission work uses its reached local interface")
	var q=MMFMissionContracts.quote(game.session,view.id,"connect")
	game.open_menu("Inventory");view.action(q)
	check(view.record().step==1 and game.ui.context_pages()==["Inventory","Records"],"Personal wrist cannot operate courier machinery")
	view=mission_console();view.action(MMFMissionContracts.quote(game.session,view.id,"connect"))
	check(view.record().status=="completed","Local cradle completes courier work")
	await capture("courier-complete")
	await dock_mission("mission-supply-relay");view=mission_console()
	view.action(MMFMissionContracts.quote(game.session,view.id,"donate"));view.action(MMFMissionContracts.quote(game.session,view.id,"restart"))
	check(game.session.missions.orchard_fuel==8,"Local relay work reserves downstream stock")
	await capture("supply-relay")
	await dock_mission("mission-watch-relay");view=mission_console()
	view.action(MMFMissionContracts.quote(game.session,view.id,"isolate"));view.action(MMFMissionContracts.quote(game.session,view.id,"cut"))
	check(view.record().status=="completed" and view.record().method=="physical","Local watch work completes without a decoy")
	check(game.playtests.launch("mission-supply-relay"),"Expiry fixture launches");await frames(3)
	game.session.distance=game.session.contacts.active.expiresAtM+1;game.opportunities.radar.update()
	check(game.session.missions.records["roof-supplies"].status=="available","Expired radar offer remains eligible for a later offer")
	for support in ["none","all"]:
		check(game.playtests.launch("finale-no-support" if support=="none" else "finale-supported"),"Finale launch: "+support);await frames(4)
		local_station("Helm","helm",game.world.helm_model.root.global_position+Vector3(0,0,1))
		game.finale.review();var before=game.session.native_snapshot();var quote=game.finale.commit_quote
		game.session.fuel-=1
		check(not game.finale.commit(quote) and game.session.finale.stage=="idle","Changed operating state invalidates final commitment")
		game.session.fuel=before.fuel;game.finale.review()
		await capture("brief-"+support)
		var prior_dir=MMFSaves.DIRECTORY;MMFSaves.DIRECTORY="user://narrative-delivery-tests/blocked-write/"
		DirAccess.make_dir_recursive_absolute(MMFSaves.DIRECTORY+"meridian-checkpoint.json.tmp")
		before=game.session.native_snapshot()
		check(not game.finale.commit() and preload("res://tests/wrist_receipt_contract.gd").same_campaign(before,game.session.native_snapshot()),"Failed durable write leaves every campaign field unchanged except its local failure receipt")
		check(game.session.polish.receipts.back().text=="Save failed. Your previous checkpoint was kept.","Failed durable write remains readable in wrist activity")
		MMFSaves.DIRECTORY=prior_dir
		check(game.finale.commit(),"Verified precommit save starts final link: "+support)
		check(MMFSaves.read("meridian-checkpoint").session.finale.stage=="idle","Saved checkpoint precedes commitment")
		local_station("Signal","receiver",game.world.receiver.global_position+Vector3(0,0,1));game.finale.secure_link()
		if support=="all":
			check(game.session.finale.encounter=="suppressed" and game.session.missions.records["quiet-watch"].effect_used and game.combat.ship_state=="none","Earned watch effect prevents only designated spawn")
		else:
			check(game.session.finale.encounter=="launched" and game.combat.ship_state!="none","Unsupported route launches exactly one existing skiff")
			game.finale.secure_link();check(game.session.finale.stage=="secure","Live interception cannot be skipped or duplicated")
			check(game.combat.scout.deploy_decoy(),"Standard decoy supports disengagement without installed guns")
			for i in 140:
				game.combat.scout.update(.1);game.combat.update_ship(.1);game.finale.update()
			await frames(3)
			check(not game.combat.active_threat() and game.session.finale.stage=="ready","Carrier and tracking finish before final travel unlocks")
		local_station("Helm","helm",game.world.helm_model.root.global_position+Vector3(0,0,1))
		check(game.finale.resume_travel() and game.session.story.endingDistance==game.session.distance+400,"Protected 400 metre journey resumes: "+support)
		check(not game.combat.begin_ship("skiff"),"Protected final travel still rejects new encounters")
		for i in 2000:
			game.session.tick(.1);game.campaign.update(.1)
			if game.cinematic=="arrival":break
		check(game.cinematic=="arrival","Travel reaches existing arrival framing")
		game.cinematics.finish();await frames(5)
		check(game.session.story.phase=="finale-docked" and game.player.camera.current and not game.menu_open,"Arrival returns to playable berth without auto-ending")
		check(game.save_game("berth-policy-replay"),"Pre-policy isolated save permits testing both choices: "+support)
		for policy in ["open","relay"]:
			if policy=="relay":game.load_payload(MMFSaves.read("berth-policy-replay"));await frames(4)
			await berth_policy(policy)

func berth_station(id: String):
	var berth=game.finale.berth;var p=berth.points.filter(func(point):return point.id==id)[0]
	local_station("Finale","receiving-berth",berth.to_global(p.at)+Vector3(0,.06,.5),id)
	game.player.camera.look_at(berth.to_global(p.at)+Vector3(0,1,-.6));game.player.camera.reset_physics_interpolation()

func seed_enclosure_matches(transferred: bool) -> bool:
	var berth=game.finale.berth
	var sprouts=MMFAssets.find_named(berth.get_node("Art100Berth"),"LivingSprouts")
	return sprouts!=null and sprouts.visible==transferred and berth.sprouts.all(func(n):return not n.visible)

func power_indicators_match(powered: bool) -> bool:
	var group=game.finale.berth.get_node("Art100Berth")
	for spec in MMFArt100Story.CONSOLES:
		if group.get_node(spec[0]+"/FinaleStatus").material_override!=MMFArt100Story.status_material(powered):return false
	return true

func berth_policy(policy: String):
	var f=game.session.finale
	check(game.finale.berth.access_clear(),"Berth gangway supports the default capsule")
	check(seed_enclosure_matches(false) and power_indicators_match(false),"Receiving hardware visibly waits for separate power and seed transfers")
	berth_station("receiver");game.finale.act("power",game.finale.signature())
	check(not f.powered,"Wrong receiver channel cannot energize coupler")
	var prior=game.finale.signature();game.finale.act("channel",prior);game.finale.act("channel",prior)
	check(f.channel==1,"Stale channel click cannot advance twice")
	game.finale.act("power",game.finale.signature());check(f.powered and power_indicators_match(true),"Channel B and local isolator restore captive power and visible status indicators")
	berth_station("seeds");game.finale.act("transfer",game.finale.signature())
	check(f.seeds and not f.archive and seed_enclosure_matches(true),"Separate seed transfer reveals authored LivingSprouts while retired primitive sprouts stay hidden")
	check(game.safe_to_save() and game.save_game("berth-partial"),"Stable receiving platform supports a verified partial save")
	var saved=MMFSaves.read("berth-partial");var position=game.player.position
	game.load_payload(saved);await frames(5);f=game.session.finale
	check(f.seeds and not f.archive and game.player.position.is_equal_approx(position) and game.finale.safe_at_berth() and seed_enclosure_matches(true) and power_indicators_match(true),"Partial berth load restores physical seed enclosure, power state and safe pose")
	berth_station("archive");game.finale.act("transfer",game.finale.signature())
	check(f.archive and "orchard-memory-core" in game.session.story.uniques,"Archive copy transfers without removing installed original core")
	berth_station("transmitter");game.finale.pending_policy=policy;game.finale.pending_signature=game.finale.signature()
	game.close_menu();game.finale.publish();check(f.policy=="","Closing preview cannot publish a policy")
	berth_station("transmitter");game.finale.pending_policy=policy;game.finale.pending_signature=game.finale.signature();game.ui.refresh()
	await capture("policy-"+policy)
	game.finale.publish();var state=game.session.native_snapshot();game.finale.publish()
	check(f.policy==policy and f.completion==1 and state==game.session.native_snapshot(),"Explicit policy completes exactly once: "+policy)
	var group=game.finale.berth.get_node("Art100Berth")
	var open_indicator=group.get_node("OpenChannelMast/PolicyStatus").material_override
	var relay_indicator=group.get_node("RelayChallengeMast/PolicyStatus").material_override
	check(open_indicator==(MMFArt100Story.policy_open if policy=="open" else MMFArt100Story.status_waiting) and relay_indicator==(MMFArt100Story.policy_relay if policy=="relay" else MMFArt100Story.status_waiting) and open_indicator.albedo_color!=relay_indicator.albedo_color,"Published policy illuminates only its authored mast with a distinct status: "+policy)
	check(not game.finale.berth.public_mast.visible and not game.finale.berth.relay_mast.visible and seed_enclosure_matches(true),"Publication keeps replaced primitives retired and transferred plants visible")
	await capture("aftermath-"+policy)
	game.player.position=Vector3(32,16.1,0);game.close_menu()
	check(not game.safe_to_save(),"Berth exception rejects unsupported/off-platform saves")
	local_station("Helm","helm",game.world.helm_model.root.global_position+Vector3(0,0,1))
	check(game.finale.depart() and game.session.story.phase=="complete","Return aboard resumes ordinary play: "+policy)
	var trial=MMFSession.new(game.data)
	check(trial.restore_native(game.session.native_snapshot()) and trial.finale.policy==policy,"Completed publication persists: "+policy)
	game.session.distance+=41;game.finale.update();await frames(3)
	check(not is_instance_valid(game.finale.berth),"Departed berth cleans up after safe distance")

func finish():
	var report={"checks":checks,"failures":failures,"source_hash":source,"source_hash_end":MMFPlaytestRecorder.source_fingerprint(),"renderer":RenderingServer.get_video_adapter_name(),"captures":captures,"human_test":false}
	var suffix="headless" if DisplayServer.get_name()=="headless" else "native"
	var file=FileAccess.open("res://../test-results/narrative-delivery-"+suffix+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	print("NARRATIVE_DELIVERY_RESULT ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
