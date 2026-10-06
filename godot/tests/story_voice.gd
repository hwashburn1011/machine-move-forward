extends SceneTree

# Small ownership fixtures exercise real imported streams and playback lifecycle.
# They deliberately do not claim earned campaign progress or human voice approval.
class Session extends RefCounted:
	var health=100
	var narrative={"known":["wake-dispatch","array-false-corridor","berth-keep-the-channel"]}
	var story={"phase":"docked","index":0}
	var finale={"stage":"aftermath"}
	var clock=10.0
class Narrative extends RefCounted:
	var entry={"beat":"wake-dispatch"}
	var comparison=false
	var allowed=true
	func authorized():return allowed
class Combat extends RefCounted:
	var active=false
	func active_threat():return active
class Finale extends RefCounted:
	var allowed=true
	func authorized(_id):return allowed
class Audio extends RefCounted:
	var volume=.7
	var muted=false
class Game extends Node:
	var started=true
	var cinematic=""
	var session=Session.new()
	var narrative=Narrative.new()
	var combat=Combat.new()
	var finale=Finale.new()
	var audio=Audio.new()
	var ui={"storage_id":"reader"}

var checks=0
var failures=[]
var game
var playback
func _initialize():call_deferred("run")
func check(value,label):
	checks+=1;print("PASS " if value else "FAIL ",label)
	if not value:failures.append(label)
func run():
	game=Game.new();root.add_child(game)
	playback=MMFStoryVoice.new();game.add_child(playback);playback.setup(game)
	check(playback.catalog.size()==3,"Exactly three optional recordings")
	for id in playback.catalog:
		var spec=playback.catalog[id];var stream=load(spec.file)
		check(stream is AudioStream and absf(stream.get_length()-spec.seconds)<.02,"Imported duration: "+id)
		check(spec.text==MMFNativeNarrativeData.BEATS[id].text,"Canonical transcript: "+id)
		var last=-1.0
		for cue in spec.cues:
			check(cue.start>=last and cue.end>cue.start and cue.end<=spec.seconds+.01,"Ordered sentence cue: "+id)
			last=cue.end
	check(playback.play("wake-dispatch"),"Reached known recording starts")
	check(absf(playback.voice.volume_linear-.56)<.001,"Quiet playback follows master volume")
	playback.toggle_pause();check(playback.voice.stream_paused,"Pause holds the recording")
	playback.toggle_pause();check(not playback.voice.stream_paused,"Resume continues recording")
	check(playback.play("wake-dispatch") and playback.get_child_count()==1,"Replay reuses one voice without overlap")
	game.narrative.entry.beat="array-false-corridor";playback._process(0)
	check(playback.beat_id=="" and not playback.play("array-false-corridor"),"Array requires comparison and stops stale Wake")
	game.narrative.comparison=true;check(playback.play("array-false-corridor"),"Compared Array reference enables playback")
	game.audio.muted=true;playback._process(0)
	check(playback.beat_id=="" and not playback.play("array-false-corridor"),"Mute stops playback and cannot start hidden audio")
	game.audio.muted=false;game.narrative.entry.beat="wake-dispatch"
	for mutation in ["close","reader","chapter","phase","death","combat","cinematic","session","rewind","zero"]:
		game.narrative.allowed=true;game.ui.storage_id="reader";game.session=Session.new();game.combat.active=false;game.cinematic="";game.audio.volume=.7
		check(playback.play("wake-dispatch"),"Lifecycle setup: "+mutation)
		match mutation:
			"close":game.narrative.allowed=false
			"reader":game.ui.storage_id="different-reader"
			"chapter":game.session.story.index=1
			"phase":game.session.story.phase="approach"
			"death":game.session.health=0
			"combat":game.combat.active=true
			"cinematic":game.cinematic="test"
			"session":game.session=Session.new()
			"rewind":game.session.clock=0
			"zero":game.audio.volume=0
		playback._process(0);check(playback.beat_id=="" and playback.voice.stream==null,"Stops and releases stream on "+mutation)
	game.audio.volume=.7;game.session=Session.new();game.session.story.phase="finale-docked"
	check(playback.play("berth-keep-the-channel"),"Completed local berth status available")
	game.session.finale.stage="berth";playback._process(0)
	check(playback.beat_id=="" and not playback.play("berth-keep-the-channel"),"Berth payoff unavailable before completion")
	game.narrative.entry.beat="wake-dispatch";game.session=Session.new();playback.play("wake-dispatch")
	var weak=weakref(playback.voice);game.queue_free();game=null;playback=null
	for i in 4:await process_frame
	check(weak.get_ref()==null,"Scene teardown frees playback node")
	var directory=ProjectSettings.globalize_path("res://../test-results/story-voice");DirAccess.make_dir_recursive_absolute(directory)
	var file=FileAccess.open(directory+"/lifecycle.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"checks":checks,"failures":failures,"passed":failures.is_empty(),"kind":"isolated ownership fixture; actual imported streams"},"\t"));file.close()
	quit(0 if failures.is_empty() else 1)
