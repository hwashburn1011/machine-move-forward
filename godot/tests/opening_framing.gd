extends SceneTree

var game
var checks=0
var failures=[]
var final_pose={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-opening-framing/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func geometry(node: Node3D) -> TriangleMesh:
	var faces=PackedVector3Array()
	for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
		if not mesh.is_visible_in_tree() or not mesh.mesh:continue
		for vertex in mesh.mesh.get_faces():faces.append(mesh.global_transform*vertex)
	var result=TriangleMesh.new();result.create_from_faces(faces);return result

func modified():
	var p=game.player;var hold=p.weapon_pose;var sk=hold.skeleton
	final_pose={"errors":[],"left":Vector3.ZERO}
	for side in ["r","l"]:
		var hand=sk.get_bone_global_pose(sk.find_bone("hand_"+side)).origin
		if not hold.last_targets.is_empty():final_pose.errors.append(hand.distance_to(hold.last_targets.right if side=="r" else hold.last_targets.left))
		if side=="l":final_pose.left=sk.to_global(hand)

func run():
	Engine.max_fps=240;root.size=Vector2i(1920,1080)
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	var c=game.cinematics;var p=game.player;c.begin_opening();await process_frame
	var roof=geometry(c.rooftop);var machine=geometry(game.world.machine)
	var ray_blocks=[];var offscreen=[];var camera_contacts=[];var corridor_hits=[];var previous=c.camera.global_position
	var surface_checks=0;var view_checks=0
	for frame in 588:
		var t=frame/60.0;c.time=t;c.update_opening(0)
		var sample=c.timeline.samples[frame]
		var points=[{"name":"hero","point":MMFAssets.v(sample.player.position)}]
		for i in 2:
			if sample.pursuers[i].alive:points.append({"name":"pursuer"+str(i),"point":MMFAssets.v(sample.pursuers[i].position)})
		# Framing and actual rendered triangles, not the absent rooftop physics.
		if t<5.8:
			for actor in points:
				for height in [-.90,0,.90]:
					var point=actor.point+Vector3.UP*height;var screen=c.camera.unproject_position(point)/Vector2(root.size);view_checks+=1
					if c.camera.is_position_behind(point) or screen.x<.02 or screen.x>.98 or screen.y<.02 or screen.y>.98:offscreen.append([t,actor.name,MMFAssets.dict_v(point),str(screen)])
					var hit=roof.intersect_segment(c.camera.global_position,point)
					if hit.is_empty():hit=machine.intersect_segment(c.camera.global_position,point)
					if not hit.is_empty():ray_blocks.append([t,actor.name,height,MMFAssets.dict_v(hit.position)])
		for solid in [roof,machine]:
			if not solid.intersect_segment(previous,c.camera.global_position).is_empty():camera_contacts.append(t)
			for axis in [Vector3.RIGHT,Vector3.UP,Vector3.BACK]:
				if not solid.intersect_segment(c.camera.global_position-axis*.16,c.camera.global_position+axis*.16).is_empty():camera_contacts.append(t)
		previous=c.camera.global_position
		if t<2.35:
			for actor in points:
				if actor.point.x<14.5:continue
				for i in 17:
					var offset=Vector3(cos(i*TAU/16),0,sin(i*TAU/16))*.32 if i<16 else Vector3.ZERO
					var foot=actor.point-Vector3.UP*.93+offset;surface_checks+=1
					var hit=roof.intersect_segment(foot,foot+Vector3.UP*1.8)
					if not hit.is_empty():corridor_hits.append([t,actor.name,MMFAssets.dict_v(hit.position)])
	check(offscreen.is_empty(),"Hero and living pursuers stay framed throughout chase, jump and both shots")
	check(ray_blocks.is_empty(),"Roof and machine triangles do not obscure the actors' legs, torsos or heads")
	check(camera_contacts.is_empty(),"Continuous opening camera and its width clear the actual rooftop and machine")
	check(corridor_hits.is_empty(),"Authored roof fittings leave the complete sampled chase corridors clear")
	var grounding=c.rooftop.get_node("GroundedSiteStructure")
	var roof_meshes=MMFAssets.of_type(c.rooftop,"MeshInstance3D").filter(func(node):return not grounding.is_ancestor_of(node))
	check(roof_meshes.size()==6,"Original rooftop retains six static material batches above its grounded foundation")
	var roof_bodies=MMFAssets.of_type(c.rooftop,"CollisionObject3D")
	var low_footing=true
	for shape in MMFAssets.of_type(grounding,"CollisionShape3D"):
		low_footing=low_footing and shape.shape is BoxShape3D and shape.global_position.y+shape.shape.size.y*.5<7
	check(roof_bodies.all(func(node):return grounding.is_ancestor_of(node)) and low_footing,"Only the buried lower building adds collision; the original cinematic rooftop stays clear")
	var anchor=c.rooftop.find_child("TakeoffLedge",true,false)
	check(anchor!=null and anchor.global_position.distance_to(Vector3(14.5,19.522,0))<.001,"Authored ledge retains the exact existing launch anchor")
	p.pose_modifier.modification_processed.connect(modified)
	var aims=[]
	for t in [3.60,3.65,4.1,4.6,5.0,5.4]:
		c.time=t;c.event_cursor=c.timeline.events.size();c.update_opening(0)
		for i in 8:await process_frame
		var model=p.rifle_mesh;var grip=p.weapon_pose.anchors.rifle.SupportGrip
		var target=p.weapon_pose.scripted_target
		var angle=rad_to_deg(model.global_basis.z.angle_to(target-p.weapon_pose.muzzle_position()))
		var error=final_pose.errors.max() if not final_pose.errors.is_empty() else INF
		var support_error=final_pose.left.distance_to(grip.global_position)
		aims.append({"time":t,"boreAngleDegrees":angle,"chainErrorM":error,"supportErrorM":support_error})
		check(angle<1 and error<.003 and support_error<.004,"Return-fire rifle and both hands follow the elevated target at "+str(t))
	c.time=6.5;c.update_opening(0)
	for i in 8:await process_frame
	check(p.rifle_mesh.global_basis.z.y<0 and not final_pose.errors.is_empty() and final_pose.errors.max()<.003,"S-07 lowers the rifle after both pursuers are defeated")
	for fov in [45,72,100]:
		p.pitch=-.12;game.settings.fov=fov;c.time=9.97;c.update_opening(0)
		check(c.transition.color.a>.999,"Handoff hides the camera cut at player FOV "+str(fov))
		c.time=10.05;c.update_opening(.08)
		check(c.camera.global_transform.is_equal_approx(p.camera.global_transform) and is_equal_approx(c.camera.fov,p.camera.fov),"Handoff reveals the actual player camera/FOV "+str(fov))
	c.finish()
	check(not c.transition.visible and not p.weapon_pose.scripted_aim and p.weapon_pose.scripted_recoil==0,"Finish releases the transition and cinematic arm override")
	game.cinematic="signal";p.weapon_pose.scripted_aim=true
	for i in 3:await process_frame
	check(p.weapon_pose.last_targets.is_empty(),"A stale opening override cannot affect other cinematics")
	c.clear_scene();game.cinematic=""
	var report={"checks":checks,"failures":failures,"viewChecks":view_checks,"corridorChecks":surface_checks,"obscured":ray_blocks.slice(0,30),"obscuredCount":ray_blocks.size(),"offscreen":offscreen.slice(0,30),"cameraContacts":camera_contacts.slice(0,30),"corridorHits":corridor_hits.slice(0,30),"aims":aims}
	var file=FileAccess.open("res://../test-results/godot-native/opening-framing-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("FRAMING_RESULT ",checks," checks, ",failures.size()," failures; ",view_checks," views / ",surface_checks," corridor rays")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();call_deferred("quit",0 if failures.is_empty() else 1)
