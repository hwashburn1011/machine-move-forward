extends SceneTree

var game
var label="current"
var report={}
var output="res://../test-results/godot-native/"
var measurements=[]
var captures_enabled=true
var legacy=false

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-crossfire-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		if arg=="--no-captures":captures_enabled=false
		if arg=="--legacy":legacy=true
	call_deferred("run")

func capture(name):
	if not captures_enabled:return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path(output+"crossfire-"+label+"-"+name+".png"))

func run():
	if DisplayServer.get_name()=="headless":push_error("Crossfire review needs native rendering");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=60
	var cinema=GDScript.new()
	cinema.source_code='extends MMFCinematics\nvar entry_ms=0.0\nvar preparation=[]\nvar prepared_at_entry=false\nfunc begin_signal():\n\tprepared_at_entry=signal_stage.part_index==7\n\tvar start=Time.get_ticks_usec()\n\tsuper.begin_signal()\n\tentry_ms=(Time.get_ticks_usec()-start)/1000.0\nfunc update(dt):\n\tvar before=signal_stage.part_index\n\tvar start=Time.get_ticks_usec()\n\tsuper.update(dt)\n\tif before!=signal_stage.part_index:preparation.append({"part":signal_stage.part_index,"ms":(Time.get_ticks_usec()-start)/1000.0,"frame":Engine.get_process_frames()})\n'
	if legacy:
		if not FileAccess.file_exists(output+"crossfire-original.gd"):
			push_error("Extract dbd3aef:godot/scripts/cinematics.gd to test-results/godot-native/crossfire-original.gd for the legacy comparison.");quit(1);return
		cinema.source_code=FileAccess.get_file_as_string(output+"crossfire-original.gd").replace("\r\n","\n").replace("class_name MMFCinematics\n","")
		cinema.source_code=cinema.source_code.replace("func begin_signal():","func begin_signal():\n\tvar review_start=Time.get_ticks_usec()")
		cinema.source_code=cinema.source_code.replace("\nfunc begin_arrival():","\n\tentry_ms=(Time.get_ticks_usec()-review_start)/1000.0\n\nfunc begin_arrival():")
		cinema.source_code+="\nvar entry_ms=0.0\nvar preparation=[]\nvar prepared_at_entry=false\n"
	if cinema.reload()!=OK:quit(1);return
	var source=FileAccess.get_file_as_string("res://scripts/main.gd")
	source=source.replace("var cinematics: MMFCinematics","var cinematics").replace("cinematics=MMFCinematics.new()","cinematics=review_cinema.new()")+"\nvar review_cinema\n"
	var script=GDScript.new();script.source_code=source
	if script.reload()!=OK:quit(1);return
	game=script.new();game.review_cinema=cinema;root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.settings.fov=72;game.save_settings()
	game.started=true;game.session.opening_done=true;game.close_menu()
	game.session.facts.merge({"salvage":true,"refineryBuilt":true,"workbenchBuilt":true,"refined":12},true)
	game.player.teleport(Vector3(0,16.1,5));game.player.yaw=.5;game.player.pitch=-.12;game.player.update_camera(1)
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	# Settle startup imports/particles before measuring scan preparation.
	for i in 180:await physics_frame
	game.session.scanner.phase="installed";game.session.update_power();game.session.start_scan()
	game.session.scanner.elapsedS=172
	var start=Time.get_ticks_usec();var previous=start;var entered=false;var finished=false;var return_at=0.0
	var captures=[0.1,3.0,7.0,11.0,13.5,16.7] if captures_enabled else []
	var last_transform=game.player.camera.global_transform;var last_fov=game.player.camera.fov
	var previous_kind="";var max_jump={"degrees":0.0};var handoff={};var observed_entry={}
	while Time.get_ticks_usec()-start<35000000:
		await process_frame
		var now=Time.get_ticks_usec();var ms=(now-previous)/1000.0;previous=now
		var camera=root.get_camera_3d();var kind=game.cinematic
		var angle=rad_to_deg(last_transform.basis.get_rotation_quaternion().angle_to(camera.global_basis.get_rotation_quaternion()))
		if kind!=previous_kind:
			var change={"from":previous_kind,"to":kind,"positionJumpM":camera.global_position.distance_to(last_transform.origin),"angleJumpDegrees":angle,"fovBefore":last_fov,"fovAfter":camera.fov,"frameMs":ms}
			if kind=="signal":observed_entry=change;entered=true
			elif entered:handoff=change;finished=true;return_at=(now-start)/1000000.0
		if kind=="signal":
			if angle>max_jump.degrees:max_jump={"degrees":angle,"time":game.cinematics.time,"fov":camera.fov}
		measurements.append({"time":game.cinematics.time,"kind":kind,"frameMs":ms,"fov":camera.fov,"angleDegrees":angle})
		last_transform=camera.global_transform;last_fov=camera.fov;previous_kind=kind
		if kind=="signal" and not captures.is_empty() and game.cinematics.time>=captures[0]:
			await capture(str(captures.pop_front()));previous=Time.get_ticks_usec()
		if finished and (now-start)/1000000.0>return_at+2:break
	await capture("returned")
	report={"scope":"Native real-time scanner completion and existing 17-second crossfire. Three-second startup warmup, seeded repaired scanner, final eight seconds of scanning; 1080p high/Vulkan, 60 FPS cap, 72-degree player FOV. Use --no-captures for timing: image capture excludes its readback time but can still cause physics catch-up. No campaign playthrough claim.","adapter":RenderingServer.get_video_adapter_name(),"entryCpuMs":game.cinematics.entry_ms,"entry":observed_entry,"handoff":handoff,"largestAngularFrame":max_jump,"finished":finished,"storyPhase":game.session.story.phase,"scannerPhase":game.session.scanner.phase,"frames":measurements}
	report.preparedAtEntry=game.cinematics.prepared_at_entry;report.preparation=game.cinematics.preparation
	report.capturesEnabled=captures_enabled;report.legacy=legacy
	var file=FileAccess.open(output+"crossfire-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("CROSSFIRE_REVIEW ",{"entryCpuMs":report.entryCpuMs,"entry":observed_entry,"handoff":handoff,"largestAngularFrame":max_jump,"finished":finished})
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	await create_timer(.1).timeout;MMFAssets.cache.clear();quit(0 if finished else 1)
