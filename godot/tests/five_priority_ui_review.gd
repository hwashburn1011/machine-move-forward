extends SceneTree

var game
var checks=0
var failures=[]
var screenshots=[]
var source_start=""
var output="res://../docs/godot-port/previews/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://five-priority-native-ui-review/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(n: int=3):
	for i in n:await process_frame

func settle():
	await create_timer(.5).timeout;await frames(3)

func capture(name: String):
	game.ui.toast_time=0;game.ui.toast.text=""
	await frames(3);await RenderingServer.frame_post_draw
	var path=output+"five-priority-"+name+".png"
	root.get_texture().get_image().save_png(path);screenshots.append(path)

func key(action: String,pressed: bool):
	var event=InputEventKey.new();event.physical_keycode=int(game.settings.bindings.get(action,game.key_defaults[action]));event.keycode=event.physical_keycode;event.pressed=pressed
	Input.parse_input_event(event);await frames(2)

func tap(action: String):
	await key(action,true);await key(action,false)

func click(point: Vector2):
	var at=root.get_final_transform()*point
	var motion=InputEventMouseMotion.new();motion.position=at;motion.global_position=at;Input.parse_input_event(motion);await frames(2)
	var event=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.button_mask=MOUSE_BUTTON_MASK_LEFT;event.position=at;event.global_position=at;event.pressed=true
	Input.parse_input_event(event);await frames(2)
	event=event.duplicate();event.pressed=false;event.button_mask=0;Input.parse_input_event(event);await frames(3)

func action_button(value: String) -> Button:
	for button in game.ui.content.find_children("*","Button",true,false):
		if button.get_meta("terminal_action","")==value:return button
	return null

func aim(cell: Dictionary):
	# Retain the normal player's camera position and aim from that shoulder.
	# There is no detached review camera or wide spectator viewpoint.
	game.player.camera.look_at(game.building.center(cell),Vector3.UP)
	game.player.camera.reset_physics_interpolation()
	game.building.update(0)
	await frames(3)

func free_cell() -> Dictionary:
	for z in [-3,-4,-2]:
		for x in [-2,-3,-1,2,3]:
			var cell={"x":x,"y":0,"z":z}
			if game.building.placement_report({"definitionId":"floor","cell":cell,"rotation":0}).valid:return cell
	return {}

func run():
	if DisplayServer.get_name()=="headless":print("Native review requires a renderer.");quit(2);return
	Engine.max_fps=60;DisplayServer.window_set_size(Vector2i(1440,900))
	source_start=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	await frames(6)
	check(game.playtests.launch("scanner"),"Native review launches isolated receiver-ready checkpoint")
	game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	game.player.yaw=0;game.player.pitch=-.18;game.player.update_camera(1)
	game.player.play("armed_idle");game.session.health=100
	game.guidance.toggle_pin("build","crate");game.ui.guidance_left=0;await settle()
	check(game.ui.objective.text.contains("PINNED") and game.ui.objective.text.contains("START THE SCAN"),"HUD combines truthful objective and a single manual material pin")
	await capture("objective-pin-1440x900")
	for size in [Vector2i(1440,900),Vector2i(1200,900)]:
		DisplayServer.window_set_size(size)
		game.settings.terminal_text_scale=1.3 if size.x==1200 else 1.0
		game.ui.terminal.apply_preferences()
		game.terminal_pages.catalog_selected="floor";game.open_menu("Build");await settle()
		var place=action_button("place:floor")
		check(place!=null and place.is_visible_in_tree() and game.ui.scroller.get_global_rect().encloses(place.get_global_rect()),"PLACE remains visible inside catalog at "+str(size))
		check(not game.ui.terminal.presenting() and game.player.camera.current,"Construction retains independent player camera at "+str(size))
		await capture("catalog-"+str(size.x)+"x"+str(size.y))
		game.open_menu("Inventory");await settle()
		check(game.ui.terminal.active and game.ui.content.find_children("*","Label",true,false).any(func(label):return label.text.contains("PINNED")),"Personal wrist shows the informational pin at "+str(size))
		check(game.ui.context_pages()==["Inventory","Records"],"Wrist retains only personal pack/log tabs at "+str(size))
		await capture("personal-pin-"+str(size.x)+"x"+str(size.y))
	DisplayServer.window_set_size(Vector2i(1440,900));game.settings.terminal_text_scale=1;game.ui.terminal.apply_preferences()
	game.terminal_pages.catalog_selected="floor";game.open_menu("Build");await settle()
	var place=action_button("place:floor")
	await click(place.get_global_rect().get_center())
	check(not game.menu_open and game.building.selected=="floor" and game.player.camera.current and not game.ui.terminal.presenting(),"Actual PLACE click immediately restores playable construction context")
	var cell=free_cell()
	check(not cell.is_empty(),"Native construction has a valid reachable candidate")
	if cell.is_empty():await finish();return
	await aim(cell)
	var cost=int(game.data.BUILD_PIECES.floor.cost.scrap)
	var scrap=game.session.count_resource("scrap");var count=game.session.structures.size();var ammo=game.session.weapons.rifle.ammoInMag
	await capture("placement-controls")
	await click(root.get_visible_rect().size*.5)
	check(game.session.structures.size()==count+1 and game.session.count_resource("scrap")==scrap-cost,"Actual world click builds one part at its ordinary paid cost")
	check(game.session.weapons.rifle.ammoInMag==ammo,"Closing the catalog and placing do not leak a weapon shot")
	await aim(cell);await tap("build_copy")
	check(game.building.selected=="floor" and game.building.moving=="" and game.session.structures.size()==count+1,"Actual copy key selects a blueprint without a free instance")
	var second=free_cell();await aim(second)
	await click(root.get_visible_rect().size*.5)
	check(game.session.structures.size()==count+2 and game.session.count_resource("scrap")==scrap-cost*2,"Copied blueprint placement charges normal resources")
	await tap("build_undo")
	check(game.session.structures.size()==count+1 and game.session.count_resource("scrap")==scrap-cost,"Actual undo key removes only the last part and refunds the paid amount")
	game.building.choose("refinery");game.building.manual_level=0;await aim(cell)
	check(game.building.report.valid and not game.building.report.warnings.is_empty(),"Native preview distinguishes valid-but-underpowered placement")
	check(game.ui.prompt.text.contains("Deck 3") and game.ui.prompt.text.contains("Scrap Metal") and game.ui.prompt.text.contains("Power"),"Native placement HUD shows deck, actual materials and power")
	await capture("power-clearance-controls")
	await tap("pause")
	check(game.building.selected=="" and not game.menu_open,"Cancel restores normal movement without opening the wrist")
	var start=game.player.position
	game.player.set_physics_process(true)
	await key("right",true);await frames(22);await key("right",false);await frames(4)
	game.player.set_physics_process(false)
	check(game.player.position.distance_to(start)>.5 and game.aboard(),"Real movement still walks the Nomad after placement, copy and undo")
	game.ui.guidance_left=0;await frames(3);await capture("walking-after-build")
	await finish()

func finish():
	var source_end=MMFPlaytestRecorder.source_fingerprint()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"source_hash":source_start,"source_hash_end":source_end,"source_stable":source_start==source_end,"renderer":RenderingServer.get_video_adapter_name(),"screenshots":screenshots,"human_test":false,"benchmark":false,"scope":"Native controlled input/layout review. Concurrent headless correctness runs; no performance inference."}
	var file=FileAccess.open("res://../docs/godot-port/results/five-priority-ui-review-2026-09-28.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	print("FIVE_PRIORITY_UI_REVIEW ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
