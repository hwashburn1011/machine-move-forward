extends SceneTree

var checks=0
var failures=[]
var space: Node3D

func _initialize():call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func run():
	space=Node3D.new();root.add_child(space)
	for faction in ["human","robot"]:
		var ship=MMFAssets.scene("res://art/crossfire-"+faction+".glb");space.add_child(ship)
		ship.position.x=-20 if faction=="human" else 20
		var meshes=MMFAssets.of_type(ship,"MeshInstance3D");var triangles=0;var textured=0;var normal_maps=0
		check(meshes.size()<=16,faction+": detailed geometry stays material-batched")
		check(MMFAssets.of_type(ship,"CollisionObject3D").is_empty(),faction+": cinematic hull adds no gameplay collision")
		var deck=ship.find_child("DeckOrigin",true,false);var fire=ship.find_child("FireAnchor",true,false)
		check(deck!=null and ship.to_local(deck.global_position).distance_to(Vector3(0,8.08,-1))<.001,faction+": retained crew standing plane")
		check(fire!=null and ship.to_local(fire.global_position).distance_to(Vector3(2,7.95,3))<.001,faction+": retained fire anchor")
		var flag=ship.find_child("FactionFlag",true,false)
		check(flag is MeshInstance3D and flag.mesh.surface_get_material(0).albedo_texture!=null,faction+": original textured faction flag retained")
		var fixture=StaticBody3D.new();ship.add_child(fixture)
		for item in meshes:
			for i in item.mesh.get_surface_count():
				var arrays=item.mesh.surface_get_arrays(i)
				triangles+=(arrays[Mesh.ARRAY_INDEX].size() if arrays[Mesh.ARRAY_INDEX]!=null else arrays[Mesh.ARRAY_VERTEX].size())/3
				var mat=item.mesh.surface_get_material(i)
				if mat is BaseMaterial3D and mat.albedo_texture:textured+=1
				if mat is BaseMaterial3D and mat.normal_enabled and mat.normal_texture:normal_maps+=1
			if item==flag:continue
			# Test-only triangle collision checks the actual exported hull surfaces,
			# not the bounding box of a large, material-joined mesh.
			var shape=CollisionShape3D.new();shape.shape=item.mesh.create_trimesh_shape();fixture.add_child(shape);shape.global_transform=item.global_transform
		check(triangles>70000 and triangles<120000,faction+": curved fittings stay within the authored triangle budget ("+str(triangles)+")")
		check(textured>=5 and normal_maps>=4,faction+": portable worn PBR surfaces and normal maps survive import")
		await physics_frame;await physics_frame
		var actors=[Vector3(-2.7,8.1,-1.2),Vector3(-2.4,8.1,2.1),Vector3(-3.35,8.1,-5)] if faction=="robot" else [Vector3(2.7,8.1,-1.8),Vector3(2.7,8.1,1.2)]
		var query_space=space.get_world_3d().direct_space_state
		for at in actors:
			var support=true
			for offset in [Vector3.ZERO,Vector3(.18,0,.18),Vector3(-.18,0,-.18)]:
				var foot=ship.to_global(at+offset)
				var hit=query_space.intersect_ray(PhysicsRayQueryParameters3D.create(foot+Vector3.UP*.2,foot-Vector3.UP*.4))
				support=support and not hit.is_empty() and absf(hit.position.y-8.08)<.013
			check(support,faction+": feet supported on staging deck at "+str(at))
			var capsule=CapsuleShape3D.new();capsule.radius=.32;capsule.height=1.86
			var query=PhysicsShapeQueryParameters3D.new();query.shape=capsule;query.transform.origin=ship.to_global(at+Vector3.UP*.93);query.margin=.001
			check(query_space.intersect_shape(query).is_empty(),faction+": crew body clears fittings at "+str(at))
		ship.queue_free();await process_frame
	space.queue_free();await process_frame;MMFAssets.cache.clear()
	var file=FileAccess.open("res://../test-results/godot-native/ship-assets.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"checks":checks,"failures":failures,"passed":failures.is_empty()},"\t"));file.close()
	print("SHIP_ASSETS_RESULT ",checks," checks, ",failures.size()," failures")
	call_deferred("quit",0 if failures.is_empty() else 1)
