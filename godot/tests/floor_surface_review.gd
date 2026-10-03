extends SceneTree
## Paired native visual evidence; scripted camera, not a human playtest.
var game
var camera: Camera3D
var label="before"
var output="res://../test-results/roof-floor/"
var records=[]
var only=""
const FRAMES=48

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://floor-surface-review/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
		if arg=="--author":set_meta("author_machine",true)
		if arg.begins_with("--only="):only=arg.trim_prefix("--only=")
	call_deferred("run")

func prepare(checkpoint: String):
	assert(game.playtests.launch(checkpoint))
	game.open_menu("Pause");game.ui.hide();game.player.hide()
	game.process_mode=Node.PROCESS_MODE_DISABLED
	for i in 4:await process_frame
	camera.make_current()

func clip(id: String,at: Vector3,target: Vector3,pan: Vector3):
	if only!="" and only!=id:return
	var directory=output+label+"/"+id+"/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
	camera.position=at;camera.look_at(target);camera.reset_physics_interpolation();camera.make_current()
	for i in 12:await process_frame
	for frame in FRAMES:
		var offset=pan*(float(frame)/float(FRAMES-1)-.5)
		camera.position=at+offset;camera.look_at(target+offset*.45);camera.reset_physics_interpolation()
		await RenderingServer.frame_post_draw
		var image=root.get_texture().get_image()
		image.save_jpg(directory+"frame-%04d.jpg"%frame,.98)
		if frame==FRAMES/2:image.save_png(output+label+"/"+id+".png")
	records.append({"id":id,"frames":FRAMES,"fps_for_review":24,"at":MMFAssets.dict_v(at),"target":MMFAssets.dict_v(target),"pan":MMFAssets.dict_v(pan)})
	print("FLOOR_REVIEW_CLIP ",label," ",id)

func run():
	if DisplayServer.get_name()=="headless":push_error("Native renderer required");quit(1);return
	DisplayServer.window_set_size(Vector2i(1280,720));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.settings.quality="high";game.apply_quality();game.invulnerable=true
	camera=Camera3D.new();root.add_child(camera);camera.fov=65;camera.near=.08;camera.far=1800
	camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	await prepare("first-steps")
	for level in [-2,-1,0]:
		var y=16.03+level*3.6
		var at=Vector3(6,y+.58,-10) if level<0 else Vector3(10,y+.58,3)
		var target=Vector3(5,y,-4) if level<0 else Vector3(8,y,0)
		await clip("deck%d-bare"%(level+3),at,target,Vector3(1.6,0,1))
		await clip("deck%d-port-landing"%(level+3),Vector3(-13.8,y+.55,-6),Vector3(-12.25,y,-3.7),Vector3(.65,0,.35))
	var p=game.session.create_piece("floor",{"x":4,"y":0,"z":0},0,{},true)
	game.building.add_visual(p)
	await clip("deck3-constructed-overlay",Vector3(10,16.58,3),Vector3(8,16.03,0),Vector3(.6,0,.55))
	await prepare("foundry")
	var foundry=game.campaign.destination
	await clip("foundry-floor",foundry.to_global(Vector3(-4,.62,3.8)),foundry.to_global(Vector3(0,0,-.4)),Vector3(1.8,0,-.4))
	await prepare("workshop")
	var workshop=game.opportunities.survivor_site.site
	await clip("workshop-floor",workshop.to_global(Vector3(-4,.65,2.8)),workshop.to_global(Vector3(1,0,1)),Vector3(1.4,0,0))
	await prepare("wake")
	var wake=game.campaign.destination
	await clip("wake-floor",wake.to_global(Vector3(4,.55,4.5)),wake.to_global(Vector3(0,0,0)),Vector3(.8,0,-1))
	var report={"label":label,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"renderer":RenderingServer.get_video_adapter_name(),"resolution":[1280,720],"quality":"high Forward+ 4x MSAA; default LOD, shadow and depth behavior retained","records":records,"scope":"Real compiled/author native assets, static world with scripted shallow moving cameras. Native floor overlay added through normal visual construction API with fixture stock; no saved personal state changed. Frames are evidence, not performance timing or human playtest."}
	var file=FileAccess.open(output+label+"/capture"+("-"+only if only!="" else "")+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("FLOOR_REVIEW_COMPLETE ",label)
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0)
