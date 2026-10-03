extends SceneTree

var checks=0
var failures=[]
var worlds=[]

func _initialize():set_meta("test_mode",true);call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func digest(bytes: PackedByteArray) -> String:
	var h=HashingContext.new();h.start(HashingContext.HASH_SHA256);h.update(bytes);return h.finish().hex_encode()

func ray(site: Node3D,a: Vector3,b: Vector3) -> Dictionary:
	return site.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(site.to_global(a),site.to_global(b),1))

func run():
	var manifest=MMFAssets.json(MMFSiteRoofs.DATA)
	check(FileAccess.get_sha256(MMFSiteRoofs.PATH)==manifest.visualSha256,"Three additive shelters match their reviewed GLB provenance")
	check(FileAccess.get_sha256(manifest.foundryPath)==manifest.foundrySha256,"Foundry roof and seated floor match reviewed source provenance")
	MMFSiteRoofs.prepare_models()
	for i in MMFSiteRoofs.SITES.size():MMFSiteRoofs.prepare_shape(i)
	check(MMFSiteRoofs._models.size()==MMFSiteRoofs.ROOTS.size() and MMFSiteRoofs._shapes.size()==MMFSiteRoofs.SITES.size(),"Bounded title preparation creates one model per additive assembly and one shared shape per site")
	var caches=MMFSiteRoofs._models.duplicate();var shapes=MMFSiteRoofs._shapes.duplicate()
	MMFSiteRoofs.prepare_models()
	for i in MMFSiteRoofs.SITES.size():MMFSiteRoofs.prepare_shape(i)
	check(caches==MMFSiteRoofs._models and shapes==MMFSiteRoofs._shapes,"Repeated preparation retains identical packed scenes and native shape resources")
	var index=0
	for id in MMFSiteRoofs.SITES:
		var world=Node3D.new();root.add_child(world);worlds.append(world);world.position.x=index*100
		var data=manifest.sites[id];var source=MMFAssets.json(data.source);var shape=load(data.path)
		check(shape is ConcavePolygonShape3D and shape.backface_collision,"Roof blocks rays from above and below: "+id)
		check(FileAccess.get_sha256(data.path)==data.shapeSha256 and FileAccess.get_sha256(data.source)==data.sourceSha256,"Exact native collision/source hashes agree: "+id)
		var faces=shape.get_faces();var exact=faces.size()==source.faces.size();var finite=true;var degenerate=0
		for i in faces.size():
			finite=finite and faces[i].is_finite()
			if i<source.faces.size():exact=exact and faces[i].is_equal_approx(MMFAssets.v(source.faces[i]))
		for i in range(0,faces.size(),3):
			if (faces[i+1]-faces[i]).cross(faces[i+2]-faces[i]).length_squared()<1e-16:degenerate+=1
		check(exact and digest(faces.to_byte_array())==data.facesSha256,"Every exported structural triangle retains source coordinates and order: "+id)
		check(finite and degenerate==0,"Roof structural mesh is finite and has no collapsed triangles: "+id)
		if id=="relay-foundry":world.add_child(MMFAssets.scene(manifest.foundryPath))
		elif id=="wreck-one":world.add_child(MMFAssets.scene(data.visualPath))
		var assembly=MMFSiteRoofs.attach(world,id);var repeat=MMFSiteRoofs.attach(world,id)
		check(assembly==repeat and MMFAssets.of_type(assembly,"StaticBody3D").size()==1,"Attach is idempotent and retains exactly one roof body: "+id)
		check(MMFAssets.of_type(assembly,"CollisionShape3D")[0].shape==shape,"Installed roof uses the shared baked shape without mesh readback: "+id)
		var models=MMFAssets.of_type(assembly,"MeshInstance3D")
		if id=="relay-foundry":models=MMFAssets.of_type(MMFAssets.find_named(world,"FoundryRoof"),"MeshInstance3D")
		elif id=="wreck-one":models=MMFAssets.of_type(MMFAssets.find_named(world,"Wreck_BrokenRoof_Geometry"),"MeshInstance3D")
		var triangles=0;var geometry_ok=true;var palettes={}
		for part in models:
			for s in part.mesh.get_surface_count():
				var material=part.get_active_material(s);palettes[material]=true
				check(material is StandardMaterial3D and material.albedo_texture!=null and not material.emission_enabled,"Authored shelter uses mapped muted material, no invented glow: "+id+" / "+str(s))
				var arrays=part.mesh.surface_get_arrays(s);var vertices=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX];triangles+=indices.size()/3
				for vertex in vertices:geometry_ok=geometry_ok and vertex.is_finite()
		check(geometry_ok and triangles<=45000 and palettes.size()<=5,"Shelter remains within bounded geometry and shared material budget: "+id)
		await physics_frame;await physics_frame
		if id=="relay-foundry":
			check(not ray(world,Vector3(-1.7,7,2),Vector3(-1.7,3,2)).is_empty(),"Foundry intact corrugated panel blocks a downward ray")
			check(not ray(world,Vector3(-1.7,3,2),Vector3(-1.7,7,2)).is_empty(),"Foundry intact panel blocks an upward ray from the workshop")
			check(ray(world,Vector3(4.5,7,-4.2),Vector3(4.5,3,-4.2)).is_empty(),"Foundry deliberately torn bay remains physically open")
			check(not ray(world,Vector3(4.5,7,-3.25),Vector3(4.5,3,-3.25)).is_empty(),"Exposed purlin in torn bay remains solid")
			for sample in [Vector3(-7.5,1.72,0),Vector3(-5,1.72,0),Vector3(0,1.72,0),Vector3(5.5,1.72,0)]:
				check(ray(world,sample+Vector3(-.5,0,0),sample+Vector3(.5,0,0)).is_empty(),"Foundry entrance and original circulation remain free of new roof supports: "+str(sample))
			var anchors={"TrackingServo":Vector3(3,1,-1.5),"SalvageController":Vector3(-1,1,1.5),"JournalLog":Vector3(-2,1,-2),"JournalBlueprint":Vector3(1,1.23,2),"Gangway":Vector3(-7.5,-.08,0),"EntryAnchor":Vector3(-7,0,0),"ExitSightline":Vector3(-5.8,1.6,0)}
			for anchor in anchors:
				var node=MMFAssets.find_named(world,anchor)
				check(node!=null and world.to_local(node.global_position).distance_to(anchors[anchor])<.001,"Existing functional anchor is unchanged: "+anchor)
		elif id=="rooftop-workshop":
			check(not ray(world,Vector3(0,6,-2.4),Vector3(0,2,-2.4)).is_empty(),"Shared workshop rear workbench has a real overhead shelter")
			check(ray(world,Vector3(0,6,0),Vector3(0,1,0)).is_empty(),"Shared workshop central aisle remains open to the sky")
			check(ray(world,Vector3(-5,5.4,6),Vector3(-2.5,5.4,6)).is_empty(),"Raised archive bridge and headroom are untouched")
		elif id=="quiet-array":
			check(not ray(world,Vector3(1.4,3.60,1.2),Vector3(1.4,3.60,1.6)).is_empty(),"Array canopy's former 120 mm bearing gap has a solid seated support")
		elif id=="glass-orchard":
			check(not ray(world,Vector3(2.7,4.075,-8.7),Vector3(2.7,4.075,-8.3)).is_empty(),"Orchard canopy's former 60 mm bearing gap has a solid seated support")
		elif id=="wreck-one":
			check(FileAccess.get_sha256(data.visualPath)==data.visualSha256,"Wake roof collision matches the final shipped roof lap geometry")
			var raised=ray(world,Vector3(0,5,-5.6),Vector3(0,3,-5.6))
			check(not raised.is_empty() and absf(world.to_local(raised.position).y-3.74)<.002,"Wake raised lap roof blocks from above at its actual top")
			var underside=ray(world,Vector3(0,3.2,-5.6),Vector3(0,4,-5.6))
			check(not underside.is_empty() and absf(world.to_local(underside.position).y-3.665)<.002,"Wake raised lap underside is solid without the obsolete lower plane")
			var intact=ray(world,Vector3(0,5,-8),Vector3(0,3,-8))
			check(not intact.is_empty() and absf(world.to_local(intact.position).y-3.5875)<.002,"Wake untouched long roof sheet retains its exact solid height")
			check(ray(world,Vector3(0,5,0),Vector3(0,2.8,0)).is_empty(),"Wake torn-open central sky remains ray-clear")
		elif id=="last-garden-meridian":
			check(not ray(world,Vector3(-5,2.8,-2),Vector3(-5,2.8,-4)).is_empty(),"Meridian entrance lettering has a real solid backing board")
			check(ray(world,Vector3(-5,1.92,-2),Vector3(-5,1.92,-4)).is_empty(),"Meridian mounted sign preserves player headroom at the garden entry")
		var capsule=CapsuleShape3D.new();capsule.radius=.32;capsule.height=1.92
		var query=PhysicsShapeQueryParameters3D.new();query.shape=capsule;query.collision_mask=1
		for point in [Vector3(-4,0,0),Vector3(0,0,0),Vector3(4,0,0)]:
			query.transform=Transform3D(Basis.IDENTITY,world.to_global(point+Vector3.UP*.96))
			check(world.get_world_3d().direct_space_state.intersect_shape(query).is_empty(),"New roof does not intrude on a full-height central walking capsule: "+id+" / "+str(point))
		world.rotation.y=PI/2;world.position.z=17;await physics_frame;await physics_frame
		check(MMFAssets.of_type(assembly,"CollisionShape3D")[0].shape==shape,"Destination movement/rotation retains the shared roof shape: "+id)
		index+=1
	for world in worlds:world.free()
	var workshop=MMFAssets.scene("res://art/native-rooftop-workshop.glb");root.add_child(workshop)
	var motto=MMFAssets.find_named(workshop,"Workshop motto")
	check(motto!=null and (motto.global_basis*Vector3.RIGHT).dot(Vector3.RIGHT)>.999,"Shared Workshop motto reads left to right from the interior")
	check(motto.position.distance_to(Vector3(1.4,2.65,-4.51))<.001,"Motto keeps its existing rear-wall mounting point")
	workshop.free()
	caches.clear();shapes.clear();MMFSiteRoofs.clear_cache();MMFAssets.cache.clear()
	check(MMFSiteRoofs._models.is_empty() and MMFSiteRoofs._shapes.is_empty(),"Teardown releases bounded roof caches")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty()}
	var file=FileAccess.open("res://../test-results/roof-floor/site-roofs-test.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("SITE_ROOFS ",checks," checks; ",failures.size()," failures");quit(0 if failures.is_empty() else 1)
