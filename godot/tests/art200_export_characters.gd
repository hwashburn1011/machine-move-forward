extends SceneTree

# Authoring-only bridge: export the actual equipped native visual with its
# original Skeleton3D and skin weights, for the complete Blender review source.
var game
var failures=[]
var records={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://art200-character-export/"
	call_deferred("run")

func own_descendants(node: Node,owner_root: Node):
	for child in node.get_children():
		child.owner=owner_root
		own_descendants(child,owner_root)

func run():
	var directory="res://../assets/art100/story-robots/native-assemblies/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	for i in 4:await physics_frame
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	for kind in MMFArt100RobotDetails.MODELS:
		var enemy=game.combat.spawn(kind,Vector3(60,16.04,0));enemy.set_physics_process(false);enemy.hp_label.hide()
		enemy.play("idle",true)
		if enemy.animator:enemy.animator.advance(.25);enemy.animator.pause()
		for i in 3:await process_frame
		var skeletons=MMFAssets.of_type(enemy.visual,"Skeleton3D")
		var bones=0;var skinned=0
		for skeleton in skeletons:bones+=skeleton.get_bone_count()
		for mesh in MMFAssets.of_type(enemy.visual,"MeshInstance3D"):
			if mesh.skin:skinned+=1
		own_descendants(enemy.visual,enemy.visual)
		var document=GLTFDocument.new();var state=GLTFState.new()
		var error=document.append_from_scene(enemy.visual,state)
		if error==OK:error=document.write_to_filesystem(state,ProjectSettings.globalize_path(directory+kind+".glb"))
		if error!=OK or bones==0 or skinned==0:failures.append(kind+": "+str(error)+", bones="+str(bones)+", skinned="+str(skinned))
		records[kind]={"error":error,"native_bones":bones,"native_skinned_meshes":skinned,"source":"actual native enemy.visual, idle 0.25s; original skeleton/skin retained; equipped material overrides exported"}
		print("EXPORTED_CHARACTER ",kind," ",records[kind])
		enemy.queue_free();await process_frame;game.combat.enemies.clear()
	var file=FileAccess.open(directory+"export-report.json",FileAccess.WRITE);file.store_string(JSON.stringify({"failures":failures,"characters":records},"\t"));file.close()
	while game.combat.nav.is_baking():await process_frame
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt200Story.clear_cache();MMFArt100Story.clear_cache();MMFArt100RobotDetails.clear_cache();MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs)
	quit(0 if failures.is_empty() else 1)
