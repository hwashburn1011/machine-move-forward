extends SceneTree

# Instrument a test-owned copy of the actual main loop, keeping its statements
# and order intact. No timers/allocations are added to shipping game scripts.
var game
var output="res://../test-results/godot-native/travel-profile.json"

func measured_script(path: String,method: String) -> GDScript:
	var script=GDScript.new()
	script.source_code='extends "res://scripts/'+path+'.gd"\nvar trace_samples=[]\nfunc '+method+'(dt):\n\tvar before=Time.get_ticks_usec()\n\tsuper.'+method+'(dt)\n\tvar elapsed=(Time.get_ticks_usec()-before)/1000.0\n\tif elapsed>2:trace_samples.append({"frame":Engine.get_process_frames(),"ms":elapsed,"time":game.session.clock})\n'
	if script.reload()!=OK:push_error("Cannot instrument "+path)
	return script

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-travel-profile/";call_deferred("run")

func instrumented_main() -> GDScript:
	var source=FileAccess.get_file_as_string("res://scripts/main.gd")
	var start=source.find("func _physics_process(dt):")
	var finish=source.find("\nfunc ",start+1)
	var original=source.substr(start,finish-start)
	var lines=original.split("\n")
	var rewritten=PackedStringArray()
	for line in lines:
		rewritten.append(line)
		var statement=line.strip_edges()
		if statement=="if session==null or get_tree().paused: return":
			rewritten.append("\ttrace_start=Time.get_ticks_usec();trace_previous=trace_start;trace_stages={}")
		elif statement.begins_with("if ") or statement.begins_with("func ") or statement=="":continue
		else:
			var indent=line.substr(0,line.length()-line.lstrip("\t").length())
			rewritten.append(indent+"trace_mark("+JSON.stringify(statement)+")")
	rewritten.append("\ttrace_ticks.append({\"frame\":Engine.get_process_frames(),\"time\":session.clock,\"distance\":session.distance,\"ms\":(Time.get_ticks_usec()-trace_start)/1000.0,\"stages\":trace_stages})")
	source=source.substr(0,start)+"\n".join(rewritten)+source.substr(finish)
	source+="\nvar trace_start=0\nvar trace_previous=0\nvar trace_stages={}\nvar trace_ticks=[]\nfunc trace_mark(label):\n\tvar now=Time.get_ticks_usec();trace_stages[label]=(now-trace_previous)/1000.0;trace_previous=now\n"
	for spec in [["player","MMFPlayer"],["ui","MMFUI"],["world","MMFWorld"],["audio","MMFAudio"],["caretaker","MMFCaretaker"]]:
		source=source.replace(spec[0]+"="+spec[1]+".new()",spec[0]+"=trace_"+spec[0]+"_script.new()")
		source+="\nvar trace_"+spec[0]+"_script\n"
	var script=GDScript.new();script.source_code=source
	if script.reload()!=OK:push_error("Cannot instrument native game loop");return null
	return script

func stats(values: Array) -> Dictionary:
	values.sort()
	return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"p99":values[int(values.size()*.99)],"max":values.back()}

func run():
	if DisplayServer.get_name()=="headless":push_error("Travel profiling requires native rendering.");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=0
	var script=instrumented_main()
	if script==null:quit(1);return
	game=script.new()
	for spec in [["player","_physics_process"],["ui","_process"],["world","update"],["audio","_process"],["caretaker","_physics_process"]]:game.set("trace_"+spec[0]+"_script",measured_script(spec[0],spec[1]))
	root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	game.started=true;game.session.opening_done=true;game.session.facts.tutorialStarted=true;game.invulnerable=true;game.close_menu()
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	game.player.teleport(Vector3(0,16.1,5));game.player.pitch=-.12
	game.world.streamer.profile_steps=true;game.world.atmosphere.profile_placements=true
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	var frames=[];var intervals=[];var slow_ticks=[];var slow_frames=[]
	var start=Time.get_ticks_usec();var previous=start
	while Time.get_ticks_usec()-start<24000000:
		var now=Time.get_ticks_usec();var elapsed=(now-start)/1000000.0
		if elapsed>3:game.player.yaw=-TAU*(elapsed-3)/8
		await process_frame
		now=Time.get_ticks_usec()
		var ms=(now-previous)/1000.0;previous=now;intervals.append(ms)
		var frame={"frame":Engine.get_process_frames(),"ms":ms,"time":game.session.clock,"distance":game.session.distance,"gpuMs":RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()),"renderCpuMs":RenderingServer.viewport_get_measured_render_time_cpu(root.get_viewport_rid())}
		frames.append(frame)
		if ms>16.67:slow_frames.append(frame)
	for tick in game.trace_ticks:
		if tick.ms>4:slow_ticks.append(tick)
	var report={"adapter":RenderingServer.get_video_adapter_name(),"resolution":str(root.size),"quality":"high / Forward+ / Vulkan / 4x MSAA","vsync":false,"frameMs":stats(intervals),"slowFrames":slow_frames,"slowMainTicks":slow_ticks,"streamSteps":game.world.streamer.slow_steps,"placementProfiles":game.world.atmosphere.placement_profiles,"frames":frames,"ticks":game.trace_ticks}
	for field in ["player","ui","world","audio","caretaker"]:report[field+"SlowSamples"]=game.get(field).trace_samples
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
	var file=FileAccess.open(output,FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("TRAVEL_PROFILE ",report.frameMs," slow frames=",slow_frames," slow main ticks=",slow_ticks)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.05).timeout
	game.queue_free();await create_timer(.1).timeout;MMFAssets.cache.clear();call_deferred("quit")
