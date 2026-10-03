extends "res://tools/bake_legacy_enemies.gd"

# Reuse resource ownership/deduplication from the previous native art compiler.
# Only the mesh changes; gameplay node graphs, skins and animations stay exact.
func _initialize():
	create_timer(120).timeout.connect(func():quit(1));call_deferred("run")
func run():
	var manifest_path="res://art/character-refinement.json"
	var report=MMFAssets.json(manifest_path) if FileAccess.file_exists(manifest_path) else {"models":{}}
	report.engine=Engine.get_version_info().string
	var kinds=["s07-player","bastion","revenant","warden","sovereign","raider","scavenger"]
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--kind="):kinds=[arg.trim_prefix("--kind=")]
	for kind in kinds:
		copies.clear()
		var old_path="res://assets/models/authored/"+kind+".glb";var new_path="res://art/refined-"+kind+".glb"
		var original=load(old_path).instantiate();var refined=load(new_path).instantiate()
		var bodies=MMFAssets.of_type(original,"MeshInstance3D").filter(func(m):return m.skin!=null)
		var replacements=MMFAssets.of_type(refined,"MeshInstance3D").filter(func(m):return m.skin!=null)
		assert(bodies.size()==1 and replacements.size()==1,"Expected one original and one replacement skin")
		var body=bodies[0];var replacement=replacements[0]
		assert(body.skin.get_bind_count()==replacement.skin.get_bind_count(),"Complete original binding count required")
		for i in body.skin.get_bind_count():
			assert(body.skin.get_bind_name(i)==replacement.skin.get_bind_name(i),"Original joint order required: "+kind+" / "+str(i))
			assert(body.skin.get_bind_pose(i).is_equal_approx(replacement.skin.get_bind_pose(i)),"Original inverse bind matrix required: "+kind+" / "+str(i))
		assert(body.transform.is_equal_approx(replacement.transform),"Original skin coordinate frame required")
		var original_height=MMFAssets.bounds(original).size.y
		original.set_meta("original_fit_height",original_height)
		body.mesh=replacement.mesh
		own(original,original);var packed=PackedScene.new();assert(packed.pack(original)==OK)
		var output="res://art/refined-"+kind+".scn";assert(ResourceSaver.save(packed,output,ResourceSaver.FLAG_COMPRESS)==OK)
		var dependencies=Array(ResourceLoader.get_dependencies(output))
		assert(dependencies.all(func(path):return not path.contains(".glb")),"Compiled model must not load obsolete containers")
		report.models[kind]={"originalSha256":FileAccess.get_sha256(old_path),"refinedSha256":FileAccess.get_sha256(new_path),"compiledSha256":FileAccess.get_sha256(output),"originalFitHeight":original_height,"bytes":FileAccess.get_file_as_bytes(output).size()}
		print("CHARACTER_BAKED ",kind," ",report.models[kind])
		original.free();refined.free()
	var file=FileAccess.open(manifest_path,FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t")+"\n");file.close()
	copies.clear();textures.clear();quit()
