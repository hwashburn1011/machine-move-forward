extends SceneTree
const OUT="res://../test-results/site-grounding/native/"
var game
var camera: Camera3D
var site: Node3D
var images=[]
var failures=[]

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://site-grounding-review/";call_deferred("run")

func capture(id: String,suffix: String,eye: Vector3,target: Vector3,fov: float=59):
	camera.global_position=site.to_global(eye);camera.look_at(site.to_global(target));camera.fov=fov;camera.reset_physics_interpolation()
	for frame in 12:await process_frame
	await RenderingServer.frame_post_draw
	var name=id+"-"+suffix
	if root.get_texture().get_image().save_png(OUT+name+".png")!=OK:failures.append(name)
	images.append({"id":id,"name":name,"localEye":str(eye),"localTarget":str(target),"fov":fov})
	print("GROUNDING_CAPTURE ",name)

func views(id: String):
	for label in MMFAssets.of_type(site,"Label3D"):label.hide()
	await physics_frame;await physics_frame
	await capture(id,"side",Vector3(-23,-5,23),Vector3(0,-5.4,0),61)
	await capture(id,"footing",Vector3(18,-12.8,20),Vector3(0,-11.4,0),62)

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	DisplayServer.window_set_size(Vector2i(1600,1000));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.visual.hide();game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	game.session.story.phase="docked";game.session.distance=2400;game.session.lateral=31.0;game.session.story.arrival=2400
	game.world.terrain_material.set_shader_parameter("distance_m",game.session.distance)
	game.world.terrain_material.set_shader_parameter("lateral_m",game.session.lateral)
	# The isolated side proof explicitly exposes the complete lower building;
	# the existing machine would obscure the west facade from this camera.
	game.world.machine.hide()
	game.building.hide()
	for part in game.building.get_children():print("GROUNDING_ISOLATION_HIDDEN_STARTER ",part.get_path())
	for chunk in game.world.chunks.values():chunk.hide()
	for particles in MMFAssets.of_type(game.world,"GPUParticles3D"):particles.hide()
	for particles in MMFAssets.of_type(game.effects,"GPUParticles3D"):particles.hide()
	camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	for i in 5:
		game.session.story.index=i;game.campaign.create_destination(game.data.STORY_EXPEDITIONS[i]);site=game.campaign.destination
		await views(game.data.STORY_EXPEDITIONS[i].id)
	game.campaign.destination.free();game.campaign.destination=null
	for kind in ["fuel-cache","salvage-wreck","memorial","repair-depot","friendly-refuge","rooftop-workshop","gear-salvage-crane","gear-battery-bank","gear-quiet-drive","mission-stranded-courier","mission-roof-supplies","mission-quiet-watch"]:
		game.session.contacts.active={"id":"grounding-review-"+kind,"slot":1,"kind":kind,"state":"docked","atDistanceM":2400.0,"worldX":31.0,"expiresAtM":2600.0,"step":"task-ready","rewards":{},"record":false,"salvageMode":""}
		game.opportunities.create_site();site=game.opportunities.site
		await views(kind)
	game.opportunities.site.free();game.opportunities.site=null
	var berth=MMFMeridianBerth.new();game.add_child(berth);game.session.finale.berth_distance=2400;berth.setup(game);site=berth
	await views("receiving-berth");berth.free()
	site=Node3D.new();game.add_child(site);site.add_child(MMFAssets.scene("res://art/opening-rooftop.glb"));MMFSiteGrounding.attach(site,"opening-rooftop",game)
	await capture("opening-rooftop","side",Vector3(-7,8,23),Vector3(19.5,9,0),62)
	await capture("opening-rooftop","footing",Vector3(5,3,12),Vector3(19.5,1,0),62);site.free()
	site=MMFAssets.scene("res://assets/models/authored/meridian-horizon.glb");game.add_child(site);site.position=Vector3(110,0,-220);site.rotation.y=PI
	MMFSiteGrounding.attach(site,"meridian-horizon",game)
	await capture("meridian-horizon","side",Vector3(-75,26,-84),Vector3(0,14,0),59)
	await capture("meridian-horizon","footing",Vector3(42,4,-39),Vector3(8,1,0),64);site.free()
	# One true upper-deck arrival view keeps the Nomad and original gangway in
	# shot; new architecture stays entirely below that walking surface.
	game.world.machine.show();game.building.show();game.session.story.index=1;game.campaign.create_destination(game.data.STORY_EXPEDITIONS[1]);site=game.campaign.destination
	await capture("relay-foundry","nomad-approach",Vector3(-14,2.3,7),Vector3(1,1.8,0),76)
	var manifest=MMFAssets.json(MMFSiteGrounding.DATA)
	var report={"passed":failures.is_empty(),"failures":failures,"images":images,"fixture":"Actual production campaign/optional/berth dispatch. Isolated low views hide world.machine plus its separate MMFBuilding starter/player-piece presentation to expose footing contact. No site-attached part is hidden. Final approach restores both Nomad branches.","sourceHash":MMFPlaytestRecorder.source_fingerprint(),"glbSha256":manifest.sha256,"manifestSha256":FileAccess.get_sha256(MMFSiteGrounding.DATA),"terrain":{"distance":game.session.distance,"lateral":game.session.lateral},"renderer":RenderingServer.get_video_adapter_name()}
	var file=FileAccess.open(OUT+"captures.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFSiteGrounding.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)
