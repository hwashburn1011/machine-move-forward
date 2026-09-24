extends SceneTree

var game
var report=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-rooftop-profile/";call_deferred("run")

func stats(values: Array):
	values.sort();return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back()}

func run():
	if DisplayServer.get_name()=="headless":push_error("Rooftop profile requires real rendering");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings();game.started=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	var c=game.cinematics;c.begin_opening();c.event_cursor=c.timeline.events.size()
	var refined=c.rooftop;var legacy=MMFAssets.scene("runtime/rooftop.glb");c.add_child(legacy);legacy.hide()
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	for at in [.5,3.5,8.5]:
		c.time=at;c.update_opening(0)
		for animator in MMFAssets.of_type(game.player.visual,"AnimationPlayer")+MMFAssets.of_type(c.scenery,"AnimationPlayer"):animator.speed_scale=0
		for mode in ["legacy","refined"]:
			legacy.visible=mode=="legacy";refined.visible=mode=="refined"
			await create_timer(2).timeout
			var frames=[];var gpu=[];var cpu=[];var start=Time.get_ticks_usec();var previous=start
			while Time.get_ticks_usec()-start<3000000:
				await process_frame
				var now=Time.get_ticks_usec();frames.append((now-previous)/1000.0);previous=now
				gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()));cpu.append(RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid()))
			var row={"at":at,"mode":mode,"frames":stats(frames),"gpu":stats(gpu),"renderCpu":stats(cpu),"drawCalls":RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)}
			report.append(row);print("ROOFTOP_PROFILE ",row)
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/rooftop-"+mode+"-"+str(at)+".png"))
	var file=FileAccess.open("res://../test-results/godot-native/rooftop-profile.json",FileAccess.WRITE);file.store_string(JSON.stringify({"adapter":RenderingServer.get_video_adapter_name(),"scope":"1080p high/Vulkan/4xMSAA, uncapped, vsync off. Actual opening models with fixed camera/animation and game/world physics disabled; both variants resident, only one visible. Two seconds settling and three seconds sampled per view; capture occurs after sampling.","samples":report},"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit()
