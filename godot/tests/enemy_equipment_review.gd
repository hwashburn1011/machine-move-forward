extends SceneTree
var game
var camera: Camera3D
var label="before"
var source_path=""
var report={"views":{},"equipment":{}}
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-enemy-equipment-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		if arg.begins_with("--source="):source_path=arg.trim_prefix("--source=")
	call_deferred("run")
func median(a: Array):a.sort();return a[a.size()/2]
func capture(name: String):
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/equipment-"+label+"-"+name+".png"))
func wait_effects(seconds: float):
	var previous=Time.get_ticks_usec();var until=previous+int(seconds*1000000)
	while Time.get_ticks_usec()<until:
		await process_frame;var now=Time.get_ticks_usec();game.effects.update((now-previous)/1000000.0);previous=now
func measure(name: String):
	await create_timer(2).timeout
	var gpu=[];var frames=[];var now=Time.get_ticks_usec();var start=now
	while Time.get_ticks_usec()-start<4000000:
		await process_frame;var next=Time.get_ticks_usec();frames.append((next-now)/1000.0);now=next
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
	report.views[name]={"medianGpuMs":median(gpu),"medianFrameMs":median(frames),"samples":frames.size(),"drawCalls":RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)}
	await capture(name)
func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.settings.vsync=false;game.save_settings();game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.ui.root.hide();game.player.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	MMFAssets.box(game,Vector3(12,.3,12),Vector3(50,15.85,0),MMFAssets.material(Color(.15,.13,.11)))
	camera=Camera3D.new();game.add_child(camera);camera.fov=42;camera.near=.03;camera.current=true
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	for kind in ["warden","bastion","sovereign"]:
		game.effects.tracers.clear();game.effects.update(0)
		var enemy
		if source_path=="":enemy=game.combat.spawn(kind,Vector3(50,16.01,0))
		else:
			enemy=load(source_path).new();game.combat.add_child(enemy);enemy.setup(game,kind);enemy.position=Vector3(50,16.01,0);game.combat.enemies.append(enemy)
		enemy.set_physics_process(false);enemy.hp_label.hide()
		camera.position=enemy.position+Vector3(2.2,1.8,3);camera.look_at(enemy.position+Vector3(.1,1.05,.25));camera.reset_physics_interpolation()
		await measure(kind)
		var socket=enemy.equipment.muzzle if source_path=="" else MMFAssets.find_named(enemy.visual,"EnemyMuzzle")
		var skeleton=MMFAssets.of_type(enemy.visual,"Skeleton3D")[0]
		enemy.committed=Vector3(50,17.2,8);enemy.shoot_committed()
		game.effects.update(0)
		report.equipment[kind]={"muzzle":str(socket.global_position),"muzzleBasis":str(socket.global_basis),"socketParent":str(socket.get_parent().get_class()),"traceStart":str(game.effects.tracers.back().a),"equipmentBone":str(skeleton.global_transform*skeleton.get_bone_global_pose(skeleton.find_bone("equipment_0")))}
		await capture(kind+"-shot")
		if kind=="sovereign":
			report.equipment[kind].hitbox=str(enemy.drone.global_position)
			enemy.drone.take_damage(100,enemy.drone.global_position);await wait_effects(1);await capture("drone-destroyed")
			enemy.take_damage(10000,enemy.position);await wait_effects(1.6);await capture("commander-fallen")
		enemy.queue_free();await process_frame;game.combat.enemies.clear()
	report.scope="1920x1080 high Forward+/Vulkan, 4x MSAA, VSync off; isolated close native views, 2s warmup/4s sample; shots/captures outside timing. Simulation frozen, authored idle animation continues."
	report.adapter=RenderingServer.get_video_adapter_name()
	var file=FileAccess.open("res://../test-results/godot-native/equipment-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("EQUIPMENT_REVIEW ",report)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
