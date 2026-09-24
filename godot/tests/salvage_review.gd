extends SceneTree

var game
var label="current"
var report={}
var output="res://../test-results/godot-native/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-salvage-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")

func frames(count):
	for i in count:await physics_frame

func capture(name):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path(output+"salvage-"+label+"-"+name+".png"))

func aim(crate,angle):
	var direction=(crate.node.position-game.salvage.hand_position()).normalized()
	game.player.yaw=atan2(-direction.x,-direction.z)+deg_to_rad(angle)
	game.player.pitch=asin(direction.y);game.player.update_camera(1)

func throw_key():
	var event=InputEventKey.new();event.physical_keycode=KEY_F;event.keycode=KEY_F;event.pressed=true;Input.parse_input_event(event)
	await process_frame;event=event.duplicate();event.pressed=false;Input.parse_input_event(event)

func run():
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1920,1080))
	Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.bindings={};game.configure_input();game.new_game()
	var wall_start=Time.get_ticks_msec();var samples={};var next_capture=3.0
	while game.cinematic!="":
		await physics_frame
		if game.cinematics.time>=next_capture:
			await capture("opening-"+str(int(next_capture)));next_capture+=3
		if Time.get_ticks_msec()-wall_start>20000:push_error("Opening failed to hand off");quit(1);return
	report.openingWallSeconds=(Time.get_ticks_msec()-wall_start)/1000.0
	var crate=null
	while crate==null:
		await physics_frame
		for c in game.salvage.crates:
			if c.active:crate=c;break
		if Time.get_ticks_msec()-wall_start>45000:push_error("First cargo never appeared");quit(1);return
	report.firstSpawnSeconds=(Time.get_ticks_msec()-wall_start)/1000.0
	game.player.teleport(Vector3(signf(crate.node.position.x)*12,8.95,-4));await frames(15)
	while crate.node.position.distance_to(game.salvage.hand_position())>29:
		aim(crate,0);await physics_frame
	aim(crate,15);await frames(3)
	report.offAxis={"prompt":game.ui.prompt.text,"aimedIndex":game.salvage.aimed_crate(),"range":crate.node.position.distance_to(game.salvage.hand_position())}
	await capture("off-axis");await throw_key()
	var start_clock=game.session.clock
	while game.salvage.busy():await physics_frame
	report.offAxis.caught=game.session.facts.salvage;report.offAxis.flightSeconds=game.session.clock-start_clock
	if crate.active:
		aim(crate,0);await frames(3);await capture("aligned")
		report.aligned={"markerVisible":game.ui.salvage_readout.visible,"readout":game.ui.salvage_readout.label.text}
		await throw_key()
		var recorded=false
		while game.salvage.busy():
			await physics_frame
			if game.salvage.reel_index>=0 and not recorded:await capture("return");recorded=true
	await frames(2);report.receipt=game.ui.toast.text;report.scannerPhase=game.session.scanner.phase;await capture("receipt")
	# Observe native free-cargo clearance against the rendered dune function at
	# many actual travel distances; keep this separate from the real-time flight.
	game.set_physics_process(false);game.player.set_physics_process(false)
	var bounds=MMFAssets.bounds(crate.node);var gaps=[]
	for distance in range(0,6000,10):
		game.session.distance=distance
		crate.active=true;crate.claimed="";crate.node.position=Vector3(-21,2,-20)
		game.salvage.next_distance=1e12;game.salvage.update(0)
		var ground=MMFDunes.height_at(crate.node.position.x+game.session.lateral,crate.node.position.z-distance)
		gaps.append(crate.node.position.y+bounds.position.y-ground)
	gaps.sort();report.groundClearanceM={"min":gaps.front(),"median":gaps[gaps.size()/2],"max":gaps.back(),"samples":gaps.size()}
	report.scope="Real-time existing opening, first spawned cargo and physical F input; diagnostic relocation to the lower fishing deck. Separate 600-distance terrain-clearance observation. No story progression added."
	var file=FileAccess.open(output+"salvage-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("SALVAGE_REVIEW ",report)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	crate=null;await create_timer(.1).timeout;MMFAssets.cache.clear();quit()
