extends SceneTree

var game
var checks=0
var failures=[]
var report={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-canopy-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func cell(at: Vector3) -> Vector3i:
	return Vector3i(floori(at.x*500),floori(at.y*500),floori(at.z*500))

func vertices(mesh: MeshInstance3D) -> Array:
	var result=[]
	for s in mesh.mesh.get_surface_count():
		for v in mesh.mesh.surface_get_arrays(s)[Mesh.ARRAY_VERTEX]:result.append(mesh.global_transform*v)
	return result

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

func removed(point: Vector3,name: String,posts: Array) -> bool:
	if name.begins_with("Tailored"):return point.x> -3.3 and point.x<6.5 and point.y>18.25 and point.y<20.4 and point.z> -1.3 and point.z<6.8
	for p in posts:
		if absf(point.x-p[0])<.10 and absf(point.z-p[2])<.10 and point.y>p[1]-.04 and point.y<p[1]+.06:return true
	return false

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	for i in 2:await physics_frame
	await process_frame
	var canopy=game.world.canopy;var kit=canopy.root;var manifest=MMFAssets.json("res://art/nomad-canopy.json")
	check(kit!=null and kit.get_parent()==game.world.machine,"Refined canvas is installed on the actual machine")
	var original=MMFAssets.scene("runtime/machine.glb");root.add_child(original);original.hide()
	report.retained=[]
	for entry in manifest.trim:
		check(MMFAssets.find_named(game.world.machine,entry.original)==null,"Old overlapping batch removed: "+entry.original)
		if entry.replacement=="":continue
		var old=MMFAssets.find_named(original,entry.original);var replacement=MMFAssets.find_named(game.world.machine,entry.replacement)
		var expected=vertices(old).filter(func(p):return not removed(p,entry.original,manifest.posts));var actual=vertices(replacement)
		var forward=retained_distance(expected,actual);var backward=retained_distance(actual,expected)
		check(maxf(forward,backward)<.001,"Unrelated banner/service geometry preserved within 1 mm: "+entry.replacement)
		check(replacement.get_active_material(0)==old.get_active_material(0),"Retained batch uses its original shared material: "+entry.replacement)
		report.retained.append({"name":entry.replacement,"oldVertices":expected.size(),"newVertices":actual.size(),"maxDistanceM":maxf(forward,backward)})
	var poles=MMFAssets.find_named(game.world.machine,"Bridge_maintenance_ladder_upright001_1");var old_poles=MMFAssets.find_named(original,"Bridge_maintenance_ladder_upright001_1")
	check(poles.mesh==old_poles.mesh and poles.global_transform.is_equal_approx(old_poles.global_transform),"All four original grounded posts and feet stay identical")
	var cloth=MMFAssets.find_named(kit,"CanopyCanvas");var arrays=cloth.mesh.surface_get_arrays(0)
	var points=arrays[Mesh.ARRAY_VERTEX];var uv=arrays[Mesh.ARRAY_TEX_UV];var colors=arrays[Mesh.ARRAY_COLOR];var indices=arrays[Mesh.ARRAY_INDEX]
	check(colors!=null and colors.size()==points.size(),"Imported COLOR_0 retains the fabric tint and pin weights")
	var pinned=[];var tint_min=1.0;var alpha_min=1.0;var alpha_max=0.0;var min_y=INF;var max_y=-INF;var degenerate=0
	for i in points.size():
		var at=cloth.global_transform*points[i];min_y=minf(min_y,at.y);max_y=maxf(max_y,at.y)
		if colors:
			tint_min=minf(tint_min,colors[i].r);alpha_min=minf(alpha_min,colors[i].a);alpha_max=maxf(alpha_max,colors[i].a)
		for corner in [Vector2(0,0),Vector2(1,0),Vector2(0,1),Vector2(1,1)]:
			if uv[i].distance_to(corner)<.0001:pinned.append(i)
	for i in range(0,indices.size(),3):
		if (points[indices[i+1]]-points[indices[i]]).cross(points[indices[i+2]]-points[indices[i]]).length_squared()<1e-18:degenerate+=1
	check(pinned.size()>=4 and pinned.all(func(i):return colors[i].a<.001),"Every authored corner is pinned after actual glTF import")
	check(tint_min<.8 and alpha_min<.001 and alpha_max>.99,"Patch variation and moving interior survive Blender export")
	check(min_y-.035>18.40,"Maximum downward billow keeps over 2.37 m of standing clearance above the deck")
	check(degenerate==0,"Imported canvas has no collapsed triangles")
	check(cloth.extra_cull_margin>=.035,"Culling bounds include maximum fabric movement")
	check(cloth.material_override==canopy.fabric and canopy.fabric.get_shader_parameter("base_map")!=null and canopy.fabric.get_shader_parameter("normal_map")!=null and canopy.fabric.get_shader_parameter("orm_map")!=null,"Portable fabric maps are connected to the native cloth shader")
	var bodies=MMFAssets.of_type(kit,"CollisionObject3D")
	check(MMFAssets.of_type(kit,"MeshInstance3D").size()==3 and bodies.size()==1 and bodies[0].collision_layer==MMFMachineCanopy.CAMERA_LAYER and MMFAssets.of_type(kit,"Light3D").is_empty(),"Three material batches add only camera collision, with no lights or cloth simulation bodies")
	for i in 4:
		var marker=MMFAssets.find_named(kit,"CanvasAnchor"+str(i+1));var at=Vector3(manifest.corners[i][0],manifest.corners[i][1],manifest.corners[i][2]);var post=Vector3(manifest.posts[i][0],manifest.posts[i][1],manifest.posts[i][2])
		check(marker.global_position.distance_to(at)<.001 and absf(marker.global_position.y-post.y)<.001 and marker.global_position.distance_to(post)<.241,"Canvas tensioner joins its existing support at corner "+str(i+1))
	var save_before=game.session.native_snapshot();var transforms={}
	for mesh in MMFAssets.of_type(kit,"MeshInstance3D"):transforms[mesh]=mesh.global_transform
	canopy.update(.1,0);var clear_wind=canopy.fabric.get_shader_parameter("wind_strength")
	canopy.update(.1,1);var storm_wind=canopy.fabric.get_shader_parameter("wind_strength")
	check(clear_wind<storm_wind and storm_wind==1,"Dust storms strengthen the restrained fabric movement")
	check(game.session.native_snapshot()==save_before,"Cosmetic fabric updates do not consume water or change gameplay state")
	check(transforms.keys().all(func(mesh):return mesh.global_transform.is_equal_approx(transforms[mesh])),"Wind leaves the machine, supports and CPU mesh transforms stationary")
	# Real paused tree and main loop, not merely a zero-delta unit call.
	game.set_physics_process(true);game.open_menu("Pause");var paused=canopy.clock
	await create_timer(.06).timeout;check(canopy.clock==paused,"Opening a paused menu freezes canopy motion")
	game.close_menu();await physics_frame;await physics_frame
	check(canopy.clock>paused,"Canvas resumes with normal gameplay")
	game.set_physics_process(false)
	report.canvas={"minimumY":min_y,"maximumY":max_y,"pinnedVertexSamples":pinned.size(),"minimumTint":tint_min,"weightRange":[alpha_min,alpha_max],"degenerateTriangles":degenerate,"triangleCount":indices.size()/3}
	original.queue_free();game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear()
	report.checks=checks;report.failures=failures
	var file=FileAccess.open("res://../test-results/godot-native/canopy-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("CANOPY_RESULT ",checks," checks, ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
