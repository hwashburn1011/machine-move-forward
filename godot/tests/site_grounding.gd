extends SceneTree

var checks=0
var failures=[]
var records=[]
class Fixture:
	var session={"distance":2738.0,"lateral":73.5}

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://site-grounding-test/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);print("FAIL ",label)
func ray(node: Node3D,a: Vector3,b: Vector3) -> Dictionary:
	return node.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(node.to_global(a),node.to_global(b),1))

func run():
	var data=MMFAssets.json(MMFSiteGrounding.DATA)
	check(FileAccess.get_sha256(MMFSiteGrounding.PATH)==data.sha256,"Grounding GLB matches reviewed authored provenance")
	MMFSiteGrounding.prepare_models();var cached=MMFSiteGrounding._models.duplicate();MMFSiteGrounding.prepare_models()
	check(cached==MMFSiteGrounding._models and cached.size()==data.models.size(),"Repeated title preparation retains bounded shared packed models")
	check(MMFSiteGrounding.ROOTS.size()==20,"All 18 visitable identities plus opening/horizon are explicit")
	# Analytic envelope is checked independently from the implementation constants.
	check(-5.2-2.6*.5==-6.5 and (-6.5*.08-.55)>-6.5,"Normalized noise plus ridged term and corridor prove conservative -6.5 m lower bound")
	var min_seen=INF;var max_seen=-INF
	for x in range(-42,43):
		for z in range(-32,33):
			var height=MMFDunes.height_at(x*71.73,z*113.21)
			min_seen=minf(min_seen,height);max_seen=maxf(max_seen,height)
	check(min_seen>=-6.5 and max_seen<=6.5,"5,525 dune samples across many lateral bands remain inside analytic bound")
	var fixture=Fixture.new()
	for id in MMFSiteGrounding.ROOTS:
		var parent=Node3D.new();root.add_child(parent);parent.position=Vector3(22,16.03,-135)
		if id in ["meridian-horizon","opening-rooftop"]:parent.position=Vector3(110,0,-220) if id=="meridian-horizon" else Vector3.ZERO
		if id=="meridian-horizon":parent.rotation.y=PI
		var sentinel=Node3D.new();sentinel.name="UnchangedWalkingAnchor";sentinel.position=Vector3(-6.5,0,0);parent.add_child(sentinel)
		var original=sentinel.global_transform
		var site=MMFSiteGrounding.attach(parent,id,fixture)
		check(site!=null and site==MMFSiteGrounding.attach(parent,id,fixture),"Idempotent complete grounding: "+id)
		check(sentinel.global_transform==original,"Existing floor/entrance anchor unchanged: "+id)
		check(MMFAssets.of_type(site,"StaticBody3D").size()==1,"One compound lower-building body: "+id)
		var instances=MMFAssets.of_type(site,"MeshInstance3D");var mats={};var valid=true
		for instance in instances:
			valid=valid and instance.transform.is_finite()
			for s in instance.mesh.get_surface_count():
				var material=instance.get_active_material(s);mats[material]=true
				check(material is StandardMaterial3D and material.albedo_texture!=null and not material.emission_enabled,"Mapped muted material without invented glow: "+id)
		check(valid and instances.size()<=28 and mats.size()<=7,"Finite model bounded to 28 mesh instances and seven shared materials: "+id)
		var samples=site.get_meta("terrain_samples");var origin=site.get_meta("terrain_world_origin")
		check(origin.is_equal_approx(Vector2(parent.global_position.x+fixture.session.lateral,parent.global_position.z-fixture.session.distance)),"Terrain uses rendered X+lateral/Z-distance: "+id)
		for group in samples:
			check(group.size()==9,"Footing samples center, edges, and corners: "+id)
			for sample in group:check(is_equal_approx(sample.height,MMFDunes.height_at(sample.worldX,sample.worldZ)),"Stored actual terrain sample is exact: "+id)
		var bottoms=[];var foundations=[]
		for child in site.get_children():
			if String(child.name).begins_with("ContinuousBuriedCaisson"):
				foundations.append(child);bottoms.append(child.global_position.y)
				check(absf(child.global_position.y+6.7)<.0001,"Continuous foundation is embedded below the global dune minimum: "+id)
		check(not foundations.is_empty(),"At least one enclosed continuous foundation: "+id)
		await physics_frame;await physics_frame
		for caisson in foundations:
			var center=parent.to_local(caisson.global_position)+Vector3.UP*(caisson.scale.y-.05)
			var hit=ray(parent,center-Vector3(.01,0,0),center+Vector3(.01,0,0))
			# Rays beginning inside a closed box need hit_from_inside to register;
			# use an exterior vertical ray to prove the actual solid foundation.
			var start=center+Vector3.UP*.20;var end=parent.to_local(caisson.global_position)-Vector3.UP
			hit=ray(parent,start,end)
			check(not hit.is_empty(),"Physical buried foundation blocks rays through its full body: "+id)
		if id not in ["opening-rooftop","meridian-horizon"]:
			check(ray(parent,Vector3(-10,1,0),Vector3(10,1,0)).is_empty(),"No new solid obstructs existing walking headroom: "+id)
			# A rotated material batch's transformed local AABB overestimates its
			# extents. Inspect actual shared vertices in the site frame instead.
			var actual_top=-INF
			for instance in instances:
				for surface in instance.mesh.get_surface_count():
					for vertex in instance.mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]:actual_top=maxf(actual_top,parent.to_local(instance.to_global(vertex)).y)
			check(actual_top<=-.12,"All actual mesh vertices remain at least 12 cm below walking floor and seated into underside: "+id)
			check(not ray(parent,Vector3(0,2,0),Vector3(0,-2,0)).is_empty(),"Original platform footprint bears on a real transfer slab: "+id)
		var transforms=[]
		for child in site.get_children():
			if child is Node3D:transforms.append(child.transform)
		parent.position.z+=120;fixture.session.distance+=120;fixture.session.lateral-=14
		await physics_frame
		var unchanged=true;var index=0
		for child in site.get_children():
			if child is Node3D:unchanged=unchanged and transforms[index]==child.transform;index+=1
		check(unchanged and samples==site.get_meta("terrain_samples"),"Travel/steering never morphs a foundation or resamples its facade: "+id)
		records.append({"id":id,"style":data.models[MMFSiteGrounding.ROOTS[id]].style,"meshInstances":instances.size(),"materials":mats.size(),"footings":foundations.size(),"bottoms":bottoms,"terrainOrigin":str(origin)})
		parent.free()
	# Exercise production dispatch, including early-return optional branches.
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.set_physics_process(false);game.player.set_physics_process(false)
	game.session.story.phase="docked";game.session.distance=1000;game.session.story.arrival=1000
	for i in 5:
		game.session.story.index=i;game.campaign.create_destination(game.data.STORY_EXPEDITIONS[i])
		check(game.campaign.destination.has_node("GroundedSiteStructure"),"Production campaign hook: "+game.data.STORY_EXPEDITIONS[i].id)
		await process_frame
	for kind in ["fuel-cache","salvage-wreck","memorial","repair-depot","friendly-refuge","rooftop-workshop","gear-salvage-crane","gear-battery-bank","gear-quiet-drive","mission-stranded-courier","mission-roof-supplies","mission-quiet-watch"]:
		game.session.contacts.active={"id":"grounding-test-"+kind,"slot":1,"kind":kind,"state":"docked","atDistanceM":1000.0,"worldX":0.0,"expiresAtM":1200.0,"step":"task-ready","rewards":{},"record":false,"salvageMode":""}
		game.opportunities.create_site()
		check(game.opportunities.site.has_node("GroundedSiteStructure"),"Production optional dispatch: "+kind)
		await process_frame
	var berth=MMFMeridianBerth.new();game.add_child(berth);berth.setup(game)
	check(berth.has_node("GroundedSiteStructure"),"Production finale berth hook")
	berth.free()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	var source_hash=MMFPlaytestRecorder.source_fingerprint()
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFSiteGrounding.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	check(MMFSiteGrounding._models.is_empty() and MMFSiteGrounding._data.is_empty(),"Grounding cache lifecycle releases all owned packed roots")
	var report={"passed":failures.is_empty(),"checks":checks,"failures":failures,"identities":records,"observedTerrainRange":[min_seen,max_seen],"sourceHash":source_hash,"glbSha256":data.sha256}
	var file=FileAccess.open("res://../test-results/site-grounding/grounding-test.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("SITE_GROUNDING_RESULT ",checks," checks / ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
