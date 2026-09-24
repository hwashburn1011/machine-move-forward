extends SceneTree

# Observation fixture, not a passing animation-quality gate. Uses real controller
# input on a flat supported test deck to quantify movement/clip disagreement.
var game
var report={}

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
	for i in 100:
		var before=p.position
		await physics_frame
		if i<20:continue
		var velocity=(p.position-before)*60;velocity.y=0
		speeds.append(velocity.length());rates.append(p.animator.get_playing_speed());clips[p.animation]=true
		var phase=fposmod(p.animator.current_animation_position/maxf(.001,p.animator.current_animation_length),1)
		var at=skeleton.to_global(skeleton.get_bone_global_pose(foot).origin)
		# Exclude contact transitions, clip seams and frames that aren't stance.
		if phase>.08 and phase<.43 and last_phase>.08 and last_phase<phase:
			drift.append(Vector2(at.x-last_foot.x,at.z-last_foot.z).length()*60)
		last_phase=phase;last_foot=at
	for action in actions:Input.action_release(action)
	report.scenarios[label]={"actualSpeedMps":median(speeds),"clipPlaybackRate":median(rates),"stanceFootDriftMps":median(drift),"stanceSamples":drift.size(),"clips":clips.keys()}
	print("PLAYER_MOTION_AUDIT ",label," ",report.scenarios[label])
	if barrier:barrier.queue_free()
	await frames(4)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false)
	MMFAssets.box(game,Vector3(30,1,30),Vector3(50,15.5,0))
	report={"revision":"83a7631 player code (unchanged during autosave pass)","scope":"Flat-deck, real-input observation of authored animation cadence. Stance-foot drift is sampled from native skeleton poses, not a perceptual whole-body score.","visualScale":str(game.player.visual.scale),"scenarios":{}}
	await sample("forward",["forward"]);await sample("strafe",["right"])
	await sample("diagonal",["forward","right"]);await sample("sprint",["forward","sprint"])
	await sample("crouch",["forward","crouch"]);await sample("blocked",["forward"],true)
	var file=FileAccess.open("res://../test-results/godot-native/player-motion-audit.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();await create_timer(.1).timeout;MMFAssets.cache.clear();call_deferred("quit")
