extends SceneTree

# Read-only gameplay investigation: fixtures use isolated saves; runtime sources
# and personal campaigns/settings are never written by this script.
var game
var report={"opening":[],"scope":"Native Godot; controlled runtime fixtures, not a full playthrough"}
var measured={}

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-feedback-investigation/"
	call_deferred("run")

func flat_angle(a: Vector3,b: Vector3) -> float:
	a.y=0;b.y=0
	return rad_to_deg(a.angle_to(b))

func modified():
	var p=game.player
	var target=p.weapon_pose.scripted_target
	measured={"bodyTargetYawErrorDeg":flat_angle(p.visual.global_basis.z,target-p.global_position),"gunTargetYawErrorDeg":flat_angle(p.rifle_mesh.global_basis.z,target-p.weapon_pose.muzzle_position()),"bodyGunYawDifferenceDeg":flat_angle(p.visual.global_basis.z,p.rifle_mesh.global_basis.z)}

func settle(count=8):
	for i in count:await process_frame

func capture(name: String):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/feedback-"+name+".png"))

func run():
	Engine.max_fps=60
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	var p=game.player;var c=game.cinematics
	p.pose_modifier.modification_processed.connect(modified)
	c.begin_opening();c.event_cursor=c.timeline.events.size()
	for t in [2.47,2.48,2.55,2.65,2.8,3.05,3.65,5.0]:
		c.time=t;c.update_opening(0);p.reset_physics_interpolation();p.visual.reset_physics_interpolation()
		await settle(10)
		var row=measured.duplicate();row.time=t;row.scriptedAim=p.weapon_pose.scripted_aim
		report.opening.append(row)
		if t in [2.55,2.8,3.65]:await capture("opening-"+str(t).replace(".","-"))
	c.clear_scene();game.cinematic="";game.session.opening_done=true;p.camera.current=true
	p.teleport(Vector3(10,16.1,0));p.visual.rotation.y=PI;p.yaw=PI;p.pitch=0;p.play("armed_idle");p.aiming=false;p.update_camera(1)
	await settle(12)
	var before=game.session.weapons.rifle.ammoInMag
	var tracer_before=game.effects.tracers.size()
	p.fire_left=0;p.fire()
	var shot=game.effects.tracers[tracer_before]
	report.stationaryRearFire={"ammoBefore":before,"ammoAfter":game.session.weapons.rifle.ammoInMag,"bodyCameraYawDifferenceDeg":flat_angle(p.visual.global_basis.z,-p.camera.global_basis.z),"gunCameraYawDifferenceDeg":flat_angle(p.rifle_mesh.global_basis.z,-p.camera.global_basis.z),"bodyShotYawDifferenceDeg":flat_angle(p.visual.global_basis.z,shot.b-shot.a),"method":"Actual player.fire() with stationary, non-aiming pose and rear-facing camera"}
	await capture("rear-fire")
	# Real rifle raycast against a player-owned construction collider.
	var wall=game.session.create_piece("wall",{"x":25,"y":0,"z":2},0,{},true)
	game.building.add_visual(wall)
	await physics_frame;await physics_frame
	var body=MMFAssets.of_type(game.building.bodies[wall.instanceId],"StaticBody3D")[0]
	var center=body.global_position
	p.teleport(center-Vector3(0,1.4,6));p.visual.rotation.y=0;p.yaw=PI;p.pitch=0;p.update_camera(1)
	p.camera.global_position=center-Vector3(0,0,5);p.camera.look_at(center)
	await settle(10)
	var health=wall.health
	var hit=game.raycast(p.camera.global_position,p.camera.global_position-p.camera.global_basis.z*15,[p.get_rid()],5)
	p.fire_left=0;p.fire()
	report.ownStructureShot={"healthBefore":health,"healthAfter":wall.health,"pieceId":wall.instanceId,"rayHitOwnedStructure":not hit.is_empty() and hit.collider.get_meta("piece_id","")==wall.instanceId}
	# Inspect the existing ship victory outcome through actual hull damage.
	game.combat.begin_ship("skiff",false,true)
	var hull=MMFAssets.of_type(game.combat.ship,"StaticBody3D")[0]
	var live_crew=game.combat.crew.size()
	hull.take_damage(1000,hull.global_position)
	report.shipDestruction={"crewBefore":live_crew,"unboardedCrewDefeated":game.combat.crew.all(func(e):return e.dead),"stateAfter":game.combat.ship_state,"shipStillVisible":game.combat.ship.is_visible_in_tree(),"healthAfter":game.combat.ship_health}
	var out=FileAccess.open("res://../test-results/godot-native/player-feedback-diagnostic.json",FileAccess.WRITE)
	out.store_string(JSON.stringify(report,"\t"));out.close()
	print("FEEDBACK_DIAGNOSTIC ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	p=null;c=null;await drain.finish(self,refs);MMFAssets.cache.clear();call_deferred("quit",0)
