extends SceneTree
## Native authoring-assembly review. Upgrade parts in the second set are explicit
## layout fixtures, not earned campaign progression or purchase evidence.
const OUT="res://../test-results/deck-audio/native/"
const VIEWS=[
	["machine-overall",Vector3(29,29,-38),Vector3(0,12,0),55],
	["upper-forward",Vector3(10,17.75,12),Vector3(-3,17,-8),78],
	["upper-aft",Vector3(-9.6,17.75,-12),Vector3(5,17,8),78],
	["middle-forward",Vector3(10.7,14.15,12),Vector3(-7,13.4,-7),78],
	["middle-aft",Vector3(8.7,14.15,-9.6),Vector3(-5,13.4,8),78],
	["lower-forward",Vector3(10.7,10.55,12),Vector3(-6,9.8,-8),78],
	["lower-aft",Vector3(10.7,10.55,-12),Vector3(-4,9.8,8),78]]
const BAY_VIEWS=[
	["quiet-drive",Vector3(10,10.65,7),Vector3(4,9.7,4),62],
	["battery-bank",Vector3(10,14.25,7),Vector3(4,13.3,4),62],
	["salvage-crane",Vector3(8,17.85,1),Vector3(10,16.6,-4),65]]
var game
var camera: Camera3D
var captures=[]
var failures=[]
var author=false

func _initialize():
	set_meta("test_mode",true)
	author="--author" in OS.get_cmdline_user_args()
	if author:set_meta("author_machine",true)
	MMFSaves.DIRECTORY="user://machine-composition-review/";call_deferred("run")

func capture(row: Array,prefix: String=""):
	camera.position=row[1];camera.look_at(row[2]);camera.fov=row[3];camera.reset_physics_interpolation()
	for frame in 20:await process_frame
	await RenderingServer.frame_post_draw
	var name=prefix+row[0];var error=root.get_texture().get_image().save_png(OUT+name+".png")
	if error!=OK:failures.append("Capture failed: "+name)
	captures.append({"name":name,"camera":str(camera.position),"lookAt":str(row[2]),"fov":row[3]})
	print("COMPOSITION_CAPTURE ",name)

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	DisplayServer.window_set_size(Vector2i(1600,900));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.visual.hide();game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	game.session.story.phase="locked";game.session.scanner.phase="consumed"
	game.session.update_power();game.world.switchgear.update(.25,game.session)
	for particles in MMFAssets.of_type(game.world,"GPUParticles3D"):particles.hide()
	for particles in MMFAssets.of_type(game.effects,"GPUParticles3D"):particles.hide()
	camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	for row in VIEWS:await capture(row)
	for row in BAY_VIEWS:await capture(row,"connection-empty-")
	var layout=MMFAssets.json("res://data/machine-spaces.json")
	for id in ["quiet-drive","battery-bank","salvage-crane"]:
		var bay=layout.bays[id];var center=Vector3(bay.cell.x*2,16.03+bay.cell.y*3.6,bay.cell.z*2)
		var angle=Basis(Vector3.UP,int(bay.rotation)*PI/2)
		await capture([id,center+angle*Vector3(1.35,1.4,1.7),center,54],"connection-detail-")
	for id in ["quiet-drive","battery-bank","salvage-crane"]:
		var bay=layout.bays[id]
		var piece=game.session.create_piece(id,bay.cell,int(bay.rotation),{},true)
		game.building.add_visual(piece)
	for row in BAY_VIEWS:await capture(row,"connection-fixture-")
	await capture(VIEWS[0],"upgraded-")
	var report={"captures":captures,"failures":failures,"passed":failures.is_empty(),"renderer":RenderingServer.get_video_adapter_name(),"authoringAssembly":author,"upgradeFixture":"Three unearned parts instantiated at the shared bay cells solely for visual layout inspection.","sourceHash":MMFPlaytestRecorder.source_fingerprint(),"layoutSha256":FileAccess.get_sha256("res://data/machine-spaces.json"),"humanAcceptance":false}
	var file=FileAccess.open(OUT+"composition-captures.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)
