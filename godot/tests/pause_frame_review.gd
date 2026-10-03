extends "res://tests/wrist_terminal.gd"

# Exercise actual input dispatch around the decorative housing, including the
# transition to the separate physical inventory viewport. Saves stay isolated.
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://pause-frame-review/";call_deferred("run")

func capture(id: String):
	await frames(5)
	if DisplayServer.get_name()!="headless":
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(output+id+".png")
	report.resolutions.append({"name":id,"viewport":str(root.size),"panel":str(game.ui.panel.get_global_rect()),"housing":str(game.ui.device_frame.housing),"frame_visible":game.ui.device_frame.visible})

func run():
	Engine.max_fps=60
	output=ProjectSettings.globalize_path("res://../test-results/pause-frame/")
	DirAccess.make_dir_recursive_absolute(output)
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	await frames(20)
	game.open_menu("Settings");await frames(6)
	check(game.ui.device_frame.visible and not game.ui.terminal.presenting(),"Title settings uses the housing without needing an active character")
	check(game.ui.panel.get_global_rect().is_equal_approx(game.ui.device_frame.glass),"First settings open fits the glass after wrapped controls settle")
	await capture("title-settings")
	game.open_menu("Title");await frames(3)
	check(not game.ui.device_frame.visible and game.ui.panel.theme==game.ui.title_screen.menu_theme,"Returning to title releases the device frame and restores the title theme")
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.player.teleport(Vector3(0,16.1,-1));game.player.yaw=0;game.player.pitch=-.08;game.player.update_camera(1)
	await key(KEY_ESCAPE)
	check(game.ui.page=="Pause" and game.ui.device_frame.visible and paused,"Escape opens a framed pause menu and keeps the world paused")
	check(game.ui.device_frame.mouse_filter==Control.MOUSE_FILTER_IGNORE and game.ui.device_frame.focus_mode==Control.FOCUS_NONE,"Housing and decorative keys cannot intercept pointer or keyboard focus")
	await capture("pause-1440")
	await click_control(button_named("SETTINGS"));await frames(5)
	check(game.ui.page=="Settings" and game.ui.device_frame.visible,"Real click opens Settings through the decorative frame")
	var slider=game.ui.content.get_children().filter(func(node):return node is HSlider)[0]
	slider.value=1;slider.grab_focus();await key(KEY_RIGHT)
	check(is_equal_approx(slider.value,1.1) and is_equal_approx(game.settings.terminal_text_scale,1.1),"Keyboard slider adjustment still changes the saved wrist text preference")
	slider.value=1
	await capture("settings-1440")
	var key_button=game.ui.binding_buttons.use.key
	key_button.grab_focus();await frames(8)
	await click_control(key_button);await key(KEY_J)
	check(game.settings.bindings.get("use")==KEY_J and game.ui.binding_action=="","Scrolled key-binding button receives real clicks and captures the replacement key")
	game.ui.apply_binding("use",KEY_E);await frames(4)
	check(game.ui.scroller.scroll_vertical>0,"Keyboard focus scrolls lower controls into view inside the glass")
	await capture("controls-1440")
	await key(KEY_ESCAPE);await frames(4)
	check(not game.menu_open and not game.ui.device_frame.visible and not paused,"Escape closes both glass and housing and resumes the world")
	game.open_menu("Inventory");await settle()
	check(game.ui.terminal.active and game.ui.panel.get_parent()==game.ui.terminal.display_root and not game.ui.device_frame.visible,"Inventory retains the actual forearm device without a second housing")
	check(game.ui.panel.theme==null,"Inventory retains its original shared display theme")
	await capture("inventory-reference")
	await key(KEY_ESCAPE);await settle();await key(KEY_ESCAPE)
	check(game.ui.page=="Pause" and game.ui.device_frame.visible and not game.ui.terminal.presenting(),"Physical wrist-to-pause transition restores the flat device frame")
	for dimensions in [Vector2i(960,540),Vector2i(1200,900),Vector2i(1920,810)]:
		if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(dimensions)
		game.open_menu("Settings");await frames(12)
		var panel=game.ui.panel.get_global_rect();var glass=game.ui.device_frame.glass
		check(glass.position.is_equal_approx(panel.position) and glass.size.is_equal_approx(panel.size),"Glass and interactive panel stay aligned at "+str(dimensions))
		check(root.get_visible_rect().encloses(game.ui.device_frame.housing) and game.ui.scroller.size.y>180,"Device fits viewport and preserves a scrollable screen at "+str(dimensions))
		await capture("settings-%dx%d"%[dimensions.x,dimensions.y])
		game.open_menu("Pause");await frames(4)
		await capture("pause-%dx%d"%[dimensions.x,dimensions.y])
	await click_control(button_named("RESUME"));await frames(4)
	check(not game.menu_open and not game.ui.device_frame.visible and game.player.suppress_fire,"Resume click closes the housing without firing the player's weapon")
	report.merge({"checks":checks,"failures":failures,"passed":failures.is_empty(),"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"Native presentation and actual input dispatch in isolated staged pause/settings/forearm fixtures; not a campaign playtest."})
	var file=FileAccess.open(output+"review.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("PAUSE_FRAME_REVIEW ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
