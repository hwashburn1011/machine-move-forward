class_name MMFAmbientMusic
extends RefCounted

# Three authored, finite phrases and deliberate empty time. No ambient oscillator,
# gameplay RNG, random resource choice, per-frame streams or catch-up playback.
const PATHS=["res://assets/audio/deck/music-dustlight.wav","res://assets/audio/deck/music-window-heat.wav","res://assets/audio/deck/music-long-way-home.wav"]
const INITIAL_SILENCE=45.0
const SILENCES=[90.0,125.0,160.0]
const FADE_IN=4.0
const FADE_OUT=4.0
const INTERRUPT_FADE=2.0
var voice: AudioStreamPlayer
var streams=[]
var state="silence"
var silence_left=INITIAL_SILENCE
var elapsed=0.0
var fade_left=0.0
var next_track=0
var active_track=-1
var starts=0
var envelope=0.0
var session_id=0
var session_clock=0.0

func setup(parent: Node):
	voice=AudioStreamPlayer.new();voice.name="QuietIntervals";parent.add_child(voice)
	voice.volume_linear=0;voice.finished.connect(finish_phrase)
	for path in PATHS:
		var stream=load(path)
		if stream is AudioStreamWAV:
			# Source imports are non-looping. Own a stream instance so this invariant
			# never changes a shared resource used by an audition or another scene.
			stream=stream.duplicate();stream.loop_mode=AudioStreamWAV.LOOP_DISABLED
		streams.append(stream)

func reset():
	if is_instance_valid(voice):voice.stop();voice.stream=null;voice.stream_paused=false;voice.volume_linear=0
	state="silence";silence_left=INITIAL_SILENCE;elapsed=0;fade_left=0;envelope=0;next_track=0;active_track=-1;starts=0

func stop_for_control():
	# Muting never retains a paused tail that could unexpectedly restart later.
	if state!="silence":finish_phrase()
	if is_instance_valid(voice):voice.stop();voice.stream=null;voice.volume_linear=0

func finish_phrase():
	if state=="silence":return
	var completed=maxi(0,active_track)
	voice.stop();voice.stream=null;voice.volume_linear=0;voice.stream_paused=false
	state="silence";silence_left=SILENCES[completed%SILENCES.size()];elapsed=0;fade_left=0;active_track=-1;envelope=0

func apply_gain(gain: float,paused: bool):
	if not is_instance_valid(voice):return
	voice.stream_paused=paused
	voice.volume_linear=0 if paused else maxf(0,gain)*envelope

func update(dt: float,session,active: bool,paused: bool,blocked: bool,gain: float):
	if not is_instance_valid(voice):return
	var identity=session.get_instance_id()
	if identity!=session_id or session.clock<session_clock:
		reset();session_id=identity
	session_clock=session.clock
	if not active or gain<=0:
		stop_for_control();return
	if paused:
		apply_gain(gain,true);return
	voice.stream_paused=false
	var step=maxf(0,dt)
	if state=="silence":
		# Busy intervals do not consume the quiet interval or queue a delayed
		# musical entrance underneath the final sentence or gunshot.
		if blocked:silence_left=maxf(silence_left,20.0);return
		silence_left=maxf(0,silence_left-step)
		if silence_left>0 or streams.is_empty():return
		active_track=next_track;next_track=(next_track+1)%streams.size()
		voice.stream=streams[active_track];voice.volume_linear=0;voice.play()
		state="playing";elapsed=0;envelope=0;starts+=1
		return
	if blocked and state=="playing":state="fading";fade_left=INTERRUPT_FADE
	elapsed+=step
	var duration=voice.stream.get_length() if voice.stream else 0.0
	if state=="fading":fade_left=maxf(0,fade_left-step)
	if elapsed>=duration or (state=="fading" and fade_left<=0):finish_phrase();return
	var intro=clampf(elapsed/FADE_IN,0,1);var ending=clampf((duration-elapsed)/FADE_OUT,0,1)
	envelope=minf(intro*intro*(3-2*intro),ending*ending*(3-2*ending))
	if state=="fading":
		var t=clampf(fade_left/INTERRUPT_FADE,0,1);envelope*=t*t*(3-2*t)
	apply_gain(gain,false)

func shutdown():
	reset();streams.clear();session_id=0;session_clock=0
