extends SceneTree

var game
var output="res://../test-results/opening-prelude/film/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://opening-movie-"+str(Time.get_ticks_usec())+"/";call_deferred("run")

func run():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):output=arg.trim_prefix("--out=").trim_suffix("/")+"/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.settings.volume=.7;game.save_settings()
	var deadline=Time.get_ticks_msec()+60000
	while not game.cinematics.opening_stage.prepared() and Time.get_ticks_msec()<deadline:await process_frame
	if not game.cinematics.opening_stage.prepared():push_error("Movie preparation timed out");quit(1);return
	var first_frame=Engine.get_process_frames();game.new_game()
	var elapsed=0.0
	while elapsed<MMFOpeningPrelude.DURATION+13.2:
		await process_frame;elapsed+=1.0/30
	var record={"source_hash":MMFPlaytestRecorder.source_fingerprint(),"fps":30,"first_frame":first_frame,"last_frame":Engine.get_process_frames(),"opening_done":game.session.opening_done,"scope":"Real New Game input, native rendered full opening and mixed engine audio. Fixed-rate movie output is not a performance measurement."}
	var file=FileAccess.open(output+"capture.json",FileAccess.WRITE);file.store_string(JSON.stringify(record,"\t"));file.close();print("OPENING_MOVIE ",JSON.stringify(record))
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio);refs.append(weakref(game.cinematics.prelude.bed_stream));refs.append(weakref(game.cinematics.prelude.voice_stream))
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if record.opening_done else 1)
