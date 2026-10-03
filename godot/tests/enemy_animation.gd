extends SceneTree

var game
var checks=0
var failures=[]
var observed={}

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-enemy-animation-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func frames(count=2):
	for i in count:await physics_frame
func spawn(kind: String):
	var enemy=game.combat.spawn(kind,Vector3(50,16.05,0));enemy.set_physics_process(false);return enemy
func remove(enemy):
	enemy.queue_free();await process_frame;game.combat.enemies.clear()
func poses(skeleton: Skeleton3D):
	var result=[]
	for i in skeleton.get_bone_count():result.append(skeleton.get_bone_pose_rotation(i))
	return result

func test_clips(kind: String):
	var enemy=spawn(kind);var p=enemy.presentation;var skeleton=MMFAssets.of_type(enemy.visual,"Skeleton3D")[0]
	check(["idle","walk","run","attack","death"].all(func(k):return p.clips.has(k)),kind+" resolves every required authored animation")
	for request in ["idle","walk","run"]:
		check(enemy.animator.get_animation(p.clips[request]).loop_mode==Animation.LOOP_LINEAR,kind+" loops "+request)
	for request in ["attack","death"]:
		check(enemy.animator.get_animation(p.clips[request]).loop_mode==Animation.LOOP_NONE,kind+" plays "+request+" once")
	enemy.animator.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	enemy.play("walk",true);enemy.animator.advance(.2)
	var foot=skeleton.find_bone("foot_l");var head=skeleton.find_bone("head")
	if foot<0:foot=skeleton.find_bone("Foot.L");head=skeleton.find_bone("Head")
	var first=skeleton.get_bone_global_pose(foot).origin;enemy.animator.advance(.25)
	check(first.distance_to(skeleton.get_bone_global_pose(foot).origin)>.025,kind+" evaluates a moving foot instead of remaining in Idle")
	enemy.play("idle",true);enemy.animator.advance(.2);var standing=skeleton.get_bone_global_pose(head).origin.y
	enemy.play("attack",true);var attack=enemy.animation;p.motion(2,enemy.definition.moveSpeed)
	check(enemy.animation==attack and p.current==attack,kind+" retains its strike when the movement request changes")
	if p.hit_pose:
		enemy.play("walk",true);enemy.animator.advance(.27);var original=poses(skeleton)
		enemy.take_damage(8,enemy.position+Vector3.UP);p.hit_pose._process_modification_with_delta(.1);var hit=poses(skeleton)
		var upper=false;var legs=true
		for i in skeleton.get_bone_count():
			var name=skeleton.get_bone_name(i);var changed=original[i].angle_to(hit[i])>.002
			if name in ["head","spine_01","spine_02"]:upper=upper or changed
			elif name.begins_with("thigh") or name.begins_with("calf") or name.begins_with("foot") or name in ["root","pelvis"]:legs=legs and not changed
		check(upper and legs and enemy.animation==p.clips.walk,kind+" hit bends its upper body without replacing locomotion or moving its legs/root")
		enemy.animator.advance(0);p.hit_pose.begin();observed.clear()
		p.hit_pose.modification_processed.connect(func():observed[kind]=p.hit_pose.elapsed)
		await frames(4)
		check(observed.get(kind,0)>0 and p.hit_pose.active,kind+" hit is evaluated by the actual skeleton modifier pipeline")
		game.open_menu("Pause");var elapsed=p.hit_pose.elapsed;await create_timer(.03).timeout
		check(p.hit_pose.elapsed==elapsed,kind+" hit reaction freezes with pause")
		game.close_menu();await frames(30);check(not p.hit_pose.active,kind+" completed hit leaves no active modifier")
		enemy.take_damage(8,enemy.position+Vector3.UP)
	enemy.take_damage(10000,enemy.position);enemy.animator.advance(1.5)
	check(skeleton.get_bone_global_pose(head).origin.y<standing-.45,kind+" death visibly lowers its head into the fallen pose")
	var fallen=enemy.animation;enemy.play("run",true)
	check(enemy.animation==fallen and enemy.dead and enemy.collision_layer==0 and (p.hit_pose==null or not p.hit_pose.active),kind+" death cannot be replaced by locomotion or a lingering hit")
	enemy._physics_process(5.0);check(not enemy.is_queued_for_deletion(),kind+" corpse retains its original five-second lifetime")
	enemy._physics_process(.01);check(enemy.is_queued_for_deletion(),kind+" corpse is removed at the original expiry")
	await remove(enemy)

func test_blocked(kind: String):
	var enemy=spawn(kind);enemy.mission="travel";enemy.mission_point=Vector3(50,16.05,9);enemy.agent.navigation_layers=2;enemy.cooldown=100
	await frames(3);var travelled=0.0;var seen_motion=false
	for i in 160:
		await physics_frame
		var before=enemy.position;enemy._physics_process(1.0/60)
		if enemy.animation in [enemy.presentation.clips.walk,enemy.presentation.clips.run]:seen_motion=true
		if i>130:travelled+=Vector2(enemy.position.x-before.x,enemy.position.z-before.z).length()
	check(seen_motion and enemy.position.z>0.2,kind+" follows a real navigation path onto the test barrier")
	check(travelled<.015 and enemy.animation==enemy.presentation.clips.idle and enemy.step_clock<-.1,kind+" blocked body rests without walking or repeated footfalls")
	await remove(enemy)

func test_shots(kind: String):
	var enemy=spawn(kind);game.player.teleport(Vector3(50,16.05,-4));await frames(2)
	enemy.cooldown=0;enemy._physics_process(.01)
	check(is_equal_approx(enemy.windup,enemy.definition.ranged.windup) and enemy.animation==enemy.presentation.clips.idle,kind+" warning retains its duration without premature recoil")
	enemy._physics_process(enemy.definition.ranged.windup+.001)
	check(enemy.shots_left==int(enemy.definition.ranged.shots) and enemy.animation==enemy.presentation.clips.idle,kind+" completes warning before firing")
	var shots=enemy.shots_left;enemy._physics_process(.01)
	check(enemy.shots_left==shots-1 and enemy.animation==enemy.presentation.clips.attack and enemy.presentation.action_left>0,kind+" recoils on the real shot tick")
	enemy.take_damage(8,enemy.position+Vector3.UP)
	check(enemy.animation==enemy.presentation.clips.attack and enemy.presentation.hit_pose.active,kind+" shot and upper-body hit can play together")
	await remove(enemy)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	MMFAssets.box(game,Vector3(24,1,24),Vector3(50,15.5,0))
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var region=NavigationRegion3D.new();var mesh=NavigationMesh.new()
	mesh.vertices=PackedVector3Array([Vector3(40,16,-10),Vector3(40,16,12),Vector3(60,16,12),Vector3(60,16,-10)]);mesh.add_polygon(PackedInt32Array([0,1,2,3]))
	region.navigation_mesh=mesh;region.navigation_layers=2;game.add_child(region);await frames(3)
	for kind in game.data.ENEMIES:await test_clips(kind)
	var barrier=MMFAssets.box(game,Vector3(6,3,.3),Vector3(50,17.5,2))
	for kind in game.data.ENEMIES:await test_blocked(kind)
	barrier.queue_free();await frames(3)
	for kind in ["warden","bastion","sovereign"]:await test_shots(kind)
	game.open_menu("Pause");var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();check(await preload("res://tests/audio_drain.gd").finish(self,refs),"Enemy animation test releases audio resources")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty()}
	var file=FileAccess.open("res://../test-results/godot-native/enemy-animation-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("ENEMY_ANIMATION_RESULT ",checks," checks; failures: ",failures);call_deferred("quit",0 if failures.is_empty() else 1)
