extends SceneTree

var game
var checks=0
var failures=[]
var output=""

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-controls-tests/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1
	print("PASS " if ok else "FAIL ",label)
	if not ok: failures.append(label)

func frames(count: int):
	for i in count: await physics_frame

func key(code: int,pressed: bool,echo: bool=false,physical: bool=true):
	var event=InputEventKey.new();event.physical_keycode=code if physical else 0;event.keycode=code;event.pressed=pressed;event.echo=echo
	Input.parse_input_event(event)
	await process_frame

func tap(code: int):
	await key(code,true);await key(code,false)

func capture(name: String):
	if DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+name+".png")

func mapping_unique(mapping: Dictionary) -> bool:
	var seen=[]
	for action in MMFControls.DEFAULTS:
		var code=mapping.get(action,MMFControls.DEFAULTS[action])
		if code in seen: return false
		seen.append(code)
	return true

func button_named(prefix: String) -> Button:
	for child in game.ui.content.find_children("*","Button",true,false):
		if child.text.begins_with(prefix):return child
	return null

func run():
	output=ProjectSettings.globalize_path("res://../test-results/godot-native/")
	check(MMFControls.normalize(null).is_empty(),"Missing or malformed bindings restore usable defaults")
	check(MMFControls.normalize({"reel":0,"use":"K","unknown":KEY_H,"pause":true,"jump":1.5,"reload":KEY_UNKNOWN}).is_empty(),"Invalid saved keys and unknown actions are ignored")
	var cycle={"forward":KEY_S,"back":KEY_D,"right":KEY_W}
	check(MMFControls.normalize(JSON.parse_string(JSON.stringify(cycle)))==cycle,"Saved three-key permutation survives JSON numeric conversion")
	check(mapping_unique(MMFControls.normalize({"forward":KEY_E,"reel":KEY_E,"use":KEY_E})),"Conflicting old mappings recover unique accessible controls")
	var mapping=MMFControls.rebind({},"use",KEY_F)
	check(mapping.get("use")==KEY_F and mapping.get("reel")==KEY_E,"Occupied key swaps both actions")
	check(MMFControls.rebind(mapping,"use",KEY_E).is_empty(),"Restoring a default swaps the displaced control back")
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.bindings={};game.configure_input()
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	await frames(12)
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.salvage.next_distance=1000000000
	game.open_menu("Settings")
	var ui=game.ui
	check(ui.binding_buttons.size()==MMFControls.DEFAULTS.size(),"Settings exposes every keyboard action with a readable name")
	ui.binding_buttons.reel.key.pressed.emit()
	check(ui.binding_action=="reel" and "Escape cancels" in ui.binding_status.text,"Binding button visibly arms capture and explains cancellation")
	await tap(KEY_ESCAPE)
	check(ui.binding_action=="" and game.settings.bindings.is_empty() and game.menu_open and ui.page=="Settings","Escape cancels capture without swapping pause or leaving settings")
	ui.begin_binding("reel")
	await key(KEY_H,true,true)
	check(ui.binding_action=="reel" and game.settings.bindings.is_empty(),"Key repeat cannot accidentally bind a control")
	await key(KEY_H,false)
	check(ui.binding_action=="reel","Key release is ignored while awaiting a new key")
	await key(KEY_H,true,false,false);await key(KEY_H,false,false,false)
	check(ui.binding_action=="reel" and game.settings.bindings.is_empty(),"Logical-only events never install a zero physical key")
	var scroller=ui.content.get_parent()
	scroller.scroll_vertical=650
	await frames(2)
	var scroll=scroller.scroll_vertical
	var button_id=ui.binding_buttons.reel.key.get_instance_id()
	await tap(KEY_H)
	check(game.settings.bindings.get("reel")==KEY_H and ui.binding_action=="","Real key event commits the selected mapping")
	check(scroll>0 and ui.binding_buttons.reel.key.get_instance_id()==button_id and scroller.scroll_vertical==scroll,"Rebinding preserves the settings controls and scroll position")
	check(ui.binding_buttons.reel.key.text==game.key_label("reel") and not "Physical" in ui.binding_buttons.reel.key.text,"Settings shows concise active key labels")
	ui.begin_binding("use");game.open_menu("Inventory")
	check(ui.binding_action=="","Switching terminal tabs cancels capture")
	await tap(KEY_K)
	check(not game.settings.bindings.has("use"),"A key after tab navigation cannot silently rebind an action")
	game.open_menu("Settings");ui.begin_binding("use");game.close_menu()
	check(ui.binding_action=="","Returning to deck cancels capture")
	await tap(KEY_F);check(not game.salvage.busy(),"Former reel key no longer throws salvage hook")
	await tap(KEY_H);check(game.salvage.busy(),"Remapped physical key throws the actual salvage hook")
	game.salvage.cancel()
	game.open_menu("Settings")
	ui.apply_binding("forward",KEY_UP)
	game.close_menu();game.player.set_physics_process(true)
	var start=game.player.position
	await key(KEY_UP,true);await frames(12);await key(KEY_UP,false)
	check(game.player.position.distance_to(start)>.2,"Remapped movement key moves the supported character")
	game.player.set_physics_process(false)
	await key(KEY_UP,true);game.configure_input()
	check(not Input.is_action_pressed("forward"),"Reconfiguration releases held actions rather than leaving movement stuck")
	await key(KEY_UP,false)
	game.open_menu("Settings")
	ui.apply_binding("use",KEY_K);ui.apply_binding("terminal",KEY_I);ui.apply_binding("build",KEY_N);ui.apply_binding("reload",KEY_J);ui.apply_binding("pause",KEY_P)
	ui.apply_binding("reel",KEY_C)
	check(InputMap.action_get_events("crouch").size()==1,"Secondary C crouch yields to a deliberate C binding")
	ui.apply_binding("reel",KEY_H)
	check(InputMap.action_get_events("crouch").size()==2,"Secondary C returns when the key becomes free")
	var persisted=JSON.parse_string(JSON.stringify(game.settings.bindings))
	check(MMFControls.normalize(persisted)==game.settings.bindings and mapping_unique(persisted),"Complete remapped configuration survives a save round trip")
	game.journey.reset();game.session.facts.salvage=false
	game.journey.enqueue("hint","SERVICE NOTE",game.session.objective(),true)
	game.close_menu();game.journey.update(.01);ui._process(0)
	check("[H]" in ui.objective.text and not "{key:" in ui.objective.text,"Salvage objective resolves the real reel binding")
	check("[I]" in ui.prompt.text and "[N]" in ui.prompt.text and "[H]" in ui.prompt.text,"HUD footer matches terminal, construction and reel bindings")
	check("[H]" in ui.transmission.text and not "{key:" in ui.transmission.text,"Queued objective reminder resolves bindings at display time")
	game.session.notify("Recover cargo with [{key:reel}].")
	check("[H]" in ui.toast.text,"Notifications resolve semantic controls")
	game.open_menu("Settings");ui.apply_binding("reel",KEY_Y)
	check("[Y]" in ui.toast.text,"An existing notification updates after a remap")
	game.close_menu();ui._process(0)
	check("[Y]" in ui.transmission.text,"Already active reminders also update after a remap")
	game.journey.reset()
	await tap(KEY_I)
	check(game.menu_open and ui.page=="Inventory" and paused,"Remapped terminal key opens the paused wrist menu")
	check("[I / P]" in ui.return_button.text,"Menu return hint uses the actual terminal and pause keys")
	await tap(KEY_P);check(not game.menu_open and not paused,"Remapped pause key returns control from the terminal")
	await tap(KEY_N);check(game.menu_open and ui.page=="Build","Remapped build key opens the catalogue")
	game.close_menu();game.building.choose("floor")
	var rotation=game.building.rotation_index
	await tap(KEY_K);ui._process(0)
	check(game.building.rotation_index==posmod(rotation+1,4) and not game.menu_open,"Remapped use rotates placement instead of opening equipment")
	check("[Q / K]" in ui.prompt.text and "[G]" in ui.prompt.text and "[RMB]" in ui.prompt.text,"Placement explains active rotation, catalogue and cancel controls")
	await capture("controls-build")
	await tap(KEY_P);check(game.building.selected=="" and not game.menu_open,"Remapped pause cancels construction first")
	# Closing the physical arm display briefly retains input ownership until
	# its camera/weapon handoff completes; test reload after that real motion.
	await create_timer(.26).timeout
	game.player.reload_left=0;game.session.weapons.rifle.ammoInMag=1
	await tap(KEY_J);check(game.player.reload_left>0,"Remapped reload key starts the existing reload")
	game.player.cancel_reload()
	# A real boarding hook beside the receiver must own BOTH prompt and input.
	game.session.facts.salvage=true;game.player.position=Vector3(2,16.03,-8.3)
	game.combat.begin_ship();game.combat.update_ship(game.combat.approach_duration);game.combat.update_ship(1.1)
	game.combat.hook.position=game.player.position+Vector3.RIGHT*.3
	game.update_interaction(0)
	check(game.near_receiver() and game.interaction_target().get("kind")=="hook" and "HOLD [K] CUT" in game.interaction_prompt,"Hook beside receiver has matching priority in the visible prompt")
	await key(KEY_K,true);game.update_interaction(.6)
	check(not game.menu_open and is_equal_approx(game.hook_cut,.6),"Holding displayed key begins cutting without opening the receiver")
	game.player.position+=Vector3(0,0,5);game.update_interaction(.1)
	check(game.hook_cut==0,"Leaving hook reach discards partial cut progress")
	game.player.position-=Vector3(0,0,5);game.update_interaction(.6)
	await key(KEY_K,false);game.update_interaction(.01)
	check(game.hook_cut==0,"Releasing use discards partial cut progress")
	await key(KEY_K,true);game.update_interaction(.7);game.open_menu("Inventory")
	check(game.hook_cut==0,"Opening a menu immediately resets the interrupted cut")
	game.close_menu();game.update_interaction(.7)
	game.building.choose("floor");game.update_interaction(.6)
	check(game.hook_cut==0 and game.combat.ship_state=="grapple" and game.interaction_prompt=="","Placement blocks competing hold interactions and their prompts")
	game.building.cancel();game.update_interaction(.7)
	var original_hook=game.combat.hook
	var replacement=MMFHitZone.new();replacement.setup(game.combat,original_hook.position,Vector3.ONE,func(_amount,_point):pass)
	game.combat.hook=replacement;original_hook.queue_free()
	game.update_interaction(.6)
	check(is_equal_approx(game.hook_cut,.6) and game.combat.ship_state=="grapple","Cut progress never transfers to a replacement hook")
	game.update_interaction(.61)
	check(game.combat.ship_state=="retreat" and game.hook_cut==0,"Uninterrupted 1.2-second hold severs the actual grapple")
	await key(KEY_K,false);game.update_interaction(0)
	check(game.interaction_target().get("kind")=="receiver" and "[K] SCANNER" in game.interaction_prompt,"Retreating hook no longer steals the receiver prompt or interaction")
	await tap(KEY_K);check(game.menu_open and ui.page=="Signal","Displayed receiver prompt executes through the remapped physical key")
	var current_task=button_named("CURRENT TASK")
	if current_task:current_task.pressed.emit()
	var task_labels=ui.content.find_children("*","Label",true,false)
	check(ui.page=="Record" and task_labels.any(func(label):return label.text.begins_with(game.hint(game.session.objective()))) and task_labels.all(func(label):return not "{key:" in label.text),"Receiver task detail resolves objective controls without exposing hint tokens")
	game.close_menu()
	# Service controls use the same arbitration, including a nearby boarding hook.
	game.session.story.phase="route-selection"
	var contact=game.opportunities.make_contact(1);contact.kind="fuel-cache";contact.state="docked"
	game.session.contacts.active=contact;game.opportunities.create_site()
	var service=game.opportunities.points.filter(func(p):return p.id=="service")[0]
	game.player.position=game.opportunities.site.to_global(service.at)-Vector3.UP*.7
	game.update_interaction(0)
	check(game.interaction_target().get("kind")=="optional" and "HOLD [K]" in game.interaction_prompt,"Optional service control shows the same chosen hold action")
	check("HOLD K" in service.label.text,"World-space service label uses the active binding")
	await key(KEY_K,true);game.update_interaction(1.3)
	check(contact.step=="task-ready" and game.opportunities.service_timer==0,"Service preserves the existing helm-steering unlock requirement")
	game.session.story.uniques.append("course-actuator");game.session.story.phase="approach";game.update_interaction(1.3)
	check(contact.step=="task-ready" and game.opportunities.service_timer==0,"Story travel retains priority over optional service")
	game.session.story.phase="route-selection";game.update_interaction(.7)
	check(is_equal_approx(game.opportunities.service_timer,.7),"Service hold accumulates at the original rate")
	game.combat.ship_state="grapple";game.combat.hook_health=60;game.combat.hook=MMFHitZone.new();game.combat.hook.setup(game.combat,game.player.position,Vector3.ONE,func(_a,_p):pass)
	game.update_interaction(.6)
	check(game.opportunities.service_timer==0 and contact.step=="task-ready" and game.hook_cut>.5,"A hook preempts service completely instead of advancing two holds")
	game.combat.ship_state="retreat";game.update_interaction(.7)
	game.player.position+=Vector3(0,0,5);game.update_interaction(.1)
	check(game.opportunities.service_timer==0,"Leaving a service control resets its partial hold")
	game.player.position-=Vector3(0,0,5);game.update_interaction(.6)
	check(contact.step=="task-ready","Interrupted service cannot finish early")
	game.update_interaction(.61)
	check(contact.step=="service-done" and game.opportunities.service_timer==0,"Service completes after an uninterrupted original-duration hold")
	await key(KEY_K,false)
	game.open_menu("Settings");ui.apply_binding("use",KEY_E)
	check("HOLD E" in service.label.text,"Existing world-space labels refresh when controls change")
	await frames(3);scroller.scroll_vertical=1050;await frames(3)
	ui.begin_binding("reel");await capture("controls-settings")
	check(scroller.scroll_vertical>0 and scroller.get_global_rect().intersects(ui.binding_buttons.reel.key.get_global_rect()),"Rendered settings review includes the active binding row")
	check(ui.binding_status.get_global_rect().end.y<ui.return_button.get_global_rect().position.y,"Capture guidance stays visible above the return button while scrolled")
	await tap(KEY_ESCAPE)
	ui.binding_buttons.reel.reset.pressed.emit()
	check(not game.settings.bindings.has("reel"),"Per-action Default restores a changed control")
	var restore_defaults=button_named("RESTORE ALL DEFAULT KEYS")
	if restore_defaults:restore_defaults.pressed.emit()
	check(game.settings.bindings.is_empty() and InputMap.action_get_events("crouch").size()==2,"Restore All reinstates default keys and secondary crouch")
	game.started=false;game.open_menu("Settings");ui.return_button.pressed.emit()
	check(ui.page=="Title","Settings opened before a campaign can return to the title")
	while game.combat.nav.is_baking(): await create_timer(.1).timeout
	var audio_refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear()
	check(await preload("res://tests/audio_drain.gd").finish(self,audio_refs),"Control-test shutdown releases all mixer-owned audio streams")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"renderer":RenderingServer.get_video_adapter_name()}
	var file=FileAccess.open(output+"controls-interactions.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	call_deferred("quit",0 if failures.is_empty() else 1)
