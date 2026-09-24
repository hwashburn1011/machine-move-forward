extends SceneTree

class GatedJob extends MMFAutosaver.WriteJob:
	var entered=Semaphore.new()
	var release=Semaphore.new()
	func run():
		entered.post();release.wait();super.run()

class Probe extends MMFAutosaver:
	var hold_next=false
	var gate: GatedJob
	var starts=[]
	func start(next: WriteJob) -> bool:
		starts.append(next.payload.get("tag","campaign"))
		if hold_next:
			hold_next=false;gate=GatedJob.new();gate.directory=next.directory;gate.payload=next.payload
			return super.start(gate)
		return super.start(next)

var checks=0
var failures=[]
var results=[]
var directory=""

func _initialize():
	set_meta("test_mode",true);call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func wait_idle(writer):
	var start=Time.get_ticks_msec()
	while writer.pending() and Time.get_ticks_msec()-start<5000:await process_frame
	check(not writer.pending(),"Worker completes and is harvested without a main-thread wait")

func run():
	directory="user://native-autosave-tests/run-"+str(Time.get_unix_time_from_system()).replace(".","-")+"/"
	MMFSaves.DIRECTORY=directory
	check(MMFSaves.write("autosave",{"tag":"baseline"}),"Initial verified checkpoint is durable")
	var writer=Probe.new();root.add_child(writer);writer.completed.connect(func(ok):results.append(ok))
	writer.hold_next=true
	var payload={"tag":"first","nested":{"values":[1,2,3]}}
	check(writer.request(payload,directory),"Background request is accepted")
	var gate_started=false;var deadline=Time.get_ticks_msec()+3000
	while Time.get_ticks_msec()<deadline:
		if writer.gate.entered.try_wait():gate_started=true;break
		await process_frame
	check(gate_started,"Controlled worker reaches I/O gate")
	payload.nested.values[0]=99
	var frame=Engine.get_process_frames()
	for i in 20:await process_frame
	check(Engine.get_process_frames()>=frame+19 and writer.pending(),"Frames continue while autosave I/O is deliberately blocked")
	check(MMFSaves.read("autosave").tag=="baseline","Pending work does not replace the previous verified checkpoint")
	writer.request({"tag":"superseded"},directory)
	var latest={"tag":"latest","nested":{"values":[7,8]}}
	writer.request(latest,directory);latest.nested.values[0]=77
	check(writer.starts==["first"] and writer.queued.payload.tag=="latest","Burst requests retain one worker and only the latest queued replacement")
	# A changed configuration cannot redirect an already acknowledged write.
	MMFSaves.DIRECTORY=directory+"different/"
	paused=true;writer.gate.release.post();await wait_idle(writer)
	paused=false;MMFSaves.DIRECTORY=directory
	check(writer.starts==["first","latest"] and results==[true,true],"Paused menus still harvest serialized writes in order")
	var saved=MMFSaves.read("autosave");var backup=MMFSaves.decode(directory+"autosave.json.bak")
	check(saved.tag=="latest" and saved.nested.values[0]==7 and saved.nested.values[1]==8 and backup.tag=="first" and backup.nested.values[0]==1 and backup.nested.values[1]==2 and backup.nested.values[2]==3,"Snapshots are deeply detached and previous verified content becomes the backup")
	check(not FileAccess.file_exists(directory+"different/autosave.json"),"In-flight jobs retain their captured save directory")
	check(not FileAccess.file_exists(directory+"autosave.json.tmp"),"Successful commit leaves no temporary file")
	# An actual FileAccess failure: the test owns an empty directory where the
	# staging file must be. Never change ACLs or touch a personal campaign.
	DirAccess.make_dir_recursive_absolute(directory+"autosave.json.tmp")
	writer.request({"tag":"must-not-commit"},directory);await wait_idle(writer)
	check(results.back()==false and MMFSaves.read("autosave").tag=="latest","I/O failure is reported and preserves the verified checkpoint")
	DirAccess.remove_absolute(directory+"autosave.json.tmp")
	writer.request({"tag":"recovered"},directory);writer.flush()
	check(not writer.pending() and MMFSaves.read("autosave").tag=="recovered","Explicit flush waits until acknowledged writes are durable")
	var envelope=JSON.parse_string(FileAccess.get_file_as_string(directory+"autosave.json"));envelope.checksum="broken"
	var tamper=FileAccess.open(directory+"autosave.json",FileAccess.WRITE);tamper.store_string(JSON.stringify(envelope));tamper.close()
	check(MMFSaves.read("autosave").tag=="latest","Checksum mismatch recovers the previous verified payload")
	var corrupt=FileAccess.open(directory+"autosave.json",FileAccess.WRITE);corrupt.store_string("interrupted / corrupt primary");corrupt.close()
	check(MMFSaves.read("autosave").tag=="latest","Malformed JSON recovers the backup without parser errors")
	writer.request({"tag":"healthy-again"},directory);writer.flush()
	check(MMFSaves.decode(directory+"autosave.json.bak").tag=="latest","Replacing a corrupt primary preserves the healthy backup")
	check(not MMFSaves.write_at(directory,"../outside",{}),"Unsafe save names remain rejected")
	writer.request({"tag":"exit-first"},directory);writer.request({"tag":"exit-latest"},directory)
	writer.queue_free();await process_frame;await process_frame
	check(MMFSaves.read("autosave").tag=="exit-latest","Node teardown drains the active and queued autosave")
	await campaign_checks()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"testDirectory":directory}
	var file=FileAccess.open("res://../test-results/godot-native/autosave-worker.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	call_deferred("quit",0 if failures.is_empty() else 1)

func campaign_checks():
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.session.facts.tutorialStarted=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.teleport(Vector3(0,16.1,-1));game.session.health=91;game.session.fuel=77
	var expected=game.session.native_snapshot();game.autosave_clock=65
	check(game.save_game("autosave") and game.autosave_clock==0,"Gameplay enqueues a safe snapshot and resets the interval")
	game.session.health=52;game.session.fuel=9;game.session.inventory.slots.clear()
	game.autosaver.flush();var payload=MMFSaves.read("autosave")
	check(payload.session.health==91 and payload.session.fuel==77 and payload.session.inventory==JSON.parse_string(JSON.stringify(expected.inventory)),"Ongoing gameplay cannot mutate an in-flight campaign snapshot")
	check(MMFSession.new(game.data).restore_native(payload.session),"Background output passes full native campaign validation")
	game.load_game("autosave")
	check(game.session.health==91 and game.session.fuel==77 and not game.autosaver.pending(),"Loading drains pending I/O before restoring a complete campaign")
	game.session.attack_recent=1
	check(not game.save_game("autosave") and not game.autosaver.pending(),"Unsafe combat state cannot enqueue an autosave")
	game.session.attack_recent=0;game.session.health=88
	check(game.save_game("manual") and MMFSaves.read("manual").session.health==88,"Manual save still returns only after a verified durable commit")
	game.session.health=83;game.save_game("autosave")
	game.load_game("autosave")
	check(game.session.health==83 and not game.autosaver.pending(),"Immediate Continue reads the newest acknowledged autosave")
	var notices=[];game.session.notice.connect(func(message):notices.append(message))
	DirAccess.make_dir_recursive_absolute(directory+"autosave.json.tmp")
	game.autosave_clock=65;game.save_game("autosave");await wait_idle(game.autosaver)
	check(notices.any(func(message):return "Save failed" in message) and MMFSaves.read("autosave").session.health==83,"Background failure reaches the player and retains the campaign")
	game.close_menu()
	for i in 10:game._physics_process(1.0/60)
	check(game.autosave_clock<1 and not game.autosaver.pending(),"A failed autosave does not retry disk I/O every physics frame")
	DirAccess.remove_absolute(directory+"autosave.json.tmp")
	game.session.health=81;game.save_game("autosave");game.open_menu("Library")
	check(not game.autosaver.pending() and MMFSaves.read("autosave").session.health==81,"Campaign library opens with the latest acknowledged checkpoint")
	game.close_menu()
	game.session.health=79;game.save_game("autosave");game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free()
	while is_instance_valid(game):await process_frame
	check(MMFSaves.read("autosave").session.health==79,"Full game teardown finishes its accepted autosave")
	await create_timer(.1).timeout;MMFAssets.cache.clear()
