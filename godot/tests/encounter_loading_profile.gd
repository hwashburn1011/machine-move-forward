extends SceneTree

var game
var label="before"
var original=false
var report={"preparation":{},"enemies":{}}
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-encounter-loading-profile/"
	for arg in OS.get_cmdline_user_args():
		if arg=="--original":original=true
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")
func measured_enemy() -> GDScript:
	var source=FileAccess.get_file_as_string("res://scripts/enemy.gd")
	var begin=source.find("func setup(");var end=source.find("\nfunc ",begin+1);var body=source.substr(begin,end-begin)
	if original:body=MMFAssets.json("res://tests/fixtures/enemy-spawn-before-prefetch.json").setup
	body=body.replace("\n\tgame = owner_game","\n\tprevious=Time.get_ticks_usec()\n\tgame = owner_game")
	body=body.replace('visual=MMFAssets.scene("models/authored/"+id+".glb")','mark("body_and_collision");visual=measured_model("models/authored/"+id+".glb")')
	for spec in [['presentation.setup(animator,visual)','mark("bounds_fit");presentation.setup(animator,visual)'],['agent=NavigationAgent3D.new()','mark("animation");agent=NavigationAgent3D.new()'],['equipment.setup(self)','mark("navigation_and_label");equipment.setup(self);mark("equipment")']]:body=body.replace(spec[0],spec[1])
	for statement in ['tactical_marker=MeshInstance3D.new()','tactical_marker.mesh=TACTICAL_RING','tactical_marker.material_override=MMFAssets.material(Color(1,0.16,0.04),2)','tactical_marker.material_override=WARNING_READY','add_child(tactical_marker)']:
		body=body.replace(statement,statement+';mark('+JSON.stringify(statement)+')')
	body+='\n\tmark("remaining_setup")\n'
	var script=GDScript.new();script.source_code='extends MMFEnemy\nvar stages={}\nvar previous=0\n'+body+'''
func mark(label):
	var now=Time.get_ticks_usec();stages[label]=(now-previous)/1000.;previous=now
func measured_model(path):
	path="res://assets/"+path
	if not MMFAssets.cache.has(path):MMFAssets.cache[path]=load(path)
	mark("resource_load")
	var result=MMFAssets.cache[path].instantiate();mark("instantiate");return result
'''
	assert(script.reload()==OK);return script
func stats(values: Array) -> Dictionary:
	if values.is_empty():return {}
	values.sort();return {"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back(),"count":values.size()}
func sample(seconds: float) -> Dictionary:
	var frames=[];var gpu=[];var start=Time.get_ticks_usec();var previous=start
	while Time.get_ticks_usec()-start<seconds*1000000:
		await process_frame;var now=Time.get_ticks_usec();frames.append((now-previous)/1000.);previous=now
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid()))
	return {"frameMs":stats(frames),"gpuMs":stats(gpu)}
func run():
	DisplayServer.window_set_size(Vector2i(1920,1080))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	if original and game.has_node("EncounterAssets"):
		game.get_node("EncounterAssets").set_process(false);game.cinematics.opening_stage.encounter_assets=null
	game.settings.vsync=false;game.settings.quality="high";game.save_settings()
	game.set_physics_process(false);game.player.set_physics_process(false);game.ui.root.hide();game.player.hide()
	var camera=Camera3D.new();game.add_child(camera);camera.fov=48;camera.current=true;camera.position=Vector3(9,19,10);camera.look_at(Vector3(3,17,3))
	RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
	var start=Time.get_ticks_usec();var previous=start;var intervals=[]
	while Time.get_ticks_usec()-start<1200000 or (not original and game.has_node("EncounterAssets") and not game.get_node("EncounterAssets").finished):
		await process_frame;var now=Time.get_ticks_usec();intervals.append((now-previous)/1000.);previous=now
		if now-start>20000000:push_error("Preparation did not finish");quit(1);return
	report.preparation={"ms":(Time.get_ticks_usec()-start)/1000.,"frames":stats(intervals),"cacheCount":MMFAssets.cache.size(),"staticMemory":OS.get_static_memory_usage()}
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.started=true;game.session.opening_done=true;game.close_menu();game.ui.root.hide()
	var script=measured_enemy()
	for kind in ["sovereign","bastion","raider","scavenger","warden","revenant"]:
		await sample(.4);var frame_start=Time.get_ticks_usec();var enemy=script.new();game.combat.add_child(enemy);enemy.setup(game,kind)
		enemy.position=Vector3(3,16.05,3);enemy.inactive=true;enemy.set_physics_process(false);enemy.reset_physics_interpolation()
		var cpu=(Time.get_ticks_usec()-frame_start)/1000.
		await process_frame;await RenderingServer.frame_post_draw
		var first=(Time.get_ticks_usec()-frame_start)/1000.;var timings=await sample(.5)
		report.enemies[kind]={"setupMs":cpu,"spawnThroughRenderMs":first,"stages":enemy.stages,"following":timings}
		await RenderingServer.frame_post_draw
		if kind=="sovereign":root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/encounter-loading-"+label+".png"))
		enemy.queue_free();await process_frame
	var warning_owner=game.effects
	if original:
		var old_script=GDScript.new();old_script.source_code="extends Node3D\n"+MMFAssets.json("res://tests/fixtures/enemy-spawn-before-prefetch.json").warning_ring
		assert(old_script.reload()==OK);warning_owner=old_script.new();game.effects.add_child(warning_owner)
	var volley_samples=[]
	for burst in 5:
		await sample(.1);var markers=[];var began=Time.get_ticks_usec()
		for i in 3:markers.append(warning_owner.warning_ring(Vector3(i*2,16.05,3)))
		var cpu=(Time.get_ticks_usec()-began)/1000.;await process_frame;await RenderingServer.frame_post_draw
		volley_samples.append({"cpuMs":cpu,"throughRenderMs":(Time.get_ticks_usec()-began)/1000.})
		for marker in markers:marker.queue_free()
		await process_frame
	report.warningBursts=volley_samples
	if original:warning_owner.queue_free()
	report.adapter=RenderingServer.get_video_adapter_name();report.scope="Native 1920x1080/high Vulkan/4xMSAA, VSync off; real title preparation followed by first use of each enemy. Instrumented original setup statements; captures follow timing. No travel or combat simulation."
	var file=FileAccess.open("res://../test-results/godot-native/encounter-loading-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("ENCOUNTER_LOADING_PROFILE ",label)
	game.open_menu("Pause");var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit")
