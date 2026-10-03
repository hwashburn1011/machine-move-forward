extends SceneTree

# Native presentation evidence, never a performance benchmark or campaign run.
var game
var camera: Camera3D
var output="res://../test-results/godot-native/"
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-feel-review/";call_deferred("run")
func frames(n: int):
	for i in n:
		game.effects.update(1.0/60)
		await process_frame
func capture(label: String):
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+"feel-"+label+".png")
func run():
	if DisplayServer.get_name()=="headless":push_error("Native renderer required");quit(1);return
	DisplayServer.window_set_size(Vector2i(1440,900));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.teleport(Vector3(50,16.05,5))
	MMFAssets.box(game,Vector3(12,.3,12),Vector3(50,15.9,0),MMFAssets.material(Color(.19,.22,.22)))
	camera=Camera3D.new();game.add_child(camera);camera.position=Vector3(52.6,17.7,4.8);camera.fov=35;camera.look_at(Vector3(50,17.1,0));camera.current=true
	for kind in ["scavenger","raider","warden","revenant","bastion","sovereign"]:
		var enemy=game.combat.spawn(kind,Vector3(50,16.05,0));enemy.set_physics_process(false)
		await frames(20);await capture(kind+"-ready")
		var point=enemy.position+Vector3(.28,1.45,0)
		var result=MMFOwnedShot.resolve({"collider":enemy,"position":point,"normal":Vector3.BACK},10,0,100,1,"player_weapon")
		MMFCombatFeedback.present(game,result);MMFCombatFeedback.confirm(game,result)
		await frames(6);await capture(kind+"-impact")
		await frames(42);await capture(kind+"-recovered")
		if kind=="bastion":
			enemy.phase="vent"
			result=MMFOwnedShot.resolve({"collider":enemy,"position":point,"normal":Vector3.BACK},10,0,100,1,"player_weapon")
			MMFCombatFeedback.present(game,result);MMFCombatFeedback.confirm(game,result)
			await frames(6);await capture(kind+"-exposed")
		enemy.queue_free();await frames(2);game.combat.enemies.clear()
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit()
