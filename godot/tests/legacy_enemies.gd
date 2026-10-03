extends SceneTree

var game
var checks=0
var failures=[]
var observations={}
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-legacy-enemy-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func graph(node: Node,base: Node) -> Array:
	var entries=[[str(base.get_path_to(node)),node.get_class(),str(node.transform) if node is Node3D else ""]]
	for child in node.get_children():entries.append_array(graph(child,base))
	return entries
func identical_animation(a: Animation,b: Animation) -> bool:
	if a.length!=b.length or a.get_track_count()!=b.get_track_count():return false
	for t in a.get_track_count():
		if a.track_get_type(t)!=b.track_get_type(t) or a.track_get_path(t)!=b.track_get_path(t) or a.track_get_key_count(t)!=b.track_get_key_count(t) or a.track_get_interpolation_type(t)!=b.track_get_interpolation_type(t):return false
		for k in a.track_get_key_count(t):
			if a.track_get_key_time(t,k)!=b.track_get_key_time(t,k) or a.track_get_key_value(t,k)!=b.track_get_key_value(t,k) or a.track_get_key_transition(t,k)!=b.track_get_key_transition(t,k):return false
	return true
func review(kind: String):
	var original_path="res://assets/models/authored/"+kind+".glb";var path=MMFEnemyModels.path(kind)
	var original=load(original_path).instantiate();var refined=load(path).instantiate()
	var manifest=MMFAssets.json("res://art/character-refinement.json").models[kind]
	check(manifest.originalSha256==FileAccess.get_sha256(original_path) and manifest.refinedSha256==FileAccess.get_sha256("res://art/refined-"+kind+".glb") and manifest.compiledSha256==FileAccess.get_sha256(path),kind+": compiled model matches original rig and refined source hashes")
	check(graph(original,original)==graph(refined,refined),kind+": original native node names, types, hierarchy and local transforms are exact")
	var old_body=MMFAssets.find_named(original,kind+"_CraftedSkin");var body=MMFAssets.find_named(refined,kind+"_CraftedSkin")
	var old_sk=old_body.get_node(old_body.skeleton);var sk=body.get_node(body.skeleton);var same=old_sk.get_bone_count()==sk.get_bone_count()
	for i in old_sk.get_bone_count():same=same and old_sk.get_bone_name(i)==sk.get_bone_name(i) and old_sk.get_bone_parent(i)==sk.get_bone_parent(i) and old_sk.get_bone_rest(i)==sk.get_bone_rest(i)
	check(same,kind+": original skeleton names, parents and rest matrices are exact")
	same=old_body.skin.get_bind_count()==body.skin.get_bind_count()
	for i in old_body.skin.get_bind_count():same=same and old_body.skin.get_bind_name(i)==body.skin.get_bind_name(i) and old_body.skin.get_bind_pose(i)==body.skin.get_bind_pose(i)
	check(same and old_body.skeleton==body.skeleton,kind+": original inverse bind matrices and skeleton target are exact")
	var old_player=MMFAssets.of_type(original,"AnimationPlayer")[0];var player=MMFAssets.of_type(refined,"AnimationPlayer")[0]
	check(old_player.get_animation_list()==player.get_animation_list(),kind+": original animation names are retained")
	for key in old_player.get_animation_list():check(identical_animation(old_player.get_animation(key),player.get_animation(key)),kind+": exact original tracks, interpolation and keys for "+key)
	check(is_equal_approx(refined.get_meta("original_fit_height"),MMFAssets.bounds(original).size.y),kind+": original visual scale is retained independently of added equipment bounds")
	var triangles=0;var collapsed=0;var weights_valid=true;var pbr=0
	for s in body.mesh.get_surface_count():
		var data=body.mesh.surface_get_arrays(s);var points=data[Mesh.ARRAY_VERTEX];var ids=data[Mesh.ARRAY_INDEX];var bones=data[Mesh.ARRAY_BONES];var weights=data[Mesh.ARRAY_WEIGHTS]
		triangles+=ids.size()/3
		for i in range(0,ids.size(),3):
			if (points[ids[i+1]]-points[ids[i]]).cross(points[ids[i+2]]-points[ids[i]]).length_squared()<1e-24:collapsed+=1
		var slots=bones.size()/points.size()
		for i in points.size():
			var sum=0.0
			for k in slots:
				var at=i*slots+k;sum+=weights[at];weights_valid=weights_valid and is_finite(weights[at]) and weights[at]>=0 and bones[at]>=0 and bones[at]<body.skin.get_bind_count()
			weights_valid=weights_valid and absf(sum-1)<.0001
		var mat=body.get_active_material(s)
		if mat is BaseMaterial3D and mat.albedo_texture and mat.normal_enabled and mat.normal_texture and mat.roughness_texture:pbr+=1
	check(collapsed==0 and triangles<(100000 if kind=="raider" else 75000),kind+": smooth detail stays within triangle budget with no collapsed faces")
	check(weights_valid,kind+": every refined vertex has normalized valid original-joint weights")
	check(MMFAssets.of_type(refined,"MeshInstance3D").size()==1 and body.mesh.get_surface_count()<15 and pbr>=(8 if kind=="raider" else 4),kind+": refined PBR detail remains one skinned mesh with bounded surfaces")
	check(MMFAssets.of_type(refined,"Light3D").is_empty() and MMFAssets.of_type(refined,"CollisionObject3D").is_empty(),kind+": art introduces no gameplay collision or realtime lights")
	check(Array(ResourceLoader.get_dependencies(path)).all(func(p):return not p.contains(".glb")),kind+": compiled resource loads no obsolete model containers")
	var enemy=game.combat.spawn(kind,Vector3(50,16.05,0),true);enemy.set_physics_process(false)
	check(MMFAssets.find_named(enemy.visual,kind+"_CraftedSkin").mesh==body.mesh,kind+": actual enemy uses the refined shared mesh")
	check(is_equal_approx(enemy.visual.scale.y,1.92/MMFAssets.bounds(original).size.y) and is_equal_approx(enemy.get_child(0).shape.height,1.92) and is_equal_approx(enemy.get_child(0).shape.radius,enemy.definition.get("capsuleRadius",.36)),kind+": actual visual scale and original capsule are unchanged")
	enemy.animator.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	var min_height=INF;var max_height=-INF
	for time in [0.,.1,.25,.5]:
		enemy.animator.seek(time,true);await physics_frame;await physics_frame
		for y in preload("res://tests/enemy_sole_geometry.gd").foot_heights(enemy):min_height=minf(min_height,y);max_height=maxf(max_height,y)
	check(min_height>16.025 and max_height<16.075,kind+": actual animated boot soles remain grounded in idle")
	check(MMFAssets.json("res://data/enemy-footing.json").models[kind].sourceSha256==FileAccess.get_sha256(path),kind+": offline footing is rebuilt for the compiled model")
	observations[kind]={"triangles":triangles,"collapsed":collapsed,"surfaces":body.mesh.get_surface_count(),"pbrSurfaces":pbr,"minIdleSoleY":min_height,"maxIdleSoleY":max_height}
	original.free();refined.free();enemy.queue_free();game.combat.enemies.clear();await process_frame
func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	while not game.get_node("EncounterAssets").finished:await process_frame
	game.started=true;game.session.opening_done=true;game.close_menu()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	for kind in ["raider","scavenger"]:await review(kind)
	var a=load(MMFEnemyModels.path("raider")).instantiate();var b=load(MMFEnemyModels.path("scavenger")).instantiate()
	var textures=[];var shared=false
	for model in [a,b]:
		for mesh in MMFAssets.of_type(model,"MeshInstance3D"):
			for i in mesh.mesh.get_surface_count():
				var mat=mesh.get_active_material(i)
				if mat is BaseMaterial3D and mat.albedo_texture:
					if model==b and mat.albedo_texture in textures:shared=true
					elif model==a:textures.append(mat.albedo_texture)
	check(shared,"Both enemies share identical worn-alloy texture resources")
	a.free();b.free()
	var file=FileAccess.open("res://../test-results/godot-native/legacy-enemy-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify({"checks":checks,"failures":failures,"observations":observations},"\t"));file.close()
	print("LEGACY_ENEMY_RESULT ",checks," checks, ",failures.size()," failures")
	game.open_menu("Pause");var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit",0 if failures.is_empty() else 1)
