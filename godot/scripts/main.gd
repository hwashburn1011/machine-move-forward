extends Node3D

var data: Dictionary
var runtime: Dictionary
var session: MMFSession
var player: MMFPlayer
var world: MMFWorld
var building: MMFBuilding
var combat: MMFCombat
var salvage: MMFSalvage
var effects: MMFEffects
var audio: MMFAudio
var campaign: MMFCampaign
var cinematics: MMFCinematics
var ui: MMFUI
var home: MMFHome
var caretaker: MMFCaretaker
var opportunities: MMFOpportunities
var menu_open=true
var cinematic=""
var invulnerable=false
var interaction_prompt=""
var settings={"sensitivity":1.0,"fov":55.0,"volume":0.7,"ambient":0.10,"vsync":true,"quality":"high","bindings":{}}
var key_defaults=MMFControls.DEFAULTS
var hint_cache={}
var autosave_clock=0.0
var autosaver=MMFAutosaver.new()
var hook_cut=0.0
var hook_cut_target=0
var started=false
var manual_turret=""
var manual_fire_clock=0.0
var benchmark
var journey=MMFJourney.new()
var activity=MMFDestinationActivity.new()
var story_art=MMFStoryArt.new()
var terminal_pages=MMFTerminalPages.new()

func _ready():
	process_mode=Node.PROCESS_MODE_ALWAYS
	data=MMFAssets.json("res://data/definitions.json")
	# Static machine physics lives in the compiled scene. Only the small build
	# piece contracts are needed during play; retain the full bake for authoring.
	runtime=MMFAssets.json("res://data/runtime-play.json")
	if FileAccess.file_exists("user://settings.json"):
		var saved=MMFAssets.json("user://settings.json")
		if saved is Dictionary: settings.merge(saved,true)
	configure_input()
	session=MMFSession.new(data)
	add_child(autosaver)
	autosaver.completed.connect(func(success):
		if not success:session.notify("Save failed. Your previous checkpoint was kept."))
	journey.game=self;activity.game=self;story_art.game=self;terminal_pages.game=self
	world=MMFWorld.new();add_child(world);world.setup(self)
	building=MMFBuilding.new();add_child(building);building.setup(self)
	effects=MMFEffects.new();add_child(effects)
	audio=MMFAudio.new();add_child(audio)
	player=MMFPlayer.new();add_child(player);player.setup(self)
	combat=MMFCombat.new();add_child(combat);combat.setup(self)
	salvage=MMFSalvage.new();add_child(salvage);salvage.setup(self)
	campaign=MMFCampaign.new();add_child(campaign);campaign.setup(self)
	cinematics=MMFCinematics.new();add_child(cinematics);cinematics.setup(self)
	home=MMFHome.new();add_child(home);home.setup(self)
	caretaker=MMFCaretaker.new();add_child(caretaker);caretaker.setup(self)
	opportunities=MMFOpportunities.new();add_child(opportunities);opportunities.setup(self)
	effects.machine_atmosphere(self)
	audio.setup(self)
	ui=MMFUI.new();add_child(ui);ui.setup(self)
	journey.reset()
	story_art.setup()
	session.contact_ready.connect(func():cinematics.begin_signal())
	save_settings()
	player.update_camera(1)
	for child in [world,building,effects,player,combat,salvage,campaign,cinematics,home,caretaker,opportunities]: child.process_mode=Node.PROCESS_MODE_PAUSABLE
	open_menu("Title")
	if get_tree().has_meta("new_native_campaign"):
		get_tree().remove_meta("new_native_campaign")
		new_game()
	if "--quick" in OS.get_cmdline_user_args():
		started=true
		session.opening_done=true
		close_menu()
		invulnerable=true
	print("MMF_NATIVE_READY ",RenderingServer.get_video_adapter_name())

func configure_input():
	settings.bindings=MMFControls.normalize(settings.get("bindings",{}))
	hint_cache.clear()
	reset_interaction_hold()
	for action in key_defaults:
		if not InputMap.has_action(action): InputMap.add_action(action)
		Input.action_release(action)
		InputMap.action_erase_events(action)
		var event=InputEventKey.new()
		event.physical_keycode=int(settings.bindings.get(action,key_defaults[action]))
		InputMap.action_add_event(action,event)
	# Keep the browser's secondary crouch key unless the player remapped it.
	if not settings.bindings.has("crouch") and KEY_C not in settings.bindings.values():
		var alternate=InputEventKey.new();alternate.physical_keycode=KEY_C
		InputMap.action_add_event("crouch",alternate)
	for spec in [["fire",MOUSE_BUTTON_LEFT],["aim",MOUSE_BUTTON_RIGHT]]:
		if not InputMap.has_action(spec[0]): InputMap.add_action(spec[0])
		InputMap.action_erase_events(spec[0])
		var event=InputEventMouseButton.new()
		event.button_index=spec[1]
		InputMap.action_add_event(spec[0],event)
	if opportunities: opportunities.refresh_labels()
	if combat and is_instance_valid(combat.hook): combat.hook.label=hint("Hold {key:use} to cut grapple")
	if ui: ui.refresh_control_labels()

func save_settings():
	var file=null if get_tree().has_meta("test_mode") else FileAccess.open("user://settings.json",FileAccess.WRITE)
	if file: file.store_string(JSON.stringify(settings))
	if audio:
		audio.volume=settings.volume
		audio.ambient=settings.ambient
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if settings.vsync else DisplayServer.VSYNC_DISABLED)
	apply_quality()

func key_label(action: String) -> String:
	return MMFControls.label(settings.bindings,action)

func hint(message: String) -> String:
	if not "{key:" in message: return message
	if hint_cache.has(message): return hint_cache[message]
	var result=message
	for action in key_defaults: result=result.replace("{key:"+action+"}",key_label(action))
	for action in ["fire","aim"]: result=result.replace("{key:"+action+"}",key_label(action))
	hint_cache[message]=result
	return result

func _input(event):
	if ui==null or ui.binding_action!="": return
	if cinematics.opening_stage.requested:
		if event.is_action_pressed("pause"):
			open_menu("Title");get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("pause"):
		if cinematic!="": cinematics.finish()
		elif manual_turret!="": dismount_turret()
		elif not menu_open and building.selected!="": building.cancel()
		elif menu_open and started: close_menu()
		else: open_menu("Pause" if started else "Title")
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("terminal") and cinematic=="" and started and session.health>0 and manual_turret=="":
		if menu_open: close_menu()
		else: open_menu("Inventory")
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("use") and not menu_open and cinematic=="" and building.selected=="" and session.health>0: interact()

func open_menu(page: String):
	if started and session.health<=0 and page not in ["Pause","Title","Settings","Library"]: return
	if page!="Departure":cinematics.opening_stage.cancel()
	reset_interaction_hold()
	menu_open=true
	# The browser wrist terminal pauses the whole simulation while aboard.
	get_tree().paused=page in ["Title","Pause","Library","Settings","Departure"] or (page!="Build" and started and aboard())
	if page in ["Title","Library"]:autosaver.flush()
	if page not in ["Build","Pause","Settings"]: building.cancel()
	if started: player.play("armed_idle")
	Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	refresh_fieldwork_power(page)
	ui.open(page)

func close_menu():
	if not started: return
	ui.cancel_binding()
	menu_open=false
	refresh_fieldwork_power()
	get_tree().paused=false
	Input.mouse_mode=Input.MOUSE_MODE_CAPTURED
	ui.panel.hide()
	player.suppress_fire=true

func new_game():
	if cinematics.opening_stage.requested:return
	if started or session.clock>0:
		get_tree().set_meta("new_native_campaign",true)
		get_tree().reload_current_scene()
		return
	if cinematics.opening_stage.prepared():
		started=true;close_menu();cinematics.begin_opening()
	else:
		open_menu("Departure")
		cinematics.opening_stage.request()

func _physics_process(dt):
	if session==null or get_tree().paused: return
	journey.update(dt)
	story_art.update(dt)
	terminal_pages.update(dt)
	if cinematic=="":
		session.tick(dt,not combat.active_threat() and (not menu_open or ui.page=="Signal"),aboard())
		combat.update(dt)
		if combat.active_threat() and menu_open and ui.page=="Build": close_menu();building.cancel()
		salvage.update(dt)
		building.update(dt)
		campaign.update(dt)
		home.update(dt)
		opportunities.update(dt)
		update_interaction(dt)
		autosave_clock+=dt
		if autosave_clock>=60 and safe_to_save():
			save_game("autosave")
	world.update(dt)
	cinematics.update(dt)
	effects.update(dt)

func raycast(from: Vector3,to: Vector3,exclude: Array=[],mask: int=1) -> Dictionary:
	var query=PhysicsRayQueryParameters3D.create(from,to,mask)
	query.exclude=exclude
	query.hit_back_faces=true
	return get_world_3d().direct_space_state.intersect_ray(query)

func crosshair_hit(length: float=4) -> Dictionary:
	return raycast(player.camera.global_position,player.camera.global_position-player.camera.global_basis.z*length,[player.get_rid()],5)

func aboard() -> bool:
	if (absf(player.position.x)<13.5 and absf(player.position.z)<15.5 or player.position.x>=-15 and player.position.x<=-11 and absf(player.position.z)<5) and player.position.y>8: return true
	# User-built deck extensions are part of the Nomad too.
	var support=player.boundary.support_at(player.position)
	return not support.is_empty() and player.boundary.support_root(support.collider)==self

func weapon_definition() -> Dictionary:
	var def=data.WEAPONS[session.current_weapon].duplicate(true)
	match session.weapons[session.current_weapon].get("attachment",""):
		"rifle-stabilizer":
			def.spread*=0.55;def.aimSpread*=0.55;def.recoil*=0.65;def.reloadTime*=1.15
		"rifle-burst-cam": def.fireRate=12
		"shotgun-choke":
			def.spread*=0.6;def.aimSpread*=0.6;def.range*=1.35;def.falloffStart*=1.25;def.fireRate*=0.8
		"shotgun-scatter-brake":
			def.spread*=1.2;def.aimSpread*=1.2;def.range*=0.75;def.falloffStart*=0.8;def.fireRate*=1.25
	return def

func stable_for_research() -> bool:
	return started and session.opening_done and session.health>0 and aboard() and cinematic=="" and not combat.active_threat() and combat.ship_state=="none" and not combat.encounter_had_enemies and session.story.phase in ["locked","signal","raids","route-selection","docked","complete"]

func research_refusal(removing: bool=false) -> String:
	if not session.facts.salvage: return "Recover the radio receiver first."
	if not stable_for_research(): return "Return aboard and finish the current encounter or journey first."
	session.update_power()
	if not removing and not session.powered.get("fixed-radio",false): return "The receiver needs power."
	return ""

func research_action(action: String,id: String) -> bool:
	var refusal=research_refusal(action=="remove")
	if refusal!="": session.notify(refusal);return false
	match action:
		"research": return session.begin_research(id)
		"fit": return session.activate_upgrade(id)
		"remove": return session.deactivate_upgrade(id)
	return false

func refresh_fieldwork_power(page: String=""):
	var terminal_page=ui.page if page=="" else page
	session.fieldwork_active=menu_open and terminal_page in ["Inventory","Storage","Workshop","Machine","Signal","Helm","Records","Record","Shelf"] and started and aboard() and session.has_station("workbench") and "relay-foundry" in session.story.completed
	session.update_power()

func attachment_refusal() -> String:
	if "relay-foundry" not in session.story.completed: return "Complete Relay Foundry to unlock attachments."
	if not session.has_station("workbench"): return "Build a functional workbench."
	if not menu_open or not stable_for_research(): return "Use the wrist terminal aboard after the encounter."
	refresh_fieldwork_power()
	if not session.powered.get("fixed-fieldwork",false): return "Fieldwork tools require 1 power."
	return ""

func fit_attachment(id: String) -> bool:
	var refusal=attachment_refusal()
	if refusal!="": session.notify(refusal);return false
	if not data.WEAPON_ATTACHMENTS.has(id): return false
	var def=data.WEAPON_ATTACHMENTS[id]
	if id not in session.attachment_research:
		if not session.pay(def.cost):
			session.notify("Not enough materials.")
			return false
		session.attachment_research.append(id)
	session.weapons[def.weaponId].attachment=id
	if def.weaponId==session.current_weapon: player.cancel_reload()
	session.notify(def.name+" fitted.")
	return true

func remove_attachment(weapon_id: String) -> bool:
	var refusal=attachment_refusal()
	if refusal!="": session.notify(refusal);return false
	if not session.weapons.has(weapon_id): return false
	session.weapons[weapon_id].attachment=""
	if weapon_id==session.current_weapon: player.cancel_reload()
	session.notify("Attachment removed.")
	return true

func nearest_piece() -> Dictionary:
	var best={}
	var nearest=2.6
	for p in session.structures:
		if p.definitionId=="floor": continue
		var length=building.center(p.cell).distance_to(player.position)
		if length<nearest:
			best=p
			nearest=length
	return best

func near_receiver() -> bool:
	var distance=player.position.distance_to(world.receiver.global_position)
	return session.facts.salvage and distance<2.4 and distance<helm_distance()

func helm_distance() -> float:
	return player.position.distance_to(world.helm_model.root.global_position)

func interaction_target() -> Dictionary:
	if menu_open or session.health<=0 or cinematic!="" or building.selected!="": return {}
	if manual_turret!="": return {"kind":"turret","text":"CREWING DECK GUN · [{key:use}] Dismount"}
	if combat.ship_state=="grapple" and combat.hook_health>0 and is_instance_valid(combat.hook) and player.position.distance_to(combat.hook.position)<2.6:
		return {"kind":"hook","target":combat.hook,"text":"HOLD [{key:use}] CUT GRAPPLE"}
	if near_receiver(): return {"kind":"receiver","text":"[{key:use}] SCANNER / RECEIVER"}
	var optional=opportunities.nearest()
	if not optional.is_empty():
		return {"kind":"optional","target":optional,"text":("HOLD [{key:use}] " if optional.id=="service" else "[{key:use}] ")+optional.text}
	var nearby=campaign.nearest()
	if not nearby.is_empty(): return {"kind":"campaign","target":nearby,"text":"[{key:use}] "+nearby.label}
	var p=nearest_piece()
	if not p.is_empty(): return {"kind":"piece","target":p,"text":"[{key:use}] "+data.BUILD_PIECES[p.definitionId].name}
	if helm_distance()<3: return {"kind":"helm","text":"[{key:use}] NAVIGATION HELM"}
	return {}

func reset_interaction_hold():
	hook_cut=0
	hook_cut_target=0
	if opportunities: opportunities.reset_service_hold()

func update_interaction(dt: float):
	var selected=interaction_target()
	interaction_prompt=hint(selected.get("text",""))
	var kind=selected.get("kind","")
	var held=Input.is_action_pressed("use")
	opportunities.update_service_hold(dt,kind=="optional" and selected.target.id=="service" and held)
	if kind!="hook" or not held:
		hook_cut=0;hook_cut_target=0
		return
	var target=selected.target
	if hook_cut_target!=target.get_instance_id(): hook_cut=0;hook_cut_target=target.get_instance_id()
	hook_cut+=dt
	if hook_cut>=1.2:
		combat.cut_hook(target.position)
		reset_interaction_hold()
		interaction_prompt=""

func interact():
	var selected=interaction_target()
	match selected.get("kind",""):
		"turret": dismount_turret()
		"receiver": open_menu("Signal")
		"optional": opportunities.interact(selected.target)
		"campaign": campaign.interact(selected.target)
		"piece": service_piece(selected.target)
		"helm": open_menu("Helm")

func service_piece(p: Dictionary):
	if session.health<=0: return
	if p.definitionId in ["generator","turret-manual","chair"] and building.center(p.cell).distance_to(player.position)>2.6:
		session.notify("Approach this equipment on the deck to use it.")
		return
	match p.definitionId:
		"generator":
			if session.refuel(): player.equipment.refuel()
		"crate","collector-auto":
			ui.storage_id=p.instanceId
			open_menu("Storage")
		"workbench","refinery","stove": open_menu("Workshop")
		"chair": home.rest(p)
		"shelf": ui.storage_id=p.instanceId;open_menu("Shelf")
		"caretaker-dock": open_menu("Machine")
		"turret-manual":
			if p.health<=0: session.notify("Repair the deck gun first.");return
			if not session.powered.get(p.instanceId,false): session.notify("Deck gun needs 3 power.");return
			close_menu()
			salvage.cancel();building.cancel()
			manual_turret=p.instanceId
			player.set_camera_fade(0)
			session.facts.defenseCrewed=true
			player.camera.reparent(self)
			player.yaw=-int(p.rotation)*PI/2
			player.pitch=0
		"condenser","planter","seed-garden":
			var id="water" if p.definitionId=="condenser" else "greens"
			var stored=int(p.state.get("stored",0))
			p.state.stored=session.add_resource(id,stored)
			if p.definitionId=="seed-garden" and p.state.get("water",0)<2 and session.pay({"water":1}): p.state.water=p.state.get("water",0)+1
			session.notify("Harvest transferred. Stored: %d" % p.state.stored)
		_: session.repair(p.instanceId)

func dismount_turret():
	if manual_turret=="": return
	manual_turret=""
	player.camera.reparent(player.arm,false)
	player.camera.position=Vector3.ZERO
	player.camera.rotation=Vector3.ZERO
	player.suppress_fire=true
	player.update_camera(1)
	player.camera.reset_physics_interpolation()

func update_manual_turret(dt: float):
	var p=session.find_piece(manual_turret)
	if p.is_empty() or p.health<=0 or not session.powered.get(manual_turret,false):
		dismount_turret()
		return
	var def=data.TURRETS["manual-turret"]
	var base=-int(p.rotation)*PI/2
	player.yaw=base+clampf(wrapf(player.yaw-base,-PI,PI),def.traverse.yawMin,def.traverse.yawMax)
	player.pitch=clampf(player.pitch,def.traverse.pitchMin,def.traverse.pitchMax)
	var direction=-Basis.from_euler(Vector3(player.pitch,player.yaw,0)).z
	var origin=building.center(p.cell)+Vector3.UP*1.35
	player.camera.global_position=origin-direction*1.0+Vector3.UP*0.25
	player.camera.look_at(origin+direction*20)
	var root_piece=building.bodies[manual_turret]
	var yaw_node=MMFAssets.find_named(root_piece,"TurretYaw")
	var pitch_node=MMFAssets.find_named(root_piece,"TurretPitch")
	if yaw_node: yaw_node.rotation.y=player.yaw-base
	if pitch_node: pitch_node.rotation.x=player.pitch
	manual_fire_clock=maxf(0,manual_fire_clock-dt)
	interaction_prompt=hint("CREWING DECK GUN · [{key:use}] Dismount")
	if Input.is_action_pressed("fire") and manual_fire_clock<=0:
		var mods=session.modifiers()
		manual_fire_clock=1.0/(def.fireRate*mods.turretRateMultiplier)
		var result=raycast(origin+direction*0.9,origin+direction*def.range,[player.get_rid()],5)
		var end=origin+direction*def.range if result.is_empty() else result.position
		if not result.is_empty() and result.collider.has_method("take_damage"): result.collider.take_damage(def.damage*mods.turretDamageMultiplier,result.position)
		effects.tracer(origin+direction*0.9,end,Color(1,0.55,0.13))
		audio.cue(65,0.25,-14,true)

func safe_to_save() -> bool:
	return started and session.opening_done and cinematic=="" and session.health>0 and session.attack_recent<=0 and not combat.active_threat() and aboard() and not salvage.busy() and manual_turret==""

func save_game(id: String) -> bool:
	if not safe_to_save():
		if id!="autosave": session.notify("Finish the salvage throw before saving." if salvage.busy() else ("Leave the deck gun before saving." if manual_turret!="" else "Return aboard and secure the deck before saving."))
		return false
	var payload={"session":session.native_snapshot(),"player":{"position":MMFAssets.dict_v(player.position),"yaw":player.yaw,"pitch":player.pitch},"salvageDistance":salvage.next_distance,"cargo":salvage.snapshot(),"loot":combat.loot_view.snapshot()}
	if id=="autosave":
		# An accepted autosave means queued, not durable yet. Success/failure is
		# harvested by the always-processing helper. Bound failure retries too.
		autosave_clock=0
		return autosaver.request(payload,MMFSaves.DIRECTORY)
	autosaver.flush()
	var result=MMFSaves.write(id,payload)
	if not result: session.notify("Save failed. Your previous checkpoint was kept.")
	elif id!="autosave": session.notify("Campaign saved: "+id)
	return result

func load_game(id: String):
	autosaver.flush()
	load_payload(MMFSaves.read(id))

func load_payload(payload: Dictionary):
	if not payload.get("session") is Dictionary:
		session.notify("Invalid or incompatible native campaign.")
		return
	if not MMFLootView.valid_snapshot(payload.get("loot",[]),data.ITEMS):
		session.notify("Invalid recovered supplies in campaign save.");return
	var trial=MMFSession.new(data)
	var position_data=payload.get("player",{}).get("position",{"x":0,"y":16.1,"z":-1}) if payload.get("player",{}) is Dictionary else null
	if not position_data is Dictionary: session.notify("Invalid player position.");return
	for axis in ["x","y","z"]:
		if not MMFSaveValidation.number(position_data.get(axis),-2000,2000): session.notify("Invalid player position.");return
	for angle in ["yaw","pitch"]:
		if not MMFSaveValidation.number(payload.get("player",{}).get(angle,0),-1e12,1e12): return
	if not trial.restore_native(payload.session):
		session.notify("Campaign validation failed.")
		return
	autosaver.flush()
	session=trial
	cinematics.opening_stage.cancel(true)
	autosave_clock=0
	dismount_turret()
	salvage.cancel()
	cinematics.clear_scene()
	cinematic=""
	if cinematics.rooftop: cinematics.rooftop.queue_free();cinematics.rooftop=null
	if campaign.destination: campaign.destination.queue_free();campaign.destination=null;campaign.points.clear()
	if opportunities.site: opportunities.site.queue_free();opportunities.site=null;opportunities.points.clear()
	for shell in combat.shells: shell.marker.queue_free()
	combat.shells.clear()
	for drop in combat.loot: drop.node.queue_free()
	combat.loot.clear()
	combat.loot_view.clear();ui.loot_readout.clear()
	combat.boarding.clear()
	if combat.hook: combat.hook.queue_free();combat.hook=null
	world.set_dock_open(false)
	session.notice.connect(ui.notify)
	session.contact_ready.connect(func():cinematics.begin_signal())
	for enemy in combat.enemies:
		if is_instance_valid(enemy): enemy.queue_free()
	combat.enemies.clear()
	if combat.ship: combat.ship.queue_free()
	combat.ship=null
	combat.ship_state="none"
	combat.encounter_had_enemies=false
	building.cancel()
	building.rebuild()
	combat.layout_changed()
	combat.mission.cancel()
	caretaker.spawned=false;caretaker.job={};caretaker.phase="idle"
	home.invalidate_layout();home.chair_id=""
	opportunities.schedule_armed=false
	world.refresh_chunks(true)
	player.position=MMFAssets.v(payload.get("player",{}).get("position",{"x":0,"y":16.1,"z":-1}))
	player.velocity=Vector3.ZERO
	player.yaw=payload.get("player",{}).get("yaw",0)
	player.pitch=payload.get("player",{}).get("pitch",-0.08)
	player.switch_weapon(session.current_weapon)
	salvage.next_distance=payload.get("salvageDistance",session.distance+60)
	for crate in salvage.crates:
		crate.active=false
		crate.node.visible=false
	if session.contacts.active.get("state","")=="departing":
		session.contacts.visited.append(session.contacts.active.id)
		session.contacts.nextSlot=int(session.contacts.active.slot)+1
		session.contacts.active={}
	salvage.restore(payload.get("cargo",[]))
	campaign.restore_destination()
	if session.contacts.active.get("state","") in ["committed","docked","visited"]:
		opportunities.create_site()
		world.set_dock_open(session.contacts.active.state in ["docked","visited"])
	combat.loot_view.restore(payload.get("loot",[]))
	player.death_left=0
	player.dead=false;player.hit_grace=0;player.reload_left=0;player.burst_left=0
	player.boundary.clear()
	player.restore_placement_frames=2
	player.reset_physics_interpolation()
	started=true
	close_menu()
	player.update_camera(1)
	journey.reset(true)
	activity.entry={};terminal_pages.locate_left=0;terminal_pages.selected="";ui.hit_left=0
	story_art.update(0)
	if session.story.phase=="arrival": cinematics.begin_arrival()
	elif session.story.phase=="crossfire": cinematics.begin_signal()
	elif not session.opening_done: cinematics.begin_opening()

func apply_quality():
	if not world or not world.world_environment: return
	var quality=settings.get("quality","high")
	get_viewport().msaa_3d=Viewport.MSAA_4X if quality=="high" else Viewport.MSAA_2X if quality=="medium" else Viewport.MSAA_DISABLED
	world.world_environment.environment.ssao_enabled=quality=="high"
	world.world_environment.environment.glow_enabled=quality!="low"
	get_viewport().positional_shadow_atlas_size=4096 if quality=="high" else 2048 if quality=="medium" else 1024
