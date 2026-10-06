extends SceneTree

# Native rendered motion fixture: real input/collision on a prepared flat deck.
# A following inspection camera keeps feet and torso visible; no campaign claim.
const OUT="res://../test-results/v1-movement-polish-2026-10-05/visual/"
var output=OUT
var game
var camera: Camera3D
var capturing=false
var capture_pending=false
var next_capture=0.0
var time=0.0
var frame=0
var stage="setup"
var samples=[]
var source=""

func _initialize():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=").trim_suffix("/")+"/"
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-weight-review/";call_deferred("run")

func release_input():
	for action in ["forward","back","left","right","sprint","crouch","aim","jump"]:Input.action_release(action)

func _process(dt):
	time+=dt
	if is_instance_valid(camera) and is_instance_valid(game):
		var at=game.player.get_global_transform_interpolated().origin
		camera.position=at+Vector3(3.1,1.7,-4.2);camera.look_at(at+Vector3.UP*.9)
		game.player.set_camera_fade(0)
	if capturing and not capture_pending and time>=next_capture:
		next_capture=time+1.0/24;capture_pending=true;capture_frame.call_deferred()
	return false

func capture_frame():
	await RenderingServer.frame_post_draw
	if not capturing:capture_pending=false;return
	var file=output+"frame-%04d.png"%frame
	root.get_texture().get_image().save_png(file)
	var p=game.player;var m=p.locomotion
	samples.append({"frame":frame,"seconds":time,"stage":stage,"position":str(p.position),"lean":str(m.sampled_lean),"landing_m":m.sampled_landing,"grounded":p.is_on_floor()})
	frame+=1;capture_pending=false

func segment(label: String,actions: Array,seconds: float):
	stage=label;release_input()
	for action in actions:Input.action_press(action)
	await create_timer(seconds).timeout

func run():
	if DisplayServer.get_name()=="headless":quit(2);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	Engine.max_fps=60;DisplayServer.window_set_size(Vector2i(1440,810))
	source=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false)
	game.audio.muted=true
	MMFAssets.box(game.world,Vector3(50,1,50),Vector3(50,15.5,0),MMFAssets.material(Color(.18,.21,.20)))
	# Inlaid stripes provide a world-space reference for planted-foot motion.
	for x in range(30,72,2):MMFAssets.box(game.world,Vector3(.025,.002,40),Vector3(x,16.001,0),MMFAssets.material(Color(.35,.34,.27)),false)
	game.player.teleport(Vector3(50,16.1,6));game.player.yaw=0
	camera=Camera3D.new();game.add_child(camera);camera.fov=45;camera.make_current();game.ui.root.hide()
	await create_timer(.5).timeout
	capturing=true
	await segment("idle",[],.8)
	await segment("walk-start",["forward"],1.3)
	await segment("walk-stop",[],.85)
	await segment("sprint-start",["forward","sprint"],1.25)
	game.player.yaw=PI/2
	await segment("sprint-turn",["forward","sprint"],.7)
	await segment("sprint-stop",[],.85)
	await segment("crouch-diagonal",["forward","right","crouch"],1.0)
	await segment("crouch-stop",["crouch"],.6)
	await segment("stand",[],.5)
	await segment("jump",["jump"],.12)
	await segment("land-settle",[],1.5)
	await segment("aim-strafe",["aim","left"],.9)
	await segment("aim-stop",["aim"],.7)
	await segment("rest",[],.8)
	capturing=false;release_input()
	while capture_pending:await process_frame
	var end_source=MMFPlaytestRecorder.source_fingerprint()
	var report={"source_hash":source,"source_hash_end":end_source,"source_stable":source==end_source,"frames":frame,"samples":samples,"ground_recoveries":game.player.boundary.recoveries,"evidence":"Prepared native real-input presentation fixture; inspection camera, no earned campaign or human feel claim"}
	FileAccess.open(output+"review.json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	print("PLAYER_WEIGHT_REVIEW frames=",frame," source_stable=",source==end_source)
	quit(0 if source==end_source and frame>100 else 1)
