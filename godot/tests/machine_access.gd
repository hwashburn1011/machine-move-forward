extends SceneTree
class Holder extends Node3D:
	var machine: Node3D
var checks=0
var failures=[]
var report={}
func _initialize():set_meta("test_mode",true);call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func physical_meshes(node: Node3D,layer: int) -> Node3D:
	var physical=Node3D.new();root.add_child(physical)
	for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
		if not mesh.is_visible_in_tree():continue
		var body=StaticBody3D.new();body.name=mesh.name;body.collision_layer=layer;body.collision_mask=0;physical.add_child(body);body.global_transform=mesh.global_transform
		var shape=CollisionShape3D.new();shape.shape=mesh.mesh.create_trimesh_shape();body.add_child(shape)
	return physical
func clearance(space,mask: int) -> Array:
	var blocked=[];var capsule=CapsuleShape3D.new();capsule.radius=.34;capsule.height=1.4
	var query=PhysicsShapeQueryParameters3D.new();query.shape=capsule;query.collision_mask=mask
	# Torso/head volume excludes expected step contacts beneath the feet.
	for level in [-2,-1]:
		for step in 61:
			var z=-3+step*.1;var y=16.03+level*3.6+(z+3)*.6
			for x in [-12.28,-12,-11.72]:
				query.transform=Transform3D(Basis.IDENTITY,Vector3(x,y+1.25,z))
				var hits=space.intersect_shape(query,1)
				if not hits.is_empty():blocked.append({"level":level,"x":x,"z":z,"y":y,"mesh":str(hits[0].collider.name)})
	return blocked
func triangles(node: Node) -> int:
	var count=0
	for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
		for surface in mesh.mesh.get_surface_count():count+=mesh.mesh.surface_get_array_index_len(surface)/3
	return count
func run():
	var holder=Holder.new();root.add_child(holder);holder.machine=MMFAssets.scene("runtime/machine.glb");holder.add_child(holder.machine)
	var original=MMFAssets.find_named(holder.machine,"Gameplay_Decks_And_Access")
	check(original!=null,"Frozen reference machine contains the expected access module")
	var original_materials={}
	for mesh in MMFAssets.of_type(original,"MeshInstance3D"):original_materials[mesh.get_active_material(0).resource_name]=mesh.get_active_material(0)
	report.beforeTriangles=triangles(original)
	var before=physical_meshes(original,16)
	var new_access=MMFMachineAccess.install(holder)
	check(new_access!=null and MMFAssets.find_named(holder.machine,"Gameplay_Decks_And_Access")==null,"Refined module replaces the old geometry without coincident duplicate decks")
	report.afterTriangles=triangles(new_access)
	var shared=0;var batch_count=0
	for mesh in MMFAssets.of_type(new_access,"MeshInstance3D"):
		batch_count+=mesh.mesh.get_surface_count()
		for surface in mesh.mesh.get_surface_count():
			var name=mesh.mesh.surface_get_material(surface).resource_name
			if name.begins_with("Shared_"):
				check(mesh.get_active_material(surface)==original_materials[name.trim_prefix("Shared_")],"Exact original material and texture resources reused: "+name)
				shared+=1
	check(shared==4 and batch_count==5,"All shared materials resolve and the detailed module uses five render batches")
	var after=physical_meshes(new_access,32);var entire=physical_meshes(holder.machine,64)
	for i in 4:await physics_frame
	var space=holder.get_world_3d().direct_space_state
	report.beforeBlocked=clearance(space,16);report.afterBlocked=clearance(space,32);report.fullMachineBlocked=clearance(space,64)
	check(report.beforeBlocked.size()==42,"Torso/head fixture reproduces all 42 reference stair obstructions")
	check(report.afterBlocked.is_empty(),"All 366 torso/head samples clear the refined access geometry")
	check(report.fullMachineBlocked.is_empty(),"All 366 samples also clear the rest of the visible machine")
	var mismatches=[];var floor_samples=0;var before_height_error=0.0;var after_height_error=0.0
	for level in [-2,-1,0]:
		var positions=[]
		for x in [-10,-8,-6,-4,0,2,4,6,8,10]:
			for z in range(-12,13,2):positions.append(Vector3(x,16.03+level*3.6,z))
		if level<0:
			for z in [-4,-2,0,2,4]:positions.append(Vector3(-14,16.03+level*3.6,z))
		for at in positions:
			floor_samples+=1
			var a=space.intersect_ray(PhysicsRayQueryParameters3D.create(at+Vector3.UP*.12,at-Vector3.UP*.3,16))
			var b=space.intersect_ray(PhysicsRayQueryParameters3D.create(at+Vector3.UP*.12,at-Vector3.UP*.3,32))
			if not a.is_empty():before_height_error=maxf(before_height_error,absf(a.position.y-at.y))
			if not b.is_empty():after_height_error=maxf(after_height_error,absf(b.position.y-at.y))
			# The frozen optimized GLB has millimetre quantization/planarity error.
			# The replacement must meet the actual deck contract, not reproduce that error.
			if a.is_empty() or b.is_empty() or a.position.distance_to(b.position)>.012 or absf(b.position.y-at.y)>.001:
				if mismatches.size()<6:print("FLOOR_DIFFERENCE ",at," before ",a.get("position")," after ",b.get("position"))
				mismatches.append(str(at))
	check(mismatches.is_empty(),"400 deck/bypass samples retain coverage and match actual deck heights within 1 mm")
	var support=MMFAssets.find_named(new_access,"AccessSupportColliders")
	check(support.get_child_count()==16,"All new structural members have matching simple camera/body collision")
	var hit=space.intersect_ray(PhysicsRayQueryParameters3D.create(Vector3(-14.82,13,0),Vector3(-14.82,11.5,0),1))
	check(not hit.is_empty() and hit.collider.get_parent()==support,"Outboard stringer has physical collision at its authored position")
	report.floorSamples=floor_samples;report.floorMismatches=mismatches;report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	report.beforeDeckHeightError=before_height_error;report.afterDeckHeightError=after_height_error
	var file=FileAccess.open("res://../test-results/godot-native/machine-access.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("MACHINE_ACCESS ",checks," checks; before ",report.beforeBlocked.size()," after ",report.afterBlocked.size()," full ",report.fullMachineBlocked.size()," floor mismatches ",mismatches.size())
	holder.queue_free();before.queue_free();after.queue_free();entire.queue_free();await process_frame;MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
