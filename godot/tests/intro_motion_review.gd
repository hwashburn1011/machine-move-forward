extends SceneTree

# Fixed-rate review of the existing memory/chase section, skipping only the
# unchanged 57.7-second letter in this review artifact. Not a performance test.
var game
var output="res://../test-results/intro-polish-20261005/motion/"
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://intro-motion-review/";call_deferred("run")
func run():
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.settings.vsync=false;game.settings.quality="high";game.settings.volume=.7;game.apply_quality()
	game.new_game();var deadline=Time.get_ticks_msec()+60000
	while not game.started and Time.get_ticks_msec()<deadline:await process_frame
	if not game.started:push_error("Intro preparation timeout");quit(1);return
	var source=MMFPlaytestRecorder.source_fingerprint()
	var c=game.cinematics;c.time=-MMFOpeningPrelude.MEMORY_DURATION;c.update(0)
	var start=Engine.get_process_frames()
	for frame in 1080:
		c.update(1.0/30);game.effects.update(1.0/30)
		await process_frame
	var report={"source_hash":source,"source_hash_end":MMFPlaytestRecorder.source_fingerprint(),"fps":30,"first_content_frame":start,"seconds":36,"scope":"Native fixed-rate memory, lever, interception, escape turn, wall arrival, roof jump and machine landing; unchanged letter omitted; not a performance benchmark."}
	FileAccess.open(output+"capture.json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	c.finish();game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0)
