extends SceneTree

var game
var label="current"
var uncached=false

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-salvage-profile/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		if arg=="--uncached":uncached=true
	call_deferred("run")

func stats(values):
	values.sort();return {"mean":values.reduce(func(a,b):return a+b,0.0)/values.size(),"median":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back()}

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.position=Vector3(-12,8.95,-4);game.player.yaw=.45;game.player.pitch=-.25;game.player.update_camera(1)
	game.session.speed=7.4;game.salvage.next_distance=1e12
	var samples=[];var query=[];var heights=[]
	for frame in 2400:
		game.session.clock=frame/60.0;game.session.distance=frame*7.4/60.0
		for index in 6:
			var c=game.salvage.crates[index];c.active=true;c.claimed="";c.node.position=Vector3(-15-index,2,-12-index*4)
			if uncached:c.ground.clear()
		var start=Time.get_ticks_usec();game.salvage.update(1.0/60);var cost=(Time.get_ticks_usec()-start)/1000.0
		start=Time.get_ticks_usec();game.salvage.aimed_crate();var aim_cost=(Time.get_ticks_usec()-start)/1000.0
		start=Time.get_ticks_usec();MMFDunes.height_at(-20,-frame);var dune_cost=(Time.get_ticks_usec()-start)/1000.0
		if frame>200:samples.append(cost);query.append(aim_cost);heights.append(dune_cost)
	var report={"scope":"Headless isolated CPU cost: full six-crate free pool, same coordinates/time/distance sequence; 2199 post-warmup samples. Query cost excludes UI drawing; not rendered FPS.","uncached":uncached,"updateMs":stats(samples),"aimQueryMs":stats(query),"duneHeightMs":stats(heights)}
	var file=FileAccess.open("res://../test-results/godot-native/salvage-profile-"+label+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("SALVAGE_PROFILE ",report)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	await create_timer(.1).timeout;MMFAssets.cache.clear();quit()
