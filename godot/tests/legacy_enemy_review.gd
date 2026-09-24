extends SceneTree

var game
var label="before"
var roster=[]
var camera: Camera3D
var original=false
var profiling=false
var poses=false
var resident=[]
var report={"views":{},"spawnMs":{}}
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-legacy-enemy-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		if arg=="--original":original=true
		if arg=="--profile":profiling=true
		if arg=="--poses":poses=true
	call_deferred("run")
func aim(at: Vector3,target: Vector3):
	camera.position=at;camera.look_at(target);camera.reset_physics_interpolation()
func median(values: Array):values.sort();return values[values.size()/2]
func measure(name: String):
	await create_timer(2).timeout
	var frames=[];var gpu=[];var start=Time.get_ticks_usec();var previous=start
	while Time.get_ticks_usec()-start<4000000:
		await process_frame
		var now=Time.get_ticks_usec();frames.append((now-previous)/1000.);previous=now
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
	report.views[name]={"medianGpuMs":median(gpu),"medianFrameMs":median(frames),"samples":frames.size(),"drawCalls":RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)}
func capture(name: String,at: Vector3,target: Vector3):
	aim(at,target)
	await create_timer(.3).timeout;await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/legacy-"+label+"-"+name+".png"))
func run():
	DisplayServer.window_set_size(Vector2i(1500,1200));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.settings.vsync=false;game.save_settings()
	game.set_physics_process(false);game.player.set_physics_process(false)
	while not game.get_node("EncounterAssets").finished:await process_frame
	# Both comparisons retain both resource sets; only the spawned skin differs.
	for kind in ["raider","scavenger"]:
		var old=load("res://assets/models/authored/"+kind+".glb");var refined=load(MMFEnemyModels.path(kind));resident.append_array([old,refined])
		if original:MMFAssets.cache[MMFEnemyModels.path(kind)]=old
	if original:MMFEnemyAnimation.footing=MMFAssets.json("res://tests/fixtures/legacy-footing-before.json").models
	game.started=true;game.session.opening_done=true;game.close_menu();game.ui.root.hide();game.player.hide()
	MMFAssets.box(game,Vector3(10,.3,8),Vector3(50,15.85,0),MMFAssets.material(Color(.13,.13,.12)))
	camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.fov=35
	for i in 2:
		var start=Time.get_ticks_usec();var enemy=game.combat.spawn(["raider","scavenger"][i],Vector3(49+i*2,16.01,0),true)
		report.spawnMs[enemy.kind]=(Time.get_ticks_usec()-start)/1000.
		enemy.set_physics_process(false);enemy.hp_label.hide();enemy.animator.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		enemy.animator.advance(0);roster.append(enemy)
	if profiling:
		RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
		for moving in [false,true]:
			for enemy in roster:
				enemy.animator.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_IDLE
				enemy.play("walk" if moving else "idle",true)
			var state="walk" if moving else "idle"
			aim(Vector3(51.7,18.2,6.3),Vector3(50,17.05,0));await measure("pair-"+state)
			for i in 2:
				var target=roster[i].position;aim(target+Vector3(.85,1.60,2.4),target+Vector3(0,1.30,0));await measure(roster[i].kind+"-"+state)
	elif poses:
		for enemy in roster:
			for request in ["walk","attack","death","boarding"]:
				enemy.presentation.dead=false;enemy.presentation.action_left=0
				var clip="idle" if request=="boarding" else request
				enemy.play(clip,true);enemy.animator.play(enemy.presentation.clips[clip],0);enemy.animator.advance(0)
				if request=="boarding":
					game.combat.boarding.prepare(enemy);enemy.boarding_pose.set_phase(.45)
				else:
					enemy.animator.seek(enemy.animator.current_animation_length*(.85 if request=="death" else .3),true)
				await capture(enemy.kind+"-"+request,enemy.position+Vector3(1.6,1.5,4.4),enemy.position+Vector3(0,1,0))
			if enemy.boarding_pose:enemy.boarding_pose.finish()
			enemy.play("idle",true);enemy.animator.play(enemy.presentation.clips.idle,0);enemy.animator.advance(0)
		# Review cohesion with the actual player and machine from the player camera.
		for i in 2:
			roster[i].position=Vector3(4+i*2,16.01,3);roster[i].reset_physics_interpolation()
		game.player.show();game.player.camera.current=true;game.player.teleport(Vector3(4,16.05,7));game.player.yaw=0;game.player.pitch=-.12;game.player.update_camera(1);game.player.play("armed_idle")
		await capture("deck",camera.position,Vector3(50,17,0))
	else:
		await capture("pair",Vector3(51.7,18.2,6.3),Vector3(50,17.05,0))
		for i in 2:
			var target=roster[i].position
			await capture(["raider","scavenger"][i],target+Vector3(.85,1.60,2.4),target+Vector3(0,1.30,0))
			await capture(["raider-back","scavenger-back"][i],target+Vector3(-.85,1.5,-2.6),target+Vector3(0,1.10,0))
	report.adapter=RenderingServer.get_video_adapter_name();report.scope="1500x1200 high Vulkan/4xMSAA, VSync off, 60 FPS cap, frozen simulation; matching original/native rigs, both art sets resident. Fixed cameras with idle/walk animation active; 2 second warmup and 4 second samples. Captures outside timing."
	var file=FileAccess.open("res://../test-results/godot-native/legacy-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	resident.clear();MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
