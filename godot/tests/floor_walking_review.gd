extends "res://tests/floor_surface_review.gd"
## Visible proof using the real player capsule and held movement input.

func walking_clip(id: String,at: Vector3,heading: float,direction: Vector3):
	var directory=output+label+"/"+id+"/";DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
	game.player.teleport(at);game.player.yaw=heading;game.player.show();game.player.set_physics_process(true)
	var begun=Time.get_ticks_usec();var samples=[]
	Input.action_press("forward")
	for frame in 96:
		var travelled=(game.player.position-at).dot(direction)
		if travelled>=6.0:Input.action_release("forward")
		camera.position=game.player.position-direction*3.7+Vector3(1.6,1.35,0)
		camera.look_at(game.player.position+Vector3.UP*.62+direction*.9);camera.reset_physics_interpolation();camera.make_current()
		await RenderingServer.frame_post_draw
		var image=root.get_texture().get_image();image.save_jpg(directory+"frame-%04d.jpg"%frame,.98)
		if frame==48:image.save_png(output+label+"/"+id+".png")
		samples.append({"seconds":(Time.get_ticks_usec()-begun)/1000000.0,"position":MMFAssets.dict_v(game.player.position),"on_floor":game.player.is_on_floor()})
	Input.action_release("forward");game.player.set_physics_process(false)
	var distance=(game.player.position-at).dot(direction)
	assert(distance>5.5,"Player failed actual walking review "+id)
	records.append({"id":id,"frames":96,"fps_for_review":24,"samples":samples,"travelled":distance})
	print("FLOOR_WALK_CLIP ",id," distance=",distance)

func run():
	if DisplayServer.get_name()=="headless":push_error("Native renderer required");quit(1);return
	DisplayServer.window_set_size(Vector2i(1280,720));Engine.max_fps=30
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.apply_quality();game.invulnerable=true
	camera=Camera3D.new();root.add_child(camera);camera.fov=65;camera.near=.08;camera.far=1800;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	await prepare("first-steps")
	game.process_mode=Node.PROCESS_MODE_ALWAYS;game.set_physics_process(false);game.caretaker.set_physics_process(false);game.close_menu();game.ui.hide()
	for level in [-2,-1,0]:
		var p=game.session.create_piece("floor",{"x":4,"y":level,"z":0},0,{},true);game.building.add_visual(p)
		await walking_clip("walk-deck%d-cap"%(level+3),Vector3(8,MMFMachineSpaces.deck_y(level)+.05,3.2),0,Vector3.FORWARD)
	for x in [6,7]:
		var p=game.session.create_piece("floor",{"x":x,"y":0,"z":0},0,{},true);game.building.add_visual(p)
	game.world.set_dock_open(true)
	await walking_clip("walk-native-edge-extension",Vector3(8.5,16.08,0),-PI/2,Vector3.RIGHT)
	var report={"label":label,"records":records,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"Real native player, physics and held forward input. Stationary test Nomad, fixture constructed plates and open gangway gate. Scripted trailing camera; no human playtest claim. JPEG readback affects capture speed, so timestamped samples are the actual timing evidence; video replays frames at24fps."}
	var file=FileAccess.open(output+label+"/capture-walking.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("FLOOR_WALK_REVIEW_COMPLETE")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0)
