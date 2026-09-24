extends SceneTree

var game
var checks=0
var failures=[]
var report={"retained":[],"models":[],"collision":[]}
var pump_manifest={}
var switchgear_manifest={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-pump-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func prior_removed(p: Vector3,entry) -> bool:
	if not entry.priorWorkshopRemoval:return false
	for box in switchgear_manifest.originalBoxes:
		if p.x>box.min[0]-.003 and p.x<box.max[0]+.003 and p.y>box.min[1]-.003 and p.y<box.max[1]+.003 and p.z>box.min[2]-.003 and p.z<box.max[2]+.003:return true
	return entry.frozen in ["Brace_welded_receiver001","Brace_welded_receiver001_5"] and p.y>12.425 and p.y<14.59 and p.z>9.91 and p.z<10.85 and [8,4,0,-4,-8].any(func(x):return p.x-x>-.40 and p.x-x<.32)

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

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	for frame in 2:await physics_frame
	await process_frame
	var machine=game.world.machine;var bank=MMFAssets.find_named(machine,"NativeServicePumps")
	pump_manifest=MMFAssets.json("res://art/nomad-pumps.json");switchgear_manifest=MMFAssets.json("res://art/nomad-switchgear.json")
	check(bank!=null and bank.get_child_count()==2,"Two complete pump skids replace the old disconnected assemblies")
	if bank==null:quit(1);return
	var original=MMFAssets.scene("runtime/machine.glb");root.add_child(original);original.hide()
	var physical_manifest=MMFAssets.json("res://art/nomad-pumps-collision.json")
	var raw=game.runtime.colliders[int(physical_manifest.sourceCollider)]
	var body=MMFAssets.find_named(game.world,"NativeWorkshopCollision")
	var faces=body.get_child(0).shape.get_faces();var cursor=0;var removed_count=0;var changed=0
	for j in range(0,raw.indices.size(),3):
		var tri=[]
		for k in [0,2,1]:
			var index=int(raw.indices[j+k])*3;tri.append(Vector3(raw.vertices[index],raw.vertices[index+1],raw.vertices[index+2]))
		var omitted=tri.all(func(p):return preload("res://tests/pump_trim.gd").removed(p,"Brace_welded_receiver001",pump_manifest))
		if omitted:removed_count+=1;continue
		for p in tri:
			if cursor>=faces.size() or not faces[cursor].is_equal_approx(p):changed+=1
			cursor+=1
	check(removed_count==4000 and cursor==faces.size() and changed==0,"All non-pump collision triangles and winding are retained exactly; 4000 obsolete pump triangles removed")
	report.physics={"removedTriangles":removed_count,"retainedTriangles":cursor/3,"changedRetainedVertices":changed}
	var shape_a=MMFAssets.find_named(game.world,"ServicePump1Collision").get_child(0).shape
	var shape_b=MMFAssets.find_named(game.world,"ServicePump2Collision").get_child(0).shape
	check(shape_a==shape_b and shape_a.get_faces().size()/3==int(physical_manifest.replacementTrianglesPerPump),"Both pumps share the authored simplified collision shape")
	for entry in pump_manifest.trim:
		var retained=MMFAssets.find_named(machine,entry.original)
		if entry.replacement=="":
			check(retained==null,"Fully replaced old pump batch is removed: "+entry.original);continue
		var old=MMFAssets.find_named(original,entry.frozen)
		var expected=vertices(old).filter(func(p):return not prior_removed(p,entry) and not preload("res://tests/pump_trim.gd").removed(p,entry.frozen,pump_manifest))
		if entry.priorCableVertices>0:
			for j in expected.size():
				var p=expected[j]
				if p.x>=-11.465 and p.x<=-11.318 and p.y>=14.589 and p.y<=15.080 and p.z>=-.819 and p.z<=.814:expected[j].x+=.45
		var actual=vertices(retained)
		var distance=maxf(retained_distance(expected,actual),retained_distance(actual,expected))
		check(distance<.001,"Unrelated workshop and undercarriage coordinates retain 1 mm accuracy: "+entry.original)
		check(retained.get_active_material(0)==old.get_active_material(0),"Original retained material is preserved: "+entry.original)
		report.retained.append({"name":entry.original,"maxDistanceM":distance,"expectedVertices":expected.size(),"actualVertices":actual.size()})
	var meshes={};var materials={};var transforms={}
	for i in bank.get_child_count():
		var node=bank.get_child(i);var site=MMFAssets.v(pump_manifest.sites[i].position);var bounds=MMFAssets.bounds(node)
		check(node.position.is_equal_approx(site) and node.basis.is_equal_approx(Basis.IDENTITY),"Pump retains its original site and aisle-facing valve: "+str(i+1))
		check(absf(bounds.position.y)<.001 and bounds.end.y<1.66,"Pump feet and deck penetrations are grounded; pipework stays below old height: "+str(i+1))
		var allowed=pump_manifest.originalBoxes[i];var world_bounds=node.transform*bounds
		check(world_bounds.position.x>=allowed.min[0]-.003 and world_bounds.end.x<=allowed.max[0]+.003 and world_bounds.position.z>=allowed.min[2]-.003 and world_bounds.end.z<=allowed.max[2]+.003,"Whole refined assembly stays inside its original footprint: "+str(i+1))
		var triangles=0;var collapsed=0;var painted=0
		for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
			meshes[mesh.mesh]=true;transforms[mesh]=mesh.global_transform
			for surface in mesh.mesh.get_surface_count():
				var material=mesh.get_active_material(surface);materials[material]=true
				if material is StandardMaterial3D and material.albedo_texture and material.normal_enabled and material.roughness_texture:painted+=1
				var arrays=mesh.mesh.surface_get_arrays(surface);var points=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX];triangles+=indices.size()/3
				for j in range(0,indices.size(),3):
					if (points[indices[j+1]]-points[indices[j]]).cross(points[indices[j+2]]-points[indices[j]]).length_squared()<1e-18:collapsed+=1
		check(triangles<80000 and painted==3 and collapsed==0,"Detailed geometry has three portable PBR materials and no collapsed triangles: "+str(i+1))
		for anchor in ["SuctionDeck","DischargeDeck","ElectricalDeck"]:
			var found=MMFAssets.find_named(node,anchor)
			check(found!=null and absf(found.global_position.y-site.y)<.001,"Complete service route reaches its deck fitting: "+anchor+" "+str(i+1))
		var rays=[]
		for height in [.10,.45,.65,.9]:
			var center=site+Vector3(0,height,0);var hit=game.raycast(center+Vector3(0,0,-1.5),center+Vector3(0,0,1.5),[],1)
			rays.append({"height":height,"hit":str(hit.get("position",Vector3.INF)),"body":str(hit.get("collider","none"))})
		print("PUMP_RAYS ",i+1," ",rays)
		var hose_clear=game.raycast(site+Vector3(0,.10,-1.35),site+Vector3(0,.10,-.65),[],1)
		check(hose_clear.is_empty(),"Removed loose hose leaves no invisible collision in front of the skid: "+str(i+1))
		var front=game.raycast(site+Vector3(0,.10,-1.35),site+Vector3(0,.10,0),[],1)
		check(not front.is_empty() and absf(front.position.z-(site.z-.59))<.004,"Skid collision meets its visible front edge: "+str(i+1))
		game.player.teleport(site+Vector3(0,.05,-1.6));game.player.yaw=PI
		check(game.player.boundary.fits(game.player.position),"Service approach is supported and available: "+str(i+1))
		game.player.set_physics_process(true);Input.action_press("forward")
		for frame in 40:await physics_frame
		Input.action_release("forward");game.player.set_physics_process(false)
		var stop=site.z-game.player.position.z
		check(stop>.45 and stop<1.0 and game.player.position.y>=site.y-.01 and game.player.position.y<=site.y+.27,"Actual player stops at the pump; a step onto its low skid remains physical: "+str(i+1))
		report.collision.append({"site":str(site),"rays":rays,"playerStopM":stop,"playerY":game.player.position.y});report.models.append({"bounds":str(bounds),"triangles":triangles,"collapsed":collapsed})
	check(meshes.size()==5 and materials.size()==5,"Both pump instances share exactly five meshes and materials")
	check(MMFAssets.of_type(bank,"CollisionObject3D").is_empty() and MMFAssets.of_type(bank,"Light3D").is_empty(),"Art installation adds no per-triangle physics or lights")
	game.session.story.phase="locked";game.session.scanner.phase="consumed"
	for frame in 30:game.world.update(1.0/60)
	check(transforms.keys().all(func(mesh):return mesh.global_transform.is_equal_approx(transforms[mesh])),"Motor, pipes and fittings remain rigidly attached through machine gait")
	original.queue_free();meshes.clear();materials.clear();transforms.clear();game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Clean pump test shutdown")
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/pumps-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("PUMP_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
