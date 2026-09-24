extends SceneTree

var game
var report={"steps":{},"cues":{}}
var step_events=[]
var modern=false
var prior_clock=0.0

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-audio-profile/";call_deferred("run")

func frames(n: int):
	for i in n: await physics_frame

func step(_side: String):
	step_events.append({"phase":game.player.locomotion.phase,"speed":game.player.locomotion.speed})

func observe():
	if modern:return
	var clock=float(game.audio.get("footfall_clock"))
	if clock>prior_clock:step("")
	prior_clock=clock

func run():
	if DisplayServer.get_name()=="headless":
		printerr("Audio movement profile requires native rendering; use audio_lifecycle.gd for headless checks.")
		quit(2);return
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false)
	game.settings.vsync=false;game.save_settings();Engine.max_fps=60
	modern=game.audio.has_signal("player_step")
	if modern:game.audio.connect("player_step",step)
	MMFAssets.box(game,Vector3(80,1,100),Vector3(60,15.5,0))
	await frames(12)
	for spec in [["jog",["forward"]],["sprint",["forward","sprint"]],["crouch",["forward","crouch"]]]:
		game.player.teleport(Vector3(60,16.1,30));game.player.yaw=0
		for action in spec[1]:Input.action_press(action)
		await frames(30);step_events.clear()
		for i in 180:await process_frame;observe()
		var errors=[]
		for event in step_events:errors.append(minf(fposmod(event.phase,.5),.5-fposmod(event.phase,.5)))
		errors.sort()
		report.steps[spec[0]]={"count":step_events.size(),"events":step_events.duplicate(),"medianPhaseError":errors[errors.size()/2] if not errors.is_empty() else -1,"maxPhaseError":errors.back() if not errors.is_empty() else -1}
		for action in spec[1]:Input.action_release(action)
		await frames(12)
	game.player.set_physics_process(false);game.audio.set_process(false)
	var initial=game.audio.get_child_count()
	var stamp=Time.get_ticks_usec()
	for spec in [[45,.65,-20,true],[65,.25,-14,true],[630,.12,-35,false]]:game.audio.cue(spec[0],spec[1],spec[2],spec[3])
	report.cues.firstUseMs=(Time.get_ticks_usec()-stamp)/1000.0
	stamp=Time.get_ticks_usec()
	for i in 200:game.audio.cue(65,.25,-14,true)
	report.cues.burstMs=(Time.get_ticks_usec()-stamp)/1000.0
	report.cues.initialNodes=initial;report.cues.nodesAfterBurst=game.audio.get_child_count()
	report.cues.note="200 same-frame cues intentionally stress allocation; this is not normal gameplay FPS."
	report.mode="contact-pooled" if modern else "timer-allocated"
	var suffix="after" if modern else "before"
	var f=FileAccess.open("res://../test-results/godot-native/audio-profile-"+suffix+".json",FileAccess.WRITE);f.store_string(JSON.stringify(report,"\t"));f.close()
	print("AUDIO_PROFILE ",report)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();await frames(5);await create_timer(.15).timeout;MMFAssets.cache.clear();call_deferred("quit")
