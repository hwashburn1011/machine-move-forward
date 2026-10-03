extends SceneTree

var checks=0
var failures=[]
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://art100-legacy/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);push_error(label)

func run():
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	var specs=JSON.parse_string(FileAccess.get_file_as_string("res://../assets/art100/legacy/manifest.json"))
	check(specs.size()==25,"Exactly 25 complete legacy refinements")
	var total=0;var ids={}
	for spec in specs:
		ids[spec.id]=true
		var node=game.world.prototypes.get(spec.id)
		check(node is MeshInstance3D,"Refined prototype is registered: "+spec.id)
		if not node:continue
		var bounds=node.get_aabb();var expected=MMFAssets.v(spec.dimensions_m)
		check(bounds.size.distance_to(expected)<.004,"Imported dimensions match metre contract: "+spec.id)
		check(absf(bounds.position.y)<.001,"Ground contact is at authored zero: "+spec.id)
		check(node.transform.is_equal_approx(Transform3D.IDENTITY),"No hidden scale or origin transform: "+spec.id)
		check(node.mesh.get_surface_count()==1,"Shared atlas remains one draw surface: "+spec.id)
		var material=node.mesh.surface_get_material(0)
		check(material is BaseMaterial3D and material.texture_filter==BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC,"Grazing-angle PBR filtering: "+spec.id)
		var arrays=node.mesh.surface_get_arrays(0)
		check(material.vertex_color_use_as_albedo and arrays[Mesh.ARRAY_COLOR]!=null,"Refined pigment reaches the native material: "+spec.id)
		var triangles=int(arrays[Mesh.ARRAY_INDEX].size()/3)
		check(triangles==int(spec.triangles) and triangles<46000,"Reviewed geometry accounting: "+spec.id)
		total+=triangles
	# Fine-comb supports add34 small brackets/pedestals to the existing25 models.
	check(total<=385000,"Legacy collection stays within reviewed geometry budget")
	var seen={};var lane_clear=true;var grounded=true;var random=game.session.rng.state
	for row in range(-240,0):
		var builder=MMFSceneryChunk.new(game.world,Vector2i(row,0))
		# Use the actual terrain placement function for all picked landmarks.
		for placement in builder.placements:
			builder.landmark(placement)
		for child in builder.root.get_children():
			var kind=child.get_meta("landmark_kind","");var bounds=child.transform*child.get_aabb()
			lane_clear=lane_clear and (bounds.end.x<=-14 or bounds.position.x>=48)
			if ids.has(kind):seen[kind]=true
			var center=bounds.get_center()
			grounded=grounded and bounds.position.y<=MMFDunes.height_at(center.x,row*64+center.z)+.15
		builder.root.free();builder=null
	for id in ids:check(seen.has(id),"Refinement appears in streamed route: "+id)
	check(lane_clear,"True rotated bounds preserve machine and boarding corridor")
	check(grounded,"Landmark bases never hover above their terrain support")
	check(random==game.session.rng.state,"Art integration does not consume gameplay RNG")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	var report={"checks":checks,"failures":failures,"triangles":total,"routeModels":seen.size(),"passed":failures.is_empty()}
	var file=FileAccess.open("res://../test-results/art100/legacy-native.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("ART100_LEGACY ",checks," checks; failures=",failures);quit(0 if failures.is_empty() else 1)
