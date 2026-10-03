extends SceneTree

var game
var checks=0
var failures=[]
var contacts=[]
var footsteps=[]
var lifetimes=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-audio-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(n: int):
	for i in n:await physics_frame

func active(pool: Array) -> Array:
	return pool.filter(func(v):return v.playing)

func stop_effects():
	for pool in [game.audio.voices,game.audio.spatial_voices,game.audio.cue_voices]:
		for voice in pool:voice.stop();game.audio.release_voice(voice)

func stream_refs(owner_audio) -> Array:
	return preload("res://tests/audio_drain.gd").capture(owner_audio)

func at_rest():
	for action in ["forward","back","left","right","sprint","crouch","jump"]:Input.action_release(action)
	game.player.teleport(Vector3(60,16.1,30));game.player.yaw=0;game.player.forced_motion=false
	await frames(12);contacts.clear();footsteps.clear();stop_effects()

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false)
	game.audio.volume=.7;game.audio.ambient=.1;game.audio.muted=false
	MMFAssets.box(game,Vector3(80,1,100),Vector3(60,15.5,0))
	game.player.locomotion.foot_planted.connect(func(side):contacts.append({"side":side,"phase":game.player.locomotion.phase,"step":game.player.locomotion.phase_step}))
	game.audio.player_step.connect(func(side):footsteps.append(side))
	await at_rest()
	var audio=game.audio
	check(audio.voices.size()==24 and audio.spatial_voices.size()==12 and audio.cue_voices.size()==8,"All playback paths use fixed voice pools")
	var unique_paths={}
	for id in MMFAudio.SOUND_IDS:unique_paths[MMFAudio.sound_path(id)]=true
	check(audio.bank.size()==unique_paths.size()+MMFAudio.CUE_SPECS.size(),"Every hot-path sound is prewarmed once, including aliased receiver contact")
	var bank_size=audio.bank.size();var node_count=audio.get_child_count()
	for i in 200:audio.cue(65,.25,-14,true)
	check(audio.get_child_count()==node_count and audio.bank.size()==bank_size,"A 200-cue burst creates no scene nodes or new streams")
	check(active(audio.cue_voices).size()==6,"Impact polyphony stays bounded during an overloaded burst")
	audio.cue(630,.12,-35)
	check(active(audio.cue_voices).size()==6,"Retired abstract radio beep never starts a voice")
	audio.receiver_contact(.12)
	check(active(audio.cue_voices).size()==6,"Physical receiver feedback does not allocate an abstract tone")
	check(is_equal_approx(audio.cue_voices[0].volume_linear,db_to_linear(-14)*.7),"Synthetic weapon cue retains its original gain")
	stop_effects();audio.play_sound("rifle",.5);audio.play_at("rifle",game.player.position,.3);audio.cue(45,.65,-20,true)
	var normal=active(audio.voices)[0];var spatial=active(audio.spatial_voices)[0];var cue=active(audio.cue_voices)[0]
	audio.volume=.35
	check(is_equal_approx(normal.volume_linear,.175) and is_equal_approx(spatial.volume_linear,.105) and is_equal_approx(cue.volume_linear,.035),"Changing master volume scales already-playing normal, spatial and synthesized sounds")
	audio.volume=0
	check(active(audio.voices).is_empty() and active(audio.spatial_voices).is_empty() and active(audio.cue_voices).is_empty(),"Zero master volume immediately stops every one-shot path")
	check(audio.drone_player.volume_linear==0 and audio.pad_player.volume_linear==0,"Zero master volume immediately silences both loops")
	audio.cue(45,.65,-15,true);audio.play_sound("rifle");audio.play_at("rifle",game.player.position)
	check(active(audio.voices).is_empty() and active(audio.spatial_voices).is_empty() and active(audio.cue_voices).is_empty(),"Zero volume cannot start quiet-but-still-playing effects")
	audio.volume=.7;audio.play_sound("shotgun");audio.play_at("servo-load",game.player.position);audio.cue(65,.25,-14,true);audio.muted=true
	check(active(audio.voices).is_empty() and active(audio.spatial_voices).is_empty() and active(audio.cue_voices).is_empty(),"Mute stops sounds that were already playing")
	audio._process(1)
	check(audio.drone_player.volume_linear==0 and audio.pad_player.volume_linear==0,"Muted loops cannot ramp back up")
	audio.muted=false
	check(active(audio.voices).is_empty() and active(audio.cue_voices).is_empty(),"Unmuting never replays old one-shot effects")
	game.session.sheltered=false;game.session.speed=7.5;audio._process(30)
	check(absf(audio.drone_player.volume_linear-.00084)<.000001 and audio.music.state=="silence" and audio.pad_player.stream==null,"Machine ambience keeps its quiet level while finite music starts with real silence")
	game.session.sheltered=true;audio._process(30)
	check(absf(audio.drone_player.volume_linear-.00042)<.000001,"Enclosed machine ambience preserves its quieter existing mix")
	game.session.sheltered=false
	# Integrate the finite controller with real game context and independent gains.
	audio.reset_music();audio._process(45);audio._process(6)
	check(audio.music.state=="playing" and is_equal_approx(audio.pad_player.volume_linear,.245),"Calm gameplay starts music at master times independent music volume")
	var archived=game.journey.current;game.journey.current={"id":"audio-test-silent-log"};audio._process(0)
	check(audio.music.state=="playing","Silent archived service text does not duck or reset music")
	game.journey.current=archived;audio.music_volume=.2
	check(is_equal_approx(audio.pad_player.volume_linear,.14),"Independent music volume changes an active phrase immediately")
	game.session.attack_recent=5;audio._process(1)
	check(audio.music.state=="fading" and audio.pad_player.volume_linear>0 and audio.pad_player.volume_linear<.14,"Recent combat releases music even after the last enemy disappears")
	audio._process(1);game.session.attack_recent=0
	check(audio.pad_player.stream==null,"Combat release leaves a detached silent music voice")
	audio.music_volume=0;audio._process(1000)
	check(audio.music.state=="silence" and audio.pad_player.stream==null,"Zero music volume suppresses scheduling while effects remain enabled")
	stop_effects();audio.shot(false)
	check(active(audio.voices).size()==1 and is_equal_approx(active(audio.voices)[0].volume_linear,.385) and active(audio.voices)[0].stream==audio.bank[MMFAudio.sound_path("rifle")],"Player rifle uses its softer body recording and reduced gain independently of music")
	stop_effects();audio.shot(true)
	check(active(audio.voices).size()==1 and is_equal_approx(active(audio.voices)[0].volume_linear,.42) and active(audio.voices)[0].stream==audio.bank[MMFAudio.sound_path("shotgun")],"Player shotgun uses its softer body recording and reduced gain independently of music")
	audio.music_volume=.35
	audio.play_sound("rifle");audio.play_at("rifle",game.player.position);audio.cue(45,.65,-20,true)
	game.open_menu("Inventory");audio._process(0)
	check(active(audio.voices).all(func(v):return v.volume_linear==0) and active(audio.spatial_voices).all(func(v):return v.volume_linear==0) and active(audio.cue_voices).all(func(v):return v.volume_linear==0),"Opening the terminal silences every gameplay effect path, including pending 3D starts")
	await frames(2);audio._process(0)
	check(active(audio.voices).all(func(v):return v.stream_paused) and active(audio.spatial_voices).all(func(v):return v.stream_paused) and active(audio.cue_voices).all(func(v):return v.stream_paused),"Gameplay playback remains paused after the pending-start tick")
	var previous=active(audio.voices).size()
	audio.play_sound("shotgun");audio.cue(65,.25,-14,true)
	check(active(audio.voices).size()==previous,"Paused controls cannot queue a weapon sound for later")
	check(audio.play_sound("radio-signal",.12),"Existing console confirmation remains audible while using its menu")
	check(active(audio.voices).any(func(v):return v.get_meta("allow_menu",false) and not v.stream_paused),"Console confirmation is not paused with gameplay")
	game.close_menu();audio._process(0)
	check(active(audio.voices).all(func(v):return not v.stream_paused) and active(audio.cue_voices).all(func(v):return not v.stream_paused),"Closing the terminal resumes paused effects")
	stop_effects();audio.play_sound("reload-done")
	# The audio mixer advances in wall time, even when --fixed-fps makes a
	# simulated .3 second timer elapse in a few milliseconds.
	var deadline=Time.get_ticks_msec()+600
	while audio.voices.any(func(v):return v.playing or v.stream!=null) and Time.get_ticks_msec()<deadline:
		await process_frame
	check(audio.voices.all(func(v):return not v.playing and v.stream==null),"Finished voices detach their stream until reused")
	for spec in [["forward",["forward"]],["backward",["back"]],["strafe",["right"]],["diagonal",["forward","left"]],["sprint",["forward","sprint"]],["crouch",["forward","crouch"]]]:
		await at_rest()
		for action in spec[1]:Input.action_press(action)
		await frames(100)
		check(contacts.size()>=4 and footsteps.size()==contacts.size(),"Each actual contact sounds once: "+spec[0])
		check(contacts.all(func(c):return fposmod(c.phase,.5)<=c.step+.00001),"Footstep occurs within its contact physics tick: "+spec[0])
		var alternating=true
		for i in range(1,footsteps.size()):alternating=alternating and footsteps[i]!=footsteps[i-1]
		check(alternating,"Contacts alternate feet: "+spec[0])
	await at_rest();await frames(45)
	check(footsteps.is_empty(),"Idle emits no footsteps")
	var wall=MMFAssets.box(game,Vector3(5,4,.3),Vector3(60,18,29.3))
	Input.action_press("forward");await frames(40);footsteps.clear();contacts.clear();await frames(45)
	check(footsteps.is_empty() and contacts.is_empty(),"Holding movement against a real wall makes no stepping sound")
	wall.queue_free();await at_rest()
	Input.action_press("forward");await frames(30);Input.action_press("jump");await frames(3);Input.action_release("jump");footsteps.clear()
	check(not game.player.is_on_floor(),"Jump sound fixture is actually airborne")
	await frames(15);check(footsteps.is_empty(),"Airborne movement emits no walking sounds")
	await at_rest();Input.action_press("forward");await frames(25);game.open_menu("Inventory");footsteps.clear();await create_timer(.15).timeout
	check(footsteps.is_empty(),"Terminal pause stops footsteps")
	Input.action_release("forward");game.close_menu();await at_rest()
	Input.action_press("forward");await frames(15);game.player.forced_motion=true;footsteps.clear();await frames(15)
	check(footsteps.is_empty(),"Scripted movement does not inherit a stale footstep timer")
	game.player.forced_motion=false;await at_rest();game.player.teleport(Vector3(65,16.1,30));await frames(12)
	check(footsteps.is_empty(),"Teleport recovery cannot create a footstep burst")
	# Record the actual lifetime of the mixer-owned tail after the game graph dies.
	game.player.set_physics_process(false);audio.play_sound("distant-gunfire");audio.cue(45,.65,-20,true)
	var weak_streams=stream_refs(audio)
	var weak_audio=weakref(audio)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var start=Time.get_ticks_msec();game.queue_free();game=null;audio=null;normal=null;spatial=null;cue=null;wall=null
	await frames(4)
	lifetimes.append({"ms":Time.get_ticks_msec()-start,"streams":weak_streams.filter(func(w):return w.get_ref()!=null).size()})
	check(weak_audio.get_ref()==null,"Freeing the scene releases the audio node and every fixed voice")
	var drained=await preload("res://tests/audio_drain.gd").finish(self,weak_streams)
	lifetimes.append({"ms":Time.get_ticks_msec()-start,"streams":weak_streams.filter(func(w):return w.get_ref()!=null).size()})
	check(drained and lifetimes.back().streams==0,"Mixer releases every one-shot, generated cue and loop stream after teardown")
	MMFAssets.cache.clear()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"mixerRelease":lifetimes,"renderer":RenderingServer.get_video_adapter_name()}
	var file=FileAccess.open("res://../test-results/deck-audio/audio-lifecycle.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	call_deferred("quit",0 if failures.is_empty() else 1)
