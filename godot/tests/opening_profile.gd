extends SceneTree

# Exercise New Game from the real paused title, then both opening kills and
# the first playable frames. Timing runs perform no screenshot readbacks.
var game
var label="current"
var capture_views=false
var without_encounter_preparation=false
var title_seconds=3.0
var output="res://../test-results/godot-native/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-opening-profile/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		if arg=="--captures":capture_views=true
		if arg=="--without-encounter-preparation":without_encounter_preparation=true
		if arg.begins_with("--title-seconds="):title_seconds=float(arg.trim_prefix("--title-seconds="))
	call_deferred("run")

func pipelines() -> Dictionary:
	var result={}
	for key in ["CANVAS","MESH","SURFACE","DRAW","SPECIALIZATION"]:
		result[key]=RenderingServer.get_rendering_info(ClassDB.class_get_integer_constant("RenderingServer","RENDERING_INFO_PIPELINE_COMPILATIONS_"+key))
	return result

func stats(values: Array) -> Dictionary:
	if values.is_empty():return {}
	values.sort()
	return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"p99":values[int(values.size()*.99)],"max":values.back()}

func run():
	if DisplayServer.get_name()=="headless":push_error("Opening profiling requires native rendering.");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	if without_encounter_preparation:
		game.get_node("EncounterAssets").set_process(false);game.cinematics.opening_stage.encounter_assets=null
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	if title_seconds>0:await create_timer(title_seconds).timeout
	var before_pipelines=pipelines()
	var start=Time.get_ticks_usec();var previous=start
	game.new_game()
	var entry_ms=(Time.get_ticks_usec()-start)/1000.0
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	var frames=[];var intervals=[];var slow=[];var events=[];var previous_cursor=0;var first_opening_ms=-1.0
	var captures=[.5,1.8,2.7,3.8,5.15,6.5,8.5,9.5,10.15] if capture_views else []
	# GPU readback and PNG encoding pause the capture run. Budget that time
	# separately so a visual review still reaches the playable handoff.
	var capture_usec=0
	while Time.get_ticks_usec()-start-capture_usec<13500000:
		await process_frame
		var now=Time.get_ticks_usec();var ms=(now-previous)/1000.0;previous=now
		var frame={"frame":Engine.get_process_frames(),"wallS":(now-start)/1000000.0,"cinematic":game.cinematic,"cinematicS":game.cinematics.time,"ms":ms,"gpuMs":RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()),"renderCpuMs":RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid()),"pipelines":pipelines()}
		if first_opening_ms<0 and game.cinematic=="opening":first_opening_ms=(now-start)/1000.0
		frames.append(frame);intervals.append(ms)
		if ms>25:slow.append(frame)
		if game.cinematics.event_cursor!=previous_cursor:
			events.append(frame);previous_cursor=game.cinematics.event_cursor
		if not captures.is_empty() and game.cinematics.time>=captures[0]:
			var capture_start=Time.get_ticks_usec()
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(ProjectSettings.globalize_path(output+"opening-"+label+"-"+str(captures.pop_front())+".png"))
			capture_usec+=Time.get_ticks_usec()-capture_start
			previous=Time.get_ticks_usec()
	var complete=game.session.opening_done and game.cinematic==""
	var report={"scope":"Actual paused title, New Game, original opening and first playable seconds. 1080p high / Vulkan / 4x MSAA, vsync off, 60 FPS cap. No input or story timing changes.","encounterPreparation":not without_encounter_preparation,"titleSeconds":title_seconds,"firstOpeningMs":first_opening_ms,"adapter":RenderingServer.get_video_adapter_name(),"entryCpuMs":entry_ms,"beforePipelines":before_pipelines,"frameMs":stats(intervals),"slowFrames":slow,"events":events,"frames":frames,"completed":complete,"captures":capture_views}
	var file=FileAccess.open(output+"opening-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("OPENING_PROFILE ",{"entryCpuMs":entry_ms,"frameMs":report.frameMs,"slowFrames":slow.size(),"complete":complete})
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var audio_drain=load("res://tests/audio_drain.gd");var audio_refs=audio_drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await audio_drain.finish(self,audio_refs);MMFAssets.cache.clear();quit(0 if complete else 1)
