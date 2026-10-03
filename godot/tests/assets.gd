extends SceneTree

func _initialize(): call_deferred("run")

func run():
	var manifest=MMFAssets.json("res://data/assets.json")
	var failed=[];var report=[]
	for entry in manifest:
		var path="res://assets/"+entry.path
		if not ResourceLoader.exists(path): failed.append(entry.path);continue
		var packed=load(path)
		var model=packed.instantiate()
		var meshes=MMFAssets.of_type(model,"MeshInstance3D").size()
		var animations=[]
		for animator in MMFAssets.of_type(model,"AnimationPlayer"): animations.append_array(Array(animator.get_animation_list()))
		report.append({"path":entry.path,"meshes":meshes,"animations":animations.size()})
		if meshes==0: failed.append(entry.path)
		model.free();packed=null
		await process_frame
	var file=FileAccess.open(ProjectSettings.globalize_path("res://../test-results/godot-native/assets.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify({"assets":report,"failed":failed},"\t"));file.close()
	print("ASSET AUDIT: ",report.size()," loaded; failures: ",failed)
	quit(0 if failed.is_empty() else 1)
