extends SceneTree

const SITES=[Vector3(9.625,16.03,7.8),Vector3(-9.625,16.03,-6.5),Vector3(5.5,16.03,10.4)]
var game
var checks=0
var failures=[]
var report={"models":[],"retained":{}}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-dressing-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func in_locker(at: Vector3) -> bool:
	for site in [Vector3(8.525,16.03,7.54),Vector3(-8.9375,16.03,-8.19),Vector3(8.8,12.43,9.88),Vector3(6.875,8.83,-6.5)]:
		if absf(at.x-site.x)<.565 and at.y>site.y-.03 and at.y<site.y+.90 and absf(at.z-site.z)<.54:return true
	return false

func vertex_key(at: Vector3) -> String:
	return "%d/%d/%d" % [roundi(at.x*1000),roundi(at.y*1000),roundi(at.z*1000)]

func vertices(mesh: MeshInstance3D,exclude_lockers=false) -> Dictionary:
	var result={}
	for s in mesh.mesh.get_surface_count():
		for point in mesh.mesh.surface_get_arrays(s)[Mesh.ARRAY_VERTEX]:
			var at=mesh.global_transform*point
			if not exclude_lockers or not in_locker(at):result[vertex_key(at)]=at
	return result

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	for i in 2:await physics_frame
	await process_frame
	var machine=game.world.machine;var dressing=game.world.native_dressing
	check(dressing!=null and dressing.get_parent()==machine,"Detailed dressing is installed on the actual machine")
	var original=MMFAssets.scene("runtime/machine.glb");root.add_child(original);original.hide()
	var old_fittings=MMFAssets.find_named(original,"Secured_weatherproof_cargo_locker001_1")
	var new_fittings=MMFAssets.find_named(machine,"NativePressureAccumulators")
	var expected=vertices(old_fittings,true);var actual=vertices(new_fittings)
	var maximum_error=0.0
	for point in expected.values():
		var nearest=INF
		for candidate in actual.values():nearest=minf(nearest,point.distance_to(candidate))
		maximum_error=maxf(maximum_error,nearest)
	# Godot quantizes imported vertices relative to each batch's new AABB. Source
	# coordinates are exact; allow less than one millimetre of GPU import error.
	check(expected.size()==actual.size() and maximum_error<.001,"Every retained pressure fitting keeps its world coordinates within GPU import precision")
	check(preload("res://tests/material_equivalence.gd").same(new_fittings.get_active_material(0),old_fittings.get_active_material(0)),"Retained fittings keep the original material properties and texture resources")
	check(MMFAssets.find_named(machine,"Secured_weatherproof_cargo_locker001_2")==null and MMFAssets.find_named(machine,"Secured_weatherproof_cargo_locker001_5")==null,"Coincident old drums and bead geometry are removed")
	# Existing access cable derivative still owns the affected stair-side bundle.
	check(MMFAssets.find_named(machine,"NativeCargoCables")!=null and MMFAssets.find_named(machine,"NativeSideWiring")!=null,"Stair-side cable clearance refinements remain installed")
	var untouched=true
	var resource_check=preload("res://tests/machine_resource_contract.gd").new()
	for name in ["Secured_weatherproof_cargo_locker001_3"]:
		var old=MMFAssets.find_named(original,name);var current=MMFAssets.find_named(machine,name)
		untouched=untouched and current!=null and resource_check.equal_value(current.mesh,old.mesh) and current.global_transform.is_equal_approx(old.global_transform)
	check(untouched,"Unselected cargo hose batch retains identical mesh data and transform")
	resource_check.clear()
	report.retained={"oldUnselectedPoints":expected.size(),"newPoints":actual.size(),"maximumCoordinateErrorM":maximum_error}
	var total_triangles=0;var total_surfaces=0
	for i in SITES.size():
		var node=MMFAssets.find_named(dressing,"ServiceDrum"+str(i+1));var bounds=MMFAssets.bounds(node)
		check(node.global_position.is_equal_approx(SITES[i]),"Existing placement retained for service drum "+str(i+1))
		check((-node.global_basis.z).is_equal_approx(Vector3.BACK if i==1 else Vector3.FORWARD),"Label and latch face the open approach: "+str(i+1))
		check(absf(bounds.position.y)<.001 and bounds.end.y<=.876,"Grounded cradle and existing height retained: "+str(i+1))
		check(bounds.position.x>=-.289 and bounds.end.x<=.289 and bounds.position.z>=-.309 and bounds.end.z<=.309,"Model remains within the previous drum/bead footprint: "+str(i+1))
		var triangles=0;var surfaces=0;var portable=false;var degenerate=0
		for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
			for s in mesh.mesh.get_surface_count():
				surfaces+=1;var arrays=mesh.mesh.surface_get_arrays(s);var positions=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX]
				triangles+=indices.size()/3
				for t in range(0,indices.size(),3):
					var a=positions[indices[t]];var b=positions[indices[t+1]];var c=positions[indices[t+2]]
					if (b-a).cross(c-a).length_squared()<1e-18:degenerate+=1
				var mat=mesh.get_active_material(s)
				if mat is StandardMaterial3D and mat.albedo_texture and mat.normal_enabled and mat.roughness_texture:portable=true
		check(degenerate==0,"Exported drum has no zero-area triangles: "+str(i+1))
		check(portable and surfaces<=5,"Portable PBR wear and five material batches: "+str(i+1))
		check(MMFAssets.of_type(node,"CollisionObject3D").is_empty(),"Detailed hardware does not introduce additional collision: "+str(i+1))
		total_triangles+=triangles;total_surfaces+=surfaces
		report.models.append({"name":node.name,"bounds":str(bounds),"triangles":triangles,"surfaces":surfaces,"degenerateTriangles":degenerate})
		# Real physics: the retained baked shell still blocks a horizontal ray and
		# the deck beside it supports the player outside the reserved footprint.
		var at=SITES[i]+Vector3.UP*.5
		var hit=game.raycast(at+Vector3(0,0,-1),at+Vector3(0,0,1),[],1)
		report.models.back().physicsHit=str(hit)
		check(not hit.is_empty() and absf(hit.position.z-(SITES[i].z-.28))<.025,"Existing drum obstruction remains aligned: "+str(i+1))
		var floor_hit=game.raycast(SITES[i]+Vector3(.7,.3,0),SITES[i]+Vector3(.7,-.2,0),[],1)
		check(not floor_hit.is_empty() and absf(floor_hit.position.y-16.03)<.012,"Neighbouring deck remains clear and supported: "+str(i+1))
	check(total_triangles<=55000 and total_surfaces==15,"All three props fit the 55k triangle / 15-batch budget")
	# Static scenery: no callbacks or additional physical/light emitters.
	check(MMFAssets.of_type(dressing,"Light3D").is_empty() and dressing.find_children("*","GPUParticles3D",true,false).is_empty(),"Props add no lights or particle systems")
	var poses={}
	for child in MMFAssets.of_type(dressing,"MeshInstance3D"):poses[child]=child.global_transform
	game.session.opening_done=true;game.session.story.phase="locked";game.session.scanner.phase="consumed"
	for i in 30:game.world.update(1.0/60)
	check(poses.keys().all(func(mesh):return mesh.global_transform.is_equal_approx(poses[mesh])),"Deck props stay fixed through machine gait updates")
	original.queue_free();game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Clean shutdown after native geometry checks")
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/deck-dressing.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	call_deferred("quit",0 if failures.is_empty() else 1)
