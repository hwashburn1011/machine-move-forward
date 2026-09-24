extends "res://tests/player_motion_audit.gd"

var checks=0
var failures=[]

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-locomotion-tests/";call_deferred("run")

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false)
	MMFAssets.box(game,Vector3(40,1,40),Vector3(50,15.5,0))
	report={"scenarios":{}};sample_frames=150
	for spec in [["forward",["forward"],4.5],["right",["right"],4.5],["left",["left"],4.5],["back",["back"],4.5],["forwardRight",["forward","right"],4.5],["forwardLeft",["forward","left"],4.5],["backRight",["back","right"],4.5],["backLeft",["back","left"],4.5],["sprint",["forward","sprint"],7.5],["sprintDiagonal",["forward","right","sprint"],7.5],["crouch",["forward","crouch"],2.2],["crouchBack",["back","crouch"],2.2]]:
		var result=await sample(spec[0],spec[1])
		check(absf(result.actualSpeedMps-spec[2])<.015,"Controller speed is preserved: "+spec[0])
		check(result.stanceSamples>=6 and result.stanceFootDriftMps<.2,"Planted-foot drift stays below 0.2 m/s: "+spec[0])
	var blocked=await sample("blocked",["forward"],true)
	check(blocked.actualSpeedMps<.01 and blocked.cyclesPerSecond==0 and blocked.clips==["armed_idle"],"Holding movement against a real wall rests the legs")
	var p=game.player;var motion=p.locomotion
	p.teleport(Vector3(50,16.1,4));p.yaw=0;await frames(12)
	Input.action_press("forward",.55);await frames(25)
	var analogue_speed=Input.get_vector("left","right","forward","back").length()*4.5
	check(analogue_speed>0 and analogue_speed<2.5 and absf(motion.speed-analogue_speed)<.02 and motion.run_weight<.01,"Slow analogue movement walks at actual displacement speed")
	Input.action_release("forward");await frames(15)
	check(motion.move_weight==0 and motion.cycles_per_second==0,"Releasing movement stops the gait rather than running in place")
	p.teleport(Vector3(50,16.1,4));Input.action_press("forward");await frames(20)
	var phase_before=motion.phase;Input.action_press("right");await frames(1)
	check(fposmod(motion.phase-phase_before,1)<.08 and motion.phase!=0,"Changing direction preserves step phase")
	Input.action_release("right")
	var skeleton=p.pose_modifier.get_skeleton();var ankle=skeleton.find_bone("foot_r")
	motion.render(.15);var early=skeleton.get_bone_global_pose(ankle).origin
	motion.render(.85);var late=skeleton.get_bone_global_pose(ankle).origin
	check(early.distance_to(late)>.005,"Skeletal motion advances between physics ticks on high-refresh displays")
	motion.render(1.0)
	game.session.weapons.rifle.ammoInMag=1;p.reload_weapon();var timer=p.reload_left
	await frames(12)
	check(p.reload_left<timer and p.reload_left>0 and motion.active and motion.speed>4.4,"Upper-body reload runs while the feet keep moving")
	p.cancel_reload();Input.action_release("forward")
	await frames(10);Input.action_press("jump");await frames(3);Input.action_release("jump")
	check(not p.is_on_floor() and not motion.active and p.animation=="armed_jump","Jump hands control back to the original non-looping clip")
	await frames(65)
	check(p.is_on_floor() and motion.active,"Landing restores grounded animation")
	Input.action_press("forward");await frames(10);game.open_menu("Inventory")
	var menu_phase=motion.phase;await create_timer(.2).timeout
	check(not motion.active and motion.phase==menu_phase and p.animation=="armed_idle","Paused terminal stops locomotion and keeps its arm pose available")
	Input.action_release("forward");game.close_menu();await frames(10)
	check(motion.active,"Closing the terminal resumes grounded presentation")
	Input.action_press("forward");await frames(8);p.forced_motion=true;await frames(3)
	check(not motion.active and p.animation=="armed_idle","Script-controlled movement releases the previous grounded stride")
	p.forced_motion=false;await frames(4)
	game.cinematic="motion-fixture";await frames(3)
	check(not motion.active and p.animation=="armed_idle","A cinematic entered while moving rests the player automatically")
	Input.action_release("forward")
	p.play("armed_run_fwd");var cinematic_time=p.animator.current_animation_position
	game.cinematic="motion-fixture";await frames(8)
	check(not motion.active and p.animator.is_playing() and p.animator.current_animation_position>cinematic_time,"Cinematic clips retain independent playback")
	game.cinematic="";await frames(10)
	check(motion.active,"Cinematic handoff restores locomotion")
	p.teleport(Vector3(50,16.1,-2));await frames(12)
	check(motion.cycles_per_second==0,"Recovery relocation cannot create a sprint animation")
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/locomotion-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	p=null;motion=null;await create_timer(.1).timeout
	MMFAssets.cache.clear();print("LOCOMOTION_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
