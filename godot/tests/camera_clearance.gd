extends SceneTree

var game
var samples=[]
var checks=0
var failures=[]
var output=""
var camera_shape=SphereShape3D.new()

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-camera-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok: failures.append(label)

func frames(n: int):
	for i in n: await physics_frame
	await process_frame

func settle(n: int=30):
	for i in n:
		game.player.update_camera(1.0/60);await physics_frame
	await process_frame

func camera_clear() -> bool:
	var query=PhysicsShapeQueryParameters3D.new();query.shape=camera_shape
	query.transform=Transform3D(Basis.IDENTITY,game.player.camera.global_position)
	query.collision_mask=1;query.exclude=[game.player.get_rid()]
	return game.get_world_3d().direct_space_state.intersect_shape(query,1).is_empty()

func all_faded_to(value: float) -> bool:
	for mesh in MMFAssets.of_type(game.player.visual,"MeshInstance3D"):
		if not is_equal_approx(mesh.transparency,value): return false
	return true

func sample(label: String,capture: bool=false,centered: bool=true):
	var player=game.player;var camera=player.camera;var head=player.pivot.global_position
	var blocked=not game.raycast(head,camera.global_position,[player.get_rid()]).is_empty()
	var chest=player.position+Vector3.UP*1.35
	var screen=camera.unproject_position(chest)/Vector2(root.get_visible_rect().size)
	var gun_meshes=MMFAssets.of_type(player.rifle_mesh,"MeshInstance3D")
	var result={"case":label,"camera":MMFAssets.dict_v(camera.global_position),"armHit":player.arm.get_hit_length(),"headRayBlocked":blocked,"clear":camera_clear(),"bodyTransparency":player.meshes[0].transparency,"gunTransparency":gun_meshes[0].transparency,"chestScreenNormalized":[screen.x,screen.y],"playerBehindCamera":camera.is_position_behind(chest)}
	samples.append(result)
	check(not blocked and result.clear,label+": camera has a clear path and physical clearance")
	check(all_faded_to(player.camera_fade),label+": body and all carried equipment fade together")
	if centered: check(not result.playerBehindCamera and screen.x>.15 and screen.x<.85,label+": character stays within central horizontal view")
	if capture and DisplayServer.get_name()!="headless":
		await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(output+"camera-"+label+".png")

func run():
	output=ProjectSettings.globalize_path("res://../test-results/godot-native/")
	camera_shape.radius=.08
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.invulnerable=true
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.teleport(Vector3(30,16.1,0));game.player.pitch=0;game.player.yaw=0
	game.ui.root.hide()
	var fixture=Node3D.new();game.add_child(fixture)
	var mat=MMFAssets.material(Color(.22,.24,.21))
	MMFAssets.box(fixture,Vector3(8,.2,8),Vector3(30,15.95,0),mat)
	MMFAssets.box(fixture,Vector3(.18,3.5,10),Vector3(30.7,17.5,0),mat)
	var back=MMFAssets.box(fixture,Vector3(8,3.5,.18),Vector3(30,17.5,1.1),mat)
	await frames(4)
	for setting in [["rightCorner",1.0,0.0,false],["leftCorner",-1.0,0.0,false],["aimCorner",1.0,0.0,true],["sideWall",1.0,-.5,false]]:
		game.player.shoulder=setting[1];game.player.yaw=setting[2];game.player.aiming=setting[3]
		await settle();await sample(setting[0],true)
	# A wall beside the shoulder alone reproduced initial sweep penetration.
	back.position.z+=10;game.player.yaw=0;game.player.aiming=false;await settle()
	await sample("shoulderWall",true)
	check(game.player.camera.global_position.x<30.61,"Camera never starts its sweep inside the shoulder-side wall")
	back.position.z-=10
	for fov in [40,90]:
		game.settings.fov=fov
		for aiming in [false,true]:
			game.player.aiming=aiming;await settle()
			await sample("fov%d-%s"%[fov,str(aiming)],false,false)
	back.position.z-=.5;game.player.aiming=false;await settle()
	check(game.player.camera_fade>.99 and all_faded_to(1),"Very close camera fully hides helmet, backpack, guns and carried props")
	var original_count=game.player.meshes.size()
	for attachment in ["rifle-stabilizer","rifle-burst-cam","","rifle-stabilizer",""]:
		game.session.weapons.rifle.attachment=attachment;await frames(3)
		check(all_faded_to(game.player.camera_fade),"Replacement attachment inherits current fade: "+attachment)
	check(game.player.meshes.size()==original_count,"Attachment replacement releases old fade references")
	game.player.switch_weapon("shotgun");game.session.weapons.shotgun.attachment="shotgun-choke";await frames(3)
	check(all_faded_to(game.player.camera_fade),"Shotgun and choke share current close-camera fade")
	game.player.equipment.refuel();await frames(3)
	check(game.player.equipment.canister.visible and all_faded_to(game.player.camera_fade),"Held fuel canister stays consistent during refueling")
	game.player.equipment.refuel_left=0;game.player.switch_weapon("rifle")
	fixture.queue_free();await frames(4)
	game.settings.fov=55;game.player.pitch=-.08;game.player.yaw=.7;game.player.shoulder=1;game.player.aiming=false
	await settle(75)
	var expected=game.player.pivot.global_position+Basis.from_euler(Vector3(-.08,.7,0))*Vector3(.55,0,4)
	check(game.player.camera.global_position.distance_to(expected)<.005,"Unobstructed camera retains original shoulder position and four-metre distance")
	check(game.player.camera.global_basis.is_equal_approx(game.player.pivot.global_basis),"Counter-rotation preserves aiming direction")
	check(all_faded_to(0),"All player visuals become opaque again away from obstacles")
	game.player.aiming=true;game.player.shoulder=-1;await settle(75)
	expected=game.player.pivot.global_position+game.player.pivot.global_basis*Vector3(-.45,0,2.3)
	check(game.player.camera.global_position.distance_to(expected)<.005 and absf(game.player.camera.fov-38)<.005,"Left-shoulder aimed position and FOV remain unchanged")
	for pose in [["lowerStairs",Vector3(-12,9.6,-2),PI,0.0],["middleDeck",Vector3(5,12.5,4),.8,-.1],["helm",Vector3(0,16.1,-8.3),0.0,0.0],["lookUp",Vector3(5,12.5,4),0.0,deg_to_rad(75)],["lookDown",Vector3(5,12.5,4),0.0,deg_to_rad(-70)]]:
		game.player.teleport(pose[1]);game.player.yaw=pose[2];game.player.pitch=pose[3];game.player.aiming=false
		await settle();await sample(pose[0],true,false)
	game.player.teleport(Vector3(5,12.5,4));game.player.pitch=0
	var blocked_frames=0
	for i in 180:
		game.player.yaw=i*.13;game.player.update_camera(1.0/60);await frames(1)
		if not camera_clear(): blocked_frames+=1
	check(blocked_frames==0,"Rapid 447-degree-per-second turns keep camera clear of machine solids")
	var turret=game.session.create_piece("turret-manual",{"x":3,"y":0,"z":4},0,{},true)
	game.building.add_visual(turret);game.session.update_power()
	game.player.teleport(Vector3(6,16.1,6));game.player.set_camera_fade(1)
	game.service_piece(turret)
	check(game.manual_turret==turret.instanceId and all_faded_to(0),"Mounting a powered deck gun restores complete character opacity")
	game.update_manual_turret(0)
	check(game.player.camera.get_parent()==game,"Mounted camera is independent of the shoulder arm")
	game.dismount_turret();game.player.teleport(Vector3(30,16.1,0));await settle()
	check(game.player.camera.get_parent()==game.player.arm and game.player.camera.global_basis.is_equal_approx(game.player.pivot.global_basis),"Dismount restores the shoulder camera and its aiming direction")
	game.player.set_camera_fade(1);game.cinematics.begin_signal()
	check(all_faded_to(0),"Signal cinematic restores player opacity before duplicating human weapons")
	var actor_guns=MMFAssets.of_type(game.cinematics.human_ship,"MeshInstance3D")
	check(actor_guns.all(func(mesh):return is_zero_approx(mesh.transparency)),"Cinematic human crew have fully visible weapons")
	game.cinematics.finish();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.teleport(Vector3(0,16.1,-1));game.player.set_camera_fade(1)
	game.cinematics.begin_opening();check(all_faded_to(0),"Opening restores the character after a close camera")
	game.cinematics.finish();game.set_physics_process(false);game.player.set_physics_process(false)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.1).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Camera test drains pending audio resources before shutdown")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"samples":samples,"rapidTurnBlockedFrames":blocked_frames}
	var file=FileAccess.open(output+"camera-clearance.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("CAMERA_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
