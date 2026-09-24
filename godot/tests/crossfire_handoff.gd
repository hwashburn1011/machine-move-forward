extends SceneTree

var game
var checks=0
var failures=[]
var report={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-crossfire-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func settle():
	for i in 3:await physics_frame

func prepare():
	var start=Time.get_ticks_msec()
	while game.cinematics.signal_stage.part_index<7 and Time.get_ticks_msec()-start<15000:
		game.cinematics.signal_stage.update();await process_frame
	return game.cinematics.signal_stage.part_index==7

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	var s=game.session;var c=game.cinematics;var p=game.player
	p.teleport(Vector3(0,16.1,5));s.scanner.phase="installed";s.facts.salvage=true;s.update_power()
	var before=s.native_snapshot();var rng=s.rng.state
	check(await prepare(),"Existing crossfire assets finish background preparation")
	check(s.native_snapshot()==before and s.rng.state==rng,"Hidden preparation does not advance the campaign or consume gameplay randomness")
	var prepared=c.signal_stage.stage
	check(not prepared.visible and prepared.process_mode==Node.PROCESS_MODE_DISABLED,"Prepared set is hidden and does not run its actors")
	check(prepared.get_child_count()==2 and MMFAssets.of_type(prepared,"AnimationPlayer").size()==5,"Prepared set has exactly two ships and five original animated actors")
	check(prepared.get_node("HumanShip").find_child("DeckOrigin",true,false)!=null and prepared.get_node("RobotShip").find_child("DeckOrigin",true,false)!=null,"Background preparation uses both refined native Blender vessels")
	check(MMFAssets.of_type(prepared,"GPUParticles3D").size()==4,"Both ships retain their fire and smoke emitters")
	var stage_id=prepared.get_instance_id()
	check(prepared.get_node("RobotShip").position==Vector3(13,1.3,5) and prepared.get_node("HumanShip").position==Vector3(-17,1.3,-6),"The original opposing ship layout is preserved")
	check(s.start_scan(),"Prepared scene does not prevent starting the existing scanner")
	s.scanner.elapsedS=179.99;s.tick(.02)
	check(s.scanner.phase=="contact-ready" and game.cinematic=="","100 percent still enters the stabilizing interval")
	s.tick(2.9);check(game.cinematic=="","Crossfire does not begin before the original three-second delay")
	s.tick(.11)
	check(game.cinematic=="signal" and s.scanner.phase=="consumed" and s.story.phase=="crossfire","The existing scanner signal activates crossfire")
	check(c.scenery.get_instance_id()==stage_id and c.scenery.visible and c.signal_stage.stage==null,"Activation reuses the prepared set instead of reconstructing it")
	check(c.hero.get_parent()==c.robot_ship and is_equal_approx(MMFAssets.bounds(c.hero).size.y*c.hero.scale.y,1.92),"The Revenant close-up uses the original actor and scale")
	c.finish();await settle()
	check(not is_instance_valid(prepared) and c.hero==null and c.robot_ship==null and c.human_ship==null,"Finishing releases scene nodes and actor references")
	var handoffs=[]
	for fov in [45,72,100]:
		for yaw in [-2.8,.5,2.8]:
			s.scanner.phase="installed";s.story.phase="signal"
			check(await prepare(),"One prepared scene is rebuilt for review "+str([fov,yaw]))
			game.settings.fov=fov;p.yaw=yaw;p.pitch=-.12;p.aiming=false;p.update_camera(1);await settle()
			var from=p.camera.global_transform;var before_fov=p.camera.fov
			c.begin_signal();c.update(0)
			check(c.camera.global_transform.is_equal_approx(from) and is_equal_approx(c.camera.fov,before_fov),"Entry matches the player's complete camera pose and FOV "+str([fov,yaw]))
			c.time=13.5;c.update(0)
			check(absf(c.camera.fov-30)<.001 and c.camera.global_position.distance_to(c.hero.global_position+Vector3.UP*1.65)<1.5,"Existing Revenant face close-up remains intact "+str([fov,yaw]))
			c.time=16.999;c.update(0)
			var distance=c.camera.global_position.distance_to(p.camera.global_position)
			var angle=rad_to_deg(c.camera.global_basis.get_rotation_quaternion().angle_to(p.camera.global_basis.get_rotation_quaternion()))
			var fov_gap=absf(c.camera.fov-p.camera.fov)
			check(distance<.0002 and angle<.06 and fov_gap<.0002,"Return converges on the current player camera "+str([fov,yaw]))
			handoffs.append({"fov":fov,"yaw":yaw,"positionGapM":distance,"angleGapDegrees":angle,"fovGap":fov_gap})
			c.update(.01)
			check(game.cinematic=="" and p.camera.current and s.story.phase=="raids" and s.threat.remaining==250 and s.threat.legacy==24,"Natural finish preserves camera control and the existing raid interval "+str([fov,yaw]))
			await settle()
	# Changing campaigns while still preparing must release the hidden scene.
	s.scanner.phase="installed";await prepare();var discarded=c.signal_stage.stage
	c.clear_scene();s.scanner.phase="awaiting-receiver";await settle();c.signal_stage.update()
	check(not is_instance_valid(discarded) and c.signal_stage.stage==null and c.signal_stage.part_index==0,"Clearing a prepared campaign releases the hidden set without starting crossfire")
	# Test cleanup of a real outstanding engine request, even with no remaining need.
	MMFAssets.cache.erase(MMFCrossfireStage.PATHS[0])
	s.scanner.phase="installed";c.signal_stage.update();var requested=c.signal_stage.pending!=""
	c.clear_scene();s.scanner.phase="consumed"
	var start=Time.get_ticks_msec()
	while c.signal_stage.pending!="" and Time.get_ticks_msec()-start<15000:c.signal_stage.update();await process_frame
	check(requested and c.signal_stage.pending=="" and c.signal_stage.stage==null,"Pending background request is consumed after campaign cancellation")
	# Old saves can resume inside the cutscene with no earlier preparation window.
	s.story.phase="crossfire";s.scanner.phase="consumed"
	var payload={"session":s.native_snapshot(),"player":{"position":MMFAssets.dict_v(p.position),"yaw":p.yaw,"pitch":p.pitch},"cargo":[]}
	game.load_payload(payload)
	check(game.cinematic=="signal" and c.hero!=null and c.scenery.visible,"Crossfire save restore builds the full set through the immediate fallback")
	c.time=6;c.update(0);c.finish();await settle()
	check(game.cinematic=="" and p.camera.current and game.session.story.phase=="raids" and c.signal_stage.stage==null,"Skipping still advances only to the existing raid phase and releases its set")
	var helper=c.signal_stage
	MMFAssets.cache.erase(MMFCrossfireStage.PATHS[0])
	game.session.scanner.phase="installed";helper.update()
	check(helper.pending!="","Shutdown fixture has a live background request")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	check(helper.pending=="" and helper.stage==null and helper.owner_cinema==null,"Shutdown drains the outstanding request and releases stage ownership")
	c=null;p=null;s=null;prepared=null;discarded=null;helper=null;await create_timer(.1).timeout;MMFAssets.cache.clear()
	report={"checks":checks,"failures":failures,"cameraHandoffs":handoffs,"scope":"Asset preparation/lifetime, scanner timing, nine full camera/FOV transitions, existing close-up/raid timing and saved-crossfire fallback."}
	var file=FileAccess.open("res://../test-results/godot-native/crossfire-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("CROSSFIRE_RESULT ",checks," checks, ",failures.size()," failures")
	# Let this suspended test's resource references unwind before shutdown.
	call_deferred("quit",0 if failures.is_empty() else 1)
