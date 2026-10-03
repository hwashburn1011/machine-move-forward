extends SceneTree

# Real controls on the live forearm screen, isolated campaign/settings fixtures.
var game
var failures=[]
var checks=0
var output=""
var report={"resolutions":[],"timings":{}}

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-wrist-terminal-tests/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count: int):
	for i in count:await process_frame

func capture(name: String):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+"wrist-"+name+".png")

func measure_display():
	if DisplayServer.get_name()=="headless":return
	var rid=game.ui.terminal.viewport.get_viewport_rid()
	var main_rid=root.get_viewport_rid()
	RenderingServer.viewport_set_measure_render_time(rid,true)
	RenderingServer.viewport_set_measure_render_time(main_rid,true)
	var cpu=[];var gpu=[];var main_gpu=[]
	for i in 24:
		game.ui.terminal.redraw();await RenderingServer.frame_post_draw
		cpu.append(RenderingServer.viewport_get_measured_render_time_cpu(rid))
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(rid))
		main_gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(main_rid))
	cpu.sort();gpu.sort();main_gpu.sort()
	report.timings={"scope":"Wrist 1120x792 redraw and native arm/machine view while aboard simulation paused; 24 rendered samples, 1440x810 window, Vulkan RTX3070; rendering only", "displayCpuMedianMs":cpu[12],"displayGpuMedianMs":gpu[12],"displayGpuMaxMs":gpu.back(),"mainViewGpuMedianMs":main_gpu[12],"idleRefreshHz":10,"closedViewport":"disabled"}

func settle():
	await create_timer(.55).timeout
	await frames(3)

func key(code: int):
	var event=InputEventKey.new();event.keycode=code;event.physical_keycode=code;event.pressed=true
	Input.parse_input_event(event);await frames(2)
	event=event.duplicate();event.pressed=false;Input.parse_input_event(event);await frames(2)

func physical_pointer(point: Vector2) -> Vector2:
	var terminal=game.ui.terminal
	var uv=point/Vector2(terminal.viewport.size)
	var local=terminal.SCREEN_CENTER+Vector3((uv.x-.5)*terminal.SCREEN_SIZE.x,(.5-uv.y)*terminal.SCREEN_SIZE.y,0)
	return terminal.camera.unproject_position(terminal.device.to_global(local))

func click_control(control: Control):
	# parse_input_event takes window coordinates; normal viewport dispatch then
	# applies the stretch transform before MMFWristTerminal receives the event.
	var center=control.get_global_rect().get_center()
	var point=root.get_final_transform()*(physical_pointer(center) if game.ui.terminal.active else center)
	var motion=InputEventMouseMotion.new();motion.position=point;motion.global_position=point
	Input.parse_input_event(motion);await frames(2)
	var event=InputEventMouseButton.new();event.button_index=MOUSE_BUTTON_LEFT;event.button_mask=MOUSE_BUTTON_MASK_LEFT;event.position=point;event.global_position=point;event.pressed=true
	Input.parse_input_event(event);await frames(2)
	event=event.duplicate();event.pressed=false;event.button_mask=0;Input.parse_input_event(event);await frames(3)

func button_named(prefix: String) -> Button:
	for child in game.ui.content.find_children("*","Button",true,false):
		if child.text.begins_with(prefix):return child
	return null

func button_tag(tag: String,value: String) -> Button:
	for child in game.ui.content.find_children("*","Button",true,false):
		if child.get_meta(tag,"")==value:return child
	return null

func run():
	Engine.max_fps=60
	output=ProjectSettings.globalize_path("res://../test-results/godot-native/")
	DirAccess.make_dir_recursive_absolute(output)
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	await frames(6)
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.teleport(Vector3(0,16.1,-1));game.player.yaw=0;game.player.pitch=-.08;game.player.update_camera(1)
	game.player.visual.rotation.y=PI;game.player.play("armed_idle")
	var terminal=game.ui.terminal
	check(terminal.screen!=null and terminal.device.get_parent() is BoneAttachment3D,"Blender display is attached to actual left forearm")
	check(terminal.screen.material_override==terminal.screen_material,"Actual screen material uses dynamic viewport texture")
	check(not terminal.screen_material.get_shader_parameter("display_live"),"Fresh closed cuff uses dark glass without sampling unrendered viewport")
	await capture("fresh-closed")
	var initial_shoulder=game.player.shoulder
	var initial_yaw=game.player.yaw
	await key(KEY_TAB);await settle()
	check(game.menu_open and game.ui.page=="Inventory" and terminal.active,"Tab opens physical inventory")
	check(game.ui.panel.get_parent()==terminal.display_root and terminal.camera.current,"Functional controls and view belong to physical screen")
	check(game.get_tree().paused and terminal.blend>.99,"Arm and camera open while aboard simulation is paused")
	check(not game.player.rifle_mesh.visible and not game.player.shotgun_mesh.visible,"Weapons lower while reading terminal")
	await capture("inventory-16x9")
	await measure_display()
	var center=physical_pointer(Vector2(terminal.viewport.size)*.5)
	check(terminal.project_pointer(center).distance_to(Vector2(terminal.viewport.size)*.5)<.1,"Projected pointer resolves display center accurately")
	var sort=button_tag("terminal_action","sort-pack")
	check(sort!=null,"Inventory retains authoritative sort action")
	if sort:
		await click_control(sort)
	check(game.menu_open and game.ui.page=="Inventory","Mouse click on real 3D display activates without firing")
	game.session.inventory.add("repair-kit",1);game.session.health=50;game.ui.refresh();await frames(4)
	var repair_entry=button_tag("terminal_entry","repair-kit")
	if repair_entry:await click_control(repair_entry)
	await key(KEY_ENTER)
	var focused=terminal.viewport.gui_get_focus_owner()
	check(focused is Button and focused.get_meta("terminal_action","")=="use:repair-kit","Keyboard Enter on selected inventory row focuses its use action")
	await key(KEY_ENTER)
	check(game.session.health>50 and game.session.inventory.count_item("repair-kit")==0,"Keyboard Enter performs authoritative inventory use")
	game.session.health=100
	await key(KEY_RIGHT);await frames(5)
	check(game.ui.page=="Records","Keyboard right changes between personal pack and log")
	await capture("records")
	for page in ["Build","Workshop","Machine","Signal"]:
		game.open_menu(page);await settle()
		check(game.ui.panel.get_parent()==game.ui.root and not terminal.active and game.ui.content.get_child_count()>0,page+" uses an independent screen")
		await capture(page.to_lower())
	game.session.story.uniques.append("course-actuator")
	game.open_menu("Helm");await settle()
	var sliders=game.ui.content.get_children().filter(func(c):return c is HSlider)
	if not sliders.is_empty():
		var slider=sliders[0];slider.grab_focus();var before=slider.value
		await key(KEY_RIGHT)
		check(game.ui.page=="Helm" and slider.value>before and game.session.target_course==slider.value,"Focused helm slider retains keyboard course control")
	else:check(false,"Focused helm slider retains keyboard course control")
	game.open_menu("Records")
	game.ui.show_record("Recovered maintenance note","The evening shift left a dry seat and a charging lead for whoever came next.\n\nSomeone wrote two names beneath the workbench: one human, one machine.")
	await settle();await capture("record")
	check(terminal.active and game.ui.page=="Record","Recovered records remain on forearm display")
	game.ui.show_record("Long field record",("A workshop log: preserve the repair notes for whoever comes next.\n\n").repeat(40))
	await frames(4)
	var scroll=game.ui.content.get_parent()
	var wheel=InputEventMouseButton.new();wheel.button_index=MOUSE_BUTTON_WHEEL_DOWN;wheel.pressed=true
	wheel.position=root.get_final_transform()*physical_pointer(Vector2(terminal.viewport.size)*Vector2(.5,.65));wheel.global_position=wheel.position
	var scroll_motion=InputEventMouseMotion.new();scroll_motion.position=wheel.position;scroll_motion.global_position=wheel.position
	Input.parse_input_event(scroll_motion);await frames(2)
	for i in 5:
		var pressed=wheel.duplicate();pressed.pressed=true;Input.parse_input_event(pressed);await frames(1)
		var released=wheel.duplicate();released.pressed=false;Input.parse_input_event(released);await frames(1)
	check(scroll.scroll_vertical>0,"Mouse wheel scrolls long records on actual display")
	var wheel_scroll=scroll.scroll_vertical
	await key(KEY_PAGEDOWN)
	check(scroll.scroll_vertical>wheel_scroll,"Page Down reads long records without pointer input")
	var crate=game.session.create_piece("crate",{"x":3,"y":0,"z":3},0,{},true)
	game.building.add_visual(crate)
	var bag=game.session.stores[crate.instanceId]
	bag.add("scrap",2)
	game.ui.storage_id=crate.instanceId;game.open_menu("Storage");await settle()
	var count=game.session.inventory.count_item("scrap")
	var stored=bag.count_item("scrap")
	await click_control(button_named("TAKE ALL"))
	check(game.session.inventory.count_item("scrap")==count+stored and bag.count_item("scrap")==0,"Real screen click transfers storage through existing inventory authority")
	await capture("storage")
	for size in [Vector2i(1280,800),Vector2i(1200,900),Vector2i(1920,810)]:
		if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(size)
		game.open_menu("Inventory");await settle()
		var corners=[]
		for uv in [Vector2.ZERO,Vector2.ONE,Vector2(1,0),Vector2(0,1)]:corners.append(physical_pointer(uv*Vector2(terminal.viewport.size)))
		var rect=root.get_visible_rect();var inside=corners.all(func(p):return rect.has_point(p))
		check(inside,"Screen fits aspect "+str(size.x)+"x"+str(size.y))
		var point=physical_pointer(Vector2(terminal.viewport.size)*Vector2(.25,.75))
		check(terminal.project_pointer(point).distance_to(Vector2(terminal.viewport.size)*Vector2(.25,.75))<.2,"Pointer mapping survives aspect "+str(size))
		report.resolutions.append({"window":str(size),"screenFits":inside,"viewport":str(root.get_visible_rect().size)})
		await capture(str(size.x)+"x"+str(size.y))
	game.settings.terminal_text_scale=1.3;game.settings.terminal_reduced_motion=true
	terminal.apply_preferences();await settle()
	check(terminal.viewport.size.x<terminal.DISPLAY_SIZE.x,"Text scaling enlarges all logical screen controls")
	await capture("large-text")
	await key(KEY_ESCAPE);await settle()
	check(not game.menu_open and not terminal.presenting() and game.player.camera.current,"Escape restores gameplay camera and closes device")
	check(game.player.shoulder==initial_shoulder and game.player.yaw==initial_yaw,"Opening preserves gameplay shoulder and camera aim")
	check(game.player.suppress_fire,"Closing suppresses menu click from becoming a shot")
	check(terminal.viewport.render_target_update_mode==SubViewport.UPDATE_DISABLED,"Closed display stops rendering")
	check(not terminal.screen_material.get_shader_parameter("display_live"),"Closed display returns to inert glass")
	game.session.weapons.rifle.ammoInMag=1;game.player.reload_weapon()
	var reload=game.player.reload_left
	game.open_menu("Inventory");await settle()
	check(reload>0 and game.player.reload_left==reload,"Paused terminal preserves an in-progress reload")
	game.close_menu();await settle();game.player.cancel_reload()
	game.open_menu("Inventory");await settle();game.invulnerable=false
	game.player.hit_grace=0;game.player.take_damage(2);await settle()
	check(not game.menu_open and not terminal.presenting() and game.player.camera.current,"Incoming damage closes terminal and restores gameplay camera")
	game.invulnerable=true;game.session.health=100;game.session.attack_recent=0
	game.open_menu("Inventory");await settle()
	var payload={"session":game.session.native_snapshot(),"player":{"position":MMFAssets.dict_v(game.player.position),"yaw":game.player.yaw,"pitch":game.player.pitch}}
	game.load_payload(payload);await settle()
	check(not game.menu_open and not terminal.presenting() and game.player.camera.current,"Native save restore releases terminal camera and input ownership")
	game.open_menu("Inventory");await settle();game.invulnerable=false
	game.player.hit_grace=0;game.player.take_damage(1000);await settle()
	check(not game.menu_open and not terminal.presenting() and game.player.dead,"Death releases terminal presentation")
	game.session.health=100;game.player.dead=false;game.player.death_left=0;game.session.attack_recent=0;game.invulnerable=true
	game.effects.flash=0;game.ui.toast_time=0;game.ui.hit_left=0
	for posture in [false,true]:
		game.player.crouched=posture;game.player.shoulder=-1;game.settings.fov=90
		game.player.play("armed_crouch_idle" if posture else "armed_idle")
		game.open_menu("Inventory");await settle()
		check(terminal.camera.current and terminal.blend==1,"Display readable with alternate shoulder / "+("crouched" if posture else "standing"))
		await capture("crouched" if posture else "alternate-shoulder")
		game.close_menu();await settle()
	game.open_menu("Settings");await settle()
	check(not terminal.presenting() and game.ui.panel.get_parent()==game.ui.root,"Settings works independently of active character")
	game.close_menu();await settle()
	var pulses=game.ui.reticle.pulse_count
	game.ui.combat_hit("ARMOUR HIT")
	check(game.ui.reticle.pulse_count==pulses,"Informational combat text never confirms a player hit")
	game.ui.confirm_player_hit()
	check(game.ui.reticle.pulse_count==pulses+1 and game.ui.reticle.hit_left>0,"Confirmed player damage creates soft-red shape pulse")
	await capture("confirmed-hit")
	game.player.crouched=false;game.player.play("armed_idle")
	game.effects.flash=0;game.ui.toast_time=0;game.ui.hit_left=0
	game.session.survivor_content.toolAcquired=true;game.building.salvage_tool.set_equipped(true)
	await frames(6)
	check(game.player.equipment.salvage_cutter!=null and game.player.equipment.salvage_cutter.visible and not game.player.rifle_mesh.visible,"Original salvage cutter replaces held firearm")
	if DisplayServer.get_name()!="headless":
		var review=Camera3D.new();game.add_child(review);review.fov=43
		review.global_position=game.player.global_position+Vector3(-1.8,1.4,-2.8)
		review.look_at(game.player.global_position+Vector3.UP*1.15);review.make_current();review.reset_physics_interpolation()
		await frames(15);await capture("salvage-cutter")
		review.queue_free();game.player.camera.make_current()
	game.building.salvage_tool.set_equipped(false)
	game.open_menu("Pause");await settle()
	check(not terminal.presenting() and game.ui.panel.get_parent()==game.ui.root,"Pause retains independent terminal styling")
	while game.combat.nav.is_baking():await create_timer(.05).timeout
	var audio_refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await preload("res://tests/audio_drain.gd").finish(self,audio_refs);MMFAssets.cache.clear()
	report.merge({"checks":checks,"failures":failures,"passed":failures.is_empty(),"renderer":RenderingServer.get_video_adapter_name()})
	var file=FileAccess.open(output+"wrist-terminal.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("WRIST_TERMINAL_REPORT ",JSON.stringify(report));call_deferred("quit",0 if failures.is_empty() else 1)
