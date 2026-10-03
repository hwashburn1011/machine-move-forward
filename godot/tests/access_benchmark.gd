extends SceneTree

var game
var report={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-access-tests/";call_deferred("run")

func percentile(values: Array,p: float) -> float:
	var sorted=values.duplicate();sorted.sort();return sorted[mini(int(sorted.size()*p),sorted.size()-1)]

func run():
	if DisplayServer.get_name()=="headless":push_error("Access benchmark requires native GPU rendering.");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED);Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.ui.root.hide();game.player.visual.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	game.player.camera.reparent(game);game.player.camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	game.player.camera.position=Vector3(-16,11.5,-5.5);game.player.camera.look_at(Vector3(-12,10.8,0))
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	var legacy=Node3D.new();game.world.add_child(legacy)
	var frozen=MMFAssets.scene("runtime/machine.glb");game.world.add_child(frozen)
	for name in ["Gameplay_Decks_And_Access","Secured_weatherproof_cargo_locker001_4","Suspended_undercarriage_reduction_gearbox001_5"]:
		MMFAssets.find_named(frozen,name).reparent(legacy,true)
	frozen.free();legacy.hide()
	var refined=[game.world.native_access,MMFAssets.find_named(game.world.machine,"NativeCargoCables"),MMFAssets.find_named(game.world.machine,"NativeSideWiring")]
	report={"adapter":RenderingServer.get_video_adapter_name(),"resolution":str(root.size),"renderer":"Forward+ / Vulkan / 4x MSAA","sampleSeconds":5,"bothVariantsResident":true,"runs":[]}
	for name in ["baseline","refined","refined","baseline"]:
		legacy.visible=name=="baseline"
		for part in refined:part.visible=name=="refined"
		await create_timer(3).timeout
		var frames=[];var gpu=[];var draws=[];var primitives=[];var start=Time.get_ticks_usec();var previous=start
		while Time.get_ticks_usec()-start<5000000:
			await process_frame
			var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
			gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
			draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
			primitives.append(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
		var sample={"variant":name,"frameMedianMs":percentile(frames,.5),"frameP95Ms":percentile(frames,.95),"gpuMedianMs":percentile(gpu,.5),"gpuP95Ms":percentile(gpu,.95),"drawsMedian":percentile(draws,.5),"primitivesMedian":percentile(primitives,.5)}
		report.runs.append(sample);print("ACCESS_BENCHMARK ",sample)
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/access-render-"+name+".png"))
	var file=FileAccess.open("res://../test-results/godot-native/access-benchmark.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.1).timeout
	game.queue_free();await create_timer(.1).timeout;MMFAssets.cache.clear();quit()
