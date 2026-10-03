extends SceneTree

var game
var checks=0
var failures=[]
var poses=[]
var report={}

class Target extends StaticBody3D:
	var health=400.0
	func _init():
		collision_layer=4;collision_mask=0;set_meta("hostile_target",true)
		var shape=CollisionShape3D.new();var box=BoxShape3D.new();box.size=Vector3(4,4,1);shape.shape=box;add_child(shape)
	func take_damage(amount: float,_point: Vector3) -> float:
		var before=health;health=maxf(0,health-amount);return before-health
	func take_weapon_damage(amount: float,point: Vector3,distance: float,range_m: float,falloff: float) -> float:
		return take_damage(MMFDamage.compute(amount,distance,range_m,falloff),point)

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-survivor-combat-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count=5):
	for i in count:await physics_frame
	await process_frame

func click():
	var down=InputEventMouseButton.new();down.button_index=MOUSE_BUTTON_LEFT;down.pressed=true;Input.parse_input_event(down)
	await process_frame
	var up=InputEventMouseButton.new();up.button_index=MOUSE_BUTTON_LEFT;up.pressed=false;Input.parse_input_event(up)

func modified():
	var p=game.player
	if game.cinematic=="opening":
		var body=p.visual.global_basis.z;var bore=p.rifle_mesh.global_basis.z;body.y=0;bore.y=0
		poses.append({"time":game.cinematics.time,"bodyGunYawDegrees":rad_to_deg(body.angle_to(bore))})

func run():
	Engine.max_fps=120
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false)
	var p=game.player
	MMFAssets.box(game,Vector3(25,1,25),Vector3(50,15.5,0))
	p.teleport(Vector3(50,16.05,0));p.yaw=0;p.visual.rotation.y=PI;p.pitch=0;p.update_camera(1)
	await frames(20)
	check(p.weapon_pose.pose_ready,"A final solved firing pose is available")
	var muzzle_error=p.weapon_pose.resolved_muzzle.distance_to(p.weapon_pose.muzzle_position())
	report.muzzleErrorM=muzzle_error
	check(muzzle_error<.015,"Cached solved muzzle matches the rendered muzzle")
	var target=Target.new();game.add_child(target);target.position=Vector3(50,17,14)
	await frames(3)
	p.yaw=PI;p.pitch=0;p.update_camera(1)
	var ammo=game.session.weapons.rifle.ammoInMag
	var pulse_before=game.ui.reticle.pulse_count
	await click();await frames(1)
	# Headless DisplayServer cannot capture the pointer. Exercise the same
	# guarded fire method there; the rendered run exercises controller release.
	if DisplayServer.get_name()=="headless":p.fire()
	check(game.session.weapons.rifle.ammoInMag==ammo,"A rear-facing quick click cannot immediately shoot through S-07")
	await frames(40)
	if DisplayServer.get_name()=="headless":p.fire()
	report.inputMode="headless method release after normal click dispatch" if DisplayServer.get_name()=="headless" else "rendered captured-pointer click"
	report.rear={"ammoBefore":ammo,"ammoAfter":game.session.weapons.rifle.ammoInMag,"queued":p.queued_click,"pending":p.pending_shot,"ready":p.weapon_pose.pose_ready,"canFire":p.weapon_pose.can_fire(),"aimYaw":p.aim_yaw,"bodyYaw":p.visual.rotation.y,"cachedYaw":p.weapon_pose.resolved_body_yaw,"boreError":rad_to_deg(p.weapon_pose.resolved_bore.angle_to(-p.camera.global_basis.z)),"suppress":p.suppress_fire}
	check(game.session.weapons.rifle.ammoInMag==ammo-1,"The buffered quick click fires once after turning")
	check(target.health<400,"The turned shot reaches its intended hostile target")
	check(game.ui.reticle.pulse_count==pulse_before+1,"An actual damaging player shot confirms exactly once on the reticle")
	check(absf(wrapf(p.visual.rotation.y-(p.yaw+PI),-PI,PI))<deg_to_rad(4),"The body finishes facing the shot")
	await frames(15)
	check(game.session.weapons.rifle.ammoInMag==ammo-1,"Releasing the trigger cannot leave recurring shots queued")
	# One shell may damage through several pellets but must confirm only once.
	p.switch_weapon("shotgun");p.pitch=0;p.update_camera(1);p.fire_left=0
	target.health=400;await frames(12)
	pulse_before=game.ui.reticle.pulse_count
	var shell_before=game.session.weapons.shotgun.ammoInMag
	await click();await frames(40)
	if DisplayServer.get_name()=="headless":p.fire()
	check(target.health<400 and game.session.weapons.shotgun.ammoInMag==shell_before-1 and game.ui.reticle.pulse_count==pulse_before+1,"A multi-pellet shotgun hit consumes one shell and confirms once")
	p.switch_weapon("rifle");p.fire_left=0;p.pitch=0
	# Own pieces still intercept bullets, without entering destruction/refund code.
	p.set_physics_process(false)
	var wall=game.session.create_piece("wall",{"x":25,"y":0,"z":3},0,{"x":25,"y":0,"z":3,"axis":"x"},true)
	game.building.add_visual(wall);await frames(3)
	var body=MMFAssets.of_type(game.building.bodies[wall.instanceId],"StaticBody3D")[0]
	var before=wall.health
	var hit={"collider":body,"position":body.global_position,"normal":Vector3.FORWARD}
	check(MMFOwnedShot.damage(hit,500)==0 and wall.health==before,"Owned weapon damage cannot destroy a built wall")
	body.take_damage(20,body.global_position)
	check(wall.health<before,"Hostile/general structure damage remains effective")
	# A muzzle obstruction can differ from the third-person camera's clear ray.
	var barrier=MMFAssets.box(game,Vector3(1,4,.5),Vector3(80,17,-2))
	var far=Target.new();game.add_child(far);far.position=Vector3(80,17,-10)
	await frames(3)
	var camera_at=Vector3(84,17,2);var muzzle=Vector3(80,17,0);var direction=(far.position-camera_at).normalized()
	var camera_hit=game.raycast(camera_at,camera_at+direction*30,[],5)
	var path=MMFOwnedShot.trace(game,muzzle,camera_at,direction,30,[])
	check(not camera_hit.is_empty() and camera_hit.collider==far,"Third-person camera can see the target around the fixture's cover")
	check(not path.hit.is_empty() and path.hit.collider!=far and path.end.z>-3,"Muzzle collision stops that shot at the actual cover")
	var behind=MMFOwnedShot.trace(game,Vector3(80,17,-12),camera_at,direction,30,[])
	check(behind.hit.is_empty() and behind.origin==behind.end,"A target behind the muzzle cannot reverse projectile direction")
	check(MMFOwnedShot.damage({"collider":far,"position":far.position},30)>0,"Owned fire reports actual hostile damage")
	far.health=0
	check(MMFOwnedShot.damage({"collider":far,"position":far.position},30)==0,"Already defeated targets cannot create confirmed-hit feedback")
	# Exercise the real deck-gun damage path at point-blank construction.
	var turret=game.session.create_piece("turret-manual",{"x":25,"y":0,"z":0},0,{},true)
	game.building.add_visual(turret);game.session.powered[turret.instanceId]=true
	var turret_at=game.building.center(turret.cell)+Vector3.UP*1.35
	var muzzle_cover=MMFAssets.box(game,Vector3(2,3,.1),turret_at+Vector3.FORWARD*.45)
	var gun_target=Target.new();game.add_child(gun_target);gun_target.position=turret_at+Vector3.FORWARD*10
	p.yaw=0;p.pitch=0;game.manual_turret=turret.instanceId;game.manual_fire_clock=0
	await frames(3);pulse_before=game.ui.reticle.pulse_count;Input.action_press("fire")
	game.update_manual_turret(.01);Input.action_release("fire")
	check(gun_target.health==400 and game.ui.reticle.pulse_count==pulse_before,"A deck gun cannot shoot through cover between its base and muzzle")
	muzzle_cover.queue_free();await frames(3);game.manual_fire_clock=0;Input.action_press("fire")
	game.update_manual_turret(.01);Input.action_release("fire")
	check(gun_target.health<400 and game.ui.reticle.pulse_count==pulse_before+1,"A clear deck-gun shot damages a hostile and confirms the player hit")
	game.dismount_turret()
	# All opening turn samples stay within the bounded forward weapon cone.
	p.pose_modifier.modification_processed.connect(modified)
	game.cinematics.begin_opening();game.cinematics.event_cursor=game.cinematics.timeline.events.size()
	for at in [2.48,2.55,2.65,2.8,3.05,3.65,5.0]:
		game.cinematics.time=at;game.cinematics.update_opening(0);await frames(5)
		check(not poses.is_empty() and poses[-1].bodyGunYawDegrees<=30.5,"Coordinated opening body/gun turn at "+str(at))
	game.cinematics.clear_scene();game.cinematic="";p.camera.current=true
	# Fresh/legacy saves share native definitions and new optional state.
	var snapshot=game.session.native_snapshot()
	var legacy=snapshot.duplicate(true);legacy.erase("survivorContent");legacy.erase("scoutState")
	var restored=MMFSession.new(game.data)
	check(restored.restore_native(legacy) and not restored.survivor_content.toolAcquired and restored.scout_state.phase=="idle","Legacy campaigns receive recoverable tool and idle scout defaults")
	var invalid=snapshot.duplicate(true);invalid.scoutState.progress=INF
	check(not MMFSession.new(game.data).restore_native(invalid),"Malformed scout progress is rejected before restoration")
	invalid=snapshot.duplicate(true);invalid.survivorContent.toolSelected=true;invalid.survivorContent.toolAcquired=false
	check(not MMFSession.new(game.data).restore_native(invalid),"Impossible selected-but-unacquired tool state is rejected")
	# Restore the complete live game, not only the session serializer: weapon
	# selection and rebuilt destination helpers used to erase equipment state.
	game.session.survivor_content.toolAcquired=true;game.session.survivor_content.toolSelected=true
	game.session.survivor_content.refuge.components=1
	game.session.survivor_content.workshop.isolated=true
	game.session.survivor_content.workshop.fuse=true
	game.session.survivor_content.workshop.powered=true
	game.session.survivor_content.workshop.mainLoot={"scrap":10,"components":2}
	game.session.scout_state={"phase":"idle","sequence":3,"resolved":3,"outcome":"decoy","progress":0.0}
	game.session.add_resource("signal-decoy",2)
	game.session.contacts.active=game.opportunities.make_contact(2)
	game.session.contacts.active.state="docked"
	game.session.distance=game.session.contacts.active.atDistanceM
	var expected_content=game.session.survivor_content.duplicate(true)
	game.load_payload({"session":game.session.native_snapshot(),"player":{"position":{"x":0,"y":16.1,"z":-1},"yaw":0,"pitch":0}})
	await frames(5)
	check(game.building.salvage_tool.equipped() and game.session.survivor_content==expected_content,"Full game restore preserves selected cutter, partial exchange and workshop caches")
	check(game.session.inventory.count_item("signal-decoy")==2 and game.session.scout_state.outcome=="decoy" and not game.combat.scout.active(),"Full game restore preserves decoys and scout outcome without a phantom encounter")
	check(is_instance_valid(game.opportunities.site) and game.opportunities.survivor_site!=null and game.session.contacts.active.kind=="rooftop-workshop","Full game restore rebuilds the new optional workshop destination")
	report.checks=checks;report.failures=failures;report.opening=poses
	var output=FileAccess.open("res://../test-results/godot-native/survivor-combat.json",FileAccess.WRITE);output.store_string(JSON.stringify(report,"\t"));output.close()
	paused=true;while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	p=null;restored=null;await drain.finish(self,refs);MMFAssets.cache.clear()
	print("SURVIVOR_COMBAT_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
