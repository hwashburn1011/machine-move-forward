extends SceneTree

var game
var checks=0
var failures=[]
var report={"retained":[],"models":[],"collision":[]}
var manifest={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-bench-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func vertices(mesh: MeshInstance3D) -> Array:
	var result=[]
	for surface in mesh.mesh.get_surface_count():
		for p in mesh.mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]:result.append(mesh.global_transform*p)
	return result

func cell(p: Vector3) -> Vector3i:return Vector3i(floori(p.x*500),floori(p.y*500),floori(p.z*500))

func retained_distance(expected: Array,actual: Array) -> float:
	var bins={};var worst=0.0
	for p in actual:
		var key=cell(p)
		if not bins.has(key):bins[key]=[]
		bins[key].append(p)
	for p in expected:
		var key=cell(p);var nearest=INF
		for x in range(-1,2):
			for y in range(-1,2):
				for z in range(-1,2):
					for q in bins.get(key+Vector3i(x,y,z),[]):nearest=minf(nearest,p.distance_to(q))
		worst=maxf(worst,nearest)
	return worst

func ray(node: Node3D,a: Vector3,b: Vector3):return game.raycast(node.global_transform*a,node.global_transform*b,[],1)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	for frame in 2:await physics_frame
	await process_frame
	var machine=game.world.machine;var bank=MMFAssets.find_named(machine,"NativeServiceBenches")
	manifest=MMFAssets.json("res://art/nomad-benches.json")
	check(bank!=null and bank.get_child_count()==6,"Six complete service benches replace the original assemblies")
	if bank==null:quit(1);return
	var original=MMFAssets.scene("runtime/machine.glb");root.add_child(original);original.hide()
	var pump_manifest=MMFAssets.json("res://art/nomad-pumps.json");var cabinet_boxes=MMFAssets.json("res://art/nomad-switchgear.json").originalBoxes
	for entry in manifest.trim:
		var retained=MMFAssets.find_named(machine,entry.original);var old=MMFAssets.find_named(original,entry.frozen)
		var expected=vertices(old).filter(func(p):
			if preload("res://tests/bench_trim.gd").removed(p,entry.frozen,manifest):return false
			if entry.frozen=="Workshop_overhead_cable_tray004_1":return true
			if p.y>12.425 and p.y<14.59 and p.z>9.91 and p.z<10.85 and [8,4,0,-4,-8].any(func(x):return p.x-x>-.40 and p.x-x<.32):return false
			if entry.frozen.begins_with("Brace_"):
				if preload("res://tests/pump_trim.gd").removed(p,entry.frozen,pump_manifest):return false
				for box in cabinet_boxes:
					if p.x>box.min[0]-.003 and p.x<box.max[0]+.003 and p.y>box.min[1]-.003 and p.y<box.max[1]+.003 and p.z>box.min[2]-.003 and p.z<box.max[2]+.003:return false
			return true)
		if expected.is_empty():
			check(retained==null and entry.replacement=="","Fully replaced old case batch is removed");continue
		var actual=vertices(retained);var distance=maxf(retained_distance(expected,actual),retained_distance(actual,expected))
		check(distance<.001,"All unrelated frozen workshop vertices retain 1 mm accuracy: "+entry.original)
		check(retained.get_active_material(0)==old.get_active_material(0),"Retained batch preserves its original material: "+entry.original)
		report.retained.append({"name":entry.original,"maxDistanceM":distance,"expectedVertices":expected.size(),"actualVertices":actual.size()})
	var collision_manifest=MMFAssets.json("res://art/nomad-benches-collision.json")
	var raw=game.runtime.colliders[int(collision_manifest.sourceCollider)];var body=MMFAssets.find_named(game.world,"NativeWorkshopCollision")
	var faces=body.get_child(0).shape.get_faces();var cursor=0;var changed=0;var removed=0;var pump_removed=0;var intake_removed=0
	for j in range(0,raw.indices.size(),3):
		var tri=[]
		for k in [0,2,1]:
			var index=int(raw.indices[j+k])*3;tri.append(Vector3(raw.vertices[index],raw.vertices[index+1],raw.vertices[index+2]))
		if tri.all(func(p):return preload("res://tests/bench_trim.gd").removed(p,"Brace_welded_receiver001",manifest)):removed+=1;continue
		if tri.all(func(p):return preload("res://tests/pump_trim.gd").removed(p,"Brace_welded_receiver001",pump_manifest)):pump_removed+=1;continue
		if tri.all(func(p):return preload("res://tests/intake_trim.gd").removed(p)):intake_removed+=1;continue
		for p in tri:
			if cursor>=faces.size() or not faces[cursor].is_equal_approx(p):changed+=1
			cursor+=1
	check(removed==int(collision_manifest.removedBenchTriangles) and pump_removed==4000 and intake_removed==12724 and changed==0 and cursor==faces.size(),"Only old benches, pumps and intake leave the frozen collision; every other triangle and winding is exact")
	report.physics={"removedBenchTriangles":removed,"priorPumpRemoved":pump_removed,"retainedTriangles":cursor/3,"changedVertices":changed}
	var meshes={};var materials={};var shapes={};var transforms={}
	for i in bank.get_child_count():
		var node=bank.get_child(i);var site=manifest.sites[i];var bounds=MMFAssets.bounds(node);var at=MMFAssets.v(site.position)
		check(node.position.is_equal_approx(at) and (-node.basis.z).is_equal_approx(Vector3.BACK if at.z<0 else Vector3.FORWARD),"Bench keeps its original site and faces the usable central aisle: "+str(i+1))
		check(absf(bounds.position.y)<.001 and bounds.end.y<=1.051,"Bench feet contact the deck and tools stay below the old assembly height: "+str(i+1))
		var world_bounds=node.transform*bounds;var allowed=manifest.originalBoxes[i]
		check(world_bounds.position.x>=allowed.min[0]-.003 and world_bounds.end.x<=allowed.max[0]+.003 and world_bounds.position.z>=allowed.min[2]-.003 and world_bounds.end.z<=allowed.max[2]+.003,"All hardware remains inside the old complete footprint: "+str(i+1))
		var surface=MMFAssets.find_named(node,"WorkSurface")
		check(surface!=null and absf(surface.global_position.y-(at.y+.7583333333))<.001,"Original worktop height is preserved: "+str(i+1))
		var triangles=0;var collapsed=0;var painted=0
		for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
			meshes[mesh.mesh]=true;transforms[mesh]=mesh.global_transform
			for s in mesh.mesh.get_surface_count():
				var material=mesh.get_active_material(s);materials[material]=true
				if material is StandardMaterial3D and material.albedo_texture and material.normal_enabled and material.roughness_texture:painted+=1
				var arrays=mesh.mesh.surface_get_arrays(s);var points=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX];triangles+=indices.size()/3
				for j in range(0,indices.size(),3):
					if (points[indices[j+1]]-points[indices[j]]).cross(points[indices[j+2]]-points[indices[j]]).length_squared()<1e-18:collapsed+=1
		check(triangles<48000 and painted==3 and collapsed==0,"Detailed bench uses three portable PBR surfaces and has no collapsed triangles: "+str(i+1))
		var collision=MMFAssets.find_named(game.world,site.name+"Collision");var shape=collision.get_child(0).shape;shapes[shape]=true
		check(shape.get_faces().size()/3==int(collision_manifest.replacementTrianglesPerBench),"Collision uses the simplified authoring mesh: "+str(i+1))
		var top=ray(node,Vector3(-.2,1.2,-.2),Vector3(-.2,.5,-.2))
		check(not top.is_empty() and top.collider==collision and absf(top.position.y-(at.y+.7583333333))<.002,"Worktop collision matches the visible steel surface: "+str(i+1))
		var leg=ray(node,Vector3(.81,.4,-.7),Vector3(.81,.4,-.15))
		check(not leg.is_empty() and leg.collider==collision,"Walking/shooting collision meets the actual frame leg: "+str(i+1))
		check(ray(node,Vector3(.62,.4,0),Vector3(.98,.4,0)).is_empty(),"Open endframe has no obsolete solid-pedestal collision: "+str(i+1))
		check(ray(node,Vector3(-.42,1.12,0),Vector3(-.42,.89,0)).is_empty(),"Removed plain case leaves no floating ghost collision: "+str(i+1))
		var front=-node.basis.z;game.player.teleport(at+front*1.35+Vector3.UP*.05);game.player.yaw=site.yaw+PI
		check(game.player.boundary.fits(game.player.position),"Bench service approach is supported: "+str(i+1))
		game.player.set_physics_process(true);Input.action_press("forward")
		for frame in 35:await physics_frame
		Input.action_release("forward");game.player.set_physics_process(false)
		var stop=(game.player.position-at).dot(front)
		check(stop>.45 and stop<.9 and absf(game.player.position.y-at.y)<.08,"Actual player stops at the bench from its service aisle: "+str(i+1))
		report.collision.append({"site":site.name,"playerStopM":stop,"playerY":game.player.position.y});report.models.append({"bounds":str(bounds),"triangles":triangles,"collapsed":collapsed})
	check(meshes.size()==5 and materials.size()==5 and shapes.size()==1,"All six benches share five render resources and one collision shape")
	check(MMFAssets.of_type(bank,"Light3D").is_empty() and MMFAssets.of_type(bank,"CollisionObject3D").is_empty(),"Decorative art adds no lights or per-triangle render physics")
	game.session.story.phase="locked";game.session.scanner.phase="consumed"
	for frame in 30:game.world.update(1.0/60)
	check(transforms.keys().all(func(mesh):return mesh.global_transform.is_equal_approx(transforms[mesh])),"Benches, cases and tools stay fixed to the machine during gait")
	original.queue_free();meshes.clear();materials.clear();shapes.clear();transforms.clear();game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Clean bench test shutdown")
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/benches-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("BENCH_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
