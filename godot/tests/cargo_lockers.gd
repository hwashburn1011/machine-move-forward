extends SceneTree

const SITES=[Vector3(8.525,16.03,7.54),Vector3(6.875,8.83,-6.5)]
var game
var checks=0
var failures=[]
var report={"models":[],"collision":[]}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-locker-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func tank_distance(meshes: Array) -> float:
	# Exact minimum in XZ projection against the original vessel's outer ellipse.
	# Its source bounds are x=8Â±.285, z=10.4Â±.304, y=12.471667..13.930001.
	# All inspected case surfaces lie in this vessel's vertical interval. Testing
	# whole triangle projections is conservative for triangles spanning an end.
	var result=INF
	for mesh in meshes:
		for surface in mesh.mesh.get_surface_count():
			var arrays=mesh.mesh.surface_get_arrays(surface);var points=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX]
			for base in range(0,indices.size(),3):
				var a=mesh.global_transform*points[indices[base]];var b=mesh.global_transform*points[indices[base+1]];var c=mesh.global_transform*points[indices[base+2]]
				if maxf(a.y,maxf(b.y,c.y))<12.471667 or minf(a.y,minf(b.y,c.y))>13.930001:continue
				# Ignore other baked lockers when evaluating the old shared batch.
				if (a+b+c).x/3<7.7 or absf((a+b+c).z/3-10.4)>1.1:continue
				var poly=PackedVector2Array()
				for p in [a,b,c]:poly.append(Vector2((p.x-8.0)/.285,(p.z-10.4)/.304))
				if absf((poly[1]-poly[0]).cross(poly[2]-poly[0]))>1e-7 and Geometry2D.is_point_in_polygon(Vector2.ZERO,poly):result=0
				for edge in 3:result=minf(result,Geometry2D.get_closest_point_to_segment(Vector2.ZERO,poly[edge],poly[(edge+1)%3]).length())
	return result

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	for i in 2:await physics_frame
	await process_frame
	var machine=game.world.machine;var cargo=MMFAssets.find_named(machine,"NativeCargoLockers")
	check(cargo!=null and cargo.get_child_count()==2,"Two fixed supply cases leave the middle deck open")
	var original=MMFAssets.scene("runtime/machine.glb");root.add_child(original);original.hide()
	for name in ["Secured_weatherproof_cargo_locker001","Secured_weatherproof_cargo_locker001_1","Secured_weatherproof_cargo_locker001_2","Secured_weatherproof_cargo_locker001_5"]:
		check(MMFAssets.find_named(machine,name)==null,"Old coincident cargo geometry is removed: "+name)
	check(MMFAssets.find_named(machine,"NativeCargoFittings")==null,"Old carry handles are not left floating beside the cases")
	var resources={};var materials={};var total_triangles=0;var snapshots={}
	for i in SITES.size():
		var node=cargo.get_child(i);var bounds=MMFAssets.bounds(node)
		check(node.position.is_equal_approx(SITES[i]) and (-node.basis.z).is_equal_approx(Vector3.BACK if SITES[i].z<0 else Vector3.FORWARD),"Case retains its site and opens toward the aisle: "+str(i+1))
		check(absf(bounds.position.y)<.001 and bounds.end.y<=.867,"Skids contact the original deck and stay below the old case height: "+str(i+1))
		check(bounds.position.x>=-.563 and bounds.end.x<=.563 and bounds.position.z>=-.534 and bounds.end.z<=.534,"Rounded hardware remains in the old case/handle footprint: "+str(i+1))
		var triangles=0;var degenerate=0;var surfaces=0;var painted=false;var bad_meshes={}
		for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
			snapshots[mesh]=mesh.global_transform;resources[mesh.mesh]=true
			for s in mesh.mesh.get_surface_count():
				surfaces+=1;var arrays=mesh.mesh.surface_get_arrays(s);var vertices=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX]
				triangles+=indices.size()/3;var mat=mesh.get_active_material(s);materials[mat]=true
				if mat is StandardMaterial3D and mat.albedo_texture and mat.normal_enabled and mat.roughness_texture:painted=true
				for base in range(0,indices.size(),3):
					if (vertices[indices[base+1]]-vertices[indices[base]]).cross(vertices[indices[base+2]]-vertices[indices[base]]).length_squared()<1e-18:
						degenerate+=1;bad_meshes[mesh.name]=bad_meshes.get(mesh.name,0)+1
		check(degenerate==0 and painted and surfaces==4 and triangles<=30000,"Portable detailed geometry and four material batches: "+str(i+1))
		total_triangles+=triangles
		report.models.append({"site":str(node.position),"bounds":str(bounds),"triangles":triangles,"surfaces":surfaces,"degenerateTriangles":degenerate,"degenerateByMesh":bad_meshes})
		var at=SITES[i]+Vector3.UP*.43
		for axis in [Vector3.RIGHT,Vector3.LEFT,Vector3.FORWARD,Vector3.BACK,Vector3.UP]:
			var extent=.5625 if axis.x!=0 else .48 if axis.z!=0 else .436667
			var hit=game.raycast(at+axis*.9,at-axis*.9,[],1)
			check(not hit.is_empty() and hit.position.distance_to(at+axis*extent)<.01,"Retained physical case surface at "+str(i+1)+" "+str(axis))
		var direction=1 if SITES[i].z<0 else -1
		game.player.teleport(SITES[i]+Vector3(0,.05,direction*1.45));game.player.yaw=0 if direction==1 else PI
		check(game.player.boundary.fits(game.player.position),"Case approach starts on a clear supported aisle: "+str(i+1))
		game.player.set_physics_process(true);Input.action_press("forward")
		for frame in 45:await physics_frame
		Input.action_release("forward");game.player.set_physics_process(false)
		var stop=(game.player.position.z-SITES[i].z)*direction
		check(stop>.77 and stop<.90 and absf(game.player.position.y-SITES[i].y)<.1,"Real player stops outside case: "+str(i+1))
		report.collision.append({"site":str(SITES[i]),"stoppedOffset":stop,"playerPosition":str(game.player.position)})
	check(resources.size()==4 and materials.size()==4,"Both retained cases share the same four mesh/material resources")
	check(MMFAssets.of_type(cargo,"CollisionObject3D").is_empty() and MMFAssets.of_type(cargo,"Light3D").is_empty() and cargo.find_children("*","GPUParticles3D",true,false).is_empty(),"New detail adds no physics bodies, lights or particles")
	var old_distance=tank_distance([MMFAssets.find_named(original,"Secured_weatherproof_cargo_locker001"),MMFAssets.find_named(original,"Secured_weatherproof_cargo_locker001_1")])
	var library_case=MMFAssets.scene("res://art/nomad-cargo-locker.glb");root.add_child(library_case);library_case.position=Vector3(8.8,12.43,9.88)
	var new_distance=tank_distance(MMFAssets.of_type(library_case,"MeshInstance3D"));library_case.free()
	check(old_distance<1.0,"Original case geometry intersects the adjacent pressure vessel's envelope")
	check(new_distance>1.0,"Reusable refined case geometry still clears the original adjacent vessel envelope")
	report.tank={"originalNormalizedDistance":old_distance,"refinedNormalizedDistance":new_distance,"clearanceThreshold":1.0}
	game.session.story.phase="locked";game.session.scanner.phase="consumed"
	for frame in 30:game.world.update(1.0/60)
	check(snapshots.keys().all(func(mesh):return mesh.global_transform.is_equal_approx(snapshots[mesh])),"All case parts remain fixed through machine gait updates")
	report.uniqueMeshes=resources.size();report.uniqueMaterials=materials.size();report.instancedTriangles=total_triangles
	original.queue_free();snapshots.clear();resources.clear();materials.clear();game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Clean native geometry test shutdown")
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/cargo-lockers.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	call_deferred("quit",0 if failures.is_empty() else 1)
