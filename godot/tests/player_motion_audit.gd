extends SceneTree

# Observation fixture, not a passing animation-quality gate. Uses real controller
# input on a flat supported test deck to quantify movement/clip disagreement.
var game
var report={}
var output="res://../test-results/godot-native/player-motion-audit.json"
var sample_frames=100

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-motion-audit/";call_deferred("run")

func frames(count: int):
	for i in count:await physics_frame

func median(values: Array) -> float:
	if values.is_empty():return 0
	values.sort();return values[values.size()/2]

func sample(label: String,actions: Array,blocked: bool=false):
	var p=game.player
	var barrier=null
	if blocked:barrier=MMFAssets.box(game,Vector3(3,3,.3),Vector3(50,17.5,2.7))
	p.teleport(Vector3(50,16.1,4));p.yaw=0
	await frames(12)
	for action in actions:Input.action_press(action)
	var skeleton=p.pose_modifier.get_skeleton();var foot=skeleton.find_bone("foot_r")
	var speeds=[];var rates=[];var drift=[];var clips={};var last_foot=Vector3.ZERO;var last_phase=-1.0
	for i in sample_frames:
		var before=p.position
		await physics_frame
		if i<20:continue
		# Evaluate the physical endpoint for contact measurements. Shipping poses
		# interpolate this phase at render rate, like the character's transform.
		if p.locomotion.active:p.locomotion.render(1.0)
		var velocity=(p.position-before)*60;velocity.y=0
		speeds.append(velocity.length());rates.append(p.animation_speed if p.locomotion.active else p.animator.get_playing_speed());clips[p.animation]=true
		var phase=p.locomotion.phase if p.locomotion.active else fposmod(p.animator.current_animation_position/maxf(.001,p.animator.current_animation_length),1)
		var at=skeleton.to_global(skeleton.get_bone_global_pose(foot).origin)
		# Exclude contact transitions, clip seams and frames that aren't stance.
		var contact_end=.27 if p.locomotion.active and p.locomotion.run_weight>.5 and p.locomotion.crouch_weight<.5 else .43
		if phase>.08 and phase<contact_end and last_phase>.08 and last_phase<phase:
			drift.append(Vector2(at.x-last_foot.x,at.z-last_foot.z).length()*60)
		last_phase=phase;last_foot=at
	for action in actions:Input.action_release(action)
	report.scenarios[label]={"actualSpeedMps":median(speeds),"cyclesPerSecond":median(rates),"stanceFootDriftMps":median(drift),"stanceSamples":drift.size(),"clips":clips.keys()}
	print("PLAYER_MOTION_AUDIT ",label," ",report.scenarios[label])
	if barrier:barrier.queue_free()
	await frames(4)
	return report.scenarios[label]

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false)
	MMFAssets.box(game,Vector3(30,1,30),Vector3(50,15.5,0))
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
	report={"revision":"native Blender locomotion refinement", "scope":"Flat-deck, real-input observation. Drift samples exclude contact transitions for each authored gait; stopped poses have no moving stance samples. Not a perceptual whole-body score.","visualScale":str(game.player.visual.scale),"scenarios":{}}
	await sample("forward",["forward"]);await sample("strafe",["right"])
	await sample("diagonal",["forward","right"]);await sample("sprint",["forward","sprint"])
	await sample("crouch",["forward","crouch"]);await sample("blocked",["forward"],true)
	var file=FileAccess.open(output,FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();await create_timer(.1).timeout;MMFAssets.cache.clear();call_deferred("quit")
