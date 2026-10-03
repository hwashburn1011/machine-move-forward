extends SceneTree

var checks=0
var failures=[]
var game
var captures=false
var camera: Camera3D
var output="res://../assets/art100/story-robots/review/"
var assemblies={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://art100-story-robot-tests/"
	captures=DisplayServer.get_name()!="headless"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label)
	print("PASS " if ok else "FAIL ",label)

func capture(id: String):
	if not captures:return
	await process_frame;await process_frame;await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path(output+id+".png"))

func stand_clear(at: Vector3) -> bool:
	return game.player.boundary.fits(at+Vector3.UP*.05)

func posed_bounds(enemy,skip: Node=null) -> AABB:
	var initialized=false;var result=AABB();var relative=enemy.global_transform.affine_inverse()
	for mesh in MMFAssets.of_type(enemy.visual,"MeshInstance3D"):
		if skip and skip.is_ancestor_of(mesh):continue
		var matrices=[]
		if mesh.skin:
			var skeleton=mesh.get_node(mesh.skeleton)
			for b in mesh.skin.get_bind_count():
				var name=mesh.skin.get_bind_name(b);var bone=skeleton.find_bone(name) if name!=&"" else mesh.skin.get_bind_bone(b)
				matrices.append(relative*skeleton.global_transform*skeleton.get_bone_global_pose(bone)*mesh.skin.get_bind_pose(b))
		for s in mesh.mesh.get_surface_count():
			var arrays=mesh.mesh.surface_get_arrays(s);var vertices=arrays[Mesh.ARRAY_VERTEX];var bones=arrays[Mesh.ARRAY_BONES];var weights=arrays[Mesh.ARRAY_WEIGHTS]
			var stride=bones.size()/vertices.size() if bones!=null else 0
			for v in vertices.size():
				var at=Vector3.ZERO
				if stride and not matrices.is_empty():
					for i in stride:
						var weight=weights[v*stride+i]
						if weight>0:at+=matrices[bones[v*stride+i]]*vertices[v]*weight
				else:at=relative*mesh.global_transform*vertices[v]
				if not initialized:result=AABB(at,Vector3.ZERO);initialized=true
				else:result=result.expand(at)
	return result

func bounds_record(box: AABB) -> Dictionary:
	return {"minimum":MMFAssets.dict_v(box.position),"maximum":MMFAssets.dict_v(box.end),"dimensions_m":MMFAssets.dict_v(box.size)}

func run():
	var manifest=MMFAssets.json("res://../assets/art100/story-robots/manifest.json")
	# Protected intact bodies captured before this iteration. Comparing only the
	# same body with/without attachments cannot detect a shifted skin export.
	var intact_reference=MMFAssets.json("res://../assets/art100/story-robots/art200-before/native-validation-gpu.json").complete_character_assemblies
	check(manifest.models.size()==25,"25 unique story/robot assembled model entries")
	for entry in manifest.models:
		var model=MMFArt100Story.part(entry.id)
		var bounds=MMFAssets.bounds(model)
		check(not MMFAssets.of_type(model,"MeshInstance3D").is_empty(),entry.id+" has native renderable geometry")
		check(bounds.size.distance_to(MMFAssets.v(entry.dimensions_m))<.005,entry.id+" metre-scale bounds match source")
		if entry.status=="new":check(absf(bounds.position.y)<.015,entry.id+" floor contact is grounded")
		model.free()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	for i in 8:await physics_frame
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	if captures:
		DisplayServer.window_set_size(Vector2i(1280,900));game.ui.root.hide();game.player.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
		camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.fov=42
	# Early equipment is supported by the actual destination deck, not a guessed
	# universal ground level, and leaves every interaction standing point open.
	for index in 5:
		game.session.story.index=index;game.session.story.phase="docked";game.session.story.arrival=game.session.distance
		game.campaign.create_destination(game.campaign.expedition())
		for i in 3:await physics_frame
		var destination=game.campaign.destination
		var group=destination.get_node("Art100Destination")
		for model in group.get_children():
			var below=model.global_position+Vector3(0,.02,0)
			var hit=game.raycast(below,below-Vector3.UP*.12,[],1)
			check(not hit.is_empty() and destination.is_ancestor_of(hit.collider),"Actual deck supports "+String(model.name)+" at "+String(game.campaign.destination_id))
		for point in game.campaign.points:
			# Reward/control anchors can lie in their own fixture; this is the
			# documented one metre approach side used by expedition test fixtures.
			var at=destination.to_global(point.at)
			var blocked_by_art=false
			var query=PhysicsShapeQueryParameters3D.new();query.shape=game.player.capsule_shape;query.transform=Transform3D(Basis.IDENTITY,Vector3(at.x,17.1,at.z+1));query.collision_mask=1
			for hit in game.get_world_3d().direct_space_state.intersect_shape(query,32):
				if group.is_ancestor_of(hit.collider):blocked_by_art=true
			check(not blocked_by_art,"New dressing preserves "+String(point.entry.get("id",point.entry.get("anchor","control")))+" approach")
		if captures and index==1:
			camera.position=destination.to_global(Vector3(-2.5,2.3,-.6));camera.look_at(destination.to_global(Vector3(-5.2,.8,-3.8)));await capture("native-foundry-service")
	game.campaign.destination.queue_free();game.campaign.destination=null
	game.session.story.phase="finale-docked";game.session.finale.stage="berth";game.session.finale.berth_distance=game.session.distance
	var berth=MMFMeridianBerth.new();game.finale.berth=berth;game.add_child(berth);berth.setup(game)
	for i in 3:await physics_frame
	var group=berth.get_node("Art100Berth")
	var distinct={}
	for model in group.get_children():
		if model.has_meta("art100_id"):distinct[model.get_meta("art100_id")]=true
	check(distinct.size()==19,"All nineteen story assemblies deployed in playable receiving berth")
	for point in berth.points:
		check(stand_clear(berth.to_global(point.at+Vector3(0,0,0 if point.id=="return" else .4))),"Berth interaction standing room: "+point.id)
	for x in range(-5,5):check(stand_clear(berth.to_global(Vector3(x,0,0))),"Continuous berth central aisle "+str(x))
	for model in group.get_children():
		var bounds=MMFAssets.bounds(model)
		check(absf(bounds.position.y+model.position.y)<.02,"Berth model feet touch deck: "+String(model.name))
	game.session.finale.powered=true;game.session.finale.seeds=true;game.session.finale.policy="open";berth.sync()
	check(MMFAssets.find_named(group,"LivingSprouts").visible,"Seed-transfer state reveals authored seedlings")
	check(berth.sprouts.all(func(s):return not s.visible),"Original primitive seedlings remain retired on restored state")
	var status=group.get_node("BerthReferenceDesk/FinaleStatus").material_override
	berth.sync();check(status==group.get_node("BerthReferenceDesk/FinaleStatus").material_override,"Stable status reuses material instance")
	if captures:
		camera.position=berth.to_global(Vector3(-9,7,10));camera.look_at(berth.to_global(Vector3(0,1,0)));await capture("native-berth-overview")
		camera.position=berth.to_global(Vector3(-2.7,2.3,-1.3));camera.look_at(berth.to_global(Vector3(.7,1,-4.7)));await capture("native-berth-preservation")
	# Full native characters, original floor placement, retained pose and weapons.
	MMFAssets.box(game,Vector3(12,.2,12),Vector3(60,15.93,0),MMFAssets.material(Color(.15,.16,.15)))
	for kind in MMFArt100RobotDetails.MODELS:
		assemblies[kind]={}
		var enemy=game.combat.spawn(kind,Vector3(60,16.04,0));enemy.set_physics_process(false);enemy.hp_label.hide()
		for i in 3:await process_frame
		check(enemy.visual.has_meta("art100_refined"),kind+" uses refined complete assembly")
		var mount=MMFAssets.find_named(enemy.visual,"Art100TorsoMount")
		check(mount is BoneAttachment3D,kind+" equipment follows original torso bone")
		var skeleton=MMFAssets.of_type(enemy.visual,"Skeleton3D")[0]
		var index=skeleton.find_bone(mount.bone_name)
		var local=skeleton.get_bone_global_rest(index)*mount.get_child(0).transform
		check(local.is_equal_approx(Transform3D.IDENTITY),kind+" exact original rest frame retained")
		var collider=enemy.get_child(0).shape
		check(is_equal_approx(collider.height,1.92),kind+" gameplay capsule height unchanged")
		for clip in ["idle","walk","polish_attack"]:
			enemy.play(clip,true)
			if enemy.animator:enemy.animator.advance(.25);enemy.animator.pause()
			await process_frame
			var before=posed_bounds(enemy,mount);var after=posed_bounds(enemy)
			assemblies[kind][clip]={"original_same_pose":bounds_record(before),"refined_complete_assembly":bounds_record(after),"original_ground_offset_m":before.position.y+enemy.position.y-16.03,"refined_ground_offset_m":after.position.y+enemy.position.y-16.03}
			check(absf(before.position.y-after.position.y)<.001,kind+" "+clip+" retains original sole grounding")
			var reference=intact_reference[kind][clip].original_same_pose
			var minimum_shift=before.position.distance_to(MMFAssets.v(reference.minimum))
			var maximum_shift=before.end.distance_to(MMFAssets.v(reference.maximum))
			assemblies[kind][clip].protected_reference_maximum_bound_shift_m=maxf(minimum_shift,maximum_shift)
			check(minimum_shift<.004 and maximum_shift<.004,kind+" "+clip+" body minimum and maximum stay within 4 mm of intact retained skin")
			if captures:
				camera.position=enemy.position+Vector3(2.6,1.9,3.2);camera.look_at(enemy.position+Vector3(0,1,0))
				if clip=="idle":
					var overrides={};mount.hide()
					for mesh in enemy.meshes:
						if mount.is_ancestor_of(mesh):continue
						var previous=[]
						for i in mesh.mesh.get_surface_count():
							previous.append(mesh.get_surface_override_material(i))
							mesh.set_surface_override_material(i,mesh.get_meta("art100_original_materials",[])[i])
						overrides[mesh]=previous
					await capture("native-"+kind+"-before")
					for mesh in overrides:
						for i in overrides[mesh].size():mesh.set_surface_override_material(i,overrides[mesh][i])
					mount.show()
				await capture("native-"+kind+"-"+clip)
		if captures:
			camera.position=enemy.position+Vector3(-2.3,1.8,-3.1);camera.look_at(enemy.position+Vector3(0,1.1,0));await capture("native-"+kind+"-rear")
		var meshes_after=enemy.meshes.size();MMFArt100RobotDetails.apply(enemy)
		check(enemy.meshes.size()==meshes_after,kind+" refinement application is idempotent")
		enemy.queue_free();await process_frame;game.combat.enemies.clear()
	var report={"checks":checks,"failures":failures,"native_captures":captures,"complete_character_assemblies":assemblies,"dimension_method":"CPU skinned vertices using current original bone poses and skin bind matrices; includes equipment; enemy-local metres, compared to same pose without new attachments"}
	var file=FileAccess.open("res://../assets/art100/story-robots/native-validation.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("ART100_STORY_ROBOTS ",report)
	while game.combat.nav.is_baking():await process_frame
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Story.clear_cache();MMFArt100RobotDetails.clear_cache();MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs)
	quit(0 if failures.is_empty() else 1)
