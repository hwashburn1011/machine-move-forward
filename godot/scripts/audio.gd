class_name MMFAudio
extends Node

signal player_step(side: String)

const SOUND_IDS=["footfall","rifle","shotgun","hook-catch","hook-throw","warning","enemy-hurt","hit-metal","radio-signal","reload-start","reload-done","distant-gunfire"]
const CUE_SPECS=[[45,.65,true],[65,.25,true],[630,.12,false]]
var muted = false:
	set(value):
		muted=value
		refresh_volume(volume)
var volume = 0.7:
	set(value):
		var previous=volume
		volume=clampf(value,0,1)
		refresh_volume(previous)
var ambient = 0.15
var bank = {}
var game
var voices=[]
var drone_player: AudioStreamPlayer
var pad_player: AudioStreamPlayer
var spatial_voices: Array=[]
var cue_voices: Array=[]
var cue_cursor=0
var radio_cursor=0
var playback_paused=false

func setup(owner_game):
	game=owner_game
	for i in 12:
		var voice=AudioStreamPlayer3D.new();voice.max_distance=35;voice.unit_size=5;voice.max_db=-6;voice.attenuation_filter_cutoff_hz=9000
		add_child(voice);spatial_voices.append(voice)
	for id in SOUND_IDS:
		var path="res://assets/audio/"+id+".wav"
		if ResourceLoader.exists(path): bank[path]=load(path)
	for i in 24:
		var voice=AudioStreamPlayer.new();add_child(voice);voices.append(voice)
	for i in 8:
		var voice=AudioStreamPlayer.new();add_child(voice);cue_voices.append(voice)
	for pool in [voices,spatial_voices,cue_voices]:
		for voice in pool: voice.finished.connect(release_voice.bind(voice))
	# These are the three existing synthesized effects. Prepare their PCM once,
	# before gameplay, rather than synthesizing on the first gun/explosion frame.
	for spec in CUE_SPECS: cue_stream(spec[0],spec[1],spec[2])
	for id in ["machine-loop","calm-loop"]:
		var voice=AudioStreamPlayer.new();add_child(voice)
		var path="res://assets/audio/"+id+".wav"
		if ResourceLoader.exists(path):
			var stream=load(path).duplicate()
			stream.loop_mode=AudioStreamWAV.LOOP_FORWARD
			stream.loop_begin=0;stream.loop_end=stream.data.size()/2
			voice.stream=stream;voice.volume_db=-80;voice.play()
		if id=="machine-loop": drone_player=voice
		else: pad_player=voice
	if game.player.locomotion: game.player.locomotion.foot_planted.connect(on_player_step)

func paused_for_sound() -> bool:
	return game and (game.menu_open or game.get_tree().paused)

func release_voice(voice):
	voice.stream=null
	voice.stream_paused=false

func refresh_volume(previous: float):
	for pool in [voices,spatial_voices,cue_voices]:
		for voice in pool:
			if muted or volume<=0:
				voice.stop();release_voice(voice)
			else: voice.volume_linear=0.0 if paused_for_sound() and not voice.get_meta("allow_menu",false) else float(voice.get_meta("gain",0.0))*volume
	for voice in [drone_player,pad_player]:
		if not is_instance_valid(voice): continue
		if muted or volume<=0: voice.volume_linear=0
		elif previous>0: voice.volume_linear*=volume/previous

func start_voice(voice,stream: AudioStream,gain: float,pitch: float=1,allow_menu: bool=false):
	voice.stream=stream;voice.pitch_scale=pitch
	voice.set_meta("gain",maxf(0,gain));voice.set_meta("allow_menu",allow_menu)
	voice.volume_linear=maxf(0,gain)*volume
	voice.play()
	voice.stream_paused=paused_for_sound() and not allow_menu

func play_sound(id: String,gain: float=1,pitch: float=1) -> bool:
	var menu_feedback=id=="radio-signal"
	if muted or volume<=0 or gain<=0 or (paused_for_sound() and not menu_feedback): return false
	var path="res://assets/audio/"+id+".wav"
	if not bank.has(path):
		if not ResourceLoader.exists(path): return false
		bank[path]=load(path)
	for voice in voices:
		if voice.playing: continue
		start_voice(voice,bank[path],gain,pitch,menu_feedback)
		return true
	return false

func play_at(id: String,at: Vector3,gain: float=.2):
	if muted or volume<=0 or gain<=0 or not game or paused_for_sound(): return
	if game.player.global_position.distance_to(at)>35: return
	var path="res://assets/audio/"+id+".wav"
	if not bank.has(path): return
	for voice in spatial_voices:
		if voice.playing: continue
		voice.global_position=at
		start_voice(voice,bank[path],clampf(gain,0,.6));return

func _process(dt: float):
	if not game: return
	var paused=paused_for_sound()
	if paused!=playback_paused:
		playback_paused=paused
		refresh_volume(volume)
		for pool in [voices,spatial_voices,cue_voices]:
			for voice in pool:voice.stream_paused=paused and not voice.get_meta("allow_menu",false)
	elif paused:
		# 3D playback starts on the next physics tick. A pause request before
		# registration cannot pause it yet; zero gain covers that pending tick.
		for voice in spatial_voices:
			if voice.playing and not voice.stream_paused:voice.stream_paused=true
	var active=game.started and not paused and not muted and volume>0
	var speed=clampf(game.session.speed/7.5,0,1)
	var duck=(0.5 if game.session.sheltered else 1.0)*(0.45 if game.combat.active_threat() else 1.0)
	var gain=(0.0002+speed*speed*0.0058)*2*duck*ambient*volume if active else 0
	drone_player.volume_linear=lerpf(drone_player.volume_linear,gain,1-exp(-dt/1.2))
	drone_player.pitch_scale=lerpf(drone_player.pitch_scale,(41+speed*17)/50,1-exp(-dt/1.2))
	var pad_gain=0.0015*2*ambient*volume if active and not game.combat.active_threat() else 0.0
	pad_player.volume_linear=lerpf(pad_player.volume_linear,pad_gain,1-exp(-dt/2))

func on_player_step(side: String):
	var p=game.player
	if not game.started or paused_for_sound() or game.cinematic!="" or p.forced_motion or game.manual_turret!="" or game.session.health<=0 or not p.is_on_floor():return
	var duck=(.5 if game.session.sheltered else 1.0)*(.45 if game.combat.active_threat() else 1.0)
	# Matching every contact increases cadence over the old timer. Compensate
	# per-step energy to limit the change in overall traversal loudness.
	var reference_rate=1.0/(.3 if p.locomotion.speed>6 else .48)
	var rate_gain=sqrt(reference_rate/maxf(reference_rate,p.locomotion.cycles_per_second*2))
	var gain=ambient*duck*rate_gain*(.55 if p.crouched else 1.0)
	if play_sound("footfall",gain,.98 if side=="l" else 1.02): player_step.emit(side)

func cue(frequency: float,seconds: float,gain: float=-24,noise: bool=false):
	if muted or volume<=0 or paused_for_sound(): return
	var stream=cue_stream(frequency,seconds,noise)
	# Keep quiet radio cues separate from impact bursts. On pathological bursts,
	# recycle voices within that group rather than creating unbounded nodes.
	var radio=not noise and is_equal_approx(frequency,630)
	var first=6 if radio else 0
	var count=2 if radio else 6
	var slot=-1
	for i in range(first,first+count):
		if not cue_voices[i].playing:slot=i;break
	if slot<0:slot=first+(radio_cursor if radio else cue_cursor)
	if radio:radio_cursor=(slot-first+1)%count
	else:cue_cursor=(slot-first+1)%count
	start_voice(cue_voices[slot],stream,db_to_linear(gain))

func cue_stream(frequency: float,seconds: float,noise: bool) -> AudioStreamWAV:
	var key = "%s,%s,%s" % [frequency,seconds,noise]
	if not bank.has(key):
		var stream=AudioStreamWAV.new()
		stream.format=AudioStreamWAV.FORMAT_16_BITS
		stream.mix_rate=22050
		var bytes=PackedByteArray()
		bytes.resize(int(seconds*22050)*2)
		var rng=RandomNumberGenerator.new()
		rng.seed=int(frequency)
		for i in bytes.size()/2:
			var t=float(i)/22050
			var sample=(rng.randf_range(-1,1) if noise else sin(TAU*frequency*t))*exp(-t/seconds*7)*0.65
			bytes.encode_s16(i*2,int(sample*32767))
		stream.data=bytes
		bank[key]=stream
	return bank[key]

func shot(shotgun: bool): play_sound("shotgun" if shotgun else "rifle")

func _exit_tree():
	# Explicitly detach active playback before the graph is destroyed. In fast
	# headless runs the audio mixer may not tick between queue_free and shutdown.
	for voice in get_children():
		if voice is AudioStreamPlayer or voice is AudioStreamPlayer3D:
			voice.stop();voice.stream=null
	bank.clear()
