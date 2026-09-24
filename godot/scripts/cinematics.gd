class_name MMFCinematics
extends Node3D

var game
var camera: Camera3D
var time=0.0
var actors: Array=[]
var scenery: Node3D
var timeline: Dictionary
var event_cursor=0
var initial_camera=Transform3D.IDENTITY
var human_ship: Node3D
var robot_ship: Node3D
var hero: Node3D
var effects_clock=0.0
var rooftop: Node3D
var rooftop_departure=0.0

func setup(owner_game):
	game=owner_game
	camera=Camera3D.new()
	camera.near=0.08
	camera.far=1800
	camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	add_child(camera)
	timeline=MMFAssets.json("res://data/opening.json")

func actor(kind: String,at: Vector3,parent: Node3D) -> Node3D:
	var node=MMFAssets.scene("models/authored/"+kind+".glb")
	var b=MMFAssets.bounds(node)
	var size=1.92/maxf(b.size.y,0.01)
	node.scale*=size
	node.position=at-Vector3.UP*b.position.y*size
	parent.add_child(node)
	if kind=="s07-player":
		var socket=MMFAssets.find_named(node,"WeaponSocket")
		if socket:
			var rifle=game.player.rifle_mesh.duplicate();rifle.visible=true;socket.add_child(rifle)
	return node

func animate(node: Node3D,clip: String):
	for animator in MMFAssets.of_type(node,"AnimationPlayer"):
		for key in animator.get_animation_list():
			if String(key).get_file().to_lower()==clip.to_lower():
				if animator.current_animation!=key: animator.play(key,0.12)
				if clip in ["walk","run","idle","armed_run_fwd","armed_idle"]: animator.get_animation(key).loop_mode=Animation.LOOP_LINEAR

func begin_opening():
	game.player.set_camera_fade(0)
	clear_scene()
	game.cinematic="opening"
	time=0
	event_cursor=0
	game.session.opening_done=false
	rooftop=MMFAssets.scene("runtime/rooftop.glb")
	add_child(rooftop)
	scenery=Node3D.new()
	add_child(scenery)
	for id in ["warden","revenant"]: actors.append(actor(id,Vector3.ZERO,scenery))
	game.player.visual.show()
	camera.current=true

func begin_signal():
	game.player.set_camera_fade(0)
	game.close_menu()
	clear_scene()
	time=0
	effects_clock=0
	game.cinematic="signal"
	game.session.story.phase="crossfire"
	initial_camera=game.player.camera.global_transform
	scenery=Node3D.new()
	add_child(scenery)
	scenery.position=Vector3(54,0,-76)
	for is_robot in [false,true]:
		var ship=MMFAssets.scene("runtime/battle-robot.glb" if is_robot else "runtime/battle-human.glb")
		scenery.add_child(ship)
		ship.position=Vector3(13,1.3,5) if is_robot else Vector3(-17,1.3,-6)
		game.effects.burning(ship,Vector3(2,7.95,3))
		var deck=ship
		if is_robot:
			robot_ship=deck
			for spec in [["warden",Vector3(-2.7,8.1,-1.2)],["bastion",Vector3(-2.4,8.1,2.1)],["revenant",Vector3(-3.35,8.1,-5)]]:
				var model=actor(spec[0],spec[1],deck)
				model.rotation.y=-PI/2
				animate(model,"idle")
				if spec[0]=="revenant": hero=model
		else:
			human_ship=deck
			for z in [-1.8,1.2]:
				var model=actor("s07-player",Vector3(2.7,8.1,z),deck)
				model.rotation.y=PI/2
				animate(model,"armed_idle")
	camera.current=true

func begin_arrival():
	game.player.set_camera_fade(0)
	clear_scene()
	time=0
	game.cinematic="arrival"
	scenery=MMFAssets.scene("models/authored/meridian-horizon.glb")
	add_child(scenery)
	scenery.position=Vector3(110,0,-220)
	scenery.rotation.y=PI
	initial_camera=game.player.camera.global_transform
	camera.current=true

func update(dt: float):
	if rooftop and game.cinematic!="opening":
		rooftop.position.z=game.session.distance-rooftop_departure
		if rooftop.position.z>160:
			rooftop.queue_free()
			rooftop=null
	if game.cinematic=="": return
	time+=dt
	match game.cinematic:
		"opening":
			var sample=timeline.samples[mini(int(time*60),timeline.samples.size()-1)]
			game.player.position=MMFAssets.v(sample.player.position)-Vector3.UP*0.96
			game.player.visual.rotation.y=-PI/2 if time<2.48 else PI/2
			game.player.play("armed_run_fwd" if sample.stance=="running" else ("armed_jump" if sample.stance=="airborne" else "armed_idle"))
			for i in actors.size():
				actors[i].position=MMFAssets.v(sample.pursuers[i].position)-Vector3.UP*0.96
				actors[i].rotation.y=-PI/2
				actors[i].visible=sample.pursuers[i].alive
				animate(actors[i],"run" if sample.pursuers[i].speed>0.2 else "idle")
			var position_camera=MMFAssets.v(sample.camera.position)
			var focus=MMFAssets.v(sample.camera.target)
			camera.position=camera.position.lerp(position_camera,1-exp(-10*dt)) if time>dt else position_camera
			camera.look_at(focus)
			while event_cursor<timeline.events.size() and time>=timeline.events[event_cursor].time:
				var event=timeline.events[event_cursor]
				event_cursor+=1
				if event.name in ["shot1","shot2"]:
					game.audio.shot(false)
					game.effects.tracer(game.player.position+Vector3.UP*1.4,MMFAssets.v(sample.weaponAim),Color(1,0.7,0.2))
				if event.name in ["kill1","kill2"]:
					game.effects.explosion(actors[0 if event.name=="kill1" else 1].position+Vector3.UP,0.85)
					game.audio.cue(45,0.65,-20,true)
			if time>=10.2: finish()
		"signal":
			scenery.position.z=-76+time*2.6
			var face=hero.global_position+Vector3.UP*1.65
			hero.rotation.y=lerp_angle(-PI/2,-PI*0.79,smoothstep(8,10,time))
			var wide_eye=Vector3(9,21,-16)
			var wide_target=scenery.to_global(Vector3(0,7,0))
			var medium_eye=robot_ship.to_global(Vector3(-14,12.5,-21))
			var eye=initial_camera.origin.lerp(wide_eye,smoothstep(0,2.3,time))
			eye=eye.lerp(medium_eye,smoothstep(5.5,8,time))
			eye=eye.lerp(face+Vector3(-0.82,0.08,-1.04),smoothstep(10,12.8,time))
			var look=wide_target.lerp(face-Vector3.UP*0.6,smoothstep(5.5,8,time)).lerp(face,smoothstep(10,12.8,time))
			camera.position=eye.lerp(initial_camera.origin,smoothstep(15.3,17,time))
			camera.look_at(look.lerp(initial_camera.origin-initial_camera.basis.z*5,smoothstep(15.3,17,time)))
			camera.fov=lerpf(56,30,smoothstep(10,12.8,time))
			effects_clock-=dt
			if effects_clock<=0:
				effects_clock=0.16
				var from=human_ship.to_global(Vector3(2.7,8.2,randf_range(-3,3)))
				var to=robot_ship.to_global(Vector3(-2.7,8.2,randf_range(-3,3)))
				game.effects.tracer(from,to,Color(1,0.65,0.2))
				game.effects.tracer(to+Vector3.BACK,from+Vector3.BACK,Color(1,0.16,0.03))
				if int(time*6)%9==0: game.effects.explosion(to-Vector3.UP,0.55)
				game.audio.play_sound("distant-gunfire",0.2)
			game.ui.caption.text="SIGNAL 100% / CROSSFIRE · STARBOARD BOW" if time<4 else ("HUMAN CONVOY: Taking fire! They’re coming alongside!" if time<8 else ("REVENANT / CONTACT ACQUIRED" if time<12 else "They saw us. Keep moving. Watch the rails."))
			if time>=17: finish()
		"arrival":
			var establish=smoothstep(0,4,time);var forward=smoothstep(5,12,time)
			camera.position=initial_camera.origin.lerp(Vector3(42,34,35).lerp(Vector3(26,29,-30),forward),establish)
			var look=Vector3(0,14,0).lerp(scenery.position+Vector3.UP*19,forward)
			camera.look_at((initial_camera.origin-initial_camera.basis.z*30).lerp(look,establish))
			camera.fov=lerpf(52,43,forward)
			game.ui.caption.text="THE CHANNEL REMAINS OPEN.\nNAMES. SEEDS. A PLACE FOR DOUBT."
			if time>=12: finish()

func finish():
	var kind=game.cinematic
	game.cinematic=""
	game.ui.caption.text=""
	game.player.camera.current=true
	if kind=="opening":
		game.session.opening_done=true
		game.player.position=Vector3(10,16.1,0)
		game.player.yaw=0
		game.player.velocity=Vector3.ZERO
		rooftop_departure=game.session.distance
		game.session.notify("The Nomad is moving. Recover drifting cargo with [F].")
	elif kind=="signal":
		game.session.story.phase="raids"
		game.session.threat.phase="recovery"
		game.session.threat.remaining=250
		game.session.threat.legacy=24
	elif kind=="arrival":
		game.session.story.phase="complete"
		game.session.story.ending="complete"
		game.ui.show_record("KEEP WALKING","S-07 carried the names, seeds and a bearing toward an unanswered voice.\n\nOriginal game & art / HWashburn\nDevelopment with Codex\nThree.js · Rapier · Blender / Native port: Godot\n\nKEEP WALKING — return to the deck to continue your journey.")
	game.player.update_camera(1)
	clear_scene()
	game.save_game("autosave")

func clear_scene():
	if scenery: scenery.queue_free()
	scenery=null
	actors.clear()
