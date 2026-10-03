extends SceneTree

var checks=0
var failures=[]
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-scenery-contract/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);push_error(label)

static func signature(chunk: Node3D) -> String:
	var entries=[]
	for node in chunk.get_children():
		if node is MeshInstance3D:
			# Duplicate-node counters are process-global; compare visible geometry.
			entries.append([node.get_meta("landmark_kind",""),node.transform,node.mesh.resource_path,node.visibility_range_end,node.cast_shadow])
		elif node is MultiMeshInstance3D:
			var transforms=[]
			for i in node.multimesh.instance_count:transforms.append(node.multimesh.get_instance_transform(i))
			entries.append([node.multimesh.mesh.resource_path,transforms,node.visibility_range_end,node.cast_shadow])
		elif node.has_meta("ambient_kind"):
			entries.append([node.get_meta("ambient_kind"),node.transform])
	entries.append(chunk.get_meta("scenery_bounds",[]))
	return str(entries).sha256_text()

func run():
	# Native variety intentionally supersedes the old browser scenery hashes.
	# desert-fixtures.json is still checked through generate_legacy in integration.
	# Check real rendered transforms against fresh, reverse-order and resumed
	# builds; headless dummy rendering cannot retain MultiMesh buffers.
	if DisplayServer.get_name()=="headless":push_error("Scenery contract comparison requires GPU rendering");quit(1);return
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	var observed_world=game.world;var report={}
	var initial_random=game.session.rng.state
	for spec in [["first",0.0,0.0],["distant",1216.3,262.4]]:
		game.session.seed_name="streaming-contract-"+spec[0];game.session.distance=spec[1];game.session.lateral=spec[2]
		observed_world.refresh_chunks(true)
		var chunks={}
		for key in observed_world.chunks:chunks[str(key)]=signature(observed_world.chunks[key])
		report[spec[0]]=chunks
		var keys=observed_world.chunks.keys();keys.reverse()
		for key in keys:
			var builder=MMFSceneryChunk.new(observed_world,key)
			# Pause at a real preparation boundary, then finish in another frame.
			builder.step();await process_frame
			var fresh=builder.finish()
			check(signature(fresh)==chunks[str(key)],spec[0]+": reverse/resumed geometry "+str(key))
			fresh.free();builder=null
		observed_world.refresh_chunks(true)
		for key in observed_world.chunks:
			check(signature(observed_world.chunks[key])==chunks[str(key)],spec[0]+": forced reload geometry "+str(key))
	check(initial_random==game.session.rng.state,"Scenery generation preserves the gameplay random stream")
	var file=FileAccess.open("res://../test-results/godot-native/scenery-contract.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	var result=FileAccess.open("res://../test-results/godot-native/scenery-contract-checks.json",FileAccess.WRITE);result.store_string(JSON.stringify({"checks":checks,"failures":failures,"passed":failures.is_empty()},"\t"));result.close()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear()
	print("SCENERY_CONTRACT ",checks," checks; failures=",failures);quit(0 if failures.is_empty() else 1)
