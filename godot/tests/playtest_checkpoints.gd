extends SceneTree

var game
var failures=[]
var checks=0
var output="res://../test-results/godot-native/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-checkpoint-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count: int=3):
	for i in count:await process_frame

func capture(name: String):
	if DisplayServer.get_name()=="headless":return
	await frames(8);await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+name+".png")

func key(code: int):
	var event=InputEventKey.new();event.keycode=code;event.physical_keycode=code;event.pressed=true
	Input.parse_input_event(event);await frames(2)
	event=event.duplicate();event.pressed=false;Input.parse_input_event(event);await frames(2)

func button(prefix: String) -> Button:
	for child in game.ui.content.find_children("*","Button",true,false):
		if child.text.begins_with(prefix):return child
	return null

func click(control: Control):
	if control==null:check(false,"Expected visible control exists");return
	var at=root.get_final_transform()*control.get_global_rect().get_center()
	var motion=InputEventMouseMotion.new();motion.position=at;motion.global_position=at;Input.parse_input_event(motion)
	await frames(2)
	var event=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.button_mask=MOUSE_BUTTON_MASK_LEFT;event.position=at;event.global_position=at;event.pressed=true
	Input.parse_input_event(event);await frames(2)
	event=event.duplicate();event.pressed=false;event.button_mask=0;Input.parse_input_event(event);await frames(3)

func run():
	Engine.max_fps=60
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,900))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	await frames(5)
	var catalog=game.playtests
	var normal_directory=MMFSaves.DIRECTORY
	var sentinel={"session":game.session.native_snapshot(),"marker":"campaign remains unchanged"}
	check(MMFSaves.write("autosave",sentinel),"Campaign sentinel saved")
	var normal_bytes=FileAccess.get_file_as_string(normal_directory+"autosave.json")
	game.open_menu("Checkpoints");await frames(5)
	check(not game.ui.terminal.presenting() and game.ui.panel.get_parent()==game.ui.root,"Checkpoints available from title independently of player wrist")
	await capture("playtest-checkpoints")
	for entry in catalog.PRESETS:
		var state=catalog.payload(entry.id)
		var trial=MMFSession.new(game.data)
		check(trial.restore_native(JSON.parse_string(JSON.stringify(state.session))),entry.id+": generated save passes real JSON validation")
		check(trial.story.completed.size()==entry.stage,entry.id+": only preceding expeditions are completed")
		check(catalog.launch(entry.id),entry.id+": launches through normal restore")
		await frames(4)
		check(game.player.camera.current and not game.menu_open and game.session.health==100,entry.id+": camera and controls returned to playable state")
		check(MMFSaves.DIRECTORY.begins_with(normal_directory+"playtests/"),entry.id+": saves isolated from campaign")
		check(game.player.boundary.fits(game.player.position),entry.id+": spawn clears world geometry")
		for p in game.session.structures:
			if p.definitionId!="floor":check(not game.building.blocked(p.cell),entry.id+": "+p.definitionId+" clears fixed machine equipment")
		if entry.mode=="docked":
			check(is_instance_valid(game.campaign.destination) and not game.campaign.points.is_empty(),entry.id+": destination and interaction points restored")
			check(game.campaign.expedition().requiredUniques.all(func(id):return id==entry.get("evidence","") or id not in game.session.story.uniques),entry.id+": destination recoveries remain playable apart from documented comparison evidence")
			check(game.campaign.departure_reason()!="",entry.id+": cannot bypass unfinished area")
			# Exercise the real objective transactions in prerequisite order.
			for kind in ["journal","objective","unique"]:
				for point in game.campaign.points:
					var item=point.entry
					if item.kind!=kind or not game.campaign.can_show(item):continue
					check(await preload("res://tests/expedition_fixture.gd").complete(game,item),entry.id+": physical service controls and local recovery "+item.id)
					game.close_menu()
			game.player.position=Vector3(0,16.1,-1)
			check(game.campaign.departure_reason()=="" and game.campaign.depart(),entry.id+": real objectives permit normal departure")
		elif entry.mode=="optional":
			check(is_instance_valid(game.opportunities.site) and not game.opportunities.points.is_empty(),entry.id+": optional site and interactions restored")
			if entry.kind.begins_with("gear-"):check(MMFNativeProgression.eligible(game.session,entry.kind.trim_prefix("gear-")),entry.id+": recovery prerequisites earned")
	check(FileAccess.get_file_as_string(normal_directory+"autosave.json")==normal_bytes,"All checkpoint launches preserve campaign autosave byte for byte")
	catalog.launch("defense");await frames(3)
	game.combat.update_director(3)
	check(game.combat.ship_state!="none" and game.session.facts.tutorialStarted,"Defense checkpoint starts an actual tutorial boarding craft")
	catalog.launch("scout");await frames(3)
	game.session.clock=game.journey.quiet_until+1;game.combat.update_director(.1)
	check(game.combat.scout.active(),"Scout checkpoint starts the real detection encounter")
	catalog.launch("array");await frames(4)
	game.session.health=73;game.session.inventory.remove("scrap",17)
	game.open_menu("Pause");await frames(3)
	var save_button=button("SAVE PLAYTEST")
	check(save_button!=null,"Pause offers an explicit playtest save")
	if save_button:save_button.pressed.emit()
	catalog.launch("wake");await frames(4)
	check(catalog.launch("array",true) and game.session.health==73,"Continue resumes the selected checkpoint's own progress")
	check(catalog.launch("array") and game.session.health==100,"Restart regenerates fresh loadout")
	await frames(4)
	game.open_menu("Inventory");await frames(5)
	check(game.ui.context_pages()==["Inventory","Records"] and game.ui.terminal.active,"Wrist navigation contains only personal pack and log")
	check(button("STORAGE")==null,"Pack does not expose remote machine storage")
	await key(KEY_B)
	check(game.ui.page=="Build" and game.player.camera.current and not game.ui.terminal.presenting(),"Build shortcut escapes wrist to construction catalog")
	game.terminal_pages.catalog_selected="floor";game.ui.refresh();await frames(5)
	await capture("construction-catalog")
	var ammo=game.session.weapons.rifle.ammoInMag
	await click(button("PLACE"))
	check(not game.menu_open and game.building.selected=="floor" and game.player.camera.current and not game.ui.panel.visible,"Actual PLACE click closes catalog and immediately restores placement camera")
	check(game.session.weapons.rifle.ammoInMag==ammo,"PLACE click never fires a weapon")
	var candidate={}
	for x in range(-4,5):
		for z in range(-4,5):
			var spec={"definitionId":"floor","cell":{"x":x,"y":0,"z":z},"rotation":0}
			if game.building.validate(spec)=="" and game.building.center(spec.cell).distance_to(game.player.position)<10:candidate=spec;break
		if not candidate.is_empty():break
	check(not candidate.is_empty(),"Normal paid build has a reachable valid deck cell")
	if not candidate.is_empty():
		var at=game.building.center(candidate.cell)
		game.player.camera.global_position=at+Vector3.UP*5;game.player.camera.look_at(at,Vector3.FORWARD)
		game.building.update(0)
		var before=game.session.structures.size();var scrap=game.session.count_resource("scrap")
		var event=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.pressed=true;Input.parse_input_event(event);await frames(2)
		event=event.duplicate();event.pressed=false;Input.parse_input_event(event);await frames(2)
		check(game.session.structures.size()==before+1 and game.session.count_resource("scrap")==scrap-game.data.BUILD_PIECES.floor.cost.scrap,"World click builds exactly one part and charges ordinary cost")
	game.building.cancel();game.player.update_camera(1)
	for kind in ["workbench","refinery"]:
		var station=game.session.structures.filter(func(p):return p.definitionId==kind)[0]
		game.player.position=game.building.center(station.cell)+Vector3(0,.07,-1.8)
		game.service_piece(station);await frames(4)
		check(game.ui.page=="Workshop" and game.ui.station_kind==kind and not game.ui.terminal.active and game.ui.panel.get_parent()==game.ui.root,kind+": interaction opens equipment's own interface")
		var recipes=game.ui.content.find_children("*","Button",true,false).filter(func(b):return b.has_meta("terminal_entry"))
		check(not recipes.is_empty() and recipes.all(func(b):return game.data.RECIPES.any(func(r):return r.id==b.get_meta("terminal_entry") and r.station==kind)),kind+": offers only local recipes")
		await capture("station-"+kind)
	game.player.position=Vector3(0,16.1,-1)
	game.open_station("Signal","receiver");await frames(4)
	check(game.ui.context_pages()==["Signal","Research"] and not game.ui.terminal.active,"Receiver owns signals and research")
	game.open_menu("Research");await frames(4)
	check(game.ui.workshop_view.category=="RESEARCH","Receiver research available independently of workbench")
	game.ui.show_record("Receiver requirements","Test");await frames(2)
	check(not game.ui.terminal.active,"Station detail stays on station screen")
	game.open_station("Helm","helm");await frames(4)
	check(game.ui.context_pages().is_empty() and not game.ui.terminal.active,"Helm navigation remains separate from physical engineering")
	await capture("station-helm")
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1200,900))
	game.open_menu("Checkpoints");await frames(5);await capture("playtest-checkpoints-4x3")
	check(game.ui.panel.size.x<=root.get_visible_rect().size.x and game.ui.scroller.size.y>100,"Checkpoint selector fits viewport with scrollable details")
	catalog.return_to_campaign();await frames(3)
	check(MMFSaves.DIRECTORY==normal_directory and not game.started and game.ui.page=="Title","Leaving title-started playtest restores campaign directory and title")
	check(FileAccess.get_file_as_string(normal_directory+"autosave.json")==normal_bytes,"Playtest saves never alter campaign autosave")
	game.load_payload(catalog.payload("wake"));await frames(3)
	game.session.health=82;var return_distance=game.session.distance
	check(catalog.launch("array"),"Campaign can enter playtest from a safe paused point")
	await frames(3);catalog.return_to_campaign();await frames(3)
	check(game.started and game.session.health==82 and game.session.distance==return_distance and MMFSaves.DIRECTORY==normal_directory,"Return restores pre-playtest campaign health, progress and save scope")
	game.session.attack_recent=5
	check(not catalog.launch("array") and MMFSaves.DIRECTORY==normal_directory and game.session.health==82,"Unsafe campaign switch is refused without losing live progress")
	game.session.attack_recent=0
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await preload("res://tests/audio_drain.gd").finish(self,refs);MMFAssets.cache.clear()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty()}
	var file=FileAccess.open(output+"playtest-checkpoints.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("PLAYTEST_CHECKPOINTS ",JSON.stringify(report));quit(0 if failures.is_empty() else 1)
