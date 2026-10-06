extends SceneTree

var game
var camera
var report={"views":[],"scope":"Static native material/catalog review; no gameplay or frame timing claim."}
const OUT="res://../test-results/v1-playthrough-fixes-20261005/construction/visual/"

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://deck-gun-review/";call_deferred("run")

func capture(label: String):
	for i in 12:await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path(OUT+label+".png"));report.views.append(label)

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	report.source_start=MMFPlaytestRecorder.source_fingerprint()
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	var start=Time.get_ticks_usec()
	while not game.cinematics.opening_stage.prepared():
		await process_frame
		if Time.get_ticks_usec()-start>30000000:push_error("Preparation timeout");quit(1);return
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.player.visual.hide();game.ui.root.hide()
	var gun=load("res://assets/runtime/turret-manual.glb").instantiate();game.add_child(gun);gun.position=Vector3(-6,16.03,-4)
	camera=Camera3D.new();game.add_child(camera);camera.fov=65;camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	var finish=preload("res://scripts/deck_gun_finish.gd")
	var center=gun.position+MMFAssets.bounds(gun).get_center()
	for view in ["approach","pedestal"]:
		camera.position=center+Vector3(2.6,1.0,3.8) if view=="approach" else gun.position+Vector3(1.4,.75,2.1)
		camera.look_at(center if view=="approach" else gun.position+Vector3(0,.45,0))
		for mesh in MMFAssets.of_type(gun,"MeshInstance3D"):
			for surface in mesh.mesh.get_surface_count():mesh.set_surface_override_material(surface,null)
		await capture(view+"-before")
		finish.apply(gun);await capture(view+"-after")
	game.ui.root.show();game.open_menu("Build");game.terminal_pages.catalog_page=1;game.ui.refresh()
	await capture("catalog-page-two")
	DisplayServer.window_set_size(Vector2i(1280,720));await capture("catalog-page-two-1280")
	report.source_end=MMFPlaytestRecorder.source_fingerprint();report.source_stable=report.source_start==report.source_end
	report.passed=report.views.size()==6
	var file=FileAccess.open(OUT+"review.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit()
