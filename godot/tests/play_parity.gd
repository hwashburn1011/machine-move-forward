extends SceneTree

var game
var checks=0
var failures=[]
var output=""

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-test-campaigns/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1
	print("PASS " if ok else "FAIL ",label)
	if not ok: failures.append(label)

func frames(count: int):
	for i in count: await physics_frame

func key(code: int,pressed: bool):
	var event=InputEventKey.new();event.physical_keycode=code;event.keycode=code;event.pressed=pressed
	Input.parse_input_event(event)
	await process_frame

func tap(code: int):
	await key(code,true);await key(code,false)

func capture(name: String):
	if DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+name+".png")

func press_button(label: String) -> bool:
	for child in game.ui.content.get_children():
		if child is Button and child.text==label and not child.disabled:
			child.pressed.emit();return true
	return false

func run():
	output=ProjectSettings.globalize_path("res://../test-results/godot-native/")
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.bindings={};game.configure_input()
	game.started=true;game.session.opening_done=true;game.close_menu()
	game.salvage.next_distance=1000000000.0
	await frames(20)
	check(game.player.is_on_floor(),"Normal player starts on a supported deck")
	check(not game.invulnerable,"Play fixture has real damage enabled")
	check(not game.world.receiver.visible and game.world.receiver_body.collision_layer==0,"Missing receiver is hidden and cannot block the deck")
	game.player.teleport(Vector3(-11,16.1,9));game.player.yaw=PI/2;game.player.pitch=0.05;game.player.update_camera(1)
	await tap(KEY_F)
	check(game.salvage.busy() and game.salvage.hook_visual.visible and game.salvage.cable.visible,"Physical F throws a visible hook with no cargo")
	await frames(20)
	check(game.salvage.hook_distance>8 and game.salvage.hook_distance<=34,"Empty hook flies out at source range/speed")
	await capture("parity-hook-empty")
	var before=game.salvage.hook_distance
	await tap(KEY_F)
	check(game.salvage.hook_distance>=before,"Second F does not reset the active throw")
	await frames(110)
	check(not game.salvage.busy() and not game.salvage.cable.visible,"Missed hook returns and cable disappears")
	check(not game.session.facts.salvage,"Empty throw grants no cargo or radio")
	# Aim at real drifting cargo from the lower fishing deck, then drive the key.
	game.player.teleport(Vector3(-12,8.95,-4));await frames(15)
	var crate=game.salvage.crates[0]
	crate.active=true;crate.node.show();crate.claimed="";crate.opened=false
	crate.node.position=Vector3(-19,2,-16)
	# Real spawns are fitted to the rendered dune before the player can aim.
	game.salvage.ground_crate(crate,0);crate.node.reset_physics_interpolation()
	var aim=(crate.node.position-game.salvage.hand_position()).normalized()
	game.player.yaw=atan2(-aim.x,-aim.z);game.player.pitch=asin(aim.y);game.player.update_camera(1)
	check(game.salvage.aimed_crate()==0,"Cargo in the crosshair is identified")
	await tap(KEY_F)
	check(not game.safe_to_save(),"Saving is blocked while a hook is in flight")
	await frames(22)
	check(game.salvage.reel_index==0,"Outbound hook physically catches drifting cargo")
	await capture("parity-hook-cargo")
	await frames(85)
	check(game.session.facts.salvage and game.session.scanner.phase=="awaiting-module","Reeled cargo grants the first receiver and scanner objective")
	check(game.world.receiver.visible and game.world.receiver_body.collision_layer==1 and not game.world.receiver_module.visible,"Recovered receiver appears with collision and an empty module socket")
	check(not crate.active and game.salvage.reel_index==-1,"Claimed cargo is removed after transfer")
	game.player.teleport(Vector3(2,16.1,-8.3));await frames(12)
	await tap(KEY_E)
	check(game.menu_open and game.ui.page=="Signal" and paused,"E opens the recovered receiver service panel")
	game.session.inventory.add("scanner-replacement-module",1)
	check(press_button("INSTALL REPLACEMENT MODULE") and game.session.scanner.phase=="installed","Install-module UI consumes the component and enables the scanner")
	check(press_button("START RECEIVER SCAN") and not game.menu_open and not paused,"Start-scan UI returns to gameplay rather than freezing the scan")
	await frames(10)
	check(game.session.scanner.elapsedS>0 and game.world.receiver_module.visible,"Powered scanner progresses and shows the installed module")
	game.player.teleport(Vector3(0,16.1,-8.3));await frames(10);await tap(KEY_E)
	check(game.ui.page=="Helm" and game.menu_open,"Nearby receiver does not steal the helm interaction")
	game.close_menu()
	await key(KEY_C,true);await frames(3)
	check(game.player.crouched,"Browser C crouch shortcut works")
	await key(KEY_C,false)
	# Combat input, reload, refuel gesture and slot switching stay usable after menus.
	await frames(2)
	var ammo=game.session.weapons.rifle.ammoInMag
	Input.action_press("fire");await frames(5)
	# Headless DisplayServer cannot capture a mouse. Rendered runs exercise the
	# held-button path; headless runs exercise the same weapon and reload rules.
	if DisplayServer.get_name()=="headless": game.player.fire()
	check(game.session.weapons.rifle.ammoInMag<ammo,"Fire resumes normally after closing a terminal")
	Input.action_release("fire")
	await tap(KEY_R);check(game.player.reload_left>0,"Physical R starts reload")
	await frames(150)
	check(game.session.weapons.rifle.ammoInMag==game.data.WEAPONS.rifle.magazineSize,"Reload restores the rifle magazine")
	await tap(KEY_2);check(game.session.current_weapon=="shotgun","Physical 2 equips the shotgun")
	await tap(KEY_1);check(game.session.current_weapon=="rifle","Physical 1 restores the rifle")
	# Building, terminal, remapping and mounted input contexts.
	game.building.choose("floor");await tap(KEY_F)
	check(not game.salvage.busy(),"F cannot throw during construction")
	await tap(KEY_ESCAPE)
	check(game.building.selected=="" and not game.menu_open,"Escape exits build placement without trapping the player")
	await tap(KEY_TAB)
	check(game.menu_open and paused,"Wrist terminal pauses the whole game aboard")
	var distance=game.session.distance
	for i in 6: await process_frame
	check(game.session.distance==distance,"Machine stays paused while inspecting inventory")
	await tap(KEY_F);check(not game.salvage.busy(),"Terminal typing does not throw a hook")
	await tap(KEY_TAB);check(not game.menu_open and not paused,"Tab restores live controls")
	game.settings.bindings.reel=KEY_H;game.configure_input()
	await tap(KEY_F);check(not game.salvage.busy(),"Old reel key stops working after remap")
	await tap(KEY_H);check(game.salvage.busy(),"Remapped physical key throws the hook")
	game.salvage.cancel();game.settings.bindings.erase("reel");game.configure_input()
	# Radiation must rescue to a validated platform, not drain health on a flat Y test.
	game.player.teleport(Vector3(-12,12.49,4));await frames(15)
	var safe=game.player.position
	var hp=game.session.health
	var rescues=game.player.boundary.recoveries
	game.player.teleport(Vector3(-20,-0.15,3));await frames(3)
	check(game.player.boundary.recoveries==rescues+1,"Flat radioactive ground triggers precontact recovery")
	check(game.player.position.distance_to(safe)<0.5 and game.session.health==hp,"Recovery preserves health and returns to the last supported platform")
	# Find an actual raised dune at the current travel distance. A fixed point
	# can be a trough, and a 2 cm margin races the moving terrain between ticks.
	var dune=Vector3.ZERO;var dune_edge=-INF
	for x in [40,60,80,100]:
		for z in [-100,-60,-20,20,60]:
			var candidate=Vector3(x,0,z);var edge=game.player.boundary.terrain_edge(candidate)
			if edge>dune_edge: dune=candidate;dune_edge=edge
	check(dune_edge>0.75,"Radiation fixture samples an actual raised dune")
	dune.y=dune_edge-.3
	game.player.teleport(dune);await frames(3)
	check(game.player.boundary.recoveries==rescues+2,"Raised dunes use the rendered terrain height")
	game.player.teleport(Vector3(-12,8.95,-4));await frames(10)
	check(game.player.boundary.recoveries==rescues+2 and game.player.position.y>8.7,"Lowest deck is safe above radioactive terrain")
	# A live off-machine inventory must not freeze the player in mid-air.
	game.player.teleport(Vector3(-35,3,-5));game.open_menu("Inventory")
	check(not paused,"Off-machine inventory is not a floating pause platform")
	await frames(60)
	check(game.player.boundary.recoveries>rescues+2 and game.player.position.y>8,"Gravity and radiation remain active in off-machine inventory")
	game.close_menu()
	# A built extension is still aboard and remains a valid recovery surface.
	var floor_piece=game.session.create_piece("floor",{"x":7,"y":0,"z":5},0,{},true)
	game.building.add_visual(floor_piece)
	game.player.teleport(Vector3(14,16.1,10));await frames(15)
	check(game.aboard(),"Player-built extension counts as part of the machine")
	await tap(KEY_TAB);check(paused,"Terminal pauses on an extended deck tile")
	await tap(KEY_TAB)
	game.building.demolish(floor_piece.instanceId)
	await frames(4)
	game.player.teleport(Vector3(30,-1,0));await frames(4)
	check(game.player.boundary.fits(game.player.position) and game.player.position.x<13.5,"Removed floor cannot be used as a recovery anchor")
	# Use an actual expedition collision surface and then invalidate its docking root.
	game.session.story.phase="route-selection";game.session.story.index=0
	check(game.campaign.begin_route(),"Boundary fixture can start a real expedition")
	game.session.distance=game.session.story.arrival;game.session.speed=0;game.campaign.update(0.1)
	game.player.teleport(Vector3(19,16.1,0));await frames(15)
	var dock_safe=game.player.position
	check(game.player.is_on_floor(),"Destination gangway supplies actual physics support")
	game.player.teleport(Vector3(32,-1,0));await frames(4)
	check(game.player.position.distance_to(dock_safe)<0.5,"Falling from a destination returns to its supported platform")
	game.session.story.phase="locked"
	game.campaign.destination.queue_free();game.campaign.destination=null;game.campaign.points.clear()
	game.world.set_dock_open(false);await frames(3)
	game.player.teleport(Vector3(32,-1,0));await frames(4)
	check(game.aboard() and game.player.position.x<13.5,"Departed destination is discarded as a recovery anchor")
	# Mounted death formerly returned before advancing the respawn clock.
	var turret=game.session.create_piece("turret-manual",{"x":3,"y":0,"z":4},0,{},true)
	game.building.add_visual(turret);game.session.update_power()
	game.player.teleport(Vector3(6,16.1,9));await frames(5)
	game.open_menu("Machine");game.service_piece(turret)
	check(game.manual_turret==turret.instanceId and not game.menu_open and not paused,"Mounting from Machine terminal closes it and resumes aiming")
	await tap(KEY_F);check(not game.salvage.busy(),"Mounted gun blocks personal grapple")
	await tap(KEY_ESCAPE);check(game.manual_turret=="" and not game.menu_open,"Escape dismounts the deck gun")
	game.service_piece(turret)
	game.player.take_damage(200)
	check(game.session.health==0 and game.manual_turret=="" and game.player.camera.get_parent()==game.player.arm,"Lethal mounted hit restores the player camera")
	await tap(KEY_F);await tap(KEY_B);await tap(KEY_TAB)
	check(not game.salvage.busy() and not game.menu_open and game.building.selected=="","Dead players cannot grapple, build or open the terminal")
	await frames(185)
	check(game.session.health==100 and game.player.hit_grace>0 and not game.player.dead,"Mounted death completes the normal 3-second respawn")
	game.player.take_damage(10);check(game.session.health==100,"Respawn grace protects against an immediate death loop")
	check(game.player.boundary.fits(game.player.position),"Respawn point is supported and unoccupied")
	await capture("parity-recovered")
	# Validate terminal restoration and cancel stale throw state on campaign load.
	game.session.attack_recent=0;game.player.hit_grace=0
	check(game.save_game("native-parity"),"Recovered campaign can be saved")
	await tap(KEY_F)
	game.load_game("native-parity");await frames(3)
	check(not game.salvage.busy() and not game.salvage.cable.visible,"Loading clears an in-flight hook and cable")
	game.open_menu("Pause")
	while game.combat.nav.is_baking(): await create_timer(0.02).timeout
	var audio_refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear()
	check(await preload("res://tests/audio_drain.gd").finish(self,audio_refs),"Shutdown releases in-flight hook and synthetic audio streams")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"renderer":RenderingServer.get_video_adapter_name()}
	var file=FileAccess.open(output+"play-parity.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	# Let the suspended run() stack release its locals before engine shutdown.
	call_deferred("quit",0 if failures.is_empty() else 1)
