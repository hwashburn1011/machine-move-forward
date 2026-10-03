extends SceneTree

var game
var checks=0
var failures=[]
var report={"retained":[],"models":[],"collision":[],"indicators":[]}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-switchgear-tests/";call_deferred("run")

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

func removed(p: Vector3,entry,boxes: Array) -> bool:
	for box in boxes:
		if p.x>box.min[0]-.003 and p.x<box.max[0]+.003 and p.y>box.min[1]-.003 and p.y<box.max[1]+.003 and p.z>box.min[2]-.003 and p.z<box.max[2]+.003:return true
	return entry.priorVesselRemoval and p.y>12.425 and p.y<14.59 and p.z>9.91 and p.z<10.85 and [8,4,0,-4,-8].any(func(x):return p.x-x>-.40 and p.x-x<.32)

func status(expected: Vector3,label: String):
	game.session.update_power();var before=game.session.native_snapshot()
	game.world.switchgear.update(.25,game.session)
	var actual=game.world.switchgear.indicators.get_shader_parameter("status_bits")
	check(actual==expected,label)
	check(before==game.session.native_snapshot(),"Indicator sampling leaves simulation/save state unchanged: "+label)
	report.indicators.append({"case":label,"expected":str(expected),"actual":str(actual),"capacity":game.session.capacity,"demand":game.session.demand})

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	for i in 2:await physics_frame
	await process_frame
	var kit=game.world.switchgear.root;var machine=game.world.machine;var manifest=MMFAssets.json("res://art/nomad-switchgear.json")
	check(kit!=null and kit.get_child_count()==2,"Two complete electrical cabinets serve the middle-deck control edges")
	var original=MMFAssets.scene("runtime/machine.glb");root.add_child(original);original.hide()
	var pump_manifest=MMFAssets.json("res://art/nomad-pumps.json")
	var bench_manifest=MMFAssets.json("res://art/nomad-benches.json")
	for entry in manifest.trim:
		if entry.replacement=="":
			check(MMFAssets.find_named(machine,entry.original)==null,"Old floating indicator geometry is removed: "+entry.original);continue
		var old=MMFAssets.find_named(original,entry.frozen);var retained=MMFAssets.find_named(machine,entry.replacement)
		var expected=vertices(old).filter(func(p):return not removed(p,entry,manifest.originalBoxes) and not preload("res://tests/pump_trim.gd").removed(p,entry.frozen,pump_manifest) and not preload("res://tests/bench_trim.gd").removed(p,entry.frozen,bench_manifest))
		if expected.is_empty():
			check(retained==null,"Batch emptied by subsequent pump refinement is removed: "+entry.replacement);continue
		check(retained!=null,"Shared batch keeps its stable identity: "+entry.replacement)
		var actual=vertices(retained)
		var distance=maxf(retained_distance(expected,actual),retained_distance(actual,expected))
		check(distance<.001,"All unrelated structure/fittings remain within 1 mm: "+entry.replacement)
		check(preload("res://tests/material_equivalence.gd").same(retained.get_active_material(0),old.get_active_material(0)),"Retained geometry keeps the original material properties and textures: "+entry.replacement)
		report.retained.append({"name":entry.replacement,"maxDistanceM":distance,"originalVertices":expected.size(),"retainedVertices":actual.size()})
	var meshes={};var materials={};var transforms={}
	var sites=MMFMachineComposition.sites(manifest)
	for selected in sites.size():
		var site=sites[selected];var i=manifest.sites.find(site);var node=kit.get_child(selected);var bounds=MMFAssets.bounds(node);var at=MMFAssets.v(site.position);var front=-node.basis.z
		check(node.position.is_equal_approx(at) and front.is_equal_approx(Vector3.BACK if i<2 else Vector3.LEFT),"Cabinet keeps its site with controls facing the aisle: "+str(i+1))
		check(absf(bounds.position.y)<.001 and bounds.end.y<=1.7101,"Continuous plinth and gland flange contact the deck: "+str(i+1))
		var world_bounds=node.transform*bounds;var allowed=manifest.originalBoxes[i]
		check(world_bounds.position.x>allowed.min[0]-.003 and world_bounds.end.x<allowed.max[0]+.003 and world_bounds.position.z>allowed.min[2]-.003 and world_bounds.end.z<allowed.max[2]+.003,"Refined fittings stay within the original complete assembly footprint: "+str(i+1))
		var triangles=0;var degenerate=0;var painted=false;var degenerate_meshes={}
		for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
			meshes[mesh.mesh]=true;transforms[mesh]=mesh.global_transform
			for surface in mesh.mesh.get_surface_count():
				var mat=mesh.get_active_material(surface);materials[mat]=true
				if mat is StandardMaterial3D and mat.albedo_texture and mat.normal_enabled and mat.roughness_texture:painted=true
				var arrays=mesh.mesh.surface_get_arrays(surface);var points=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX];triangles+=indices.size()/3
				for j in range(0,indices.size(),3):
					if (points[indices[j+1]]-points[indices[j]]).cross(points[indices[j+2]]-points[indices[j]]).length_squared()<1e-18:
						degenerate+=1;degenerate_meshes[mesh.name]=degenerate_meshes.get(mesh.name,0)+1
		check(painted and degenerate==0 and triangles<=55000,"Portable worn material and valid smooth geometry: "+str(i+1))
		var lamps=MMFAssets.find_named(node,"SwitchgearIndicators");var channels=lamps.mesh.surface_get_arrays(0)[Mesh.ARRAY_COLOR];var counts=[0,0,0];var invalid=0
		for color in channels:
			if color.r>.99 and color.g<.01 and color.b<.01:counts[0]+=1
			elif color.g>.99 and color.r<.01 and color.b<.01:counts[1]+=1
			elif color.b>.99 and color.r<.01 and color.g<.01:counts[2]+=1
			else:invalid+=1
		check(invalid==0 and counts.all(func(n):return n>100),"All three lens channels survive actual COLOR_0 import: "+str(i+1))
		check(lamps.material_override==game.world.switchgear.indicators,"Cabinet shares one live indicator material: "+str(i+1))
		# Exercise the original concave collider from the real service aisle.
		var center=at+Vector3.UP*.92;var hit=game.raycast(center+front,center-front,[],1)
		check(not hit.is_empty() and hit.position.distance_to(center)>.24 and hit.position.distance_to(center)<.33,"Original physical door remains solid: "+str(i+1))
		game.player.teleport(at+front*1.3+Vector3.UP*.05);game.player.yaw=0 if i<2 else -PI/2
		check(game.player.boundary.fits(game.player.position),"Cabinet approach remains a usable supported aisle: "+str(i+1))
		game.player.set_physics_process(true);Input.action_press("forward")
		for frame in 35:await physics_frame
		Input.action_release("forward");game.player.set_physics_process(false)
		var stop=(game.player.position-at).dot(front)
		check(stop>.54 and stop<.76 and absf(game.player.position.y-at.y)<.1,"Real player stops at cabinet instead of walking through it: "+str(i+1))
		report.models.append({"site":str(at),"bounds":str(bounds),"triangles":triangles,"degenerate":degenerate,"degenerateMeshes":degenerate_meshes,"lensVertices":counts});report.collision.append({"site":str(at),"playerStopM":stop})
	check(meshes.size()==5 and materials.size()==5,"All cabinets share five mesh/material resources including their one indicator shader")
	check(MMFAssets.of_type(kit,"CollisionObject3D").is_empty() and MMFAssets.of_type(kit,"Light3D").is_empty(),"No new physics bodies or dynamic lights")
	var s=game.session;status(Vector3(1,0,0),"Healthy supplied bus lights only SUPPLY")
	var extra_a=s.create_piece("refinery",{"x":3,"y":0,"z":3},0,{},true)
	var extra_b=s.create_piece("refinery",{"x":4,"y":0,"z":3},0,{},true)
	status(Vector3(1,1,0),"Real overloaded station tier lights LOAD SHED")
	check(not s.powered.get(extra_a.instanceId,true),"Warning agrees with the actual shed consumer")
	s.subsystems.engine-=1;status(Vector3.ONE,"Existing engine damage lights ENGINE DAMAGE")
	s.fuel=0;status(Vector3.ZERO,"Fuel exhaustion makes all cabinet lamps dark")
	s.inventory.add("fuel",10);check(s.refuel(),"Physical refuelling transaction succeeds");status(Vector3.ONE,"Supply and existing warnings return after refuelling")
	s.inventory.add("scrap",20);check(s.repair("engine"),"Existing engine repair transaction succeeds");status(Vector3(1,1,0),"Repair clears only ENGINE DAMAGE")
	s.structures.erase(extra_a);s.structures.erase(extra_b);status(Vector3(1,0,0),"Removing excess demand clears LOAD SHED")
	var indicator=game.world.switchgear;var shader=indicator.indicators
	s.subsystems.engine-=1;indicator.update(.05,s);check(shader.get_shader_parameter("status_bits")==Vector3(1,0,0),"Indicator changes are sampled at four Hz instead of every frame")
	indicator.update(.20,s);check(shader.get_shader_parameter("status_bits")==Vector3(1,0,1),"Sample catches the changed engine state within 250 ms")
	s.subsystems.engine=s.data.SUBSYSTEMS.engine.maxHealth
	game.set_physics_process(true);game.open_menu("Pause");var remaining=indicator.remaining
	await create_timer(.08).timeout;check(indicator.remaining==remaining and shader.get_shader_parameter("status_bits")==Vector3(1,0,1),"Pause freezes presentation sampling with the simulation")
	game.close_menu();for frame in 20:await physics_frame
	game.set_physics_process(false);check(shader.get_shader_parameter("status_bits")==Vector3(1,0,0),"Normal gameplay resumes the correct indicators")
	check(transforms.keys().all(func(mesh):return mesh.global_transform.is_equal_approx(transforms[mesh])),"Live lamps and gait keep every cabinet part fixed on the deck")
	original.queue_free();meshes.clear();materials.clear();transforms.clear();game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Clean switchgear test shutdown")
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/switchgear-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("SWITCHGEAR_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
