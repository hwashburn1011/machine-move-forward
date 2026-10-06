extends SceneTree

var game
var checks=0
var failures=[]
var samples=[]
var out="res://../test-results/v1-playthrough-fixes-20261005/"
var rendered=false
var hand=Vector3.INF
var right_hand=Vector3.INF

func _initialize():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):out=arg.trim_prefix("--output=").trim_suffix("/")+"/"
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://action-presentation/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count=6):
	for i in count:await process_frame

func capture(label: String):
	if not rendered:return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(out+label+".png")

func modified():
	var sk=game.player.pose_modifier.get_skeleton()
	hand=sk.to_global(sk.get_bone_global_pose(sk.find_bone("hand_l")).origin)
	right_hand=sk.to_global(sk.get_bone_global_pose(sk.find_bone("hand_r")).origin)

func wrist_sample(label: String):
	var t=game.ui.terminal
	var center=t.device.to_global(t.SCREEN_CENTER)
	var screen=t.camera.unproject_position(center)
	var sample={"stage":label,"elapsed":t.elapsed,"blend":t.blend,"screen":str(screen),"camera":str(t.camera.global_position),"forward":str(-t.camera.global_basis.z)}
	samples.append(sample)
	await capture(label)

func run():
	var source_at_start=MMFPlaytestRecorder.source_fingerprint()
	Engine.max_fps=60;rendered=DisplayServer.get_name()!="headless"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out))
	if rendered:DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false);game.audio.muted=true
	var p=game.player;var e=p.equipment
	p.pose_modifier.modification_processed.connect(modified)
	p.teleport(Vector3(4,16.03,6));p.yaw=0;p.visual.rotation.y=PI;p.pitch=-.1;p.update_camera(1)
	await frames(12)
	await capture("backpack-muted")
	check(MMFEnemyModels.player_plasma.emission_energy_multiplier<.4 and MMFEnemyModels.player_plasma.emission.s<.5,"Backpack keeps a dim desaturated shared pilot material")
	var copy=MMFAssets.scene(MMFEnemyModels.PLAYER);var shared=false
	for mesh in MMFAssets.of_type(copy,"MeshInstance3D"):
		for surface in mesh.mesh.get_surface_count():shared=shared or mesh.get_active_material(surface)==MMFEnemyModels.player_plasma
	check(shared,"Independent S07 instances reuse the same backpack material")
	copy.free()
	var gun=game.session.create_piece("turret-manual",{"x":3,"y":0,"z":4},0,{},true);game.building.add_visual(gun);game.session.powered[gun.instanceId]=true
	p.teleport(game.building.center(gun.cell)+Vector3(0,0,1.9))
	var before=p.position
	game.service_piece(gun)
	game.update_manual_turret(.016);await frames(8)
	check(game.manual_turret==gun.instanceId and not p.rifle_mesh.visible and not p.shotgun_mesh.visible,"Mounted sight holsters personal firearms")
	check(p.camera_fade==1 and p.meshes.all(func(m):return m.transparency==1),"Mounted sight excludes the contradictory exterior operator")
	check(p.position.is_equal_approx(before),"Mounting does not warp the physical capsule")
	await capture("deck-gun-sight")
	game.dismount_turret()
	# Let the actual main/player updates restore both pose and interaction.
	game.set_physics_process(true);p.set_physics_process(true)
	for i in 8:await physics_frame
	game.set_physics_process(false);p.set_physics_process(false)
	await frames(3)
	check(p.camera.get_parent()==p.arm and p.rifle_mesh.visible and p.camera_fade<1,"Dismount restores selected weapon and normal camera clearance")
	check(not "CREWING DECK GUN" in game.interaction_prompt,"Live dismount updates the ordinary interaction prompt")
	await capture("deck-gun-dismount")
	MMFAssets.box(game.world,Vector3(20,1,20),Vector3(50,15.5,0),MMFAssets.material(Color(.20,.22,.20)))
	p.teleport(Vector3(50,16.03,0));p.yaw=-PI/2;p.visual.rotation.y=PI/2;p.pitch=-.3
	game.update_interaction(0)
	for i in 8:p.update_camera(1);await physics_frame
	await frames(3)
	game.salvage.throw_hook();await frames(8)
	check(game.salvage.hook_phase=="out" and e.salvage_gesture() and not p.rifle_mesh.visible,"Existing throw activates free-hand presentation")
	var origin=game.salvage.hook_origin;var dir=game.salvage.hook_direction
	game.salvage.update_hook(.12);await frames(8)
	check(game.salvage.hook_visual.position.distance_to(origin+dir*game.salvage.HOOK_SPEED*.12)<.001,"Throw animation does not change hook trajectory or speed")
	check(e.salvage_grip.distance_to(hand)<.002,"Rendered tether uses the solved free hand")
	await capture("salvage-release")
	var inspect=Camera3D.new();game.add_child(inspect);inspect.position=p.position+Vector3(2,1.8,3);inspect.look_at(p.position+Vector3.UP*1.2);inspect.fov=42;inspect.make_current()
	await frames(3);await capture("salvage-release-hands")
	var release_hand=right_hand
	game.salvage.update_hook(1);await frames(8);game.salvage.update_hook(.10);await frames(8)
	check(game.salvage.hook_phase=="back" and not p.rifle_mesh.visible,"Return flight keeps the reel gesture and firearm holstered")
	var cable_end=game.salvage.cable.position-game.salvage.cable.basis.y*.5
	check(cable_end.distance_to(e.cable_origin())<.12,"Rendered line starts at the free hand during reel")
	check(right_hand.distance_to(release_hand)>.025,"Reel stroke visibly changes the free-hand release pose")
	await capture("salvage-reel")
	p.aiming=true;await frames(8)
	check(not e.salvage_gesture() and p.rifle_mesh.visible and p.weapon_pose.pose_ready,"Aiming retains its existing priority over salvage presentation")
	p.aiming=false;game.salvage.cancel();await frames(8)
	check(p.rifle_mesh.visible and not e.salvage_grip.is_finite(),"Cancel restores weapon and clears stale tether grip")
	p.camera.make_current();inspect.queue_free()
	# Simulate ordinary mouse deltas at the reported canopy location, retaining
	# the production input clamp and spring-arm collision response.
	p.teleport(Vector3(4.4156,16.0468,1.4610));p.pitch=0;p.yaw=0;p.visual.rotation.y=PI
	Input.mouse_mode=Input.MOUSE_MODE_CAPTURED
	var mouse=InputEventMouseMotion.new();mouse.relative=Vector2(0,420/game.settings.sensitivity)
	if rendered:p._unhandled_input(mouse)
	else:p.pitch=-.924 # Headless display cannot capture a physical mouse.
	for i in 8:p.update_camera(1);await physics_frame
	check(is_equal_approx(p.pitch,-.924),"Steep canopy view uses ordinary mouse sensitivity" if rendered else "Headless steep-view geometry fixture matches requested mouse pitch")
	var canopy_hit=game.raycast(p.pivot.global_position,p.camera.global_position,[],MMFMachineCanopy.CAMERA_LAYER)
	check(canopy_hit.is_empty(),"Steep-view camera boom stays on the player's side of the canopy")
	await capture("canopy-steep-mouse")
	# Repeat the wrist opening from a steep view: verify it holds the known
	# third-person transform until pronation, then reaches readable glass.
	p.teleport(Vector3(0,16.03,-1));p.pitch=-.8;p.yaw=PI;p.update_camera(1)
	await frames(6)
	game.open_menu("Inventory");var t=game.ui.terminal;var start=t.start_transform
	await wrist_sample("wrist-open-00")
	await create_timer(.08).timeout
	check(t.elapsed>=.20 or t.camera.global_transform.is_equal_approx(start),"Wrist camera waits for the forearm raise before travel")
	await wrist_sample("wrist-open-08")
	await create_timer(.08).timeout;await wrist_sample("wrist-open-16")
	await create_timer(.08).timeout;await wrist_sample("wrist-open-24")
	await create_timer(.08).timeout;await wrist_sample("wrist-open-32")
	await create_timer(.18).timeout;await wrist_sample("wrist-open-settled")
	check(t.active and t.blend>.99 and t.camera.global_position.distance_to(t.target_transform().origin)<.02,"Wrist reaches its authored reading camera")
	check(not p.rifle_mesh.visible and game.ui.panel.get_parent()==t.display_root,"Wrist still owns readable controls and weapon suppression")
	game.close_menu();await create_timer(.3).timeout
	check(not t.presenting() and p.camera.current,"Wrist close restores the gameplay camera")
	game.ui.show_record("Relay note",game.data.STORY_EXPEDITIONS[1].journals[0].text)
	await create_timer(.65).timeout;await capture("relay-note-settled")
	check(t.active and t.blend==1,"Read-only Relay note settles onto the physical wrist")
	game.close_menu();await create_timer(.3).timeout
	game.settings.terminal_reduced_motion=true;game.open_menu("Inventory");await frames(5)
	check(t.blend==1 and t.camera.global_position.distance_to(t.target_transform().origin)<.02,"Reduced motion still opens without camera travel")
	game.close_menu();await frames(5)
	var source_at_end=MMFPlaytestRecorder.source_fingerprint()
	var result={"checks":checks,"failures":failures,"rendered":rendered,"source_hash":source_at_start,"source_hash_end":source_at_end,"source_stable":source_at_start==source_at_end,"samples":samples,"scope":"Prepared input/physics and native camera fixtures; not campaign balance or human discovery"}
	var file=FileAccess.open(out+("action-native.json" if rendered else "action-tests.json"),FileAccess.WRITE);file.store_string(JSON.stringify(result,"\t"));file.close()
	print("ACTION_PRESENTATION_RESULT ",checks," checks / ",failures.size()," failures")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
