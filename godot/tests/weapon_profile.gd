extends SceneTree

# Same resident assets, native scene/light/camera; only the two presentations
# alternate. Measure real renderer frames and final-pose callback CPU cost.
class TimedHold extends MMFWeaponPose:
	var times=[]
	func apply():
		var start=Time.get_ticks_usec();super.apply();times.append((Time.get_ticks_usec()-start)/1000.0)

var game
var native: TimedHold
var old_models={}
var report={"scenarios":{}}

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-weapon-profile/";call_deferred("run")

func stats(values: Array) -> Dictionary:
	if values.is_empty():return {}
	values.sort();return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back()}

func sample(refined: bool,kind: String,label: String):
	var p=game.player;game.session.current_weapon=kind;p.play("armed_idle")
	p.weapon_pose=native if refined else null
	p.rifle_mesh.visible=refined and kind=="rifle";p.shotgun_mesh.visible=refined and kind=="shotgun"
	for key in old_models:old_models[key].visible=not refined and kind==key
	await create_timer(2).timeout
	native.times.clear();var frames=[];var gpu=[];var calls=[];var start=Time.get_ticks_usec();var previous=start
	while Time.get_ticks_usec()-start<5000000:
		await process_frame
		var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
		calls.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	report.scenarios[label]={"frameMs":stats(frames),"gpuMs":stats(gpu),"holdCpuMs":stats(native.times),"drawCalls":stats(calls),"samples":frames.size()}
	print("WEAPON_PROFILE ",label," ",report.scenarios[label])

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings();game.started=true;game.session.opening_done=true;game.close_menu()
	game.set_physics_process(false);game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	var p=game.player;p.set_physics_process(false);p.equipment.set_process(false)
	p.teleport(Vector3(50,16.1,0));p.yaw=0;p.pitch=0;p.visual.rotation.y=PI;p.set_camera_fade(0)
	MMFAssets.box(game,Vector3(15,.3,15),Vector3(50,15.95,0),MMFAssets.material(Color(.15,.13,.11)))
	var camera=Camera3D.new();game.add_child(camera);camera.fov=45;camera.current=true
	camera.position=p.position+Vector3(2.4,1.45,-3.1);camera.look_at(p.position+Vector3(0,1,0))
	for pair in [["rifle",.88],["shotgun",.95]]:
		var model=MMFAssets.scene("models/authored/scrap-"+pair[0]+".glb");var b=MMFAssets.bounds(model)
		var long_axis=b.size.max_axis_index();var thin_axis=0 if long_axis!=0 else 1
		for axis in 3:
			if axis!=long_axis and b.size[axis]<b.size[thin_axis]:thin_axis=axis
		var barrel=Vector3.ZERO;barrel[long_axis]=1 if absf(b.end[long_axis])>=absf(b.position[long_axis]) else -1
		var lateral=Vector3.ZERO;lateral[thin_axis]=1
		model.basis=Basis(lateral,barrel.cross(lateral),barrel).transposed()
		model.scale*=float(pair[1])/maxf(b.size[long_axis],.01)/p.visual.scale.x
		model.position.x=-.05/p.visual.scale.x;p.weapon_socket.add_child(model);model.hide();old_models[pair[0]]=model
	native=TimedHold.new();native.setup(p)
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	report.adapter=RenderingServer.get_video_adapter_name();report.resolution=str(root.size);report.quality="High / Vulkan Forward+ / 4x MSAA / VSync off"
	report.scope="Real native world and idle character close view. Original/refined meshes and pose alternate, all assets resident. Two 5s samples each per weapon after 2s warmup. Hold CPU is timed inside the actual SkeletonModifier callback. No combat, travel or streaming; not a gameplay FPS claim."
	for kind in ["rifle","shotgun"]:
		for repeat in 2:
			await sample(false,kind,kind+"-original-"+str(repeat+1));await sample(true,kind,kind+"-refined-"+str(repeat+1))
	p.weapon_pose=native
	var file=FileAccess.open("res://../test-results/godot-native/weapon-profile.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	p=null;native=null;old_models.clear();await create_timer(.1).timeout;MMFAssets.cache.clear();quit()
