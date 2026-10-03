extends SceneTree

var game
var samples=[2.48,2.55,2.65,2.8,3.05,3.65,5.0]
var records=[]
var captured=[]

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-survivor-opening-review/"
	call_deferred("run")

func run():
	Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.new_game()
	var deadline=Time.get_ticks_msec()+20000
	while game.cinematic!="opening" and Time.get_ticks_msec()<deadline:await process_frame
	if game.cinematic!="opening":quit(1);return
	var started=Time.get_ticks_usec()
	while game.cinematic=="opening":
		await process_frame
		if not samples.is_empty() and game.cinematics.time>=samples[0]:
			var at=samples.pop_front()
			await RenderingServer.frame_post_draw
			var path="res://../test-results/godot-native/survivor-opening-%.2f.png"%at
			captured.append({"path":path,"image":root.get_texture().get_image()})
			records.append({"at":game.cinematics.time,"frameMs":Performance.get_monitor(Performance.TIME_PROCESS)*1000,"path":path})
	var report={"mode":"normal-speed live cinematic; default simulation and camera","elapsedSeconds":(Time.get_ticks_usec()-started)/1000000.0,"captures":records,"handedBack":game.player.camera.current and game.session.opening_done}
	# Encode after playback; synchronous PNG compression otherwise introduces
	# artificial frame stalls precisely in the turn being visually reviewed.
	for entry in captured:entry.image.save_png(entry.path)
	captured.clear()
	var output=FileAccess.open("res://../test-results/godot-native/survivor-opening-review.json",FileAccess.WRITE);output.store_string(JSON.stringify(report,"\t"));output.close()
	print("SURVIVOR_OPENING_REVIEW ",JSON.stringify(report))
	paused=true
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear()
	quit(0 if report.handedBack and samples.is_empty() else 1)
