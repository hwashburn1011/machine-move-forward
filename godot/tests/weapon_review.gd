extends SceneTree

var game
var report={"views":{}}
var label="current"
var camera: Camera3D
var hands={}

func read_modified_hands():
	var skeleton=game.player.pose_modifier.get_skeleton()
	for side in ["r","l"]:hands[side]=skeleton.to_global(skeleton.get_bone_global_pose(skeleton.find_bone("hand_"+side)).origin)

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-weapon-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")

func capture(name: String,at: Vector3,target: Vector3):
	camera.position=at;camera.look_at(target);camera.reset_physics_interpolation()
	for i in 8:await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/weapon-"+label+"-"+name+".png"))

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=120
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.save_settings();game.started=true;game.session.opening_done=true;game.close_menu();game.invulnerable=true
	game.set_physics_process(false);game.player.set_physics_process(false);game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	var p=game.player;p.teleport(Vector3(50,16.1,0));p.pitch=0;p.yaw=0;p.visual.rotation.y=PI;p.set_camera_fade(0)
	MMFAssets.box(game,Vector3(15,.3,15),Vector3(50,15.95,0),MMFAssets.material(Color(.15,.13,.11)))
	camera=Camera3D.new();game.add_child(camera);camera.fov=45;camera.current=true
	var skeleton=MMFAssets.of_type(p.visual,"Skeleton3D")[0]
	p.pose_modifier.modification_processed.connect(read_modified_hands)
	for kind in ["rifle","shotgun"]:
		p.switch_weapon(kind);p.play("armed_idle")
		for i in 12:await physics_frame
		var model=p.rifle_mesh if kind=="rifle" else p.shotgun_mesh
		var muzzle=MMFAssets.find_named(model,"Muzzle");var grip=MMFAssets.find_named(model,"GripOrigin")
		var right=hands.r
		var left=hands.l
		var actual=muzzle.global_position
		var materials=[]
		for mesh in MMFAssets.of_type(model,"MeshInstance3D"):
			for surface in mesh.mesh.get_surface_count():
				var mat=mesh.get_active_material(surface)
				materials.append({"name":mat.resource_name,"albedoTexture":str(mat.albedo_texture),"roughnessTexture":str(mat.roughness_texture),"normalEnabled":mat.normal_enabled})
		report.views[kind]={"rightHand":str(right),"leftHand":str(left),"grip":str(grip.global_position) if grip else "none","rightHandGripDistance":right.distance_to(grip.global_position) if grip else -1,"muzzle":str(actual),"modelTransform":str(model.transform),"socketTransform":str(p.weapon_socket.global_transform),"materials":materials}
		await capture(kind+"-body",p.position+Vector3(2.4,1.45,-3.1),p.position+Vector3(0,1,0))
		await capture(kind+"-hands",right+Vector3(1.2,.50,-.72),(right+left+actual)/3)
		p.update_camera(1);var old_count=game.effects.tracers.size();p.fire_left=0;p.fire()
		if game.effects.tracers.size()>old_count:
			report.views[kind].tracer=game.effects.tracers.back()
		p.recoil=0;p.pitch=deg_to_rad(45)
		await capture(kind+"-up",p.position+Vector3(2.4,1.45,-3.1),p.position+Vector3(0,1.3,0))
		p.pitch=deg_to_rad(-50)
		await capture(kind+"-down",p.position+Vector3(2.4,1.45,-3.1),p.position+Vector3(0,1,0))
		p.pitch=0
	for spec in [["rifle","rifle-stabilizer"],["rifle","rifle-burst-cam"],["shotgun","shotgun-choke"],["shotgun","shotgun-scatter-brake"]]:
		p.switch_weapon(spec[0]);p.play("armed_idle");game.session.weapons[spec[0]].attachment=spec[1]
		await capture(spec[1],p.position+Vector3(-1.3,1.8,-1.5),p.position+Vector3(0,1.35,-.4))
	print("WEAPON_REVIEW ",JSON.stringify(report))
	var file=FileAccess.open("res://../test-results/godot-native/weapon-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	await create_timer(.1).timeout;MMFAssets.cache.clear();quit()
