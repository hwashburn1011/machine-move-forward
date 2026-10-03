extends "res://tests/narrative_delivery.gd"

func walk_to(target: Vector3,seconds: float=8.0) -> bool:
	game.close_menu();var elapsed=0.0;Input.action_press("forward")
	while elapsed<seconds:
		var delta=(target-game.player.position)*Vector3(1,0,1)
		if delta.length()<.12:break
		game.player.yaw=atan2(-delta.x,-delta.z)
		await physics_frame;elapsed+=1.0/60
	Input.action_release("forward")
	for i in 8:await physics_frame
	print("NARRATIVE_WALK ",target," -> ",game.player.position)
	return Vector2(target.x-game.player.position.x,target.z-game.player.position.z).length()<.5

func use_key():
	var event=InputEventKey.new();event.physical_keycode=game.settings.bindings.get("use",game.key_defaults.use);event.keycode=event.physical_keycode;event.pressed=true
	Input.parse_input_event(event);await frames(3);event=event.duplicate();event.pressed=false;Input.parse_input_event(event);await frames(3)

func click_button(prefix: String):
	var target
	for button in game.ui.content.find_children("*","Button",true,false):
		if button.text.begins_with(prefix):target=button;break
	check(target!=null,"Visible action exists: "+prefix)
	if target==null:return
	game.ui.scroller.ensure_control_visible(target);await frames(3)
	var at=root.get_final_transform()*target.get_global_rect().get_center()
	var motion=InputEventMouseMotion.new();motion.position=at;motion.global_position=at;Input.parse_input_event(motion);await frames(2)
	var event=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.button_mask=MOUSE_BUTTON_MASK_LEFT;event.position=at;event.global_position=at;event.pressed=true
	Input.parse_input_event(event);await frames(2)
	event=event.duplicate();event.pressed=false;event.button_mask=0;Input.parse_input_event(event);await frames(3)

func world_tests():
	await super.world_tests()
	check(game.playtests.launch("finale-transfer"),"Native berth walking checkpoint launches");await frames(5)
	var berth=game.finale.berth
	# An actual capsule-sized obstruction in the user's construction subtree
	# must keep the safety gate shut; clearing it opens without teleporting.
	var obstacle=MMFAssets.box(game.building,Vector3(.4,2,2.1),Vector3(12,17,0),MMFAssets.material(Color(.4,.3,.2)))
	await frames(3);game.finale.gangway_open=false;game.world.set_dock_open(false);game.finale.update()
	check(game.finale.access_obstructed() and not game.finale.gangway_open,"Construction at gangway blocks deployment")
	obstacle.queue_free();await frames(3);game.finale.update()
	check(game.finale.gangway_open and berth.access_clear(),"Removing obstruction reopens supported passage")
	game.player.set_physics_process(true)
	for i in 12:await physics_frame
	var recoveries=game.player.boundary.recoveries
	for at in [Vector3(0,16.03,0),Vector3(8,16.03,0),Vector3(14,16.03,0),Vector3(15.3,16.03,-1.5)]:check(await walk_to(at),"Walk to berth reference: "+str(at))
	await use_key();check(game.ui.page=="Finale" and game.ui.storage_id=="reference","Normal Use opens local maintenance reference")
	await capture("reference-walking")
	game.close_menu()
	check(await walk_to(Vector3(17.5,16.03,-3.3)),"Walk to receiving coupler")
	await use_key();await click_button("SELECT NEXT CHANNEL");await click_button("CLOSE ISOLATOR")
	check(game.session.finale.powered,"Normal local clicks power the berth")
	game.close_menu();check(await walk_to(Vector3(20.6,16.03,-3.3)),"Walk to seed enclosure")
	await use_key();await click_button("TRANSFER SEEDS")
	game.close_menu();check(await walk_to(Vector3(22.6,16.03,-.8)),"Walk to archive receiver")
	await use_key();await click_button("IMPORT ARCHIVE COPY")
	game.close_menu()
	for at in [Vector3(21,16.03,0),Vector3(21,16.03,3.2),Vector3(22.6,16.03,3.2)]:check(await walk_to(at),"Walk around console to access transmitter: "+str(at))
	await use_key();await click_button("PREVIEW RELAY CHAIN")
	DisplayServer.window_set_size(Vector2i(1200,900));game.settings.terminal_text_scale=1.3;game.ui.terminal.apply_preferences();game.ui.refresh();await frames(4)
	await capture("policy-large-text");await click_button("CONFIRM COMMUNICATION POLICY")
	check(game.session.finale.policy=="relay","Normal preview and confirmation publish chosen policy")
	await click_button("CREDITS / KEEP WALKING");check(game.ui.page=="Record","Credits can be opened after publishing")
	game.close_menu();check(await walk_to(Vector3(19,16.03,0)),"Walk back through berth aisle")
	game.player.set_physics_process(false)
	var review_camera=Camera3D.new();game.add_child(review_camera);review_camera.global_position=Vector3(10,23,13);review_camera.look_at(Vector3(19,17.3,-1));review_camera.make_current()
	await capture("berth-overview");review_camera.queue_free();game.player.camera.make_current();game.player.set_physics_process(true)
	for at in [Vector3(14,16.03,0),Vector3(8,16.03,0),Vector3(0,16.03,0)]:check(await walk_to(at),"Walk back aboard: "+str(at))
	check(game.aboard() and game.player.boundary.recoveries==recoveries,"Supported berth round trip uses no fall recovery")
	game.player.set_physics_process(false)
	game.settings.terminal_text_scale=1;game.ui.terminal.apply_preferences();DisplayServer.window_set_size(Vector2i(1440,900))
	check(game.playtests.launch("story-array-comparison"),"Array comparison checkpoint launches");await frames(4)
	var point=game.campaign.points.filter(func(p):return p.entry.get("kind","")=="narrative")[0]
	check(preload("res://tests/expedition_fixture.gd").stand_at(game,point),"Array evidence reader has supported reachable position")
	game.campaign.interact(point.entry);await click_button("COMPARE BOTH REFERENCES")
	check(game.narrative.comparison,"Array comparison uses a local reached reader")
	await capture("array-comparison")
	game.open_menu("Inventory");check(game.ui.context_pages()==["Inventory","Records"],"Wrist stays personal after story and finale controls")
	game.open_menu("Build");game.terminal_pages.catalog_selected="floor";game.ui.refresh();await click_button("PLACE")
	check(not game.menu_open and game.building.selected=="floor","Build Place returns to world after new menus")
	game.building.cancel();game.close_menu()
