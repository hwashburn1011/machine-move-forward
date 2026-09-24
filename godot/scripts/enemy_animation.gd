class_name MMFEnemyAnimation
extends RefCounted

# Existing imports use two naming conventions. Resolve them once per instance;
# presentation never owns attack timers, root motion, damage or navigation.
const ALIASES={
	"idle":["idle"],"walk":["walk","walking"],"run":["run","running","walk","walking"],
	"attack":["polish_attack","attack","punch"],"polish_attack":["polish_attack","attack","punch"],
	"death":["polish_death","death"],"polish_death":["polish_death","death"],"climb":["climb"]}
var player: AnimationPlayer
var clips={}
var current=""
var action_left=0.0
var dead=false
var hit_pose: MMFEnemyHitPose

func setup(animator: AnimationPlayer,visual: Node3D):
	player=animator
	if not player:return
	var available={}
	for key in player.get_animation_list():available[String(key).get_file().to_lower()]=key
	for request in ALIASES:
		for candidate in ALIASES[request]:
			if available.has(candidate):clips[request]=available[candidate];break
	for request in ["idle","walk","run","climb"]:
		if clips.has(request):player.get_animation(clips[request]).loop_mode=Animation.LOOP_LINEAR
	for request in ["attack","death"]:
		if clips.has(request):player.get_animation(clips[request]).loop_mode=Animation.LOOP_NONE
	if available.has("polish_hit"):
		var skeletons=MMFAssets.of_type(visual,"Skeleton3D")
		if not skeletons.is_empty():
			hit_pose=MMFEnemyHitPose.new();hit_pose.name="UpperBodyHitReaction";skeletons[0].add_child(hit_pose)
			hit_pose.setup(player.get_animation(available.polish_hit))

func tick(dt: float):action_left=maxf(0,action_left-dt)

func play(request: String,force=false) -> String:
	if not player:return current
	if request=="polish_hit":
		if not dead and hit_pose:hit_pose.begin()
		return current
	if dead or not clips.has(request):return current
	var action=request in ["attack","polish_attack","death","polish_death"]
	if not action and not force and action_left>0:return current
	var key=clips[request]
	if request in ["death","polish_death"]:
		dead=true
		if hit_pose:hit_pose.clear()
	if current!=key or force:
		current=key;player.speed_scale=1
		player.play(key,.04 if action else .12)
		if action:action_left=player.get_animation(key).length
		else:action_left=0
	return current

func motion(speed: float,nominal_speed: float) -> String:
	if not player or action_left>0 or dead:return current
	play("idle" if speed<.08 else "run" if nominal_speed>4 else "walk")
	player.speed_scale=1 if speed<.08 else clampf(speed/maxf(.01,nominal_speed),.1,2)
	return current
