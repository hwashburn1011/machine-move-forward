extends SceneTree

func _initialize():call_deferred("run")

func run():
	for kind in ["revenant","warden"]:
		var model=MMFAssets.scene(MMFEnemyModels.path(kind));root.add_child(model)
		var sk=MMFAssets.of_type(model,"Skeleton3D")[0]
		var player=MMFAssets.of_type(model,"AnimationPlayer")[0]
		for key in player.get_animation_list():
			if String(key).get_file().to_lower()=="idle":player.play(key);player.seek(0,true);break
		await process_frame
		print("RIG ",kind," skeleton ",sk.transform," model ",model.transform)
		for name in ["pelvis","upperarm_r","lowerarm_r","hand_r","equipment_0","upperarm_l","hand_l","head","foot_r"]:
			var idx=sk.find_bone(name)
			if idx>=0:print(name," ",sk.get_bone_global_pose(idx))
		model.queue_free();await process_frame
	quit()
