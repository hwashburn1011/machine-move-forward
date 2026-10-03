class_name MMFOpeningPrelude
extends Node3D

const MEMORY_DURATION=26.0
const DURATION=MMFOpeningLetter.DURATION+MEMORY_DURATION
const PATH="res://art/opening-memory.glb"
var cinema
var game
var set_model: Node3D
var machines=[]
var worker: Node3D
var glove: Node3D
var lever: Node3D
var load_motor: Node3D
var fractures: Node3D
var glove_rest=Transform3D.IDENTITY
var memory_environment: Environment
var focus: CameraAttributesPractical
var searchlight: SpotLight3D
var strip_lights=[]
var bars: Control
var top_bar: ColorRect
var bottom_bar: ColorRect
var skip_hint: Label
var subtitle: Label
var bed: AudioStreamPlayer
var voice: AudioStreamPlayer
var score: AudioStreamPlayer
var bed_stream: AudioStream
var voice_stream: AudioStream
var score_stream: AudioStream
var active=false
var previous=-1.0
var machine_origin=Vector3.ZERO
var muzzle: OmniLight3D
var passing_machine: Node3D
var passing_gait=MMFGait.new()
var original_machine_visible=true
var upper_sleeve: Node3D
var fore_sleeve: Node3D
var cart: Node3D
var spool: Node3D
var fingers=[]
var thumb: Node3D
var performances=[]
var hero_performance: MMFOpeningPerformance
var cart_rest=Vector3.ZERO
var spool_rest=Vector3.ZERO
var letter=MMFOpeningLetter.new()
var fire_stream: AudioStream
var memory_started=false
var fire_started=false
var slash_clip: Dictionary
var climb_clips=[]
var climbers=[]

func setup(owner_cinema):
	cinema=owner_cinema;game=cinema.game;name="OpeningPrelude"
	position=Vector3(4000,0,0);hide();process_mode=Node.PROCESS_MODE_DISABLED;set_process(false)
	bed=AudioStreamPlayer.new();add_child(bed);voice=AudioStreamPlayer.new();add_child(voice);score=AudioStreamPlayer.new();add_child(score)
	bed_stream=load("res://assets/audio/opening/memory-and-escape.wav")
	voice_stream=load("res://assets/audio/opening/pursuer-roof.wav")
	score_stream=load("res://assets/audio/opening/memory-score.wav")
	fire_stream=load("res://assets/audio/opening/paper-fire.wav")
	slash_clip=MMFAssets.json("res://assets/animation/opening/revenant-slash.json")
	for kind in ["warden","revenant"]:climb_clips.append(MMFAssets.json("res://assets/animation/opening/"+kind+"-climb.json"))
	var layer=CanvasLayer.new();layer.layer=0;add_child(layer)
	bars=Control.new();bars.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);bars.mouse_filter=Control.MOUSE_FILTER_IGNORE;layer.add_child(bars)
	bars.add_child(letter);letter.setup()
	for i in 2:
		var bar=ColorRect.new();bar.color=Color.BLACK;bar.mouse_filter=Control.MOUSE_FILTER_IGNORE;bars.add_child(bar)
		if i==0:top_bar=bar
		else:bottom_bar=bar
	skip_hint=Label.new();skip_hint.add_theme_font_size_override("font_size",16);skip_hint.add_theme_color_override("font_color",Color(.64,.66,.62));skip_hint.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT;bars.add_child(skip_hint)
	subtitle=Label.new();subtitle.add_theme_font_size_override("font_size",24);subtitle.add_theme_color_override("font_color",Color(.83,.84,.78));subtitle.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;subtitle.add_theme_constant_override("outline_size",3);subtitle.add_theme_color_override("font_outline_color",Color(0,0,0,.8));bars.add_child(subtitle)
	bars.hide()

func prepare_part(index: int):
	if index==0 and is_instance_valid(set_model):return
	if index in [1,2] and machines.size()>=index:return
	if index==3 and is_instance_valid(worker):return
	if index==4 and is_instance_valid(passing_machine):return
	if index==0:
		set_model=MMFAssets.scene(PATH);add_child(set_model)
		glove=MMFAssets.find_named(set_model,"HumanGlove");glove_rest=glove.transform
		lever=MMFAssets.find_named(set_model,"DisconnectLever");load_motor=MMFAssets.find_named(set_model,"SuspendedMotor")
		fractures=MMFAssets.find_named(set_model,"GlassFractures")
		upper_sleeve=MMFAssets.find_named(set_model,"UpperSleeve");fore_sleeve=MMFAssets.find_named(set_model,"ForeSleeve")
		cart=MMFAssets.find_named(set_model,"ServiceCart");cart_rest=cart.position
		spool=MMFAssets.find_named(set_model,"EjectedSpool");spool_rest=spool.position
		thumb=MMFAssets.find_named(set_model,"OpposedThumb")
		for i in 4:
			for j in 3:fingers.append(MMFAssets.find_named(set_model,"Finger%d_%d"%[i,j]))
	elif index in [1,2]:
		var model=MMFAssets.scene(MMFEnemyModels.path("warden" if index==1 else "revenant"))
		var bounds=MMFAssets.bounds(model);var fit=2.05/maxf(bounds.size.y,.01);model.scale*=fit;add_child(model);machines.append(model)
		model.position.y=-bounds.position.y*fit
		var acting=MMFOpeningPerformance.new();MMFAssets.of_type(model,"Skeleton3D")[0].add_child(acting);performances.append(acting)
	elif index==3:
		worker=MMFAssets.scene(MMFEnemyModels.PLAYER);var bounds=MMFAssets.bounds(worker);var fit=1.85/maxf(bounds.size.y,.01);worker.scale*=fit;add_child(worker);worker.position.y=-bounds.position.y*fit
		cinema.animate(worker,"unarmed_run")
		hero_performance=MMFOpeningPerformance.new();MMFAssets.of_type(game.player.visual,"Skeleton3D")[0].add_child(hero_performance);hero_performance.clear()
		memory_environment=Environment.new();memory_environment.background_mode=Environment.BG_COLOR;memory_environment.background_color=Color("172126")
		memory_environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;memory_environment.ambient_light_color=Color("9caeb2");memory_environment.ambient_light_energy=.42
		memory_environment.tonemap_mode=Environment.TONE_MAPPER_FILMIC;memory_environment.ssao_enabled=game.settings.get("quality","high")=="high";memory_environment.glow_enabled=game.settings.get("quality","high")!="low";memory_environment.glow_intensity=.25
		focus=CameraAttributesPractical.new();focus.dof_blur_far_enabled=true;focus.dof_blur_far_distance=8;focus.dof_blur_far_transition=5;focus.dof_blur_amount=.035
		for at in [Vector3(-4,5.2,-5),Vector3(4,5.2,0),Vector3(-4,4,4)]:
			var lamp=OmniLight3D.new();lamp.position=at;lamp.light_color=Color("cbd6c8");lamp.light_energy=3;lamp.omni_range=10;lamp.shadow_enabled=true;add_child(lamp);strip_lights.append(lamp)
		var key=SpotLight3D.new();key.position=Vector3(2,5,8);key.light_color=Color("e9ce9f");key.light_energy=8;key.spot_range=24;key.spot_angle=38;key.shadow_enabled=true;add_child(key);key.look_at(global_position+Vector3(-1,0,-3))
		muzzle=OmniLight3D.new();muzzle.light_color=Color("e6b675");muzzle.omni_range=4;muzzle.light_energy=0;add_child(muzzle)
		searchlight=SpotLight3D.new();searchlight.light_color=Color("d4ded2");searchlight.light_energy=5;searchlight.spot_range=18;searchlight.spot_angle=15;searchlight.shadow_enabled=true;cinema.add_child(searchlight);searchlight.hide()
	elif index==4:
		passing_machine=game.world.machine.duplicate(0);passing_machine.name="CinematicNomad";passing_machine.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF;cinema.add_child(passing_machine)
		var bodies=MMFAssets.of_type(passing_machine,"CollisionObject3D");bodies.reverse()
		for body in bodies:
			for child in body.get_children():
				if not child is CollisionShape3D and not child is CollisionPolygon3D:child.reparent(body.get_parent())
			body.free()
		passing_gait.setup(game,passing_machine);passing_machine.hide();passing_machine.process_mode=Node.PROCESS_MODE_DISABLED

func prepared() -> bool:return is_instance_valid(passing_machine)

func begin():
	active=true;previous=-1;memory_started=false;fire_started=false;machine_origin=game.world.machine.position
	original_machine_visible=game.world.machine.visible
	lever.rotation=Vector3.ZERO
	hero_performance.clear()
	for acting in performances:acting.active=true
	for actor in machines+[worker]:actor.process_mode=Node.PROCESS_MODE_INHERIT
	memory_environment.ssao_enabled=game.settings.get("quality","high")=="high"
	memory_environment.glow_enabled=game.settings.get("quality","high")!="low"
	process_mode=Node.PROCESS_MODE_ALWAYS
	show();bars.show();set_process(true);skip_hint.text=game.hint("{key:pause}  ·  SKIP INTRO")
	climbers.clear()
	for actor in cinema.actors:
		var acting=MMFOpeningPerformance.new();MMFAssets.of_type(actor,"Skeleton3D")[0].add_child(acting);acting.clear();climbers.append(acting)
	bed.stop();bed.stream=null;bed.volume_linear=0
	voice.stream=voice_stream;voice.volume_linear=0
	score.stop();score.stream=score_stream;score.volume_linear=0
	apply_mix()

func apply_mix():
	var gain=0.0 if game.audio.muted else float(game.settings.volume)
	bed.volume_linear=gain*.85;voice.volume_linear=gain*.95
	score.volume_linear=gain*float(game.settings.get("music_volume",.35))*2.0
	bed.stream_paused=game.menu_open or game.get_tree().paused;voice.stream_paused=bed.stream_paused
	score.stream_paused=bed.stream_paused

func _process(_dt):
	if not active:return
	apply_mix()
	var size=game.get_viewport().get_visible_rect().size
	var border=maxf(0,(size.y-size.x/2.35)*.5)
	var reveal=1-smoothstep(9.65,10.2,cinema.time)
	if cinema.time < -MEMORY_DURATION:border=0
	border*=reveal
	top_bar.position=Vector2.ZERO;top_bar.size=Vector2(size.x,border)
	bottom_bar.position=Vector2(0,size.y-border);bottom_bar.size=Vector2(size.x,border)
	skip_hint.position=Vector2(size.x-340,size.y-maxf(36,border*.55));skip_hint.size=Vector2(306,24);skip_hint.modulate.a=reveal
	subtitle.position=Vector2(24,size.y-border+maxf(12,(border-36)*.28) if border>=72 else size.y-96);subtitle.size=Vector2(size.x-48,36)

static func exposure(at: float,start: float,end: float) -> float:
	return smoothstep(start,start+.75,at)*(1-smoothstep(end-.5,end,at))

func camera_view(eye: Vector3,target: Vector3,fov: float):
	cinema.camera.global_position=global_position+eye;cinema.camera.look_at(global_position+target)
	# Lock the composition horizontally; extra-wide monitors must not reveal
	# the off-camera end of the operator's arm or unrelated rooftop scenery.
	cinema.camera.keep_aspect=Camera3D.KEEP_WIDTH
	cinema.camera.fov=rad_to_deg(2*atan(tan(deg_to_rad(fov*.5))*16.0/9.0))

func sample_actor(actor: Node3D,clip: String,seconds: float):
	# Sample the memory from its edit clock, so impact and reaction remain in
	# sync across render rates, paused playback and a staged review capture.
	for animator in MMFAssets.of_type(actor,"AnimationPlayer"):
		animator.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		for key in animator.get_animation_list():
			if String(key).get_file().to_lower()!=clip:continue
			var animation=animator.get_animation(key)
			if animator.current_animation!=key:animator.play(key,0)
			animator.seek(fposmod(seconds,animation.length) if clip in ["idle","run","walk","unarmed_run","armed_walk_fwd"] else clampf(seconds,0,animation.length),true)
			break

func hand_performance(at: float):
	var reach=smoothstep(5.5,6.27,at)
	var close=smoothstep(6.24,6.63,at)*(1-smoothstep(8.08,8.31,at))
	var pull=smoothstep(7.04,7.50,at)
	var settle=maxf(0,at-7.50)
	lever.rotation.x=.045*smoothstep(6.72,7.02,at)+1.055*pull+.045*sin(settle*22)*exp(-settle*9)
	var wrist=Basis.from_euler(Vector3(.08+.22*pull,-.10+.07*pull,.08))
	var handle=lever.transform*Vector3(0,.15,.12)
	glove.transform=Transform3D(wrist,handle+wrist*Vector3(.007,.068,.115))
	glove.position+=Vector3(.15,-.18,.25)*(1-reach)+Vector3(.07,-.12,.16)*smoothstep(8.3,8.85,at)
	for i in 4:
		var grip=smoothstep(6.24+i*.025,6.53+i*.025,at)*(1-smoothstep(8.08+i*.015,8.29+i*.015,at))
		for j in 3:fingers[i*3+j].rotation.x=lerpf(-.10,[-1.20,-.35,-.55][j],grip)
	thumb.rotation.x=-.05*close;thumb.rotation.z=-.14*(1-close)
	# Two fixed-length bones bend at the elbow; the wrist meets the cuff.
	var shoulder=Vector3(-3.16,1.57,3.31)+Vector3(-.025,-.014,-.02)*pull
	var wrist_end=glove.transform*Vector3(0,-.005,.110)
	var direction=(wrist_end-shoulder).normalized()
	var distance=clampf(shoulder.distance_to(wrist_end),.06,.629)
	var along=(.34*.34-.29*.29+distance*distance)/(2*distance)
	var pole=Vector3(.28,-1,.15);pole=(pole-direction*pole.dot(direction)).normalized()
	var elbow=shoulder+direction*along+pole*sqrt(maxf(0,.34*.34-along*along))
	upper_sleeve.transform=Transform3D(Basis.looking_at(elbow-shoulder,Vector3.UP,true),shoulder)
	fore_sleeve.transform=Transform3D(Basis.looking_at(wrist_end-elbow,Vector3.UP,true),elbow)

func factory_performance(at: float):
	var impact=10.23;var elapsed=maxf(0,at-impact)
	var shove=smoothstep(9.96,10.23,at)
	var recoil=smoothstep(10.04,10.28,at)
	machines[0].position.x=-1.21-.57*recoil;machines[0].position.z=-3.35;machines[0].rotation.y=PI*.5
	machines[1].position.x=1.0-1.40*smoothstep(9.13,10.13,at)-.10*shove;machines[1].position.z=-3.25;machines[1].rotation.y=-PI*.5
	sample_actor(machines[0],"idle",at)
	sample_actor(machines[1],"idle" if at<8.8 or at>=9.45 else "walk",at)
	if at>=9.45:performances[1].use_clip(slash_clip,at-9.45)
	else:performances[1].clip={}
	performances[0].brace=-.43*recoil+.14*smoothstep(10.6,11.9,at)
	performances[0].compression=.12*recoil-.035*smoothstep(10.7,11.9,at)
	performances[0].gaze=Vector2(.12*recoil,-.10*recoil)
	performances[1].brace=.12*shove*(1-smoothstep(10.4,11.4,at))
	worker.visible=true;worker.position.z=-5.8;worker.rotation.y=-PI/2
	worker.position.x=-3.7-3.0*clampf(at-9.35,0,1.48)
	sample_actor(worker,"unarmed_idle" if at<9.35 else "unarmed_run",maxf(0,at-9.35))
	cart.transform=cart_pose(elapsed)
	spool.rotation.x=0;spool.position=spool_rest
	if at>=impact:
		# It rolls clear of the tray first, then falls and loses energy on each
		# bounce. No downward travel through the supporting shelf.
		var roll=1.9*minf(elapsed,.10)+.80*(1-exp(-maxf(0,elapsed-.10)*2))
		var local=spool_rest-cart_rest
		if elapsed<=.10:
			spool.transform=cart.transform*Transform3D(Basis(Vector3.RIGHT,roll/.16),local+Vector3(0,.075*sin(elapsed/.10*PI*.5),roll))
		else:
			var launch=cart_pose(.10)*(local+Vector3(0,.075,.19))
			var land=sqrt((launch.y-.16)/4.9)
			var fall=minf(elapsed-.10,land);var bounce=maxf(0,elapsed-.10-land)
			spool.position=launch+Vector3(0,0,roll-.19)
			spool.position.y=maxf(.16,launch.y-4.9*fall*fall)+.12*absf(sin(bounce*12))*exp(-bounce*5)
			spool.rotation=Vector3(roll/.16,0,cart_pose(.10).basis.get_euler().z*(1-smoothstep(.10,.30,elapsed)))
	load_motor.rotation.z=.008*sin(at*.9)+.045*sin(elapsed*3.2)*exp(-elapsed*.8)
	fractures.visible=at>=impact
	for light in strip_lights:light.light_energy=3 if at<7.34 else 1.1
	if previous<impact and at>=impact:
		game.effects.combat_impact(global_position+Vector3(-2.02,.98,-3.28),Vector3(-1,.3,0),"blocked")
	muzzle.light_energy=0

func cart_pose(elapsed: float) -> Transform3D:
	var rock=.13*sin(elapsed*14)*exp(-elapsed*2.7)
	return Transform3D(Basis(Vector3.BACK,rock),cart_rest+Vector3(-.24*(1-exp(-elapsed*8)),.48*absf(sin(rock)),.05*(1-exp(-elapsed*6))))

func rooftop_performance(at: float):
	var look=smoothstep(15.35,16.55,at)
	var turn=smoothstep(15.70,17.02,at)
	var stand=smoothstep(18.05,18.7,at)
	var step=clampf((at-23.6)/2.4,0,1)
	var start=Vector3(21.15,19.522,-1.9);var control_a=Vector3(20.55,19.522,-1.28);var control_b=Vector3(20.88,19.522,0);var end=Vector3(20.5,19.522,0)
	game.player.position=start.bezier_interpolate(control_a,control_b,end,step)
	game.player.visual.rotation.y=lerp_angle(2.30,-PI/2,turn)
	if step>0:
		var tangent=start.bezier_derivative(control_a,control_b,end,step)
		game.player.visual.rotation.y=lerp_angle(-PI/2,atan2(tangent.x,tangent.z),smoothstep(0,.16,step))
	game.player.play(("armed_crouch_walk" if turn>.01 and turn<.99 else "armed_crouch_idle") if stand<.5 else "armed_idle" if at<23.6 else "armed_walk_fwd")
	if step>0:sample_actor(game.player.visual,"armed_walk_fwd",step*2.05/1.1)
	hero_performance.active=true
	var eye_line=lerp_angle(1.74,-PI/2+.08,look)
	hero_performance.gaze=Vector2(clampf(angle_difference(game.player.visual.rotation.y,eye_line),-.8,.8),-.12*look)
	hero_performance.gaze*=1-smoothstep(0,.4,step)
	hero_performance.brace=.10*(1-stand)+.12*smoothstep(21.3,21.8,at)
	game.player.reset_physics_interpolation()

func arrival_performance(at: float):
	for i in cinema.actors.size():
		var actor=cinema.actors[i];var acting=climbers[i]
		var u=clampf((at-22.05-float(i)*.32)/3.6,0,1)
		actor.visible=at>=22.05+float(i)*.32
		var pull=smoothstep(0,.30,u);var over=smoothstep(.30,.66,u);var land=pow(clampf((u-.66)/.16,0,1),2)
		var end_x=23.4 if i==0 else 23.8;var z=2.5 if i==0 else -2.5
		actor.position=Vector3(24.73-.13*pull-(24.60-end_x)*smoothstep(.36,.70,u),18.85+.50*pull+1.24*over-1.068*land,z)
		actor.rotation.y=-PI/2
		sample_actor(actor,"run",0)
		acting.use_clip(climb_clips[i],u*3.6);acting.carry_equipment=false
		acting.compression=.12*smoothstep(.82,.86,u)*(1-smoothstep(.87,1,u))
		acting.wall_grips=[Vector3(24.35,20.49,z-.27),Vector3(24.35,20.49,z+.27)]
		acting.grip_weight=1-smoothstep(.29,.44,u)
		if acting.grip_weight==0:acting.wall_grips=[]
		actor.reset_physics_interpolation()

func update(at: float):
	if not active:return
	if at<MMFOpeningLetter.DURATION:
		hide();cinema.set_transition(1);letter.sample(at);subtitle.text="";game.ui.caption.text=""
		for actor in cinema.actors:actor.hide()
		game.player.play("armed_crouch_idle")
		if at>=MMFOpeningLetter.BURN_START and not fire_started:
			fire_started=true;bed.stream=fire_stream;bed.play(maxf(0,at-MMFOpeningLetter.BURN_START))
		return
	letter.stop()
	if not memory_started:
		memory_started=true;bed.stop();bed.stream=bed_stream;bed.play();score.play()
	at-=MMFOpeningLetter.DURATION
	if previous<12.9 and at>=12.9:voice.play()
	if at<MEMORY_DURATION:
		game.player.weapon_pose.scripted_aim=false
		if at<14.25:game.player.play("armed_crouch_idle")
		if at<22.05:
			for actor in cinema.actors:actor.hide()
	var alpha=0.0
	if at<12.5:
		show();cinema.camera.environment=memory_environment;cinema.camera.attributes=focus
		glove.visible=at>=5;upper_sleeve.visible=glove.visible;fore_sleeve.visible=glove.visible
		hand_performance(at);factory_performance(at)
		if at<5.2:
			alpha=exposure(at,.15,4.85);camera_view(Vector3(6.8,2.65,8.7).lerp(Vector3(6.1,2.55,7.6),smoothstep(0,4.8,at)),Vector3(-.7,2,-3),48)
			focus.dof_blur_far_distance=18;focus.dof_blur_amount=.02
		elif at<9.0:
			alpha=exposure(at,5.25,8.8)
			camera_view(Vector3(-4.18,1.83,3.94).lerp(Vector3(-4.10,1.77,3.85),smoothstep(5.2,8.8,at)),Vector3(-3.61,1.48,2.68),39)
			focus.dof_blur_far_distance=1.6;focus.dof_blur_far_transition=2;focus.dof_blur_amount=.035
		else:
			var jolt=.035*exp(-maxf(0,at-10.23)*12) if at>=10.23 else 0.0
			alpha=exposure(at,9.1,12.5);camera_view(Vector3(1.0,1.85,4.6).lerp(Vector3(.65,1.75,4.3),smoothstep(9.1,12.5,at))+Vector3(jolt,-jolt,0),Vector3(-1.30,1.25,-3.6),40)
			focus.dof_blur_far_distance=14;focus.dof_blur_amount=.012
	else:
		hide();cinema.camera.environment=null;cinema.camera.attributes=null
		for actor in machines+[worker]:actor.process_mode=Node.PROCESS_MODE_DISABLED
		if at<14.25:alpha=0
		elif at<MEMORY_DURATION:
			alpha=exposure(at,14.25,MEMORY_DURATION+.5)
			var t=clampf((at-14.25)/(MEMORY_DURATION-14.25),0,1)
			game.world.machine.hide();passing_machine.show();passing_machine.process_mode=Node.PROCESS_MODE_INHERIT
			passing_machine.position=machine_origin;passing_machine.force_update_transform();passing_gait.rig.force_update_transform()
			passing_gait.update((at-14.25)*2.8,0);passing_machine.position.z+=21.7*(1-t)
			rooftop_performance(at)
			var reveal=smoothstep(15.7,19.35,at)
			cinema.camera.global_position=Vector3(22.6,22.5,-5.7).lerp(Vector3(22.6,23.0,-4.1),reveal)
			cinema.camera.look_at(Vector3(18.8,20.4,1.0).lerp(Vector3(11.4,18.2,6.5),reveal))
			cinema.camera.keep_aspect=Camera3D.KEEP_WIDTH
			cinema.camera.fov=rad_to_deg(2*atan(tan(deg_to_rad(lerpf(44,52,reveal)*.5))*16.0/9.0))
			if at>=21.2:
				arrival_performance(at)
				cinema.camera.keep_aspect=Camera3D.KEEP_HEIGHT
				var meet=smoothstep(24.7,26.0,at)
				var chase=MMFOpeningPresentation.view(0,game.player.position+Vector3.UP*.96)
				cinema.camera.global_position=Vector3(15.15,24.25,.15).lerp(chase.eye,meet)
				cinema.camera.look_at(Vector3(22.3,20.4,0).lerp(chase.target,meet));cinema.camera.fov=lerpf(52,chase.fov,meet)
			searchlight.show();searchlight.global_position=Vector3(24.8,22.9,-3.4);searchlight.look_at(Vector3(20.0,19.7,lerpf(-2,2,smoothstep(15.7,19.2,at))))
			if previous<20.1 and at>=20.1:game.effects.tracer(Vector3(24.5,21,-2),Vector3(19.3,19.7,1.2),Color(.8,.54,.28))
		else:
			release_memory()
	if at<MEMORY_DURATION:
		cinema.set_transition(1-alpha)
		game.ui.caption.text="";subtitle.text="“There. On the roof.”" if at>=13.0 and at<15.7 else ""
	previous=at

func release_memory():
	letter.stop()
	for acting in climbers:
		if is_instance_valid(acting):acting.clear()
	for actor in cinema.actors:
		for animator in MMFAssets.of_type(actor,"AnimationPlayer"):animator.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_IDLE
	game.player.animator.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_IDLE
	hide();cinema.camera.environment=null;cinema.camera.attributes=null
	cinema.camera.keep_aspect=Camera3D.KEEP_HEIGHT
	game.world.machine.visible=original_machine_visible;passing_machine.hide();passing_machine.process_mode=Node.PROCESS_MODE_DISABLED
	searchlight.hide();game.ui.caption.text="";subtitle.text=""
	if hero_performance:hero_performance.clear()

func stop():
	if active:release_memory()
	active=false;hide();bars.hide();set_process(false)
	process_mode=Node.PROCESS_MODE_DISABLED
	bed.stop();voice.stop();score.stop();bed.stream=null;voice.stream=null;score.stream=null

func _exit_tree():
	bed.stop();voice.stop();score.stop();bed.stream=null;voice.stream=null;score.stream=null;bed_stream=null;voice_stream=null;score_stream=null;fire_stream=null
