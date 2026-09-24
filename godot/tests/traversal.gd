extends SceneTree

var game
var failures=[]
var output=""

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-test-campaigns/"
	call_deferred("run")

func check(passed: bool,label: String):
	print("PASS " if passed else "FAIL ",label)
	if not passed: failures.append(label)

func walk_to(target: Vector3,seconds: float=5.0):
	var elapsed=0.0
	Input.action_press("forward")
	while elapsed<seconds:
		var delta=(target-game.player.position)*Vector3(1,0,1)
		if delta.length()<0.22: break
		game.player.yaw=atan2(-delta.x,-delta.z)
		await physics_frame
		elapsed+=1.0/60
	Input.action_release("forward")
	for i in 10: await physics_frame
	print("WALK ",target," -> ",game.player.position)
	return Vector2(target.x-game.player.position.x,target.z-game.player.position.z).length()<0.5

func run():
	output=ProjectSettings.globalize_path("res://../test-results/godot-native/")
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.player.position=Vector3(-12,8.95,-4.1);game.player.velocity=Vector3.ZERO;game.player.reset_physics_interpolation()
	for i in 30: await physics_frame
	check(await walk_to(Vector3(-12,12.43,4)),"Lower-to-middle side stair traversal")
	check(absf(game.player.position.y-12.43)<0.15,"Middle stair landing is grounded")
	check(await walk_to(Vector3(-14,12.43,4)),"Middle landing connects to outer bypass")
	check(await walk_to(Vector3(-14,12.43,-4)),"Middle bypass is clear")
	check(await walk_to(Vector3(-12,12.43,-4)),"Upper stair entrance is accessible")
	check(await walk_to(Vector3(-12,16.03,4)),"Middle-to-upper side stair traversal")
	check(absf(game.player.position.y-16.03)<0.15,"Upper landing is grounded")
	game.player.position=Vector3(10,16.1,0);game.player.velocity=Vector3.ZERO
	game.session.story.phase="route-selection";game.session.story.index=0;game.campaign.begin_route()
	game.session.distance=game.session.story.arrival;game.session.speed=0
	game.campaign.update(0.02)
	for i in 10: await physics_frame
	check(await walk_to(Vector3(19,16.03,0),6),"Walk from machine across expedition gangway")
	check(game.player.position.y>15.9,"Gangway keeps the player above radioactive ground")
	if DisplayServer.get_name()!="headless":
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(output+"gangway.png")
	game.combat.begin_ship("gunboat")
	game.combat.ship.position=Vector3(18,6,0);game.combat.update_ship(0.01)
	game.combat.weapon_health=0;game.combat.update_ship(3.1)
	check(game.combat.ship_state=="retreat","Gunboat retreats after weapon disable")
	game.combat.update_ship(8)
	game.session.story.phase="raids";game.session.scanner.phase="consumed";game.session.facts.defenses=0
	game.session.facts.defenseCrewed=true;game.session.facts.tutorialStarted=false
	game.session.create_piece("turret-manual",{"x":-4,"y":0,"z":0},0,{},true)
	game.combat.update_director(15.1)
	check(game.combat.ship_health==220 and game.combat.hook_health==45,"Guided skiff uses original profile")
	check(game.combat.crew.size()==2 and game.combat.crew[0].kind=="raider","Guided skiff carries original raiders")
	check(game.combat.crew[0].mission=="sabotage" and game.combat.crew[0].mission_subsystem=="engine","Legacy raiders prioritize the engine")
	var f=FileAccess.open(output+"traversal.json",FileAccess.WRITE);f.store_string(JSON.stringify({"failures":failures,"passed":failures.is_empty()},"\t"));f.close()
	game.queue_free();await create_timer(.1).timeout
	MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
