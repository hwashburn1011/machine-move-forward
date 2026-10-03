extends "res://tests/recovery_operations.gd"

func _initialize():
	super._initialize()
	Engine.max_fps=60
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,900))

func walk_to(target: Vector3,seconds: float=6.0) -> bool:
	var elapsed=0.0;Input.action_press("forward")
	while elapsed<seconds:
		var delta=(target-game.player.position)*Vector3(1,0,1)
		if delta.length()<.10:break
		game.player.yaw=atan2(-delta.x,-delta.z)
		await physics_frame;elapsed+=1.0/60
	Input.action_release("forward")
	for i in 10:await physics_frame
	print("ENGINEERING_WALK ",target," -> ",game.player.position)
	return Vector2(target.x-game.player.position.x,target.z-game.player.position.z).length()<.5

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
	check(game.playtests.launch("operations-loads"),"Native route begins in isolated operations checkpoint")
	game.set_physics_process(false);game.close_menu();game.player.set_physics_process(true)
	for i in 12:await physics_frame
	check(await walk_to(Vector3(0,16.03,4)),"Walk from checkpoint to top-deck aisle")
	check(await walk_to(Vector3(-10,16.03,4)),"Walk along top deck toward fixed stairs")
	check(await walk_to(Vector3(-12,16.03,4)),"Enter permanent stair landing")
	check(await walk_to(Vector3(-12,12.43,-4)),"Walk down permanent stairs from top deck")
	check(absf(game.player.position.y-12.43)<.2,"Service deck landing is grounded")
	var path=service_path()
	check(not path.is_empty(),"Permanent supported path reaches an engineering cabinet")
	for at in path:check(await walk_to(at),"Walk supported service aisle "+str(at))
	check(game.engineering.near(),"Walking route ends within actual service reach")
	game.player.set_physics_process(false);game.player.camera.make_current();game.player.update_camera(1)
	game.player.camera.look_at(game.engineering.nearest_anchor()+Vector3.UP*.4);game.player.camera.reset_physics_interpolation()
	await capture("cabinet-walking")
	var event=InputEventKey.new();event.physical_keycode=game.settings.bindings.get("use",game.key_defaults.use);event.keycode=event.physical_keycode;event.pressed=true
	Input.parse_input_event(event);await frames(3);event=event.duplicate();event.pressed=false;Input.parse_input_event(event);await frames(3)
	check(game.ui.page=="Machine" and game.engineering.authorized(),"Actual Use key opens reached cabinet")
	game.engineering.view="modes";game.ui.refresh()
	await click_button("PREVIEW DEFENSE")
	check(not game.engineering.pending.is_empty(),"Actual click creates reviewed mode proposal")
	await click_button("APPLY OPERATING MODE")
	check(game.session.operations.mode=="defense","Actual Apply click changes mode once")
	check(game.session.weapons.rifle.ammoInMag==game.data.WEAPONS.rifle.magazineSize,"Station clicks do not fire weapon")
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1200,900))
	game.settings.terminal_text_scale=1.3;game.ui.terminal.apply_preferences();game.engineering.view="service";game.ui.refresh();await frames(4)
	await capture("service-large-4x3")
	check(game.ui.scroller.get_global_rect().size.x>600,"Large-text service uses a usable scrolling panel")
	game.open_menu("Inventory");check(game.ui.context_pages()==["Inventory","Records"],"Wrist remains personal after operating machinery")
	game.terminal_pages.catalog_selected="floor";game.open_menu("Build");await frames(3)
	await click_button("PLACE")
	check(not game.menu_open and game.building.selected=="floor","Build Place returns to world after engineering and wrist")
	game.building.cancel();game.close_menu()
	game.settings.terminal_text_scale=1;game.ui.terminal.apply_preferences()
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,900))
	await super.world_tests()

func service_path() -> Array:
	# Plan only through actual supported capsule clearance, then walk the route
	# with the unmodified controller. No collision bypass or teleport is used.
	var start=Vector2i(roundi(game.player.position.x*2),roundi(game.player.position.z*2))
	var queue=[start];var parents={start:start};var found=start;var success=false
	while not queue.is_empty():
		var at=queue.pop_front();var point=Vector3(at.x*.5,12.49,at.y*.5)
		if game.engineering.anchors.any(func(anchor):return point.distance_to(anchor)<1.9):found=at;success=true;break
		for direction in [Vector2i(1,0),Vector2i(-1,0),Vector2i(0,1),Vector2i(0,-1)]:
			var next=at+direction
			if parents.has(next) or absi(next.x)>29 or absi(next.y)>29:continue
			var target=Vector3(next.x*.5,12.49,next.y*.5)
			if not game.player.boundary.fits(target):continue
			var parameters=PhysicsTestMotionParameters3D.new();parameters.from=Transform3D(Basis.IDENTITY,point);parameters.motion=target-point
			if PhysicsServer3D.body_test_motion(game.player.get_rid(),parameters):continue
			parents[next]=at;queue.append(next)
	if not success:return []
	var cells=[found]
	while found!=start:found=parents[found];cells.push_front(found)
	var path=[]
	for i in range(1,cells.size()):
		if i==cells.size()-1 or cells[i]-cells[i-1]!=cells[i+1]-cells[i]:path.append(Vector3(cells[i].x*.5,12.43,cells[i].y*.5))
	print("SERVICE_PATH ",path)
	return path
