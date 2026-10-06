extends SceneTree

var checks=0
var failures=[]

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func _initialize():call_deferred("run")

func run():
	for path in [MMFEnemyModels.path("revenant"),"models/authored/revenant.glb"]:
		var model=MMFAssets.scene(path);var fitted=MMFAssets.bounds(model)
		var sk=MMFAssets.of_type(model,"Skeleton3D")[0]
		var sockets=[sk.get_node("PulseBlade0"),sk.get_node("PulseBlade1")]
		check(sockets[0].get_child(0).mesh==sockets[1].get_child(0).mesh,"Both pulse swords share geometry: "+path)
		for socket in sockets:sk.remove_child(socket)
		check(fitted.is_equal_approx(MMFAssets.bounds(model)),"Pulse cores preserve original character fitting and floor height: "+path)
		for socket in sockets:sk.add_child(socket)
		MMFPulseBlades.attach(model)
		check(MMFAssets.of_type(sk,"BoneAttachment3D").filter(func(n):return String(n.name).begins_with("PulseBlade")).size()==2,"Repeated preparation does not duplicate pulse cores: "+path)
		check(MMFAssets.of_type(sockets[0],"CollisionObject3D").is_empty(),"Pulse core has no combat collision")
		root.add_child(model)
		var animator=MMFAssets.of_type(model,"AnimationPlayer")[0]
		for key in animator.get_animation_list():
			if String(key).get_file().to_lower() not in ["idle","attack","run","death"]:continue
			animator.play(key);animator.seek(animator.get_animation(key).length*.45,true)
			await process_frame;await process_frame
			for socket in sockets:
				check(socket.transform.is_equal_approx(sk.get_bone_global_pose(sk.find_bone(socket.bone_name))),"Pulse core follows its weapon during "+String(key))
		model.queue_free();await process_frame
	MMFAssets.cache.clear()
	print("PULSE_BLADES ",JSON.stringify({"checks":checks,"failures":failures,"passed":failures.is_empty()}))
	quit(0 if failures.is_empty() else 1)
