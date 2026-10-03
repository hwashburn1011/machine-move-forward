extends "res://tests/wrist_terminal.gd"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://opening-prelude-review-"+str(Time.get_ticks_usec())+"/";call_deferred("run")

func capture(id: String):
	await frames(3)
	if DisplayServer.get_name()!="headless":
		await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(output+id+".png")

func inspect_contacts(p):
	var wrist_error=0.0;var elbow_error=0.0;var grip_clearance=1.0
	for i in 205:
		var at=5.45+i/60.0;p.hand_performance(at)
		wrist_error=maxf(wrist_error,(p.fore_sleeve.transform*Vector3(0,0,.29)).distance_to(p.glove.transform*Vector3(0,-.005,.110)))
		elbow_error=maxf(elbow_error,(p.upper_sleeve.transform*Vector3(0,0,.34)).distance_to(p.fore_sleeve.position))
		if at>=6.65 and at<=8.04:
			for finger in 4:
				for joint in [1,2]:
					var centre=p.lever.to_local(p.fingers[finger*3+joint].global_position)-Vector3(0,.15,.12)
					grip_clearance=minf(grip_clearance,maxf(absf(centre.y)-.0325,absf(centre.z)-.0375))
	check(wrist_error<.003 and elbow_error<.003,"Sleeve joints remain connected within 3 mm throughout reach, pull and withdrawal")
	check(grip_clearance>=-.002,"Curled finger joints do not pass through the solid lever handle")
	var min_spool=10.0;var shelf_clear=true
	for i in 140:
		p.factory_performance(10.23+i/60.0)
		min_spool=minf(min_spool,p.spool.position.y-.16)
		var local=p.cart.to_local(p.spool.global_position)
		if absf(local.z)<.43 and absf(local.x)<.51:shelf_clear=shelf_clear and local.y-.16>=.945
	check(min_spool>=-.002 and shelf_clear,"Loose spool clears its supporting tray before falling and stays above the floor")
	p.rooftop_performance(15.1);var rear=game.player.visual.rotation.y
	p.rooftop_performance(19.0);var ahead=game.player.visual.rotation.y
	check(absf(angle_difference(rear,ahead))>.9,"Rooftop performance turns from the pursuer toward the passing machine")
	p.rooftop_performance(MMFOpeningPrelude.MEMORY_DURATION-.001)
	var start=MMFAssets.v(game.cinematics.timeline.samples[0].player.position)-Vector3.UP*.96
	check(game.player.position.distance_to(start)<.015,"Decision beat ends at the original chase starting position")
	report["physical_contacts"]={"max_wrist_gap_m":wrist_error,"max_elbow_gap_m":elbow_error,"min_finger_joint_clearance_m":grip_clearance,"min_spool_floor_clearance_m":min_spool,"spool_clears_tray":shelf_clear}

func inspect_arrival(c,p):
	var grip_error=0.0;var wall_clearance=10.0;var wall_samples=0;var worst_grip={};var worst_foot={}
	var facing_error=0.0;var previous_position=Vector3.ZERO
	for frame in 120:
		var at=22.0+frame/30.0;c.time=at-MMFOpeningPrelude.MEMORY_DURATION;c.update(0);await frames(2)
		for i in 2:
			var acting=p.climbers[i];var sk=acting.get_skeleton()
			if not c.actors[i].visible:continue
			if acting.grip_weight>.999 and acting.grip_error>grip_error:
				grip_error=acting.grip_error;worst_grip={"at":at,"actor":i,"scale":str(sk.global_basis.get_scale())}
			for foot in acting.sampled_ankles:
				if absf(foot.x-24.35)<.14:
					wall_samples+=1;wall_clearance=minf(wall_clearance,foot.y-20.50)
					if is_equal_approx(wall_clearance,foot.y-20.50):worst_foot={"at":at,"actor":i,"position":str(foot)}
		if at>24.05 and at<25.95:
			var movement=game.player.position-previous_position
			if movement.length()>.0001:facing_error=maxf(facing_error,absf(angle_difference(game.player.visual.rotation.y,atan2(movement.x,movement.z))))
		previous_position=game.player.position
	check(grip_error<.008,"Both climbers keep their loaded hands on the coping within 8 mm")
	check(wall_samples>0 and wall_clearance>.10,"Both sets of boots clear the rear wall rather than passing through it")
	check(facing_error<.12,"Diagonal approach faces its direction of travel without a sideways animation")
	var positions=[]
	for i in 2:positions.append(c.actors[i].position)
	c.time=0;c.update(0)
	for i in 2:check(positions[i].distance_to(c.actors[i].position)<.005,"Climber "+str(i)+" joins the original chase without a position jump")
	report["arrival_contacts"]={"max_hand_error_m":grip_error,"min_ankle_clearance_above_wall_m":wall_clearance,"wall_crossing_samples":wall_samples,"max_walk_facing_error_radians":facing_error,"worst_grip":worst_grip,"worst_foot":worst_foot}
	c.begin_opening(true)
	var tips=[];var high_head=Vector3.ZERO
	for at in [9.95,10.23,10.40]:
		c.time=at-MMFOpeningPrelude.MEMORY_DURATION;c.update(0);await frames(2);tips.append(p.performances[1].sampled_blade_tip)
		if at==9.95:high_head=p.performances[1].sampled_head
	check(tips[0].y-high_head.y>.7,"Attack wind-up raises the blade visibly above the head")
	check(tips[0].y-tips[1].y>1.1 and tips[2].y<high_head.y,"Blade swings down through contact into a low follow-through")
	report["slash"]={"windup_tip_above_head_m":tips[0].y-high_head.y,"downward_travel_m":tips[0].y-tips[1].y}

func run():
	Engine.max_fps=60;output=ProjectSettings.globalize_path("res://../test-results/opening-prelude/preview-01/")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):output=arg.trim_prefix("--out=").trim_suffix("/")+"/"
	DirAccess.make_dir_recursive_absolute(output)
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,810))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	var initial=game.session.native_snapshot();var rng=game.session.rng.state
	game.new_game()
	var deadline=Time.get_ticks_msec()+30000
	while not game.started and Time.get_ticks_msec()<deadline:await process_frame
	var c=game.cinematics;var p=c.prelude
	check(game.cinematic=="opening" and c.time==-MMFOpeningPrelude.DURATION and p.active,"New Game begins with the cinematic lead-in")
	check(game.session.native_snapshot()==initial and game.session.rng.state==rng,"Preparing and entering the lead-in preserves campaign state and RNG")
	check(MMFAssets.of_type(p,"CollisionObject3D").is_empty(),"Memory set creates no gameplay collision bodies")
	check(MMFAssets.of_type(p.passing_machine,"CollisionObject3D").is_empty(),"Passing Nomad has no duplicate collision bodies")
	var machine_transform=game.world.machine.transform
	inspect_contacts(p)
	await inspect_arrival(c,p)
	c.begin_opening(true)
	for at in [1.7,3.7,6.0,6.8,7.2,7.5,8.3,9.7,9.95,10.1,10.2,10.4,11.3,13.5,15.1,16.6,19.5,21.1,21.9,22.7,23.4,24.2,24.9,25.7,26.7,29.8,32.6,35.8]:
		c.time=at-MMFOpeningPrelude.MEMORY_DURATION;c.update(0)
		if at>=15.4 and at<22:
			check(game.world.machine.transform==machine_transform and not game.world.machine.visible and p.passing_machine.visible,"Passing reveal preserves the gameplay machine transform at "+str(at))
		for i in 12:game.effects.update(1.0/60);await process_frame
		if at==10.4:check(p.performances[0].contact_error<.005,"Robot recoil bends the knees while preserving its planted feet within 5 mm")
		await capture("shot-%.1f"%at)
	var acting_info=[]
	for actor in p.machines+[game.player.visual]:
		var skeleton=MMFAssets.of_type(actor,"Skeleton3D")[0];var bones=[]
		for bone in skeleton.get_bone_count():bones.append(skeleton.get_bone_name(bone))
		acting_info.append({"name":actor.name,"bones":bones,"animations":Array(MMFAssets.of_type(actor,"AnimationPlayer")[0].get_animation_list())})
	report["acting_rigs"]=acting_info
	check(game.session.rng.state==rng and game.session.clock==0,"The entire staged introduction leaves campaign time and RNG untouched")
	c.finish();await frames(5)
	check(not p.active and not p.bars.visible and p.process_mode==Node.PROCESS_MODE_DISABLED,"Handoff stops the prelude, letterbox and its processing")
	check(not p.hero_performance.active and c.camera.keep_aspect==Camera3D.KEEP_HEIGHT,"Handoff removes acting offsets and restores gameplay camera framing")
	check(c.camera.environment==null and c.camera.attributes==null and game.player.camera.current,"Handoff restores the gameplay camera and clears cinematic exposure/focus")
	check(game.world.machine.position==Vector3.ZERO and game.session.opening_done,"Handoff restores the machine origin and completes the opening")
	check(not p.bed.playing and not p.voice.playing and not p.score.playing and p.bed.stream==null and p.voice.stream==null and p.score.stream==null,"Cinematic sound stops and releases playback on handoff")
	for at in [0.1,7.0,14.0,19.0,25.0]:
		c.begin_opening(true);c.time=at-MMFOpeningPrelude.MEMORY_DURATION;c.update(0);await frames(3)
		await key(KEY_ESCAPE)
		check(game.cinematic=="" and game.session.opening_done and not p.active and not p.hero_performance.active and game.world.machine.position==Vector3.ZERO,"Escape safely skips from cinematic time "+str(at))
	c.begin_opening(true);c.time=-8.5;c.update(0);await frames(3)
	game.audio.muted=true;await frames(3)
	check(p.bed.volume_linear==0 and p.voice.volume_linear==0 and p.score.volume_linear==0,"Mute silences all three cinematic sound stems")
	game.audio.muted=false;game.settings.volume=.4;game.settings.music_volume=0;await frames(3)
	check(is_equal_approx(p.bed.volume_linear,.34) and is_equal_approx(p.voice.volume_linear,.38) and p.score.volume_linear==0,"Master and music controls independently govern cinematic sound")
	game.open_menu("Settings");await frames(3)
	check(p.bed.stream_paused and p.voice.stream_paused and p.score.stream_paused,"A paused menu pauses every cinematic sound stem")
	game.close_menu();await frames(3)
	check(not p.bed.stream_paused and not p.voice.stream_paused,"Returning from settings resumes cinematic sound")
	c.finish()
	for size in [Vector2i(1024,768),Vector2i(1920,810),Vector2i(960,540)]:
		if DisplayServer.get_name()=="headless":break
		DisplayServer.window_set_size(size);await frames(5)
		game.settings.quality="low" if size.x==960 else "high";game.apply_quality();c.begin_opening(true)
		for at in [6.8,13.5,19.5]:
			c.time=at-MMFOpeningPrelude.MEMORY_DURATION;c.update(0);await capture("aspect-%dx%d-%.1f"%[size.x,size.y,at])
		check(root.get_visible_rect().encloses(p.skip_hint.get_global_rect()),"Skip control stays within the "+str(size)+" viewport")
		check(root.get_visible_rect().encloses(p.subtitle.get_global_rect()),"Dialogue stays within the "+str(size)+" viewport")
		check(p.memory_environment.ssao_enabled==(game.settings.quality=="high"),"Cinematic environment follows selected graphics quality at "+str(size))
		c.finish()
	report.merge({"checks":checks,"failures":failures,"passed":failures.is_empty(),"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"Staged native shots and real skip input; independent timing pass covers real-time playback and performance."})
	var file=FileAccess.open(output+"review.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("PRELUDE_REVIEW ",JSON.stringify(report))
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio);refs.append(weakref(p.bed_stream));refs.append(weakref(p.voice_stream))
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
