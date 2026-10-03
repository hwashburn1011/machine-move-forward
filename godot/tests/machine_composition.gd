extends SceneTree

class FinishOwner extends RefCounted:
	var session={"customization":MMFNomadPersonalization.defaults(),"facts":{"guardianOutcome":"destroyed"}}

var checks=0
var failures=[]
var report={"retained":[],"removed":[]}

func _initialize():call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func vector(v: Vector3) -> Array:return [v.x,v.y,v.z]

func run():
	var layout=MMFAssets.json("res://data/machine-spaces.json")
	var collision=MMFAssets.json("res://art/nomad-spaces-collision.json")
	check(layout.staticRetained.size()==10 and layout.staticRemoved.size()==14,"Sparse composition retains ten purposeful assemblies and removes fourteen repetitions")
	var world=MMFWorld.new();root.add_child(world)
	var full=MMFAssets.json("res://data/runtime.json");world.assemble_machine(full.colliders)
	for frame in 3:await physics_frame
	var machine=world.machine;var space=world.get_world_3d().direct_space_state
	var selected={};var local_bounds={}
	for site in layout.staticRetained:
		var parent=MMFAssets.find_named(machine,site.parent)
		var node=parent.get_node_or_null(NodePath(site.name)) if parent else null
		check(node!=null,"Retained assembly remains under its original anchor: "+site.name)
		if not node:continue
		selected[site.name]=true
		var at=MMFAssets.v(site.position);var bounds=node.transform*MMFAssets.bounds(node)
		local_bounds[site.name]=bounds
		check(node.position.distance_to(at)<.001,"Retained assembly stays at its occupied legacy footprint: "+site.name)
		check(absf(bounds.position.y-at.y)<.002 and bounds.end.y<at.y+2.2,"Assembly feet touch the deck and its height remains human scale: "+site.name)
		var query=PhysicsRayQueryParameters3D.create(at+Vector3(0,.4,-.8),at+Vector3(0,.4,.8),1)
		if site.family=="bench":
			# The centre below a worktop is deliberately open knee space.
			check(space.intersect_ray(query).is_empty(),"Bench keeps open knee space between its frame legs: "+site.name)
			query=PhysicsRayQueryParameters3D.create(node.global_transform*Vector3(-.2,1.2,-.2),node.global_transform*Vector3(-.2,.5,-.2),1)
		var hit=space.intersect_ray(query)
		check(not hit.is_empty(),"Retained assembly still has physical obstruction: "+site.name)
		report.retained.append({"name":site.name,"deck":site.deck,"position":site.position,"min":vector(bounds.position),"max":vector(bounds.end),"sizeM":vector(bounds.size),"purpose":site.purpose})
	var expected_counts={"NativeCargoLockers":2,"NativeDeckDressing":1,"NativePressureVessels":2,"NativeServicePumps":1,"NativeSwitchgear":2,"NativeServiceBenches":2}
	for parent_name in expected_counts:
		check(MMFAssets.find_named(machine,parent_name).get_child_count()==expected_counts[parent_name],"Only selected complete assemblies remain in "+parent_name)
	var connections=MMFAssets.find_named(machine,"NativeServiceConnections")
	check(connections!=null and connections.get_child_count()==3,"Each upgrade bay has one distinct authored physical service plate")
	for id in ["quiet-drive","battery-bank","salvage-crane"]:
		var socket=connections.get_node(NodePath(id));var bay=layout.bays[id]
		var expected=Vector3(bay.cell.x*2,16.03+bay.cell.y*3.6,bay.cell.z*2)
		var bounds=MMFAssets.bounds(socket)
		check(socket.position.distance_to(expected)<.001 and is_equal_approx(socket.rotation.y,int(bay.rotation)*PI/2),"Service plate matches the exact cell and orientation: "+id)
		check(bounds.position.y>=-.001 and bounds.end.y<=.0181 and bounds.size.x<=1.641 and bounds.size.z<=1.641,"Service plate fits the bay and remains within 18 mm of its floor: "+id)
		check(MMFAssets.of_type(socket,"CollisionObject3D").is_empty() and MMFAssets.of_type(socket,"Light3D").is_empty(),"Service plate adds neither invisible obstacles nor lights: "+id)
	var capsule=CapsuleShape3D.new();capsule.radius=.30;capsule.height=1.50
	for site in layout.staticRemoved:
		check(MMFAssets.find_named(machine,site.name)==null,"Repeated fixed model is absent: "+site.name)
		check(MMFAssets.find_named(world,site.name+"Collision")==null,"Removed assembly has no separate ghost collider: "+site.name)
		var at=MMFAssets.v(site.position)
		var query=PhysicsShapeQueryParameters3D.new();query.shape=capsule;query.collision_mask=1
		query.transform=Transform3D(Basis.IDENTITY,at+Vector3.UP)
		var hits=space.intersect_shape(query,8)
		check(hits.is_empty(),"Former occupied centre is clear for a human-sized torso: "+site.name)
		var down=PhysicsRayQueryParameters3D.create(at+Vector3.UP*.2,at-Vector3.UP*.2,1)
		var floor_hit=space.intersect_ray(down)
		check(not floor_hit.is_empty() and absf(floor_hit.position.y-at.y)<.02,"Removing the prop preserves the deck underneath: "+site.name)
		report.removed.append({"name":site.name,"position":site.position,"blockingBodies":hits.map(func(hit):return str(hit.collider.name)),"floorY":floor_hit.get("position",Vector3.INF).y})
	var raw=full.colliders[int(collision.sourceCollider)]
	var current=MMFAssets.find_named(world,"NativeWorkshopCollision").get_child(0).shape.get_faces()
	var removed=preload("res://tests/machine_spaces_collision_contract.gd").removed_offsets()
	var prior=MMFAssets.json("res://art/nomad-intake-collision.json")
	var cursor=0;var changed=0;var protected_cabinet_faces=0
	for span in prior.retainedIndexRanges:
		for offset in range(int(span[0]),int(span[1]),3):
			if removed.has(offset):continue
			for corner in [0,2,1]:
				var index=int(raw.indices[offset+corner])*3
				var p=Vector3(raw.vertices[index],raw.vertices[index+1],raw.vertices[index+2])
				if cursor>=current.size() or not current[cursor].is_equal_approx(p):changed+=1
				cursor+=1
			if offset/3>=134104 and offset/3<=134195:protected_cabinet_faces+=1
	check(removed.size()==5068 and collision.partialTriangles==0 and collision.partialComponents==0,"Exactly 5,068 obsolete faces are removed as nineteen whole source components")
	check(collision.removedComponents.size()==19 and current.size()==111604*3 and cursor==current.size() and changed==0,"All 111,604 remaining source triangles preserve original coordinates, sequence and clockwise winding")
	check(protected_cabinet_faces==92,"All 92 retained rear cabinet faces survive the overlapping removed locker envelope")
	var owner=FinishOwner.new();owner.session.customization.restored=true
	owner.session.customization.machinePaint={"lockers":"petrol","benches":"clay"};owner.session.customization.serviceMark="g01"
	var painter=MMFNomadPersonalization.new();painter.setup(owner);painter.bind_machine(machine)
	check(painter._zone_root("lockers").get_child_count()==2 and painter._zone_root("benches").get_child_count()==2,"Both saved paint zones still resolve all retained assemblies")
	var mark=MMFAssets.find_named(machine,"CargoLocker1").get_node_or_null("NomadServiceMark")
	check(mark!=null and mark.visible,"Earned G-01 service mark retains its original CargoLocker1 anchor")
	check(MMFAssets.find_named(world,"NativeWorkshopCollision").get_child(0).shape.get_faces()==current,"Saved paint and service mark do not change machine collision")
	owner.session.customization=MMFNomadPersonalization.defaults();painter.bind_machine(machine)
	check(mark!=null and not mark.visible,"Original finish state safely restores both machine zones and hides the mark")
	report.collision={"removedTriangles":removed.size(),"retainedTriangles":current.size()/3,"changedVertices":changed,"retainedCabinetFaces":protected_cabinet_faces,"sourceSha256":collision.sourceSha256,"faceSha256":collision.retainedSourceFacesSha256}
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://../test-results/deck-audio"))
	var file=FileAccess.open("res://../test-results/deck-audio/composition-test.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	painter.machine=null;painter.game=null;world.free();MMFAssets.cache.clear()
	print("MACHINE_COMPOSITION_RESULT ",checks," checks, ",failures.size()," failures")
	call_deferred("quit",0 if failures.is_empty() else 1)
