extends SceneTree

func _initialize():set_meta("test_mode",true);call_deferred("run")

static func signature(chunk: Node3D) -> String:
	var entries=[]
	for node in chunk.get_children():
		if node is MeshInstance3D:
			# Automatic duplicate-node names contain process-global counters; mesh
			# identity and transforms are the reproducible visual contract instead.
			entries.append([node.transform,node.mesh.resource_path,node.visibility_range_end,node.cast_shadow])
		elif node is MultiMeshInstance3D:
			var transforms=[]
			for i in node.multimesh.instance_count:transforms.append(node.multimesh.get_instance_transform(i))
			entries.append([node.multimesh.mesh.resource_path,transforms,node.visibility_range_end,node.cast_shadow])
		elif node.has_meta("ambient_kind"):
			entries.append([node.get_meta("ambient_kind"),node.transform])
	return str(entries).sha256_text()

func run():
	# The dummy headless renderer does not retain real MultiMesh transform
	# buffers. This fixture compares the actual GPU-visible instance data.
	if DisplayServer.get_name()=="headless":push_error("Scenery contract comparison requires GPU rendering");quit(1);return
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	var observed_world=game.world
	if "--baseline" in OS.get_cmdline_user_args():
		observed_world=load("res://../test-results/godot-native/world-before.gd").new();game.add_child(observed_world);observed_world.setup(game)
	var report={}
	for spec in [["first",0.0,0.0],["distant",1216.3,262.4]]:
		game.session.seed_name="streaming-contract-"+spec[0];game.session.distance=spec[1];game.session.lateral=spec[2]
		observed_world.refresh_chunks(true)
		var chunks={}
		for key in observed_world.chunks:chunks[str(key)]=signature(observed_world.chunks[key])
		report[spec[0]]=chunks
	var file=FileAccess.open("res://../test-results/godot-native/scenery-contract.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	var failures=[];var checks=0
	if "--baseline" not in OS.get_cmdline_user_args():
		var expected=MMFAssets.json("res://data/scenery-fixtures.json")
		for scenario in expected:
			for key in expected[scenario]:
				checks+=1
				if report[scenario].get(key)!=expected[scenario][key]:failures.append(scenario+":"+key)
		var result=FileAccess.open("res://../test-results/godot-native/scenery-contract-checks.json",FileAccess.WRITE);result.store_string(JSON.stringify({"checks":checks,"failures":failures,"passed":failures.is_empty()},"\t"));result.close()
	while game.combat.nav.is_baking():await create_timer(.1).timeout
	game.queue_free();await create_timer(.1).timeout;MMFAssets.cache.clear();print("SCENERY_CONTRACT ",checks," checks; failures=",failures);quit(0 if failures.is_empty() else 1)
