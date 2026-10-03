extends SceneTree
## Run with the matching engine against the exported PCK and isolated APPDATA.
## Official release templates disable external script overrides. The actual EXE
## launch is verified separately; this driver is never a shipped dependency.
var game
var output=""
var isolation=""
var phase="new"
var checks=[]
var failures=[]
var build={}

func _initialize():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):output=arg.trim_prefix("--out=")
		if arg.begins_with("--isolation-root="):isolation=arg.trim_prefix("--isolation-root=")
		if arg.begins_with("--phase="):phase=arg.trim_prefix("--phase=")
	call_deferred("run")

func check(ok: bool,label: String):
	checks.append({"name":label,"passed":ok});print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func capture(label: String):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw
	check(root.get_texture().get_image().save_png(output.path_join(label+".png"))==OK,"Capture "+label)

func wait_until(predicate: Callable,seconds: float) -> bool:
	var start=Time.get_ticks_msec()
	while not predicate.call() and Time.get_ticks_msec()-start<seconds*1000:await process_frame
	return predicate.call()

func title_text() -> String:
	var parts=PackedStringArray()
	parts.append(game.ui.title_screen.footer.text)
	for node in game.ui.content.get_children():
		if node is Label:parts.append(node.text)
	return "\n".join(parts)

func title_button(label: String) -> Button:
	for node in game.ui.content.get_children():
		if node is Button and node.text==label:return node
	return null

func finish():
	if is_instance_valid(game):
		game.open_menu("Pause")
		while game.combat.nav.is_baking():await create_timer(.02).timeout
		game.autosaver.flush()
		var audio_refs=[]
		for stream in game.audio.bank.values():audio_refs.append(weakref(stream))
		for voice in [game.audio.drone_player,game.audio.pad_player]:
			if voice.stream:audio_refs.append(weakref(voice.stream))
		if game.audio.music:
			for stream in game.audio.music.streams:audio_refs.append(weakref(stream))
		for stream in [game.cinematics.prelude.bed_stream,game.cinematics.prelude.voice_stream,game.cinematics.prelude.score_stream,game.cinematics.prelude.fire_stream]:
			if stream:audio_refs.append(weakref(stream))
		game.queue_free()
		while is_instance_valid(game):await process_frame
		MMFAssets.cache.clear();MMFSiteRoofs.clear_cache()
		var until=Time.get_ticks_msec()+600
		while Time.get_ticks_msec()<until and not audio_refs.all(func(w):return w.get_ref()==null):
			await process_frame;OS.delay_msec(1)
	var report={"passed":failures.is_empty(),"failures":failures,"checks":checks,"phase":phase,"build":build,"executable":OS.get_executable_path(),"user_data":OS.get_user_data_dir(),"renderer":RenderingServer.get_video_adapter_name(),"scope":"Matching engine against unchanged exported PCK, clean isolated profile, real-clock opening and movement, persisted campaign reload. Actual release EXE launch is separate evidence. Later site is an explicit playtest fixture, not earned progression."}
	var file=FileAccess.open(output.path_join("smoke-"+phase+".json"),FileAccess.WRITE)
	if file:file.store_string(JSON.stringify(report,"\t"));file.close()
	quit(0 if failures.is_empty() else 1)

func run():
	if output=="" or isolation=="":push_error("Required --out and --isolation-root arguments missing");quit(2);return
	DirAccess.make_dir_recursive_absolute(output)
	var data_path=OS.get_user_data_dir().replace("\\","/").to_lower()
	check(data_path.begins_with(isolation.replace("\\","/").trim_suffix("/").to_lower()+"/"),"User data is inside the isolated release profile")
	if not failures.is_empty():await finish();return
	check(not FileAccess.file_exists("res://project.godot") and FileAccess.file_exists("res://project.binary"),"Running the exported pack with compiled project settings")
	var identity=JSON.parse_string(FileAccess.get_file_as_string("res://release/build.json")) if FileAccess.file_exists("res://release/build.json") else null
	check(identity is Dictionary and identity.get("source_hash","") is String and identity.get("source_hash","").length()==64 and identity.get("version","") is String and not identity.get("version","").is_empty(),"Pack contains a release identity")
	if not failures.is_empty():await finish();return
	build=identity
	check(MMFPlaytestRecorder.source_fingerprint()==build.get("source_hash",""),"Recorder identifies the exported source correctly")
	check(not ResourceLoader.exists("res://tests/integration.gd"),"Authoring test scripts are excluded")
	check(not ResourceLoader.exists("res://assets/models/player.glb"),"Unused legacy character is excluded")
	Engine.max_fps=60
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	check(game.menu_open and game.ui.page=="Title" and not game.started,"Shipping main scene opens the title")
	check(not game.invulnerable,"Normal release launch has damage enabled")
	check(title_text().contains(build.version) and not title_text().contains("development build"),"Title displays this beta version")
	var title_distance=game.ui.title_screen.distance
	for i in 60:await process_frame
	check(game.ui.title_screen.active and game.ui.title_screen.distance>title_distance and is_zero_approx(game.session.clock),"Packed title walks independently of the paused campaign")
	check(["NEW GAME","CONTINUE","LOAD GAME","SETTINGS"].all(func(label):return title_button(label)!=null),"Packed title exposes the four main menu actions")
	await capture("title-"+phase)
	if phase=="resume":
		check(is_equal_approx(float(game.settings.music_volume),.24) and is_equal_approx(float(game.settings.volume),.62),"Sound and music preferences survive process restart")
		check(is_equal_approx(game.audio.music_volume,.24) and is_equal_approx(game.audio.volume,.62),"Restored preferences are applied to live audio")
		var prior=MMFSaves.read("autosave")
		check(not prior.is_empty(),"Previous process persisted a valid autosave")
		title_button("CONTINUE").pressed.emit()
		check(game.started and game.session.opening_done and not game.menu_open,"Continue restores playable campaign")
		check(is_equal_approx(game.session.fuel,float(prior.get("session",{}).get("fuel",-1))),"Continue restores saved fuel exactly")
		await capture("continued-campaign")
		check(game.playtests.launch("foundry"),"Pack can launch the Foundry checkpoint")
		for i in 30:await process_frame
		check(game.campaign.destination!=null and game.session.story.phase=="docked","Foundry arrives with its loaded destination")
		check(game.campaign.destination.has_node("GroundedSiteStructure"),"Packed Foundry loads its complete grounded lower building")
		check(MMFSiteGrounding._models.size()==MMFSiteGrounding._data.models.size() and MMFSiteGrounding.ROOTS.values().all(func(id):return MMFSiteGrounding._models.has(id)),"Every packed lower-building and foundation root prepares")
		MMFRoadsideOutposts.prepare_models()
		check(MMFRoadsideOutposts.models.size()==MMFRoadsideOutposts.ROOTS.size(),"Both packed roadside tower variants prepare")
		for index in MMFSiteRoofs.SITES.size():MMFSiteRoofs.prepare_shape(index)
		check(MMFSiteRoofs._shapes.size()==MMFSiteRoofs.SITES.size(),"Every packed roof collision loads")
		await capture("foundry-checkpoint")
	else:
		check(MMFSaves.read("autosave").is_empty(),"First launch starts without someone else's save")
		game.settings.music_volume=.24;game.settings.volume=.62;game.save_settings()
		check(FileAccess.file_exists("user://settings.json"),"Settings writes into the isolated profile")
		title_button("NEW GAME").pressed.emit()
		check(await wait_until(func():return game.started and game.cinematic=="opening",30),"Packed New Game enters the cinematic opening")
		if not failures.is_empty():await finish();return
		check(game.cinematics.prelude.active and game.cinematics.prelude.letter.visible and not game.cinematics.prelude.bed.playing,"Packed opening starts with the silent human letter")
		await wait_until(func():return game.cinematics.time>=-MMFOpeningPrelude.DURATION+3.0,10)
		await capture("opening-letter")
		await wait_until(func():return game.cinematics.time>=-MMFOpeningPrelude.DURATION+43.5,60)
		await capture("opening-paper-burn")
		await wait_until(func():return game.cinematics.time>=-MMFOpeningPrelude.MEMORY_DURATION+1.7,15)
		await capture("opening-memory")
		await wait_until(func():return game.cinematics.time>=-MMFOpeningPrelude.MEMORY_DURATION+13.5,20)
		await capture("opening-voice")
		await wait_until(func():return game.cinematics.time>=-MMFOpeningPrelude.MEMORY_DURATION+19.5,10)
		await capture("opening-reveal")
		await wait_until(func():return game.cinematics.time>=-MMFOpeningPrelude.MEMORY_DURATION+23.4,10)
		await capture("opening-wall-arrival")
		check(await wait_until(func():return game.session.opening_done and game.cinematic=="" and game.started,90),"Normal New Game completes its opening in real time")
		check(not game.cinematics.prelude.active and game.cinematics.prelude.bed.stream==null and game.world.machine.visible,"Packed opening releases its audio and restores the real machine")
		if not failures.is_empty():await finish();return
		await capture("opening-complete")
		var start=game.player.position
		Input.action_press("back")
		await create_timer(.6).timeout
		Input.action_release("back")
		check(game.player.position.distance_to(start)>.25 and game.player.position.y>15.7,"Real movement input works aboard the machine")
		game.open_menu("Pause")
		for i in 8:await process_frame
		check(game.ui.device_frame.visible and game.ui.panel.get_global_rect().is_equal_approx(game.ui.device_frame.glass),"Packed pause menu fits the Linekeeper device housing")
		game.open_menu("Settings")
		for i in 8:await process_frame
		check(game.ui.device_frame.visible and game.ui.panel.theme==game.ui.device_frame.screen_theme,"Packed settings uses the matching device controls")
		await capture("wrist-settings")
		game.open_menu("Pause")
		check(game.safe_to_save() and game.save_game("release-smoke"),"Normal manual save succeeds")
		check(game.save_game("autosave"),"Normal autosave is accepted")
		game.autosaver.flush()
		check(not MMFSaves.read("autosave").is_empty(),"Autosave is durable before exit")
		game.recorder.set_recording(true,game.session.clock)
		check(game.recorder.metadata.source_hash==build.source_hash,"Opt-in recorder uses this beta's identity")
		check(game.recorder.write_report(output.path_join("local-playtest-report.json"),game.session.clock),"Local playtest report writes from a release")
	await finish()
