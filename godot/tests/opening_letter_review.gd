extends "res://tests/wrist_terminal.gd"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://opening-letter-review-"+str(Time.get_ticks_usec())+"/";call_deferred("run")

func shot(name: String):
	await frames(3)
	if DisplayServer.get_name()!="headless":
		await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(output+name+".png")

func run():
	Engine.max_fps=60;output=ProjectSettings.globalize_path("res://../test-results/opening-letter/letter-review/")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):output=arg.trim_prefix("--out=").trim_suffix("/")+"/"
	DirAccess.make_dir_recursive_absolute(output)
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false);game.new_game()
	var deadline=Time.get_ticks_msec()+60000
	while not game.started and Time.get_ticks_msec()<deadline:await process_frame
	var c=game.cinematics;var p=c.prelude;var letter=p.letter
	check(MMFOpeningLetter.READ_END-MMFOpeningLetter.READ_START>=30 and MMFOpeningLetter.READ_END-MMFOpeningLetter.READ_START<=45,"Ink reading takes 30–45 seconds")
	check(is_equal_approx(MMFOpeningLetter.BURN_START-MMFOpeningLetter.READ_END,2),"Last words remain still for two seconds before ignition")
	check(letter.ink.bottom<MMFOpeningLetter.PAPER_SIZE.y-65,"Every line fits the parchment with a bottom margin")
	check(not p.bed.playing and not p.voice.playing and not p.score.playing,"Letter opens silently without spoken narration or memory music")
	c.time=12-MMFOpeningPrelude.DURATION;c.update(0);await key(KEY_ENTER)
	check(is_equal_approx(c.time,MMFOpeningLetter.READ_END-MMFOpeningPrelude.DURATION) and letter.ink.progress==1,"Enter finishes the silent reading without skipping the memory sequence")
	await shot("finished-reading-hold")
	await key(KEY_ENTER)
	check(is_equal_approx(c.time,MMFOpeningLetter.READ_END-MMFOpeningPrelude.DURATION) and not p.fire_started,"Repeated Enter preserves the two-second final line hold")
	c.update(1.99)
	check(not p.fire_started,"Fire does not start early after choosing to continue")
	c.update(.02)
	check(p.fire_started and p.bed.stream==p.fire_stream,"Early reading completion still ignites the paper on its authored cue")
	c.begin_opening(true)
	for at in [2.0,20.5,39.5,41.4,42.3,43.5,44.8,46.8,49.2]:
		c.time=at-MMFOpeningPrelude.DURATION;c.update(0);await shot("letter-%.1f"%at)
		if at==20.5:check(absf(letter.ink.progress-.5)<.001,"Ink reaches the middle of the complete letter at the reading midpoint")
		if at==41.4:check(letter.paper_material.get_shader_parameter("burn")==0 and letter.ink.progress==1,"Hold preserves fully darkened text on unburnt paper")
		if at==43.5:check(p.bed.playing and p.bed.stream==p.fire_stream,"Ignition uses its finite dedicated paper sound")
		if at==49.2:check(not letter.visible and p.memory_started and p.bed.stream==p.bed_stream,"Burn resolves into the factory memory with its separate sound edit")
	for size in [Vector2i(1024,768),Vector2i(1920,810),Vector2i(960,540)]:
		if DisplayServer.get_name()=="headless":break
		DisplayServer.window_set_size(size);await frames(3);c.begin_opening(true);c.time=30-MMFOpeningPrelude.DURATION;c.update(0);await shot("letter-%dx%d"%[size.x,size.y])
		check(root.get_visible_rect().encloses(letter.paper.get_global_rect()),"Entire letter fits "+str(size))
		check(root.get_visible_rect().encloses(p.skip_hint.get_global_rect()),"Skip remains on screen at "+str(size))
	for at in [0.0,20.0,41.5,44.5]:
		c.begin_opening(true);c.time=at-MMFOpeningPrelude.DURATION;c.update(0);await frames(2);await key(KEY_ESCAPE)
		check(not letter.visible and letter.viewport.render_target_update_mode==SubViewport.UPDATE_DISABLED and not p.active and p.bed.stream==null and game.session.opening_done,"Skip from paper time "+str(at)+" releases drawing, audio and control")
	check(game.player.animator.callback_mode_process==AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_IDLE,"Skip restores normal player animation processing")
	report.merge({"checks":checks,"failures":failures,"passed":failures.is_empty(),"source_hash":MMFPlaytestRecorder.source_fingerprint(),"letter_words":letter.ink.words.size(),"last_line_baseline":letter.ink.bottom,"reading_seconds":MMFOpeningLetter.READ_END-MMFOpeningLetter.READ_START,"full_opening_seconds":MMFOpeningPrelude.DURATION+10.2})
	var file=FileAccess.open(output+"review.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("LETTER_REVIEW ",JSON.stringify(report))
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
