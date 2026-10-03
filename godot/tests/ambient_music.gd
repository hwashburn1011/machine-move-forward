extends SceneTree

class MusicSession:
	extends RefCounted
	var clock=0.0
	var rng=RandomNumberGenerator.new()

var checks=0
var failures=[]
var parent: Node
var music: MMFAmbientMusic
var session=MusicSession.new()

func _initialize():call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func advance(dt: float,paused=false,blocked=false,gain=.245):music.update(dt,session,true,paused,blocked,gain)
func stream_refs() -> Array:
	var refs=[]
	for stream in music.streams:refs.append(weakref(stream))
	return refs

func run():
	parent=Node.new();root.add_child(parent);music=MMFAmbientMusic.new();music.setup(parent)
	check(parent.get_child_count()==1 and music.streams.size()==3,"One bounded voice owns three authored music phrases")
	check(music.streams.all(func(stream):return stream is AudioStreamWAV and stream.loop_mode==AudioStreamWAV.LOOP_DISABLED and stream.get_length()>=28 and stream.get_length()<=32),"Every phrase is finite, non-looping and 28–32 seconds")
	var private_rng=session.rng.state
	advance(0);advance(44)
	check(music.starts==0 and music.voice.stream==null and music.silence_left==1,"First44 calm seconds contain real silence, not a zero-volume looping track")
	advance(1)
	check(music.starts==1 and music.active_track==0 and music.voice.volume_linear==0,"First phrase begins once at the end of the initial45-second interval")
	advance(2)
	check(is_equal_approx(music.envelope,.5) and is_equal_approx(music.voice.volume_linear,.1225),"Music enters through a smooth four-second fade at the chosen volume")
	var elapsed=music.elapsed;advance(50,true)
	check(music.elapsed==elapsed and music.voice.stream_paused and music.voice.volume_linear==0,"Pause freezes phrase position and silences playback")
	advance(0)
	check(not music.voice.stream_paused and music.elapsed==elapsed and music.voice.volume_linear>0,"Resume restores the same phrase without restarting or catching up")
	advance(28)
	check(music.state=="silence" and music.voice.stream==null and not music.voice.playing and music.silence_left==90,"End of first phrase stops and detaches its stream for90 seconds")
	advance(89);check(music.starts==1 and music.voice.stream==null,"Silence remains physically stopped until the next scheduled entrance")
	advance(1);check(music.active_track==1 and music.starts==2,"Second entrance uses the different authored phrase")
	advance(28);check(music.state=="silence" and music.silence_left==125,"Second phrase receives125 seconds of actual silence")
	advance(125);advance(32);check(music.silence_left==160,"Third phrase receives160 seconds of actual silence")
	music.reset();advance(45);advance(8);var loud=music.voice.volume_linear
	advance(1,false,true)
	check(music.state=="fading" and music.voice.volume_linear>0 and music.voice.volume_linear<loud,"Combat or dialogue begins a gentle two-second release instead of an alarm or hard restart")
	advance(1,false,true);check(music.state=="silence" and music.voice.stream==null,"Interrupted phrase releases its voice after the fade")
	var rest=music.silence_left;advance(500,false,true)
	check(music.silence_left==rest and music.starts==1,"Busy play consumes no silence budget and never schedules catch-up music")
	music.reset();advance(45);advance(5);music.stop_for_control()
	check(music.voice.stream==null and not music.voice.playing and music.envelope==0,"Mute/zero volume immediately detach active music")
	advance(0);check(music.state=="silence" and music.starts==1,"Unmute cannot replay a retained tail")
	music.reset();advance(45);advance(5);var previous_session=session;session=MusicSession.new();advance(0)
	check(music.state=="silence" and music.voice.stream==null and music.silence_left==45 and music.starts==0,"Loading another session resets music without retaining the old scene")
	advance(45);session.clock=100;advance(1);session.clock=10;advance(0)
	check(music.voice.stream==null and music.silence_left==45,"A clock rollback also resets the playlist safely")
	advance(100000);check(music.starts==1,"A coarse update can start at most one phrase")
	advance(100000);check(music.starts==1 and music.state=="silence","A coarse phrase update stops without chaining more music")
	check(previous_session.rng.state==private_rng,"Music consumes no gameplay random draws")
	check(parent.get_child_count()==1 and music.streams.size()==3,"Repeated transitions allocate no additional players or streams")
	var refs=stream_refs()
	music.shutdown();music=null;parent.queue_free();await process_frame
	var deadline=Time.get_ticks_msec()+500
	while refs.any(func(ref):return ref.get_ref()!=null) and Time.get_ticks_msec()<deadline:await process_frame
	check(refs.all(func(ref):return ref.get_ref()==null),"Teardown releases every owned music stream and voice")
	var f=FileAccess.open("res://../test-results/deck-audio/ambient-music.json",FileAccess.WRITE);f.store_string(JSON.stringify({"checks":checks,"failures":failures,"finite_tracks":3,"scope":"Deterministic bounded music lifecycle; file statistics and auditions reviewed separately."},"\t"));f.close()
	print("AMBIENT_MUSIC ",checks," checks; failures=",failures.size());call_deferred("quit",0 if failures.is_empty() else 1)
