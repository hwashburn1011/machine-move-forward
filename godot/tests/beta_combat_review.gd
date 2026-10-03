extends SceneTree

# Controlled visual evidence. Guardian uses the real route checkpoint and attack
# state machine. Enemy close views pause representative existing controller states
# on an isolated supported floor; they are not a natural-play difficulty test.
var game
var camera: Camera3D
var output="res://../test-results/beta-next/combat-native/"
var captures=[]
var selected=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://beta-next-combat-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--only="):selected=Array(arg.trim_prefix("--only=").split(","))
	call_deferred("run")

func frames(n=5):
	for i in n:await process_frame

func shot(id: String,eye: Vector3,at: Vector3,metadata: Dictionary={},hud=false):
	if not selected.is_empty() and id not in selected:return
	game.ui.root.visible=hud;camera.global_position=eye;camera.look_at(at);camera.make_current();camera.reset_physics_interpolation()
	if is_instance_valid(game.combat.ship_marker):game.combat.ship_marker.visible=hud
	await frames(10);await RenderingServer.frame_post_draw
	var path=output+id+".png";root.get_texture().get_image().save_png(path)
	captures.append({"id":id,"path":path,"eye":MMFAssets.dict_v(eye),"target":MMFAssets.dict_v(at),"state":metadata})
	print("BETA_COMBAT_CAPTURE ",id)

func phase(name: String):
	for i in 160:
		if game.combat.guardian.phase==name:return
		game.combat.update(.05)
	push_error("Cannot reach guardian phase "+name);quit(1)

func guardian_record() -> Dictionary:
	var c=game.combat;var g=c.guardian
	return {"phase":g.phase,"pattern":g.pattern,"remaining":g.remaining,"completed_cycles":g.completed_cycles,"hull":c.ship_health,"weapon_exposed":g.weapon_exposed(),"shutter_opening":g.presentation.opening,"status":g.status_text(),"marks":c.shells.map(func(shell):return {"target":MMFAssets.dict_v(shell.target),"time":shell.time})}

func run():
	if DisplayServer.get_name()=="headless":push_error("Visual review requires a rendering driver");quit(1);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	if not selected.is_empty() and FileAccess.file_exists(output+"review.json"):
		captures=MMFAssets.json(output+"review.json").captures.filter(func(item):return item.id not in selected)
	DisplayServer.window_set_size(Vector2i(1600,1000));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game;await frames()
	game.playtests.launch("gatekeeper");game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	game.player.hit_grace=1000;game.player.position=Vector3(-4,16.1,2);game.player.hide();game.close_menu();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	camera=Camera3D.new();camera.fov=52;camera.far=1200;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF;game.add_child(camera)
	await frames();game.session.distance+=21;game.campaign.update(.1);game.combat.update_ship(game.combat.approach_duration)
	var c=game.combat;var g=c.guardian
	c.craft.update(1)
	await shot("01-gatekeeper-lock",Vector3(7,18,-4),c.ship.position+Vector3(0,2,0),guardian_record(),true)
	await shot("02-g01-complete-carrier",c.ship.position+Vector3(8,6,-10),c.ship.position+Vector3(0,1.8,0),guardian_record())
	await shot("03-g01-identity-and-relay",c.ship.to_global(Vector3(3.4,4,.2)),c.ship.to_global(Vector3(.6,2.95,.3)),guardian_record())
	var recoil=c.craft.recoil
	await shot("04-fire-control-armored",recoil.to_global(Vector3(.95,.75,-1.55)),recoil.to_global(Vector3(.05,.25,0)),guardian_record())
	phase("salvo")
	await shot("05-line-fixed-ground-marks",Vector3(-4,19.1,-8),Vector3(-4,16,2),guardian_record(),true)
	phase("cooling");c.update(.3)
	await shot("06-cooling-counterattack",Vector3(7,18,-4),c.ship.position+Vector3(0,2,0),guardian_record(),true)
	await shot("07-fire-control-shutters-open",recoil.to_global(Vector3(.95,.75,-1.55)),recoil.to_global(Vector3(.05,.25,0)),guardian_record())
	# Explicit later-cycle fixture: damage and two completed cycles are both
	# required. The same real lock/salvo controller generates the five marks.
	game.effects.update(4);await frames(100) # Let the real GPU impact fire expire while the encounter fixture is paused.
	c.ship_health=200;g.completed_cycles=2;g.begin_lock();c.update(.01)
	await shot("08-cross-pattern-warning",Vector3(7,18,-4),c.ship.position+Vector3(0,2,0),guardian_record(),true)
	phase("salvo")
	await shot("09-cross-fixed-ground-marks",Vector3(-4,19.1,-8),Vector3(-4,16,2),guardian_record(),true)
	phase("cooling");c.update(.3)
	await shot("10-cross-extended-cooling",Vector3(7,18,-4),c.ship.position+Vector3(0,2,0),guardian_record(),true)
	game.load_payload(game.playtests.payload("gatekeeper"));await frames();game.set_physics_process(false);game.player.set_physics_process(false);game.player.hide();game.close_menu();game.ui.root.hide()
	MMFAssets.box(game,Vector3(12,.2,12),Vector3(60,15.94,0),MMFAssets.material(Color(.15,.16,.15)))
	game.player.position=Vector3(60,16.04,4)
	for kind in ["scavenger","raider","warden","revenant","bastion","sovereign"]:
		var e=game.combat.spawn(kind,Vector3(60,16.04,0));e.set_physics_process(false);e.visual.rotation.y=0;e.play("idle",true)
		if e.animator:e.animator.advance(.2);e.animator.pause()
		e.mission="assault";e.committed=game.player.position+Vector3.UP;e.lunge_direction=Vector3.BACK
		var states=["closing"] if kind=="scavenger" else ["sabotage"] if kind=="raider" else ["rifle_lock"] if kind=="warden" else ["blade_commit","blade_recover"] if kind=="revenant" else ["burst_lock","vent"] if kind=="bastion" else ["relay_lock","shield_relay","relay_broken"]
		for state in states:
			e.windup=.8 if state in ["rifle_lock","burst_lock","relay_lock"] else 0
			e.phase="telegraph" if state=="blade_commit" else "recovery" if state=="blade_recover" else "vent" if state=="vent" else "idle"
			if state=="sabotage":e.mission="sabotage";e.mission_subsystem="engine"
			if state=="relay_broken":
				e.equipment.disable_drone(e);game.effects.update(1.2);await frames(100)
			e.tactical_marker.visible=e.windup>0 or e.phase in ["telegraph","vent"]
			e.tells.update(.01)
			await shot("enemy-"+kind+"-"+state,e.position+Vector3(2.4,2.8,4.8),e.position+Vector3(0,1.25,.1),{"kind":kind,"state":e.tells.state,"caption":e.hp_label.text,"arrow_visible":e.tells.arrow.visible,"fixture":"Paused representative existing controller state on isolated supported floor; original body, rigs and authored lighting retained."})
		e.queue_free();await frames(2);game.combat.enemies.clear()
	var file=FileAccess.open(output+"review.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"captures":captures,"human_playthrough":false,"source_fingerprint":MMFPlaytestRecorder.source_fingerprint(),"scope":"Real checkpoint Guardian with paused encounter states; close hardware and isolated enemy state review. No difficulty or natural comprehension claim."},"\t"));file.close()
	while game.combat.nav.is_baking():await process_frame
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();MMFEnemyTells.clear_cache();await drain.finish(self,refs);quit()
