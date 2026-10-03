extends "res://tests/wrist_terminal.gd"

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://title-review-"+str(Time.get_ticks_usec())+"/"
	call_deferred("run")

func capture(id: String):
	await frames(5)
	if DisplayServer.get_name()!="headless":
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(output+id+".png")
	report.resolutions.append({"name":id,"viewport":str(root.size),"render_size":str(game.ui.title_screen.viewport.size),"panel":str(game.ui.panel.get_global_rect())})

func finish_review():
	report.merge({"checks":checks,"failures":failures,"passed":failures.is_empty(),"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"Native title rendering, save isolation and real input transitions. Performance measures the isolated animated title, not a full campaign."})
	var file=FileAccess.open(output+"review.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("TITLE_REVIEW ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)

func run():
	Engine.max_fps=60
	output=ProjectSettings.globalize_path("res://../test-results/title-screen/")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):output=arg.trim_prefix("--out=").trim_suffix("/")+"/"
	DirAccess.make_dir_recursive_absolute(output)
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	var title=game.ui.title_screen
	var initial=game.session.native_snapshot()
	var live_foot=game.world.gait.joints[0].foot.transform
	var shown_foot=title.gait.joints[0].foot.transform
	var distance=title.distance
	await frames(180)
	check(title.active and title.viewport.own_world_3d and root.disable_3d,"Title renders its own world without drawing the paused campaign behind it")
	check(title.distance>distance+1 and not title.gait.joints[0].foot.transform.is_equal_approx(shown_foot),"Nomad walks and sand advances while the campaign is paused")
	check(game.session.native_snapshot()==initial and game.world.gait.joints[0].foot.transform.is_equal_approx(live_foot),"Menu animation leaves campaign state and gameplay machine transforms unchanged")
	check(MMFSaves.list_saves().is_empty() and button_named("CONTINUE").disabled,"Clean profile has no saves and Continue is disabled")
	check(MMFAssets.of_type(title.stage,"CollisionObject3D").is_empty(),"Presentation contains no collision bodies")
	await capture("title-1440")
	if "--preview" in OS.get_cmdline_user_args():await finish_review();return
	await key(KEY_DOWN)
	await key(KEY_ENTER);await frames(8)
	check(game.ui.page=="Library" and title.active and game.ui.device_frame.visible,"Keyboard navigation skips disabled Continue and opens Load Game")
	check(button_named("CREATE NAMED CHECKPOINT")==null,"Empty load screen cannot save an unstarted campaign")
	await capture("empty-load")
	await key(KEY_ESCAPE);await frames(6)
	check(game.ui.page=="Title" and not game.started,"Escape from Load Game returns to the title")
	await click_control(button_named("SETTINGS"));await frames(6)
	check(game.ui.page=="Settings" and title.active and game.ui.device_frame.visible,"Settings opens in the wrist device over the live desert")
	check(game.ui.panel.get_global_rect().is_equal_approx(game.ui.device_frame.glass),"Title settings controls fit the device glass")
	game.settings.quality="low";game.save_settings()
	check(title.viewport.msaa_3d==Viewport.MSAA_DISABLED and not title.environment.ssao_enabled,"Title respects low graphics quality")
	game.settings.quality="high";game.save_settings()
	await capture("title-settings")
	await click_control(game.ui.return_button);await frames(6)
	check(game.ui.page=="Title" and not game.ui.device_frame.visible,"Settings return restores the title layout")
	for dimensions in [Vector2i(960,540),Vector2i(1200,900),Vector2i(1920,810)]:
		if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(dimensions)
		await frames(12)
		check(root.get_visible_rect().encloses(game.ui.panel.get_global_rect()) and game.ui.scroller.get_global_rect().encloses(button_named("PLAYTEST CHECKPOINTS").get_global_rect()),"All title actions fit without scrolling at "+str(dimensions))
		check(title.viewport.size.y<=1080,"Title render resolution remains capped at "+str(dimensions))
		await capture("title-%dx%d"%[dimensions.x,dimensions.y])
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,810))
	await frames(10)
	# The real New Game callback and opening handoff; full real-time opening is
	# covered separately by the shipped-pack smoke driver.
	await click_control(button_named("NEW GAME"))
	var start=Time.get_ticks_msec()
	while not game.started and Time.get_ticks_msec()-start<30000:await process_frame
	check(game.started and game.cinematic=="opening" and not title.active and not root.disable_3d,"New Game hands the renderer to the playable opening")
	check(title.viewport.render_target_update_mode==SubViewport.UPDATE_DISABLED and not title.is_processing(),"Title stops rendering and animating during gameplay")
	check(not title.stage.visible and title.stage.process_mode==Node.PROCESS_MODE_DISABLED,"Hidden title assemblies and particles do no gameplay processing")
	game.cinematics.finish();game.set_physics_process(false);game.player.set_physics_process(false)
	game.session.opening_done=true;game.player.teleport(Vector3(0,16.1,-1));game.player.update_camera(1)
	game.open_menu("Title");await frames(6)
	var saved_clock=game.session.clock
	await click_control(button_named("SETTINGS"));await frames(6);await key(KEY_ESCAPE);await frames(6)
	check(game.ui.page=="Title" and game.menu_open and paused,"Escape from title Settings never accidentally resumes an existing campaign")
	await click_control(button_named("CONTINUE"));await frames(8)
	check(not game.menu_open and not title.active and not root.disable_3d and game.player.camera.is_current(),"Continue restores the gameplay camera and renderer")
	check(game.player.suppress_fire and game.session.clock==saved_clock,"Continue preserves the current session and suppresses the menu click's gunshot")
	game.open_menu("Pause");await frames(4)
	check(not title.active and game.ui.device_frame.visible,"Gameplay Pause keeps its existing wrist frame without the title backdrop")
	await click_control(button_named("RESUME"));await frames(4)
	game.open_menu("Inventory");await settle()
	check(game.ui.terminal.active and not title.active and not root.disable_3d,"Inventory still renders on the physical forearm after leaving the title")
	game.close_menu()
	var payload={"session":game.session.native_snapshot(),"player":{"position":{"x":0,"y":16.1,"z":-1},"yaw":0,"pitch":-.08},"loot":[]}
	check(MMFSaves.write("autosave",payload),"Isolated Continue fixture writes a verified campaign")
	game.started=false;game.open_menu("Title");await frames(6)
	check(not button_named("CONTINUE").disabled,"Existing autosave enables Continue on a fresh front end")
	await click_control(button_named("CONTINUE"));await frames(8)
	check(game.started and not game.menu_open and not title.active and game.session.native_snapshot().distance==payload.session.distance,"Continue loads the saved campaign and releases the title")
	check(MMFSaves.write("named-review",payload),"Named-load fixture writes a verified campaign")
	game.open_menu("Title");await frames(5);await click_control(button_named("LOAD GAME"));await frames(5)
	await click_control(button_named("named-review"));await frames(8)
	check(game.started and not game.menu_open and not title.active and not root.disable_3d,"Load Game row restores a chosen named save and the gameplay renderer")
	game.open_menu("Title");await frames(10)
	var before=FileAccess.get_sha256(MMFSaves.DIRECTORY+"autosave.json")
	await measure_title()
	check(before==FileAccess.get_sha256(MMFSaves.DIRECTORY+"autosave.json"),"Idle title never changes the campaign save")
	await capture("title-continue")
	await finish_review()

func measure_title():
	if DisplayServer.get_name()=="headless":return
	DisplayServer.window_set_size(Vector2i(1920,1080));game.settings.vsync=false;game.save_settings();Engine.max_fps=0
	await frames(60)
	var rid=game.ui.title_screen.viewport.get_viewport_rid();RenderingServer.viewport_set_measure_render_time(rid,true)
	var gpu=[];var cpu=[];var wall=[];var last=Time.get_ticks_usec()
	for i in 600:
		await RenderingServer.frame_post_draw
		var now=Time.get_ticks_usec();wall.append((now-last)/1000.0);last=now
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(rid));cpu.append(RenderingServer.viewport_get_measured_render_time_cpu(rid))
	gpu.sort();cpu.sort();wall.sort()
	report.timings={"samples":600,"resolution":"1920x1080","quality":"high","adapter":RenderingServer.get_video_adapter_name(),"title_gpu_p95_ms":gpu[570],"title_gpu_max_ms":gpu.back(),"title_cpu_p95_ms":cpu[570],"frame_p95_ms":wall[570],"frame_max_ms":wall.back()}
	check(wall[570]<33.34,"Animated title stays within a 30 FPS frame budget on the review hardware")
	Engine.max_fps=60
