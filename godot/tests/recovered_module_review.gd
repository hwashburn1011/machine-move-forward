extends SceneTree
## Native visual review of the three recovered, paid-blueprint assets.
## Instances here are explicit layout fixtures, not campaign reward evidence.
const BASE="res://../test-results/deck-audio/native-recovered/"
var out=BASE
var game
var camera: Camera3D
var captures=[]
var failures=[]
var pieces={}
var operation={}

func _initialize():
	set_meta("test_mode",true)
	if "--diagnostic" in OS.get_cmdline_user_args():out=BASE+"diagnostic/"
	MMFSaves.DIRECTORY="user://recovered-module-review/"
	call_deferred("run")

func capture(name: String,at: Vector3,target: Vector3,fov: float=45):
	camera.position=at;camera.look_at(target);camera.fov=fov;camera.reset_physics_interpolation()
	for frame in 20:await process_frame
	await RenderingServer.frame_post_draw
	var error=root.get_texture().get_image().save_png(out+name+".png")
	if error!=OK:failures.append("Capture failed: "+name)
	captures.append({"name":name,"camera":str(at),"lookAt":str(target),"fov":fov})
	print("RECOVERED_MODULE_CAPTURE ",name)

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out))
	DisplayServer.window_set_size(Vector2i(1600,900));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.load_payload(game.playtests.payload("scanner"))
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.visual.hide();game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	game.session.story.phase="locked";game.session.scanner.phase="consumed"
	for particles in MMFAssets.of_type(game.world,"GPUParticles3D"):particles.hide()
	for particles in MMFAssets.of_type(game.effects,"GPUParticles3D"):particles.hide()
	game.session.expedition_gear.recovered=["quiet-drive","battery-bank","salvage-crane"];game.session.fuel=100
	var layout=MMFAssets.json("res://data/machine-spaces.json")
	for id in ["quiet-drive","battery-bank","salvage-crane"]:
		var bay=layout.bays[id];var piece=game.session.create_piece(id,bay.cell,int(bay.rotation),{},true)
		game.building.add_visual(piece);pieces[id]=piece
	game.session.update_power();game.world.switchgear.update(.25,game.session)
	camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	for id in ["quiet-drive","battery-bank"]:
		var center=game.building.center(pieces[id].cell)
		await capture(id+"-service",center+Vector3(1.65,1.30,2.2),center+Vector3(0,.65,0),43)
		await capture(id+"-reverse",center+Vector3(-1.65,1.40,-2.2),center+Vector3(0,.65,0),43)
		await capture(id+"-context",center+Vector3(5.3,2.05,3.5),center+Vector3(0,.75,0),62)
	var crane_center=game.building.center(pieces["salvage-crane"].cell)
	await capture("salvage-crane-service",crane_center+Vector3(-3,1.9,1.5),crane_center+Vector3(0,1.05,0),48)
	await capture("salvage-crane-outboard",crane_center+Vector3(3.2,1.9,-1.5),crane_center+Vector3(0,1.05,0),48)
	await capture("salvage-crane-context",Vector3(7,19,1),crane_center+Vector3(0,1.05,0),58)
	await capture("salvage-crane-deployed-jib",Vector3(11.5,19.1,-.2),Vector3(11.7,17.55,-4),55)
	game.player.position=MMFMachineSpaces.bay_service("salvage-crane")+Vector3.UP*.06
	for c in game.salvage.crates:c.active=false;c.node.hide()
	for bag in game.session.containers():bag.slots.fill(null)
	for frame in 3:await physics_frame
	operation.spawned=game.salvage.spawn_heavy(Vector3(20,2,-4))
	var cargo=game.salvage.crates.filter(func(c):return c.active and c.heavy)[0]
	operation.groundedAt=MMFAssets.dict_v(cargo.node.position)
	operation.realCargoVisible=not MMFAssets.of_type(cargo.heavyModel,"MeshInstance3D").is_empty()
	operation.powered=game.session.powered.get(pieces["salvage-crane"].instanceId,false)
	operation.aboard=game.aboard()
	operation.available=MMFNativeProgression.available(game.session,"salvage-crane")
	operation.cableClear=game.salvage.crane_cable_clear(game.salvage.crane_tip(pieces["salvage-crane"]),cargo.node.position+Vector3.UP*.45)
	operation.captured=game.salvage.operate_crane(pieces["salvage-crane"])
	game.salvage.update_cranes(1.0/60.0)
	operation.liveCable=game.salvage.crane_cables.has(pieces["salvage-crane"].instanceId)
	await capture("salvage-crane-ground-catch",Vector3(25,18.5,9),Vector3(15,10.5,-4),61)
	await capture("salvage-crane-live-fairlead",Vector3(13.5,19.0,-1.4),Vector3(12.65,18.25,-4),48)
	for step in 180:game.salvage.update_cranes(1.0/60.0)
	await capture("salvage-crane-mid-hoist",Vector3(21,18,5),Vector3(14.7,14,-4),58)
	for step in 1200:
		if not cargo.active:break
		game.salvage.update_cranes(1.0/60.0)
	operation.delivered=not cargo.active and game.session.count_resource("scrap")==48 and game.session.count_resource("components")==8 and game.session.count_resource("fuel")==4
	if not operation.captured or not operation.liveCable or not operation.delivered or not operation.realCargoVisible:failures.append("Actual grounded cargo must visibly catch, hoist and deliver its exact resources")
	var legacy=MMFNativeProgression.model("salvage-crane");game.add_child(legacy);legacy.position=Vector3(6,16.03,-4)
	MMFNativeProgression.configure_model(legacy,{"definitionId":"salvage-crane"})
	await capture("salvage-crane-legacy-folded",Vector3(3,17.85,-2),Vector3(6,17.05,-4),49)
	legacy.queue_free()
	var report={"passed":failures.is_empty(),"failures":failures,"captures":captures,"operation":operation,"fixture":"Three recovered module models instantiated solely for native visual inspection; no claim of earned purchase.","glbSha256":FileAccess.get_sha256("res://art/nomad-recovered-modules.glb"),"sourceHash":MMFPlaytestRecorder.source_fingerprint(),"renderer":RenderingServer.get_video_adapter_name(),"humanAcceptance":false}
	var file=FileAccess.open(out+"recovered-module-captures.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)
