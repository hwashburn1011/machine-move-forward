extends SceneTree

var failures=[]
var checks=0
func _initialize():call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func frames():
	for i in 3:await physics_frame

func run():
	var assembly=load("res://art/nomad-native.scn").instantiate();root.add_child(assembly)
	var other=load("res://art/nomad-native.scn").instantiate();root.add_child(other);other.position.x=100
	var helper=preload("res://scripts/beta_crane_collision.gd").new()
	check(helper.install(assembly),"Crane helper validates compiled collision hash")
	check(helper.removed_triangles==3020,"Only 3020 authored crane triangles are removed")
	var manifest=MMFAssets.json("res://art/beta-crane-collision.json")
	var original=helper.original.get_faces();var retained=helper.repaired.get_faces();var expected=PackedVector3Array();var start=0
	for span in manifest.removedRanges:
		expected.append_array(original.slice(start,int(span[0])));start=int(span[1])
	expected.append_array(original.slice(start))
	check(retained==expected,"Every remaining triangle is bit-for-bit identical and in its original order")
	var other_shape=MMFAssets.find_named(other,"NativeWorkshopCollision").get_child(0)
	check(other_shape.shape==helper.original and helper.repaired!=helper.original,"Repaired shape is private; original resources remain shared and untouched")
	await frames()
	var space=assembly.get_world_3d().direct_space_state
	var rays=[]
	for spec in [["suspended crate",Vector3(-16.4625,14.69667,8.76),1.3],["old pedestal",Vector3(-9.4875,16.6,7.8),1.5]]:
		for axis in [Vector3.RIGHT,Vector3.LEFT,Vector3.BACK,Vector3.FORWARD,Vector3.UP]:
			var from=spec[1]+axis*spec[2];var to=spec[1]
			var hit=space.intersect_ray(PhysicsRayQueryParameters3D.create(from,to,1))
			check(not hit.is_empty(),"Original "+spec[0]+" physically exists on "+str(axis))
			rays.append({"from":from,"to":to,"name":spec[0]+str(axis)})
	var preserved=[]
	var rails=[]
	# Test every other collision body and the deck below the old crane using
	# actual physics. The exact buffer comparison above covers the shared batch.
	for level in [8.83,12.43,16.03]:
		for x in [-10,-8,-6,0,6,10]:
			for z in [-10,-6,0,6,10]:
				var at=Vector3(x,level,z)
				var hit=space.intersect_ray(PhysicsRayQueryParameters3D.create(at+Vector3.UP*.09,at-Vector3.UP*.3,1))
				if not hit.is_empty():preserved.append({"from":at+Vector3.UP*.09,"to":at-Vector3.UP*.3,"position":hit.position})
	for body in MMFAssets.of_type(assembly,"StaticBody3D"):
		if not body.get_meta("open_railing",false):continue
		var shape=body.get_child(0)
		var axis=Vector3.RIGHT if shape.shape.size.x<shape.shape.size.z else Vector3.BACK
		var from=shape.to_global(axis*.2);var to=shape.global_position
		var hit=space.intersect_ray(PhysicsRayQueryParameters3D.create(from,to,1))
		if not hit.is_empty() and hit.collider==body:rails.append({"from":from,"to":to,"position":hit.position,"body":body})
	helper.set_repaired(true);await frames()
	for ray in rays:
		var query=PhysicsRayQueryParameters3D.create(ray.from,ray.to,1)
		check(space.intersect_ray(query).is_empty(),"Repair removes obsolete "+ray.name+" collision")
		query.from+=Vector3.RIGHT*100;query.to+=Vector3.RIGHT*100
		check(not space.intersect_ray(query).is_empty(),"Another campaign retains "+ray.name+" collision")
	var same=true
	for ray in preserved:
		var hit=space.intersect_ray(PhysicsRayQueryParameters3D.create(ray.from,ray.to,1))
		same=same and not hit.is_empty() and hit.position.distance_to(ray.position)<.001
	check(same and preserved.size()>75,"All "+str(preserved.size())+" supported deck probes remain identical")
	var rails_same=true
	for ray in rails:
		var hit=space.intersect_ray(PhysicsRayQueryParameters3D.create(ray.from,ray.to,1))
		rails_same=rails_same and not hit.is_empty() and hit.collider==ray.body and hit.position.distance_to(ray.position)<.001
	check(rails_same and rails.size()>10,"All "+str(rails.size())+" sampled safety rails retain their actual contact faces")
	helper.set_repaired(false);await frames()
	check(helper.target.shape==helper.original,"Loading an unrepaired campaign restores the original resource")
	for ray in rays:check(not space.intersect_ray(PhysicsRayQueryParameters3D.create(ray.from,ray.to,1)).is_empty(),"Restored original "+ray.name)
	helper.set_repaired(true);var selected=helper.target.shape;helper.set_repaired(true)
	check(selected==helper.target.shape,"Repeated repaired-state sync reuses the same shape")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"removed_triangles":helper.removed_triangles,"retained_deck_probes":preserved.size(),"retained_rail_probes":rails.size()}
	var file=FileAccess.open("res://../test-results/godot-native/beta-crane-collision.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	assembly.queue_free();other.queue_free();await process_frame;MMFAssets.cache.clear()
	print("BETA_CRANE_COLLISION ",JSON.stringify(report));quit(0 if failures.is_empty() else 1)
