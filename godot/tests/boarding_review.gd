extends SceneTree
var game
var camera: Camera3D
var label="current"
var source=""
var poses=false
var transitions=false
var profiling=false
var deck_review=false
var side=1
var report={"models":{},"views":{}}
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-boarding-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		if arg.begins_with("--source="):source=arg.trim_prefix("--source=")
		if arg=="--poses":poses=true
		if arg=="--transitions":transitions=true;poses=true
		if arg=="--profile":profiling=true
		if arg=="--deck":deck_review=true
		if arg=="--port":side=-1
	call_deferred("run")
func capture(name: String):
	await create_timer(.25).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/boarding-"+label+"-"+name+".png"))
func median(values: Array):values.sort();return values[values.size()/2]
func measure(name: String):
	var start=Time.get_ticks_usec()
	while Time.get_ticks_usec()-start<2000000:
		game.combat.update_ship(0);game.effects.update(1.0/60);await process_frame
	var frames=[];var gpu=[];start=Time.get_ticks_usec();var previous=start
	while Time.get_ticks_usec()-start<4000000:
		game.combat.update_ship(0);game.effects.update(1.0/60);await process_frame
		var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
	report.views[name].render={"medianGpuMs":median(gpu),"medianFrameMs":median(frames),"samples":frames.size(),"drawCalls":RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)}
func pose_views():
	for kind in game.data.ENEMIES:
		var enemy=game.combat.spawn(kind,Vector3(50,16,0),true);enemy.set_physics_process(false);game.combat.boarding.prepare(enemy);enemy.boarding_pose.set_phase(.45)
		camera.position=Vector3(52.2,17.7,3.6);camera.look_at(Vector3(50,16.95,0));camera.reset_physics_interpolation()
		if transitions and kind in ["warden","bastion"]:
			for phase in [.03,.06,.10,.88,.93,.97]:
				enemy.boarding_pose.set_phase(phase);await capture(kind+"-"+str(phase).replace(".","-"))
		else:await capture(kind)
		enemy.queue_free();await process_frame
func run():
	DisplayServer.window_set_size(Vector2i(1920,1080))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.settings.vsync=false;game.save_settings();game.started=true;game.session.opening_done=true;game.close_menu();game.invulnerable=true
	game.set_physics_process(false);game.player.set_physics_process(false);game.ui.root.hide();game.player.hide();game.effects.update(0)
	camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.fov=48;camera.position=Vector3(29,20,14);camera.look_at(Vector3(14,13,0))
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	if source!="":
		var script=GDScript.new();script.source_code=FileAccess.get_file_as_string(source);assert(script.reload()==OK)
		game.combat.queue_free();await process_frame;game.combat=script.new();game.add_child(game.combat);game.combat.setup(game)
		while game.combat.nav.is_baking():await create_timer(.02).timeout
	for kind in game.data.ENEMIES:
		var enemy=game.combat.spawn(kind,Vector3(50,16,0));enemy.set_physics_process(false)
		var skeletons=MMFAssets.of_type(enemy.visual,"Skeleton3D");var bones=[]
		for skeleton in skeletons:
			for i in skeleton.get_bone_count():bones.append({"name":skeleton.get_bone_name(i),"at":str(skeleton.get_bone_global_rest(i).origin),"parent":skeleton.get_bone_parent(i)})
		report.models[kind]={"clips":enemy.animator.get_animation_list(),"bones":bones,"fit":enemy.visual.scale.x}
		enemy.queue_free()
	if poses:
		await pose_views()
	else:
		await ship_views()
	var file=FileAccess.open("res://../test-results/godot-native/boarding-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("BOARDING_REVIEW_COMPLETE")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
func ship_views():
	camera.position=Vector3(side*29,20,14);camera.look_at(Vector3(side*14,13,0));camera.reset_physics_interpolation()
	game.combat.begin_ship("skiff",false,true);game.combat.ship_side=side;game.combat.ship.position=Vector3(side*17,6,0);game.combat.weapon_health=0
	for enemy in game.combat.crew:enemy.set_physics_process(false)
	game.combat.update_ship(0)
	if deck_review:
		# This fixture forces a side; retire the earlier seeded approach caption.
		game.ui.notify("")
		game.ui.root.show();game.player.show();game.player.camera.current=true
		game.player.teleport(Vector3(9.4,16.05,1.2));game.player.yaw=-.98;game.player.pitch=-.20;game.player.update_camera(1);game.player.play("armed_idle")
		game.combat.ship_timer=4.4;game.combat.update_ship(0);game.update_interaction(0)
		await capture("deck-arrival")
		Input.action_press("use")
		for i in 73:game.update_interaction(1.0/60);await physics_frame
		Input.action_release("use");assert(game.combat.ship_state=="retreat")
		for enemy in game.combat.crew:enemy.set_physics_process(true)
		await create_timer(.6).timeout;game.update_interaction(0)
		await capture("deck-severed")
		return
	report.shipBounds=str(MMFAssets.bounds(game.combat.ship))
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	for at in ([0.,3.75,4.8,7.0] if profiling else [0.,2.,3.75,4.8,5.5,7.0]):
		game.combat.ship_timer=at;game.combat.update_ship(0)
		var key=str(at).replace(".","-");report.views[key]={"crew":game.combat.crew.map(func(e):return {"kind":e.kind,"position":str(e.position),"clip":e.animation,"inactive":e.inactive})}
		if profiling:await measure(key)
		await capture(key)
	report.adapter=RenderingServer.get_video_adapter_name();report.scope="1920x1080 high Vulkan/4xMSAA, VSync off, same real machine and camera; frozen ship timeline with native animation/effects active; two second warmup/four second samples. Captures after timing."
