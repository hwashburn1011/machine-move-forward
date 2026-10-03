extends SceneTree
var game
const OUT="res://../test-results/site-grounding/title-review/"
var images=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://beta-title-review/";call_deferred("run")

func capture(id: String):
	for i in 12:await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(OUT+id+".png")
	images.append({"name":id,"panel_position":str(game.ui.panel.position),"panel_size":str(game.ui.panel.size),"return_visible":game.ui.return_button.visible,"parent":str(game.ui.panel.get_parent().name)})

func run():
	if DisplayServer.get_name()=="headless":quit(2);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	for size in [Vector2i(1920,1080),Vector2i(1200,900),Vector2i(960,540)]:
		DisplayServer.window_set_size(size)
		await capture("title-%dx%d"%[size.x,size.y])
	game.open_menu("Settings");await capture("settings-after-title")
	game.open_menu("Title");await capture("returned-title")
	var file=FileAccess.open(OUT+"review.json",FileAccess.WRITE);file.store_string(JSON.stringify({"source_hash":MMFPlaytestRecorder.source_fingerprint(),"images":images},"\t"));file.close()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit()
