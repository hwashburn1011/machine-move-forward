extends SceneTree

# Sample the FINAL skeleton in its modifier callback. Outside that callback,
# Godot exposes the pre-modifier animation rather than the pose sent to skinning.
var game
var checks=0
var failures=[]
var pose={}
var report={"poses":{}}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-weapon-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count=8):
	for i in count:await physics_frame
	await process_frame

func modified():
	var p=game.player;var sk=p.pose_modifier.get_skeleton();var hold=p.weapon_pose
	pose={"targets":hold.last_targets.duplicate(),"errors":[],"hands":{}}
	for side in ["r","l"]:
		var at=sk.get_bone_global_pose(sk.find_bone("hand_"+side)).origin
		pose.hands[side]=sk.to_global(at)
		if not hold.last_targets.is_empty():pose.errors.append(at.distance_to(hold.last_targets.right if side=="r" else hold.last_targets.left))

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false)
	var p=game.player;p.set_physics_process(false);p.teleport(Vector3(50,16.1,0));p.yaw=0;p.visual.rotation.y=PI
	MMFAssets.box(game,Vector3(30,1,30),Vector3(50,15.5,0))
	p.pose_modifier.modification_processed.connect(modified)
	for kind in ["rifle","shotgun"]:
		p.switch_weapon(kind);p.play("armed_idle");p.recoil=0
		var model=p.rifle_mesh if kind=="rifle" else p.shotgun_mesh
		var support=MMFAssets.find_named(model,"SupportGrip")
		var grip=MMFAssets.find_named(model,"GripOrigin")
		for degrees in [-70,-30,0,40,75]:
			p.pitch=deg_to_rad(degrees);p.update_camera(1);await frames()
			var expected=p.pose_modifier.get_skeleton().global_basis*Basis(Vector3.RIGHT,-p.pitch).z
			var error=pose.errors.max() if not pose.errors.is_empty() else INF
			var support_error=pose.hands.l.distance_to(support.global_position)
			var right_offset=pose.hands.r.distance_to(grip.global_position)
			report.poses[kind+str(degrees)]={"chainErrorM":error,"supportErrorM":support_error,"rightPalmOffsetM":right_offset,"aimAngleDegrees":rad_to_deg(expected.angle_to(model.global_basis.z))}
			check(error<.003 and support_error<.004 and absf(right_offset-.054765)<.003,"Reachable hands follow the actual "+kind+" at pitch "+str(degrees))
			check(expected.angle_to(model.global_basis.z)<.001,"Bore follows aim pitch: "+kind+" "+str(degrees))
		p.pitch=0;p.update_camera(1);await frames()
		var original_muzzle=p.weapon_pose.muzzle_position();p.recoil=.035;await frames()
		check(original_muzzle.distance_to(p.weapon_pose.muzzle_position())>.02 and pose.hands.l.distance_to(support.global_position)<.004,"Recoil moves both hands with the "+kind)
		p.recoil=0;await frames()
		var def=game.weapon_definition();var random=MMFRandom.new();random.state=game.session.rng.state
		var endpoints=[]
		for i in int(def.pellets):
			var angle=random.randf()*TAU;var radius=sqrt(random.randf())*deg_to_rad(def.spread)
			var dir=(-p.camera.global_basis.z+p.camera.global_basis.x*cos(angle)*radius+p.camera.global_basis.y*sin(angle)*radius).normalized()
			var hit=game.raycast(p.camera.global_position,p.camera.global_position+dir*def.range,[p.get_rid()],5)
			endpoints.append(hit.position if not hit.is_empty() else p.camera.global_position+dir*def.range)
		var before=game.effects.tracers.size();var ammo=game.session.weapons[kind].ammoInMag;var muzzle=p.weapon_pose.muzzle_position()
		p.fire_left=0;p.aiming=false;p.fire()
		var exact=game.effects.tracers.size()-before==int(def.pellets)
		for i in int(def.pellets):
			var shot=game.effects.tracers[before+i]
			exact=exact and shot.a.distance_to(muzzle)<.0001 and shot.b.distance_to(endpoints[i])<.001
		check(exact and random.state==game.session.rng.state,"Actual muzzle emits every pellet with unchanged camera hits and random sequence: "+kind)
		check(game.session.weapons[kind].ammoInMag==ammo-1 and is_equal_approx(p.fire_left,1.0/def.fireRate),"Ammo and cadence preserved: "+kind)
		p.fire();check(game.session.weapons[kind].ammoInMag==ammo-1,"Cadence prevents an extra shot: "+kind)
		p.reload_weapon();check(is_equal_approx(p.reload_left,def.reloadTime),"Reload duration preserved: "+kind)
		p.reload_left=def.reloadTime*.5;await frames()
		check(pose.targets.is_empty() and not p.pose_modifier.reload_tracks.is_empty(),"Authored moving reload owns the arms mid-clip: "+kind)
		p.cancel_reload();await frames();check(not pose.targets.is_empty(),"Cancel reload restores the grip: "+kind)
	for spec in [["rifle","rifle-stabilizer"],["rifle","rifle-burst-cam"],["shotgun","shotgun-choke"],["shotgun","shotgun-scatter-brake"]]:
		p.switch_weapon(spec[0]);p.pitch=.2;game.session.weapons[spec[0]].attachment=spec[1];await frames()
		var item=p.equipment.attachment;var mount=p.weapon_pose.attachment_mount(spec[1]=="rifle-burst-cam")
		check(item.get_parent()==mount and item.global_position.distance_to(mount.global_position)<.001 and absf(item.global_basis.get_scale().x-1)<.001,"Attachment keeps metre scale and physical mount: "+spec[1])
		var outlet=MMFAssets.find_named(p.rifle_mesh,"Muzzle").global_position if spec[1]=="rifle-burst-cam" else item.to_global(Vector3(0,0,-.119))
		check(p.weapon_pose.muzzle_position().distance_to(outlet)<.001,"Tracer outlet follows the fitted hardware: "+spec[1])
		p.set_camera_fade(.7)
		check(MMFAssets.of_type(item,"MeshInstance3D").all(func(mesh):return absf(mesh.transparency-.7)<.001),"Close camera fades attached hardware: "+spec[1])
	game.session.weapons.rifle.attachment="";game.session.weapons.shotgun.attachment="";p.switch_weapon("rifle");await frames()
	check(p.equipment.attachment==null,"Weapon change removes the old attachment")
	game.session.weapons.rifle.attachment="rifle-stabilizer";p.equipment.refresh_attachment();p.switch_weapon("shotgun")
	check(p.equipment.muzzle==null and p.equipment.attachment==null,"Switching weapon cannot fire from the previous weapon's attachment")
	game.session.weapons.rifle.attachment="";p.switch_weapon("rifle")
	for mode in ["terminal","cinematic","forced","turret","refuel","dead"]:
		match mode:
			"terminal":game.open_menu("Inventory")
			"cinematic":game.cinematic="weapon-fixture"
			"forced":p.forced_motion=true
			"turret":game.manual_turret="weapon-fixture"
			"refuel":p.equipment.refuel_left=1
			"dead":game.session.health=0
		await frames(3)
		check(pose.targets.is_empty(),"Arm solver releases during "+mode)
		game.close_menu();game.cinematic="";p.forced_motion=false;game.manual_turret="";p.equipment.refuel_left=0;game.session.health=100
		await frames(3)
		check(not pose.targets.is_empty(),"Grip recovers after "+mode)
	p.pitch=.15;p.set_physics_process(true);await frames(12)
	for actions in [["forward"],["back"],["left"],["right"],["forward","right"],["forward","sprint"],["forward","crouch"],["back","crouch"]]:
		p.teleport(Vector3(50,16.1,3))
		for action in actions:Input.action_press(action)
		await frames(24)
		check(not pose.errors.is_empty() and pose.errors.max()<.003,"Both arms remain reachable during real controller movement: "+str(actions))
		for action in actions:Input.action_release(action)
		await frames(4)
	report.checks=checks;report.failures=failures
	var file=FileAccess.open("res://../test-results/godot-native/weapon-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	p=null;await create_timer(.1).timeout;MMFAssets.cache.clear()
	print("WEAPON_RESULT ",checks," checks, ",failures.size()," failures");quit(0 if failures.is_empty() else 1)
