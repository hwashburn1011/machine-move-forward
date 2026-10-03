extends SceneTree

var checks=0
var failures=[]
var report={"models":{},"route":{}}
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-wasteland-assets/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func run():
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.session.seed_name="wasteland-asset-route"
	var world=game.world;var source_refs=[];var total_triangles=0
	for spec in MMFDesertLayout.WASTELAND+MMFDesertLayout.ART100:
		var kind=spec[0];var source=world.prototypes.get(kind)
		check(source is MeshInstance3D,kind+": registered native mesh")
		if not source:continue
		var mesh: Mesh=source.mesh;var bounds=mesh.get_aabb();var triangles=0;var colors_visible=true
		for surface in mesh.get_surface_count():
			var arrays=mesh.surface_get_arrays(surface)
			triangles+=(arrays[Mesh.ARRAY_INDEX].size() if arrays[Mesh.ARRAY_INDEX]!=null and arrays[Mesh.ARRAY_INDEX].size()>0 else arrays[Mesh.ARRAY_VERTEX].size())/3
			if mesh.surface_get_format(surface)&Mesh.ARRAY_FORMAT_COLOR:
				var material=mesh.surface_get_material(surface)
				colors_visible=colors_visible and material is BaseMaterial3D and material.vertex_color_use_as_albedo
		total_triangles+=triangles
		check(triangles>250 and triangles<=22000,kind+": detailed geometry stays within the reviewed 22k cap")
		check(mesh.get_surface_count()<=6 and mesh.get_surface_count()>0,kind+": at most six material surfaces")
		check(bounds.size.is_finite() and bounds.size.x>1 and bounds.size.z>1 and bounds.size.y>.5,kind+": valid three-dimensional silhouette")
		check(source.transform.is_equal_approx(Transform3D.IDENTITY),kind+": exported identity transform for instancing")
		check(colors_visible,kind+": authored vertex patina is enabled in native materials")
		source_refs.append(weakref(source))
		report.models[kind]={"triangles":triangles,"surfaces":mesh.get_surface_count(),"bounds":str(bounds)}
	check(total_triangles<=245000,"25 reviewed wasteland assemblies remain within the combined triangle budget")
	var random=game.session.rng.state;var seen={};var lane_clear=true;var all_registered=true;var maximum=0
	# Check actual imported bounds, not just nominal widths from the generator.
	for row in range(-240,0):
		var builder=MMFSceneryChunk.new(world,Vector2i(row,0));var chunk=builder.finish();var count=0
		for child in chunk.get_children():
			if not child.has_meta("landmark_kind"):continue
			count+=1;seen[child.get_meta("landmark_kind")]=true
			var bounds=child.transform*child.get_aabb()
			lane_clear=lane_clear and (bounds.end.x<=-14 or bounds.position.x>=48)
			all_registered=all_registered and bounds in chunk.get_meta("scenery_bounds")
		maximum=maxi(maximum,count)
		chunk.free();builder=null
	for spec in MMFDesertLayout.WASTELAND+MMFDesertLayout.ART100:check(seen.has(spec[0]),spec[0]+": appears in real streamed route")
	check(lane_clear,"Actual landmark bounds clear the machine and right docking corridor")
	check(all_registered,"Every landmark contributes its real bounds for cinematic avoidance")
	check(maximum<=11,"Real chunks respect the existing eleven-landmark cap")
	check(random==game.session.rng.state,"Asset placement leaves gameplay RNG untouched")
	report.route={"seed":game.session.seed_name,"chunks":240,"uniqueModels":seen.size(),"maxLandmarks":maximum,"corridorClear":lane_clear};report.totalTriangles=total_triangles
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	check(source_refs.all(func(w):return w.get_ref()==null),"World shutdown frees both new prototype libraries")
	await drain.finish(self,refs);MMFAssets.cache.clear()
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/wasteland-assets.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("WASTELAND_ASSETS ",checks," checks; failures=",failures);quit(0 if failures.is_empty() else 1)
