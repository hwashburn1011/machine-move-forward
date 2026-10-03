extends SceneTree

var game
var label="before"
var author=false
var frames=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-startup-profile/"
	for arg in OS.get_cmdline_user_args():
		if arg=="--author":author=true;set_meta("author_machine",true)
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")

func function_source(path: String,method: String) -> String:
	var source=FileAccess.get_file_as_string(path);var start=source.find("func "+method+"(");var end=source.find("\nfunc ",start+1)
	return source.substr(start,end-start if end>=0 else -1)

func mark_method() -> String:
	return '\nvar boot_stamps=[]\nfunc boot_mark(label):boot_stamps.append([label,Time.get_ticks_usec()])\n'

func measured_world() -> GDScript:
	var body=function_source("res://scripts/world.gd","setup").replace("\tgame = owner_game","\tboot_mark(\"begin\")\n\tgame = owner_game")
	body=body.replace('\tgait.setup(game,machine)','\tboot_mark("machine assembled")\n\tgait.setup(game,machine)')
	body+='\n\tboot_mark("end")\n\n'+function_source("res://scripts/world.gd","assemble_machine")+'\n'+function_source("res://scripts/world.gd","setup_environment")
	for phrase in ['\tadd_child(machine)','\tMMFMachineBenches.install(machine)','\tgait.setup(game,machine)','\tMMFMachinePumps.install_collision(self)','\tMMFMachineIntake.install_collision(self)','\tlighting()','\tstreamer.setup(self)']:
		body=body.replace(phrase,phrase+'\n\tboot_mark('+JSON.stringify(phrase.strip_edges())+')')
	var script=GDScript.new();script.source_code='extends "res://scripts/world.gd"\n'+body+mark_method();assert(script.reload()==OK);return script

func measured_main() -> GDScript:
	var source=FileAccess.get_file_as_string("res://scripts/main.gd")
	var original=function_source("res://scripts/main.gd","_ready");var body=original.replace('\tprocess_mode=Node.PROCESS_MODE_ALWAYS','\tboot_mark("begin")\n\tprocess_mode=Node.PROCESS_MODE_ALWAYS')
	var lines=body.split("\n");var out=PackedStringArray()
	for line in lines:
		out.append(line)
		if line.begins_with("\t") and not line.begins_with("\t\t") and (line.contains("=MMFAssets.json") or line.contains(".setup(") or line.contains("save_settings()") or line.contains('open_menu("Title")') or line.contains("MMF_NATIVE_READY")):
			out.append('\tboot_mark('+JSON.stringify(line.strip_edges())+')')
	source=source.replace(original,"\n".join(out)).replace('world=MMFWorld.new()','world=trace_world_script.new()')
	if author:source=source.replace('res://data/runtime-play.json','res://data/runtime.json')
	source+='\nvar trace_world_script\n'+mark_method()
	var script=GDScript.new();script.source_code=source;assert(script.reload()==OK);return script

func spans(raw: Array) -> Array:
	var result=[]
	for i in range(1,raw.size()):result.append({"stage":raw[i][0],"ms":(raw[i][1]-raw[i-1][1])/1000.0})
	return result

func stats(values: Array) -> Dictionary:
	values.sort();return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"p99":values[int(values.size()*.99)],"max":values.back()}

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED);Engine.max_fps=60
	var script=measured_main();game=script.new();game.trace_world_script=measured_world()
	var start=Time.get_ticks_usec();root.add_child(game);current_scene=game
	var ready_ms=(Time.get_ticks_usec()-start)/1000.0
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	await RenderingServer.frame_post_draw
	var first_title_ms=(Time.get_ticks_usec()-start)/1000.0
	var previous=Time.get_ticks_usec();var title_start=previous
	while Time.get_ticks_usec()-title_start<3000000:
		await process_frame;var now=Time.get_ticks_usec()
		frames.append({"phase":"title","ms":(now-previous)/1000.0,"gpuMs":RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()),"openingPrepared":game.cinematics.opening_stage.prepared()});previous=now
	var memory={"staticBytes":OS.get_static_memory_usage(),"videoBytes":Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED),"textureBytes":Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED),"bufferBytes":Performance.get_monitor(Performance.RENDER_BUFFER_MEM_USED),"resources":Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)}
	var new_start=Time.get_ticks_usec();game.new_game();var entry_ms=(Time.get_ticks_usec()-new_start)/1000.0
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE;previous=Time.get_ticks_usec()
	while Time.get_ticks_usec()-new_start<13500000:
		await process_frame;var now=Time.get_ticks_usec()
		frames.append({"phase":"opening" if game.cinematic!="" else "play","ms":(now-previous)/1000.0,"gpuMs":RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()),"cinematicS":game.cinematics.time});previous=now
	var complete=game.session.opening_done and game.cinematic==""
	var report={"adapter":RenderingServer.get_video_adapter_name(),"scope":"Actual paused title, New Game and existing opening at 1080p high/Vulkan/4x MSAA, VSync off, 60 FPS cap. Ready stages instrumented in test-only copies. First title time begins immediately before main ready, excluding test script parsing and engine bootstrap.","readyCpuMs":ready_ms,"firstTitleMs":first_title_ms,"readyStages":spans(game.boot_stamps),"worldStages":spans(game.world.boot_stamps),"newGameCpuMs":entry_ms,"openingAndPlayMs":stats(frames.filter(func(f):return f.phase!="title").map(func(f):return f.ms)),"slowFrames":frames.filter(func(f):return f.ms>25),"completed":complete,"frames":frames}
	report.memoryAtTitle=memory;report.compiled=not author
	var file=FileAccess.open("res://../test-results/godot-native/startup-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("STARTUP_PROFILE ",{"readyCpuMs":ready_ms,"firstTitleMs":first_title_ms,"newGameCpuMs":entry_ms,"openingAndPlayMs":report.openingAndPlayMs,"completed":complete});print("READY_STAGES ",report.readyStages);print("WORLD_STAGES ",report.worldStages)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit",0 if complete else 1)
