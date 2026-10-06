extends SceneTree

# Presentation fixtures in the shipping native scene. No altered game scripts,
# prerecorded intro, still-image pans, sped-up simulation or fabricated actions.
var game
var scene_id="walker"
var output=""
var camera: Camera3D
var events=[]
var did={}
var enemy
var start_frame=0
var walk_start=Vector3.ZERO
var cargo_before=0
var frames_count=420

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://trailer-capture/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):scene_id=arg.trim_prefix("--shot=")
		if arg.begins_with("--out="):output=arg.trim_prefix("--out=")
	call_deferred("run")

func mark(id: String, detail={}):
	did[id]=true;events.append({"id":id,"frame":Engine.get_process_frames()-start_frame,"detail":detail})

func aim(at: Vector3):
	var direction=(at-game.player.camera.global_position).normalized()
	game.player.yaw=atan2(-direction.x,-direction.z);game.player.pitch=asin(direction.y)

func view(eye: Vector3,at: Vector3,fov=52.0):
	camera.global_position=eye;camera.look_at(at);camera.fov=fov;camera.make_current()

func run():
	DisplayServer.window_set_size(Vector2i(1920,1080))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.vsync=false;game.settings.quality="high";game.settings.volume=.75;game.settings.music_volume=0.0;game.save_settings()
	while not game.cinematics.opening_stage.prepared():await process_frame
	var checkpoint={"walker":"foundry-route","salvage":"port-repair","build":"scanner","drone":"salvage-drone","explore":"orchard-caretaker","combat":"scanner","guardian":"gatekeeper","home":"scanner"}.get(scene_id,"scanner")
	if not game.playtests.launch(checkpoint):push_error("Trailer checkpoint failed");quit(1);return
	game.invulnerable=true;game.session.threat.remaining=800;game.close_menu()
	camera=Camera3D.new();camera.near=.08;camera.far=1800;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF;game.add_child(camera)
	for i in 60:await process_frame
	if scene_id=="walker":game.campaign.begin_route("foundry-detour");frames_count=480
	if scene_id=="salvage":
		game.player.teleport(Vector3(-7.5,16.1,-6));game.player.yaw=PI/2;game.player.pitch=-.4
		for i in game.salvage.crates.size():
			var c=game.salvage.crates[i]
			if c.active:c.node.position.z=-6;game.salvage.ground_crate(c,i)
		cargo_before=game.session.count_resource("scrap")
	if scene_id=="build":
		game.player.teleport(Vector3(-6,16.1,-6));game.player.yaw=PI;game.player.pitch=-.62
	if scene_id=="explore":
		game.player.teleport(Vector3(14,16.1,0));game.player.yaw=-PI/2;game.player.pitch=-.09
	if scene_id=="combat":
		game.player.teleport(Vector3(-4,16.1,5));game.player.yaw=0;game.player.pitch=-.08
		enemy=game.combat.spawn("warden",Vector3(-4,16.1,-5))
		game.combat.spawn("revenant",Vector3(-1,16.1,-8))
		game.combat.spawn("raider",Vector3(-5,16.1,-11))
	if scene_id=="guardian":
		game.player.teleport(Vector3(7,16.1,0));game.player.yaw=-PI/2;game.player.pitch=.02
		var wait_frames=0
		while game.combat.guardian.phase!="lock" and wait_frames<1800:
			game.close_menu();await process_frame;wait_frames+=1
		if game.combat.guardian.phase!="lock":push_error("Guardian never entered its firing cycle");quit(1);return
	if scene_id=="home":
		for spec in [["nomad-chart-desk",-3,-5],["nomad-field-chair",-3,-4]]:
			var cell={"x":spec[1],"y":0,"z":spec[2]}
			if game.building.validate({"definitionId":spec[0],"cell":cell,"rotation":0})=="":game.building.add_visual(game.session.create_piece(spec[0],cell,0))
		game.player.teleport(Vector3(-3,16.1,-9));game.player.yaw=PI/2;game.player.pitch=-.1
	for i in 15:await process_frame
	Input.mouse_mode=Input.MOUSE_MODE_CAPTURED
	start_frame=Engine.get_process_frames();walk_start=game.player.position
	for frame in frames_count:
		var t=frame/30.0
		game.ui.hide()
		match scene_id:
			"walker":
				var angle=-1.02+t*.029
				view(Vector3(sin(angle)*53,18+t*.28,cos(angle)*53),Vector3(0,10.5,0),48)
			"salvage":
				view(Vector3(-27,13,-17),Vector3(-12,9,-6),60)
				if t<1.5:
					for i in game.salvage.crates.size():
						if not game.salvage.crates[i].active:continue
						var direction=game.salvage.suggested_direction(i)
						game.player.yaw=atan2(-direction.x,-direction.z);game.player.pitch=asin(direction.y)
				if t>=1.5 and not did.has("hook"):
					game.salvage.throw_hook();mark("hook",game.salvage.hook_phase)
				if game.session.count_resource("scrap")>cargo_before and not did.has("cargo_recovered"):mark("cargo_recovered",game.session.count_resource("scrap")-cargo_before)
			"build":
				game.player.camera.make_current()
				if t>=1 and not did.has("choose"):mark("choose",game.building.choose("nomad-chart-desk"))
				if t>=4 and not did.has("placed"):mark("placed",game.building.commit_placement());game.building.cancel()
				if t>5 and t<6:Input.action_press("right")
				else:Input.action_release("right")
			"drone":
				var drones=game.salvage.automation.drones
				if not drones.is_empty():
					var job=drones.values()[0]
					var target=job.node.global_position
					view(target+Vector3(-7,3,7),target,55)
					if not did.has(job.phase):mark(job.phase)
			"explore":
				game.player.camera.make_current()
				if t<3.5:Input.action_press("forward")
				else:
					Input.action_release("forward");game.player.yaw=-PI/2+minf((t-3.5)*.35,1.2)
			"combat":
				game.player.camera.make_current()
				var alive=[]
				for e in game.combat.enemies:
					if is_instance_valid(e) and e.health>0:alive.append(e)
				if not alive.is_empty():
					aim(alive[0].position+Vector3.UP*1.15)
					if t>1:Input.action_press("aim");Input.action_press("fire")
					if game.session.weapons.rifle.ammoInMag<=0:game.player.reload_weapon()
				else:Input.action_release("fire");Input.action_release("aim")
				if t>3 and t<4:Input.action_press("left")
				else:Input.action_release("left")
			"guardian":
				if is_instance_valid(game.combat.ship):
					view(Vector3(7,23,-14),Vector3(14,16,0),62)
					aim(game.combat.ship.global_position+Vector3.UP*2)
					if t>2.7 and t<3.9:Input.action_press("right")
					else:Input.action_release("right")
					if game.combat.guardian.weapon_exposed() and is_instance_valid(game.combat.guardian.weapon_zone):
						aim(game.combat.guardian.weapon_zone.global_position);Input.action_press("aim");Input.action_press("fire")
					else:Input.action_release("fire");Input.action_release("aim")
				else:view(Vector3(-30,26,35),Vector3(0,12,-30),55)
				if not did.has(game.combat.guardian.phase):mark(game.combat.guardian.phase)
			"home":
				view(Vector3(-10+t*.14,20,-18),Vector3(-5,16.5,-8),55)
		await process_frame
	for action in ["fire","aim","left","right","forward"]:Input.action_release(action)
	var report={"shot":scene_id,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"start_frame":start_frame,"frames":frames_count,"fps":30,"events":events,"walked_displacement":walk_start.distance_to(game.player.position),"distance":game.session.distance,"guardian_volleys":game.combat.guardian.volleys,"enemies_remaining":game.combat.enemies.filter(func(e):return is_instance_valid(e) and e.health>0).size(),"scope":"Staged native gameplay checkpoint, invulnerable actor, normal-speed simulation and production action authorities. Fixed-rate movie capture is not performance evidence."}
	var file=FileAccess.open(output,FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("TRAILER_CAPTURE ",JSON.stringify(report))
	game.open_menu("Pause");while game.combat.nav.is_baking():await process_frame
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit()
