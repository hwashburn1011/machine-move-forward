extends "res://tests/player_motion_audit.gd"

var checks=0
var failures=[]
var peaks={}
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-player-weight-tests/";call_deferred("run")

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false)
	MMFAssets.box(game.world,Vector3(40,1,40),Vector3(50,15.5,0))
	var p=game.player;var motion=p.locomotion
	p.teleport(Vector3(50,16.1,4));p.yaw=0;await frames(15)
	var initial=p.position;Input.action_press("forward");await frames(3)
	check(p.velocity.length()>4.49 and p.position.distance_to(initial)>.07,"Start keeps immediate controller response")
	await frames(3);peaks.start=motion.body_lean.length()
	check(peaks.start>.008 and peaks.start<=deg_to_rad(4),"Start has restrained body follow-through")
	await frames(45)
	check(motion.body_lean.length()<.002,"Steady travel returns to authored gait")
	Input.action_release("forward");await frames(3)
	check(Vector2(p.velocity.x,p.velocity.z).length()<.001,"Stop does not add controller drift")
	await frames(3);peaks.stop=motion.body_lean.length()
	check(peaks.stop>.008 and peaks.stop<=deg_to_rad(4),"Stop has restrained body settling")
	await frames(45)
	check(motion.body_lean.length()<.002 and motion.move_weight==0,"Stopped body and feet settle fully")
	Input.action_press("forward");await frames(30);Input.action_press("right");await frames(5)
	peaks.turn=absf(motion.body_lean.y)
	check(peaks.turn>.003 and motion.body_lean.length()<=deg_to_rad(4),"Directional transition creates bounded lateral weight")
	Input.action_release("right");Input.action_release("forward");await frames(45)
	Input.action_press("jump");await frames(3);Input.action_release("jump")
	check(not p.is_on_floor() and motion.sampled_landing==0,"Airborne clip carries no grounded impact offset")
	var peak=0.0;var landed=false
	for i in 90:
		await frames(1)
		if p.is_on_floor():landed=true
		peak=maxf(peak,motion.landing_offset)
	peaks.landing_m=peak
	check(landed and peak>.012 and peak<=.065,"Ordinary jump lands with bounded pelvis compression")
	check(p.is_on_floor() and absf(p.position.y-16.045)<.04 and p.velocity.y<=0,"Landing presentation never shifts capsule support")
	check(motion.landing_offset<.001,"Landing settles without sustained crouch or bounce")
	# Pure presentation impulses must not change resources, simulation or body.
	var before=game.session.native_snapshot();var transform=p.transform;var velocity=p.velocity
	motion.update_weight(1.0/60,Vector3(7.5,0,0),8)
	motion.render(.2);var early=motion.sampled_landing
	motion.render(.8)
	check(motion.sampled_landing>early,"Impact pose interpolates between physics ticks")
	check(before==game.session.native_snapshot() and transform==p.transform and velocity==p.velocity,"Presentation updates do not mutate controller or persistent state")
	p.teleport(Vector3(50,16.1,4))
	check(motion.body_lean==Vector2.ZERO and motion.landing_offset==0 and motion.sampled_landing==0,"Relocation clears prior transition impulses")
	await frames(12);Input.action_press("forward");await frames(4)
	game.open_menu("Inventory")
	check(motion.body_lean==Vector2.ZERO and motion.landing_offset==0,"Terminal handoff clears moving-body impulses")
	Input.action_release("forward");game.close_menu();await frames(6)
	Input.action_press("forward");await frames(4);p.forced_motion=true;await frames(2)
	check(motion.body_lean==Vector2.ZERO and motion.landing_offset==0,"Scripted motion clears additive gameplay posing")
	Input.action_release("forward");p.forced_motion=false;await frames(5)
	var out="res://../test-results/v1-movement-polish-2026-10-05/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out))
	var f=FileAccess.open(out+"weight-tests.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"checks":checks,"failures":failures,"peaks":peaks,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"evidence":"Native input/physics fixture plus pure presentation invariants; not human or earned campaign evidence"},"  "));f.close()
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	print("PLAYER_WEIGHT ",checks," checks; failures=",failures.size());quit(0 if failures.is_empty() else 1)
