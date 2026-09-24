extends SceneTree
var game
var camera: Camera3D
var original=false
var profile=false
var raid=false
var label="current"
var report={"views":{},"models":{}}
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-raider-craft-review/"
	for arg in OS.get_cmdline_user_args():
		if arg=="--original":original=true
		if arg=="--profile":profile=true
		if arg=="--raid":raid=true
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")
func capture(name: String):
	await create_timer(.25).timeout;await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/raider-"+label+"-"+name+".png"))
func median(values: Array):values.sort();return values[values.size()/2]
func measure(name: String):
	await create_timer(2).timeout
	var samples=[];var gpu=[];var start=Time.get_ticks_usec();var previous=start
	while Time.get_ticks_usec()-start<4000000:
		await process_frame;var now=Time.get_ticks_usec();samples.append((now-previous)/1000.0);previous=now
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
	report.views[name]={"medianFrameMs":median(samples),"medianGpuMs":median(gpu),"samples":samples.size(),"drawCalls":RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)}
func model(kind: String):
	if original:return MMFAssets.scene("models/authored/raider-"+kind+".glb")
	var kit=load("res://art/raider-craft.glb").instantiate();var node=MMFAssets.find_named(kit,"RaiderSkiff" if kind=="skiff" else "RaiderGunboat")
	node.get_parent().remove_child(node);kit.free();return node
func raid_views():
	for kind in ["skiff","gunboat"]:
		game.combat.begin_ship(kind,false,true);game.combat.ship_side=1;game.combat.ship.position=Vector3(17 if kind=="skiff" else 18,6,0)
		if kind=="skiff":
			for i in 2:
				game.combat.crew[i].queue_free()
				var enemy=game.combat.spawn("bastion" if i==0 else "warden",game.combat.boarding.start_position(i),true)
				enemy.set_physics_process(false);game.combat.boarding.prepare(enemy);game.combat.crew[i]=enemy
		game.player.teleport(Vector3(6,16.1,3.5));game.combat.update_ship(0);game.combat.craft.update(3)
		camera.position=game.combat.ship.position+Vector3(5.7,4.2,6.5);camera.look_at(game.combat.ship.position+Vector3.UP*1.9);camera.reset_physics_interpolation()
		await capture(kind+"-active")
		if kind=="skiff":
			for enemy in game.combat.crew:report.models[enemy.kind]={"root":str(enemy.position),"feet":preload("res://tests/enemy_sole_geometry.gd").foot_heights(enemy)}
		if kind=="gunboat":
			game.combat.volley_timer=.001;game.combat.update_ship(.002);await capture("gunboat-volley")
			game.combat.weapon_health=0;game.combat.engine_health=0;game.combat.craft.update(.2);await capture("gunboat-disabled")
		else:
			game.ui.root.show();game.player.show();game.ui.notify("");game.player.camera.current=true
			game.player.teleport(Vector3(9.4,16.05,1.2));game.player.yaw=-.98;game.player.pitch=-.20;game.player.update_camera(1);game.player.play("armed_idle")
			game.combat.ship_timer=4.4;game.combat.update_ship(0);game.update_interaction(0);await capture("player-boarding")
			game.ui.root.hide();game.player.hide();camera.current=true
		game.combat.boarding.clear()
		for enemy in game.combat.enemies:
			if is_instance_valid(enemy):enemy.queue_free()
		game.combat.enemies.clear();game.combat.crew.clear()
		for shell in game.combat.shells:shell.marker.queue_free()
		game.combat.shells.clear()
		if is_instance_valid(game.combat.hook):game.combat.hook.queue_free()
		game.combat.hook=null;game.combat.ship.queue_free();game.combat.ship=null;game.combat.ship_state="none";await process_frame
func run():
	DisplayServer.window_set_size(Vector2i(1920,1080))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.settings.vsync=false;game.save_settings();game.started=true;game.session.opening_done=true;game.close_menu();game.invulnerable=true
	game.set_physics_process(false);game.player.set_physics_process(false);game.ui.root.hide();game.player.hide();game.effects.update(0)
	camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.fov=48
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	if raid:await raid_views()
	for kind in ([] if raid else ["skiff","gunboat"]):
		var ship=model(kind);game.add_child(ship);ship.position=Vector3(45,6,0)
		var anchors={}
		for name in ["CrewSeatLeft","CrewSeatRight","PilotSeat","SkiffGunYaw","SkiffGunPitch","SkiffMuzzle","GunboatGunYaw","GunboatGunPitch","GunboatMuzzle","WeaponDamageAnchor","EngineDamageAnchor","EngineExhaust"]:
			var anchor=MMFAssets.find_named(ship,name)
			if anchor:anchors[name]=str(ship.to_local(anchor.global_position))
		report.models[kind]={"bounds":str(MMFAssets.bounds(ship)),"meshes":MMFAssets.of_type(ship,"MeshInstance3D").size(),"anchors":anchors}
		for view in (["front","rear"] if profile else ["front","rear","deck","below"]):
			var distance=1.0 if kind=="skiff" else 1.45
			var offset={"front":Vector3(5.5,4,-7),"rear":Vector3(-5,3.4,6.5),"deck":Vector3(3.8,6,1.5),"below":Vector3(4,-1.5,5)}[view]*distance
			camera.position=ship.position+offset;camera.look_at(ship.position+Vector3.UP*(1.2 if kind=="skiff" else 2));camera.reset_physics_interpolation()
			if profile:await measure(kind+"-"+view)
			await capture(kind+"-"+view)
		ship.queue_free();await process_frame
	report.adapter=RenderingServer.get_video_adapter_name();report.scope="1920x1080 high Vulkan, 4xMSAA, VSync off. Same frozen world and cameras, two-second warmup/four-second samples; captures after measurement. Isolated hull cost, not gameplay FPS."
	var file=FileAccess.open("res://../test-results/godot-native/raider-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);print("RAIDER_REVIEW_COMPLETE");call_deferred("quit")
