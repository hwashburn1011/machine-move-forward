extends SceneTree

# Compare the old input-selected animation controller with the new presentation
# using the same native character, lighting and actual 60 Hz capsule motion.
class LegacyMotion extends MMFPlayerLocomotion:
	func update(_dt: float,_motion: Vector3):
		var input=Input.get_vector("left","right","forward","back")
		var run=Input.is_action_pressed("sprint") and not player.crouched and input.y<0
		var pose="armed_"
		if input.length()<.05:pose+="crouch_idle" if player.crouched else "idle"
		else:
			pose+="crouch_walk" if player.crouched else ("run" if run else "walk")
			pose+="_left" if input.x<-.5 else ("_right" if input.x>.5 else ("_back" if input.y>0 else "_fwd"))
		player.play(pose)
	func contact_weight(_side: String) -> float:return 1.0

var game
var native: MMFPlayerLocomotion
var legacy: LegacyMotion
var report={}
var driver

class Driver extends Node:
	var game
	var camera: Camera3D
	var time=0.0
	func _physics_process(dt):
		time+=dt
		if time>1.3:
			time=0;game.player.teleport(Vector3(50,16.1,6))
	func _process(_dt):
		var p=game.player;var at=p.get_global_transform_interpolated().origin
		camera.position=at+Vector3(2.5,1.5,-2.8);camera.look_at(at+Vector3.UP*.9)
		p.set_camera_fade(0)

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-motion-profile/";call_deferred("run")

func stats(values: Array) -> Dictionary:
	values.sort();return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back()}

func sample(refined: bool,label: String):
	game.player.locomotion.release();game.player.locomotion=native if refined else legacy
	driver.time=0;game.player.teleport(Vector3(50,16.1,6))
	Input.action_press("forward");Input.action_press("sprint")
	await create_timer(2).timeout
	var frame_ms=[];var gpu_ms=[];var physics_ms=[];var process_ms=[];var moving_frames=0
	var start=Time.get_ticks_usec();var previous=start
	while Time.get_ticks_usec()-start<6000000:
		await process_frame
		var now=Time.get_ticks_usec();frame_ms.append((now-previous)/1000.0);previous=now
		gpu_ms.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
		physics_ms.append(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000)
		process_ms.append(Performance.get_monitor(Performance.TIME_PROCESS)*1000)
		if Vector2(game.player.get_real_velocity().x,game.player.get_real_velocity().z).length()>7.4:moving_frames+=1
	var moving_fraction=float(moving_frames)/frame_ms.size()
	assert(moving_fraction>.90,"Benchmark must exercise sustained actual sprinting")
	report.scenarios[label]={"frameMs":stats(frame_ms),"gpuMs":stats(gpu_ms),"physicsMs":stats(physics_ms),"processMs":stats(process_ms),"movingFraction":moving_fraction,"samples":frame_ms.size()}
	print("LOCOMOTION_PROFILE ",label," ",report.scenarios[label])
	Input.action_release("sprint");Input.action_release("forward")

func capture(label: String,actions: Array,at: Vector3):
	driver.set_physics_process(false);game.player.teleport(at);game.player.yaw=0
	await create_timer(.2).timeout
	for action in actions:Input.action_press(action)
	for i in 43:
		await physics_frame
		driver._process(0)
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/locomotion-"+label+".png"))
	for action in actions:Input.action_release(action)

func run():
	if DisplayServer.get_name()=="headless":push_error("Motion profile requires native rendering");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false)
	MMFAssets.box(game,Vector3(30,1,30),Vector3(50,15.5,0),MMFAssets.material(Color(.15,.13,.11)))
	game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	game.player.pitch=0;game.player.yaw=0
	native=game.player.locomotion;legacy=LegacyMotion.new();legacy.player=game.player
	driver=Driver.new();driver.game=game;driver.process_physics_priority=100;game.add_child(driver)
	# A dedicated review camera avoids the production spring arm updating a
	# reparented gameplay camera behind the inspection driver's back.
	var camera=Camera3D.new();game.add_child(camera);camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	camera.fov=55;camera.far=1800;camera.current=true;driver.camera=camera
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report={"adapter":RenderingServer.get_video_adapter_name(),"resolution":str(root.size),"quality":"high / Forward+ / Vulkan / 4x MSAA","vsync":false,"scope":"Actual capsule sprint on an unobstructed test platform in the native world/lighting, same camera/assets. Two six-second samples per controller, 2s warmup each. Resetting position every 1.3s retains a fixed view. At least 90% of sampled frames must have actual speed above 7.4 m/s. Physics/process monitors include other active work, not just animation; GPU timings are rendered.","scenarios":{}}
	await sample(false,"legacy-1");await sample(true,"refined-1");await sample(false,"legacy-2");await sample(true,"refined-2")
	game.player.locomotion=native
	await capture("forward",["forward"],Vector3(50,16.1,6))
	await capture("diagonal",["forward","right"],Vector3(50,16.1,6))
	await capture("crouch",["right","crouch"],Vector3(50,16.1,6))
	var file=FileAccess.open("res://../test-results/godot-native/locomotion-profile.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	native=null;legacy=null;await create_timer(.1).timeout
	MMFAssets.cache.clear();call_deferred("quit")
