extends "res://tests/legacy_enemies.gd"

# Animation/rig preservation matters more than image pixel similarity here.
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-character-refinement-tests/";call_deferred("run")
func review_character(kind: String):
	var original_path="res://assets/models/authored/"+kind+".glb"
	var path=MMFEnemyModels.PLAYER if kind=="s07-player" else MMFEnemyModels.path(kind)
	var original=load(original_path).instantiate();var refined=load(path).instantiate()
	var manifest=MMFAssets.json("res://art/character-refinement.json").models[kind]
	check(manifest.originalSha256==FileAccess.get_sha256(original_path) and manifest.refinedSha256==FileAccess.get_sha256("res://art/refined-"+kind+".glb") and manifest.compiledSha256==FileAccess.get_sha256(path),kind+": compiled source provenance")
	check(graph(original,original)==graph(refined,refined),kind+": exact original node graph and sockets")
	var oldbody=MMFAssets.of_type(original,"MeshInstance3D").filter(func(m):return m.skin!=null)[0]
	var body=MMFAssets.of_type(refined,"MeshInstance3D").filter(func(m):return m.skin!=null)[0]
	var oldsk=oldbody.get_node(oldbody.skeleton);var sk=body.get_node(body.skeleton)
	var same=oldsk.get_bone_count()==sk.get_bone_count()
	for i in oldsk.get_bone_count():same=same and oldsk.get_bone_name(i)==sk.get_bone_name(i) and oldsk.get_bone_parent(i)==sk.get_bone_parent(i) and oldsk.get_bone_rest(i)==sk.get_bone_rest(i)
	check(same,kind+": exact original skeleton and rest matrices")
	same=oldbody.skin.get_bind_count()==body.skin.get_bind_count()
	for i in oldbody.skin.get_bind_count():same=same and oldbody.skin.get_bind_name(i)==body.skin.get_bind_name(i) and oldbody.skin.get_bind_pose(i)==body.skin.get_bind_pose(i)
	check(same and body.skeleton==oldbody.skeleton,kind+": exact original inverse bindings")
	var oldanim=MMFAssets.of_type(original,"AnimationPlayer")[0];var anim=MMFAssets.of_type(refined,"AnimationPlayer")[0]
	check(oldanim.get_animation_list()==anim.get_animation_list(),kind+": original animation names")
	for key in oldanim.get_animation_list():check(identical_animation(oldanim.get_animation(key),anim.get_animation(key)),kind+": exact animation keys for "+key)
	var triangles=0;var valid=true;var normals_valid=true;var collapsed=0;var pbr=0
	for s in body.mesh.get_surface_count():
		var a=body.mesh.surface_get_arrays(s);var points=a[Mesh.ARRAY_VERTEX];var ids=a[Mesh.ARRAY_INDEX];var bones=a[Mesh.ARRAY_BONES];var weights=a[Mesh.ARRAY_WEIGHTS];var normals=a[Mesh.ARRAY_NORMAL];var tangents=a[Mesh.ARRAY_TANGENT]
		triangles+=ids.size()/3
		for i in range(0,ids.size(),3):
			if (points[ids[i+1]]-points[ids[i]]).cross(points[ids[i+2]]-points[ids[i]]).length_squared()<1e-24:collapsed+=1
		var slots=bones.size()/points.size()
		for i in points.size():
			var total=0.
			for k in slots:
				var at=i*slots+k;total+=weights[at];valid=valid and is_finite(weights[at]) and weights[at]>=0 and bones[at]>=0 and bones[at]<body.skin.get_bind_count()
			valid=valid and absf(total-1)<.0001
			normals_valid=normals_valid and normals[i].is_finite() and normals[i].length()>.99
			if tangents!=null:
				var tangent=Vector3(tangents[i*4],tangents[i*4+1],tangents[i*4+2]);normals_valid=normals_valid and tangent.is_finite() and tangent.length()>.99
		var mat=body.mesh.surface_get_material(s)
		if mat is BaseMaterial3D and mat.albedo_texture and mat.normal_enabled and mat.normal_texture and mat.roughness_texture:pbr+=1
	check(valid,kind+": all weights normalized on original joints")
	check(normals_valid and collapsed==0,kind+": finite unit shading vectors and no collapsed faces")
	check(triangles<(170000 if kind=="s07-player" else 140000) and body.mesh.get_surface_count()<=15,kind+": bounded geometry and draw surfaces")
	var original_pbr=0
	for s in oldbody.mesh.get_surface_count():
		var mat=oldbody.mesh.surface_get_material(s)
		if mat is BaseMaterial3D and mat.albedo_texture and mat.normal_enabled and mat.normal_texture and mat.roughness_texture:original_pbr+=1
	check(pbr>=original_pbr and pbr>=3,kind+": textured color, normals and roughness coverage retained")
	check(MMFAssets.of_type(refined,"MeshInstance3D").size()==1 and MMFAssets.of_type(refined,"Light3D").is_empty() and MMFAssets.of_type(refined,"CollisionObject3D").is_empty(),kind+": one shared skin without lights or colliders")
	check(is_equal_approx(refined.get_meta("original_fit_height"),MMFAssets.bounds(original).size.y),kind+": original visual scale retained")
	if kind=="s07-player":
		check(MMFAssets.find_named(game.player.visual,body.name).mesh==body.mesh,"Actual S-07 uses the refined skin")
		var socket=MMFAssets.find_named(game.player.visual,"WeaponSocket")
		var socket_matches=game.player.weapon_socket==socket if socket else game.player.weapon_socket is BoneAttachment3D and game.player.weapon_socket.bone_name in ["hand_r","WeaponSocket"]
		check(socket_matches and game.player.weapon_pose.valid and is_equal_approx(game.player.capsule_shape.height,1.92),"Player weapon socket and collision retained")
	else:
		var enemy=game.combat.spawn(kind,Vector3(50,16.05,0),true);enemy.set_physics_process(false)
		var active=MMFAssets.find_named(enemy.visual,body.name)
		check(active.mesh==(MMFEnemyEquipment.SOVEREIGN_BODY if kind=="sovereign" else body.mesh),kind+": actual enemy uses the refined mesh")
		check(is_equal_approx(enemy.visual.scale.y,1.92/MMFAssets.bounds(original).size.y),kind+": actual fit unchanged")
		check(MMFAssets.json("res://data/enemy-footing.json").models[kind].sourceSha256==FileAccess.get_sha256(path),kind+": fresh animated footing bake")
		enemy.queue_free();game.combat.enemies.clear();await process_frame
	observations[kind]={"triangles":triangles,"surfaces":body.mesh.get_surface_count(),"pbrSurfaces":pbr,"collapsed":collapsed}
	original.free();refined.free()
func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	while not game.get_node("EncounterAssets").finished:await process_frame
	game.started=true;game.session.opening_done=true;game.close_menu()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	for kind in ["s07-player","bastion","revenant","warden","sovereign","raider","scavenger"]:await review_character(kind)
	var file=FileAccess.open("res://../test-results/godot-native/character-refinement-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify({"checks":checks,"failures":failures,"observations":observations},"\t"));file.close()
	print("CHARACTER_REFINEMENT_RESULT ",checks," checks, ",failures.size()," failures")
	game.open_menu("Pause");var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);quit(0 if failures.is_empty() else 1)
