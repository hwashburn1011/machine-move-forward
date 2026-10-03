extends SceneTree
var game
var camera: Camera3D
var label="before"
var report={"views":{}}
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-loot-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")
func median(a: Array):a.sort();return a[a.size()/2]
func capture(name: String):
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/loot-"+label+"-"+name+".png"))
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
	game.effects.update(0)
	camera=Camera3D.new();game.add_child(camera);camera.fov=42;camera.near=.03;camera.current=true
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	await physics_frame
	for i in 3:game.combat.drop_loot(Vector3(49+i,16.04,0),["scrap","components","fuel"][i],12)
	if game.combat.get("loot_view"):game.combat.loot_view.update()
	camera.position=Vector3(51.5,17.4,2.4);camera.look_at(Vector3(50,16.12,0));camera.reset_physics_interpolation();await measure("close")
	camera.position=Vector3(52.1,18.6,4.2);camera.look_at(Vector3(50,16.1,0));camera.reset_physics_interpolation();await measure("play-distance")
	for i in 24:game.combat.drop_loot(Vector3(47.5+(i%6),16.04,-1.0-int(i/6)),["scrap","components","fuel"][i%3],12)
	if game.combat.get("loot_view"):game.combat.loot_view.update()
	camera.position=Vector3(54,20,5);camera.look_at(Vector3(50,16.1,-1.5));camera.reset_physics_interpolation();await measure("accumulated")
	report.scope="1920x1080 high Forward+/Vulkan 4x MSAA, VSync off, 2s warmup/4s sample; 3 drops then 27 accumulated drops; frozen simulation, identical pad/environment/cameras."
	report.adapter=RenderingServer.get_video_adapter_name()
	var file=FileAccess.open("res://../test-results/godot-native/loot-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("LOOT_REVIEW ",report)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
