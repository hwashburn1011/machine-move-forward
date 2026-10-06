class_name MMFStoryVoice
extends Node

# Local, voluntary playback. No scene progression or save state depends on sound.
var game
var catalog={}
var voice: AudioStreamPlayer
var beat_id=""
var owner_session=0
var owner_phase=""
var owner_reader=""
var owner_index=-1
var last_clock=0.0
var caption: Label
var toggle: Button

func setup(owner_game):
	game=owner_game;process_mode=Node.PROCESS_MODE_ALWAYS
	catalog=MMFAssets.json("res://data/story-voice.json")
	voice=AudioStreamPlayer.new();add_child(voice)
	voice.finished.connect(stop)

func authorized(id: String) -> bool:
	if not catalog.has(id) or not game.started or game.session.health<=0 or game.cinematic!="" or game.combat.active_threat():return false
	if id not in game.session.narrative.known:return false
	if id=="berth-keep-the-channel":return game.finale.authorized("transmitter") and game.session.finale.stage=="aftermath"
	return game.narrative.authorized() and game.narrative.entry.get("beat","")==id and (id!="array-false-corridor" or game.narrative.comparison)

func play(id: String) -> bool:
	if not authorized(id) or game.audio.muted or game.audio.volume<=0:return false
	var stream=load(catalog[id].file)
	if not stream is AudioStream:return false
	stop();beat_id=id;owner_session=game.session.get_instance_id()
	owner_phase=game.session.story.phase;owner_index=int(game.session.story.index);owner_reader=game.ui.storage_id
	last_clock=game.session.clock
	voice.stream=stream;voice.volume_linear=game.audio.volume*.8;voice.play()
	update_controls();return true

func stop():
	if is_instance_valid(voice):voice.stop();voice.stream_paused=false;voice.stream=null
	beat_id="";update_controls()

func toggle_pause():
	if beat_id=="" or not authorized(beat_id):stop();return
	voice.stream_paused=not voice.stream_paused;update_controls()

func _process(_dt):
	if beat_id=="":return
	if game.session.get_instance_id()!=owner_session or game.session.story.phase!=owner_phase or int(game.session.story.index)!=owner_index or game.ui.storage_id!=owner_reader or game.session.clock<last_clock or not authorized(beat_id) or game.audio.muted or game.audio.volume<=0:
		stop();return
	last_clock=game.session.clock;voice.volume_linear=game.audio.volume*.8
	update_controls()

func update_controls():
	if is_instance_valid(toggle):toggle.text="RESUME RECORDING" if beat_id!="" and voice.stream_paused else "PAUSE RECORDING";toggle.disabled=beat_id==""
	if not is_instance_valid(caption):return
	if beat_id=="":caption.text="READY · Full transcript below.";return
	var at=int(voice.get_playback_position());var duration=int(ceil(catalog[beat_id].seconds))
	caption.text=("PAUSED · " if voice.stream_paused else "PLAYING · ")+"%d:%02d / %d:%02d"%[at/60,at%60,duration/60,duration%60]

func render(ui,id: String):
	if not authorized(id):return
	if id=="berth-keep-the-channel":ui.section("BERTH STATUS LOG","RECORDED")
	ui.text_line("Local recording · optional playback · stops when this reader closes.")
	ui.button("LISTEN / REPLAY",func():play(id))
	toggle=ui.button("PAUSE RECORDING",toggle_pause,beat_id!="")
	ui.button("STOP RECORDING",stop)
	caption=ui.text_line("");update_controls()

func _exit_tree():
	stop()
