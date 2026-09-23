extends SceneTree

var game
var rendered=true
var report={}

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-test-campaigns/"
	call_deferred("run")

func frames(count: int):
	for i in count: await process_frame

func percentile(values: Array,p: float) -> float:
	var sorted=values.duplicate();sorted.sort()
	return sorted[clampi(int(ceil(sorted.size()*p))-1,0,sorted.size()-1)]

func run():
	if DisplayServer.get_name()=="headless": push_error("Benchmark requires real GPU rendering.");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080))
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	Engine.max_fps=60 if "--cap60" in OS.get_cmdline_user_args() else 0
	game=load("res://scenes/main.tscn").instantiate()
	root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true
	game.close_menu()
	game.settings.vsync=false
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	game.player.position=Vector3(5.6,16.09,1.5)
	game.player.reset_physics_interpolation()
	await create_timer(5).timeout
	report={"engine":Engine.get_version_info(),"adapter":RenderingServer.get_video_adapter_name(),"resolution":str(root.size),"renderer":"Forward+ / Vulkan","msaa":"4x","vsync":false,"frameCap":Engine.max_fps,"sampleSeconds":12,"seed":game.session.seed_name,"physicsHz":60,"scenarios":{}}
	for scenario in ["deck","rapid-look","crowded-look"]:
		if scenario=="crowded-look":
			for i in 8:
				game.combat.spawn(["bastion","warden","revenant","sovereign"][i%4],Vector3(-6 if i<4 else 6,16.09,-6+(i%4)*4),false)
		await create_timer(2.5).timeout
		var elapsed=[];var cpu=[];var physics=[];var gpu=[];var render_cpu=[];var draws=[];var primitives=[]
		var before=Time.get_ticks_usec()
		var start=before
		var previous=Time.get_ticks_usec()
		while Time.get_ticks_usec()-start<12000000:
			var current=Time.get_ticks_usec()
			if scenario!="deck": game.player.yaw-=3.96*(current-previous)/1000000.0
			previous=current
			await process_frame
			var now=Time.get_ticks_usec();elapsed.append((now-before)/1000.0);before=now
			cpu.append(Performance.get_monitor(Performance.TIME_PROCESS)*1000)
			physics.append(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000)
			gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
			render_cpu.append(RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid()))
			draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
			primitives.append(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
		var mean=elapsed.reduce(func(a,b):return a+b,0.0)/elapsed.size()
		report.scenarios[scenario]={"frames":elapsed.size(),"enemies":game.combat.enemies.size(),"distance":game.session.distance,"peakDraws":draws.max(),"peakPrimitives":primitives.max(),"meanMs":mean,"fps":1000/mean,"p50Ms":percentile(elapsed,0.5),"p95Ms":percentile(elapsed,0.95),"p99Ms":percentile(elapsed,0.99),"cpuP50Ms":percentile(cpu,0.5),"physicsP50Ms":percentile(physics,0.5),"gpuP50Ms":percentile(gpu,0.5),"renderCpuP50Ms":percentile(render_cpu,0.5),"drawCallsP50":percentile(draws,0.5),"primitivesP50":percentile(primitives,0.5)}
		print("BENCHMARK ",scenario," ",report.scenarios[scenario])
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/native-"+scenario+".png"))
	var path=ProjectSettings.globalize_path("res://../test-results/godot-native/benchmark"+("-60" if Engine.max_fps==60 else "")+".json")
	var file=FileAccess.open(path,FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.queue_free();await frames(3);MMFAssets.cache.clear();quit()
