class_name MMFAudio
extends Node

var muted = false
var volume = 0.7
var ambient = 0.15
var bank = {}
var game
var voices=[]
var drone_player: AudioStreamPlayer
var pad_player: AudioStreamPlayer
var footfall_clock=0.0
var spatial_voices: Array=[]

func setup(owner_game):
	game=owner_game
	for i in 12:
		var voice=AudioStreamPlayer3D.new();voice.max_distance=35;voice.unit_size=5;voice.max_db=-6;voice.attenuation_filter_cutoff_hz=9000
		add_child(voice);spatial_voices.append(voice)
	for id in ["footfall","rifle","hook-catch","warning","enemy-hurt","hit-metal","radio-signal"]:
		var path="res://assets/audio/"+id+".wav"
		if ResourceLoader.exists(path): bank[path]=load(path)
	for i in 24:
		var voice=AudioStreamPlayer.new();add_child(voice);voices.append(voice)
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

func play_sound(id: String,gain: float=1):
	if muted or volume<=0: return
	var path="res://assets/audio/"+id+".wav"
	if not bank.has(path):
		if not ResourceLoader.exists(path): return
		bank[path]=load(path)
	for voice in voices:
		if voice.playing: continue
		voice.stream=bank[path]
		voice.volume_db=linear_to_db(maxf(0.00001,gain*volume))
		voice.play()
		return

func play_at(id: String,at: Vector3,gain: float=.2):
	if muted or volume<=0 or not game or game.menu_open: return
	if game.player.global_position.distance_to(at)>35: return
	var path="res://assets/audio/"+id+".wav"
	if not bank.has(path): return
	for voice in spatial_voices:
		if voice.playing: continue
		voice.stream=bank[path];voice.global_position=at
		voice.volume_db=linear_to_db(maxf(.00001,clampf(gain,0,.6)*volume))
		voice.play();return

func _process(dt: float):
	if not game: return
	for voice in spatial_voices:
		if muted or volume<=0: voice.stop()
		voice.stream_paused=game.menu_open or game.get_tree().paused
	var active=game.started and not game.menu_open and not muted
	var speed=clampf(game.session.speed/7.5,0,1)
	var duck=(0.5 if game.session.sheltered else 1.0)*(0.45 if game.combat.active_threat() else 1.0)
	var gain=(0.0002+speed*speed*0.0058)*2*duck*ambient*volume if active else 0
	drone_player.volume_linear=lerpf(drone_player.volume_linear,gain,1-exp(-dt/1.2))
	drone_player.pitch_scale=lerpf(drone_player.pitch_scale,(41+speed*17)/50,1-exp(-dt/1.2))
	var pad_gain=0.0015*2*ambient*volume if active and not game.combat.active_threat() else 0.0
	pad_player.volume_linear=lerpf(pad_player.volume_linear,pad_gain,1-exp(-dt/2))
	if active and game.player.is_on_floor() and Vector2(game.player.velocity.x,game.player.velocity.z).length()>0.5:
		footfall_clock-=dt
		if footfall_clock<=0:
			footfall_clock=0.3 if Input.is_action_pressed("sprint") else 0.48
			play_sound("footfall",ambient*duck)

func cue(frequency: float,seconds: float,gain: float=-24,noise: bool=false):
	if muted: return
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
	var player=AudioStreamPlayer.new()
	player.stream=bank[key]
	player.volume_db=gain+linear_to_db(maxf(volume,0.001))
	add_child(player)
	player.finished.connect(player.queue_free)
	player.play()

func shot(shotgun: bool): play_sound("shotgun" if shotgun else "rifle")
