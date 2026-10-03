extends SceneTree

var game
var report={}
var motion_driver

class MotionDriver extends Node:
	var bot
	var legacy
	var old_wheels=[]
	var refined=false
	var clock=0.0
	var samples=[]
	func _physics_process(dt):
		clock+=dt
		var before_position=bot.position
		bot.position.z=6+sin(clock*2)*.25
		bot.visual.rotation.y=sin(clock)*.35;legacy.rotation.y=bot.visual.rotation.y
		var before=Time.get_ticks_usec()
		if refined:bot.drive.update(bot.visual.global_transform,true)
		else:
			var distance=bot.position.distance_to(before_position)
			for wheel in old_wheels:wheel.rotation.x-=distance/.143
		samples.append((Time.get_ticks_usec()-before)/1000.0)

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-drive-profile/";call_deferred("run")

func stats(values: Array) -> Dictionary:
	values.sort()
	return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back()}

func sample(legacy: Node3D,refined: bool,label: String):
	var bot=game.caretaker
	legacy.visible=not refined;bot.visual.visible=refined
	motion_driver.refined=refined;motion_driver.clock=0;bot.drive.positioned=false
	await create_timer(2).timeout
	motion_driver.samples.clear()
	var frames=[];var gpu=[];var draws=[];var triangles=[]
	var start=Time.get_ticks_usec();var previous=start
	while Time.get_ticks_usec()-start<6000000:
		await process_frame
		var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
		draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		triangles.append(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
	report.scenarios[label]={"frameMs":stats(frames),"gpuMs":stats(gpu),"driveCpuMs":stats(motion_driver.samples),"draws":stats(draws),"primitives":stats(triangles),"samples":frames.size()}
	print("DRIVE_PROFILE ",label," ",report.scenarios[label])
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/drive-profile-"+label+".png"))

func run():
	if DisplayServer.get_name()=="headless":push_error("Drive profile requires native rendering.");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	game.started=true;game.session.opening_done=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	var bot=game.caretaker;bot.position=Vector3(-4,16.03+.02,6);bot.visible=true
	var kit=MMFAssets.scene("models/authored/fieldwork-kit.glb")
	var legacy=MMFAssets.find_named(kit,"L12").duplicate();kit.free();bot.add_child(legacy)
	legacy.position.y=-MMFAssets.bounds(legacy).position.y-bot.safe_margin
	motion_driver=MotionDriver.new();motion_driver.bot=bot;motion_driver.legacy=legacy
	for wheel in legacy.get_children():
		if String(wheel.name).begins_with("L12Wheel"):motion_driver.old_wheels.append(wheel)
	game.add_child(motion_driver)
	game.player.visual.hide();game.ui.root.hide()
	var camera=game.player.camera;camera.reparent(game);camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	camera.position=bot.position+Vector3(2,1.25,-2);camera.look_at(bot.position+Vector3.UP*.62)
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report={"adapter":RenderingServer.get_video_adapter_name(),"resolution":str(root.size),"quality":"high / Forward+ / Vulkan / 4x MSAA","vsync":false,"scenario":"Identical native deck/camera/body with one L12, stationary world, repeated small forward/reverse movement and turns; legacy static tracks versus animated authored shoes.","scenarios":{}}
	await sample(legacy,false,"legacy-1");await sample(legacy,true,"refined-1")
	await sample(legacy,false,"legacy-2");await sample(legacy,true,"refined-2")
	var file=FileAccess.open("res://../test-results/godot-native/drive-profile.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.05).timeout
	game.queue_free();await create_timer(.1).timeout;MMFAssets.cache.clear();call_deferred("quit")
