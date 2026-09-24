extends SceneTree

var game
var checks=0
var failures=[]
var report={"retained":[],"models":[],"collision":[]}
var switchgear_boxes=[]
var pump_manifest={}
const SITES=[Vector3(8,12.43,10.4),Vector3(4,12.43,10.4),Vector3(0,12.43,10.4),Vector3(-4,12.43,10.4),Vector3(-8,12.43,10.4)]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-vessel-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func removed(p: Vector3) -> bool:
	return p.y>12.425 and p.y<14.59 and p.z>9.91 and p.z<10.85 and SITES.any(func(at):return p.x-at.x>-.40 and p.x-at.x<.32)

func replaced_cabinet(p: Vector3,original_name: String) -> bool:
	# The following cabinet pass trims two of these shared batches again. Verify
	# the exact remainder of both replacements, rather than weakening tolerance.
	if original_name not in ["Brace_welded_receiver001","Brace_welded_receiver001_5"]:return false
	for box in switchgear_boxes:
		if p.x>box.min[0]-.003 and p.x<box.max[0]+.003 and p.y>box.min[1]-.003 and p.y<box.max[1]+.003 and p.z>box.min[2]-.003 and p.z<box.max[2]+.003:return true
	return false

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
	for i in 2:await physics_frame
	await process_frame
	var machine=game.world.machine;var bank=MMFAssets.find_named(machine,"NativePressureVessels")
	check(bank!=null and bank.get_child_count()==5,"Five complete receivers replace the original middle-deck tank bank")
	var original=MMFAssets.scene("runtime/machine.glb");root.add_child(original);original.hide()
	var manifest=MMFAssets.json("res://art/nomad-vessels.json")
	switchgear_boxes=MMFAssets.json("res://art/nomad-switchgear.json").originalBoxes
	pump_manifest=MMFAssets.json("res://art/nomad-pumps.json")
	for entry in manifest.trim:
		check(MMFAssets.find_named(machine,entry.original)==null,"Old vessel components removed: "+entry.original)
		if entry.replacement=="":continue
		var old=MMFAssets.find_named(original,entry.original);var replacement=MMFAssets.find_named(machine,entry.replacement)
		var expected=vertices(old).filter(func(p):return not removed(p) and not replaced_cabinet(p,entry.original) and not preload("res://tests/pump_trim.gd").removed(p,entry.original,pump_manifest));var actual=vertices(replacement)
		var difference=maxf(retained_distance(expected,actual),retained_distance(actual,expected))
		check(difference<.001,"Unrelated workshop fittings retain their coordinates within 1 mm: "+entry.replacement)
		check(replacement.get_active_material(0)==old.get_active_material(0),"Original shared material preserved: "+entry.replacement)
		report.retained.append({"name":entry.replacement,"maxDistanceM":difference,"originalVertices":expected.size(),"replacementVertices":actual.size()})
	var resources={};var materials={};var transforms={};var all_triangles=0
	for i in SITES.size():
		var node=bank.get_child(i);var bounds=MMFAssets.bounds(node)
		check(node.position.is_equal_approx(SITES[i]) and node.basis.is_equal_approx(Basis.IDENTITY),"Receiver remains at the original site with its instruments facing the aisle: "+str(i+1))
		check(absf(bounds.position.y)<.001 and bounds.end.y<2.15,"Feet contact the deck; upper fittings stay below their previous height: "+str(i+1))
		check(bounds.position.x>=-.40 and bounds.end.x<=.32 and bounds.position.z>=-.49 and bounds.end.z<=.45,"All fittings remain inside the previous complete assembly footprint: "+str(i+1))
		var triangles=0;var degenerate=0;var surfaces=0;var painted=false;var front_letters=0
		for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
			if i==0:print("VESSEL_MESH ",mesh.name," material=",mesh.get_active_material(0).resource_name)
			resources[mesh.mesh]=true;transforms[mesh]=mesh.global_transform
			for surface in mesh.mesh.get_surface_count():
				surfaces+=1;var mat=mesh.get_active_material(surface);materials[mat]=true
				if mat is StandardMaterial3D and mat.albedo_texture and mat.normal_enabled and mat.roughness_texture:painted=true
				var arrays=mesh.mesh.surface_get_arrays(surface);var points=arrays[Mesh.ARRAY_VERTEX];var indices=arrays[Mesh.ARRAY_INDEX]
				triangles+=indices.size()/3
				for n in range(0,indices.size(),3):
					var a=points[indices[n]];var b=points[indices[n+1]];var c=points[indices[n+2]]
					if (b-a).cross(c-a).length_squared()<1e-18:degenerate+=1
					# Godot triangle winding is clockwise. Visible dial printing must
					# face the aisle, not depend on seeing a mirrored back face.
					if mat.resource_name.contains("rubber"):
						var local=node.global_transform.affine_inverse()*mesh.global_transform
						var p=(local*a+local*b+local*c)/3
						if p.y>1.18 and p.y<1.27 and p.z<-.395 and p.z>-.398 and (local.basis*((c-a).cross(b-a))).dot(Vector3.FORWARD)>0:front_letters+=1
		check(surfaces==5 and triangles<30000 and painted and degenerate==0,"Five portable material batches with valid detailed geometry: "+str(i+1))
		check(front_letters>100,"Gauge printing faces the aisle after native glTF import: "+str(i+1))
		all_triangles+=triangles;report.models.append({"site":str(node.position),"bounds":str(bounds),"triangles":triangles,"surfaces":surfaces,"degenerate":degenerate,"frontDialTriangles":front_letters})
		# The real frozen concave collider is retained, including its winding.
		var at=SITES[i]+Vector3.UP*.75;var offsets=[]
		for axis in [Vector3.RIGHT,Vector3.LEFT,Vector3.FORWARD,Vector3.BACK]:
			var hit=game.raycast(at+axis*.75,at-axis*.75,[],1)
			var distance=hit.position.distance_to(at) if not hit.is_empty() else INF;offsets.append(distance)
			check(distance>.26 and distance<.33,"Existing tank collision is still solid from "+str(axis)+" at "+str(i+1))
		game.player.teleport(SITES[i]+Vector3(0,.05,-1.25));game.player.yaw=PI
		check(game.player.boundary.fits(game.player.position),"Player can still stand in the receiver service aisle: "+str(i+1))
		game.player.set_physics_process(true);Input.action_press("forward")
		for frame in 35:await physics_frame
		Input.action_release("forward");game.player.set_physics_process(false)
		var stop=SITES[i].z-game.player.position.z
		check(stop>.56 and stop<.83 and absf(game.player.position.y-SITES[i].y)<.1,"Real player cannot walk through the pressure vessel: "+str(i+1))
		report.collision.append({"site":str(SITES[i]),"radialHitsM":offsets,"playerStopM":stop})
	check(resources.size()==5 and materials.size()==5,"All five instances share five mesh and material resources")
	check(MMFAssets.of_type(bank,"CollisionObject3D").is_empty() and MMFAssets.of_type(bank,"Light3D").is_empty() and bank.find_children("*","GPUParticles3D",true,false).is_empty(),"Refinement adds no physics bodies, lights or particles")
	game.session.story.phase="locked";game.session.scanner.phase="consumed"
	for frame in 30:game.world.update(1.0/60)
	check(transforms.keys().all(func(mesh):return mesh.global_transform.is_equal_approx(transforms[mesh])),"Feet, shells and fittings remain rigidly attached through machine gait")
	report.uniqueMeshes=resources.size();report.uniqueMaterials=materials.size();report.instancedTriangles=all_triangles
	original.queue_free();resources.clear();materials.clear();transforms.clear();game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Clean native test shutdown")
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/vessel-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("VESSEL_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
