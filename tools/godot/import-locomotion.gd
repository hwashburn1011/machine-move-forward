extends SceneTree

func _initialize():call_deferred("run")

func run():
	var document=GLTFDocument.new();var state=GLTFState.new()
	var path=ProjectSettings.globalize_path("res://../test-results/godot-native/motion/s07-locomotion.glb")
	if document.append_from_file(path,state)!=OK:quit(1);return
	var source=document.generate_scene(state)
	var source_player=MMFAssets.of_type(source,"AnimationPlayer")[0]
	var original=MMFAssets.scene("models/authored/s07-player.glb")
	var original_player=MMFAssets.of_type(original,"AnimationPlayer")[0]
	var skeleton_path=""
	var original_clip=original_player.get_animation("armed_walk_fwd")
	for i in original_clip.get_track_count():
		var track=String(original_clip.track_get_path(i))
		if ":foot_r" in track:skeleton_path=track.get_slice(":",0)
	assert(skeleton_path!="")
	var library=AnimationLibrary.new()
	for key in source_player.get_animation_list():
		if not key.begins_with("native_"):continue
		var clip=source_player.get_animation(key).duplicate(true)
		# Only skeletal tracks are carried into the native derivative. Geometry,
		# materials, sockets and original clips remain the shipped asset's data.
		for index in range(clip.get_track_count()-1,-1,-1):
			var track=String(clip.track_get_path(index))
			if ":" not in track:clip.remove_track(index);continue
			clip.track_set_path(index,NodePath(skeleton_path+":"+track.get_slice(":",1)))
		clip.loop_mode=Animation.LOOP_LINEAR
		library.add_animation(key.trim_prefix("native_"),clip)
	assert(library.get_animation_list().size()==24)
	var result=ResourceSaver.save(library,"res://art/s07-locomotion.res",ResourceSaver.FLAG_COMPRESS)
	assert(result==OK)
	var report=MMFAssets.json("res://../assets/native-motion/locomotion-report.json")
	var file=FileAccess.open("res://art/s07-locomotion.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report.clips,"\t"));file.close()
	print("NATIVE_LOCOMOTION_IMPORTED ",library.get_animation_list().size()," skeletal clips at ",skeleton_path)
	source.free();original.free();MMFAssets.cache.clear();quit()
