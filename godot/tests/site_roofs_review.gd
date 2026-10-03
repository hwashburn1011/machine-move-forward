extends SceneTree
## Visual fixtures only. Existing authored destinations plus their runtime roof
## assemblies, viewed under the actual game environment with no earned rewards.
const OUT="res://../test-results/roof-floor/native-roofs/"
var game
var camera: Camera3D
var site: Node3D
var images=[]
var failures=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://site-roofs-review/";call_deferred("run")

func set_site(id: String,path: String):
	if is_instance_valid(site):site.free()
	site=Node3D.new();game.add_child(site);site.position=Vector3(20,16.03,0)
	site.add_child(MMFAssets.scene(path));MMFSiteRoofs.attach(site,id)
	await physics_frame;await physics_frame

func capture(name: String,eye: Vector3,target: Vector3,fov: float=65):
	camera.global_position=site.to_global(eye);camera.look_at(site.to_global(target));camera.fov=fov;camera.reset_physics_interpolation()
	for frame in 15:await process_frame
	await RenderingServer.frame_post_draw
	var status=root.get_texture().get_image().save_png(OUT+name+".png")
	if status!=OK:failures.append("Image write failed: "+name)
	images.append({"name":name,"localCamera":str(eye),"localTarget":str(target),"fov":fov})
	print("SITE_ROOF_CAPTURE ",name)

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	DisplayServer.window_set_size(Vector2i(1600,900));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.visual.hide();game.ui.root.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
	game.session.story.phase="locked";game.session.scanner.phase="consumed"
	if game.campaign.destination:game.campaign.destination.queue_free();game.campaign.destination=null
	for particles in MMFAssets.of_type(game.world,"GPUParticles3D"):particles.hide()
	for particles in MMFAssets.of_type(game.effects,"GPUParticles3D"):particles.hide()
	camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	await set_site("relay-foundry","res://assets/models/authored/relay-foundry.glb")
	await capture("foundry-high-roof",Vector3(15,10,-17),Vector3(1.5,2.5,0),58)
	await capture("foundry-loading-entrance",Vector3(-8.7,1.8,0),Vector3(3,3.0,0),77)
	await capture("foundry-player-interior",Vector3(-2.8,1.72,3.8),Vector3(4.5,3.75,-3.0),78)
	await capture("foundry-torn-bay",Vector3(10,9,-10),Vector3(3.6,5.0,-3),58)
	await capture("foundry-eave-folds",Vector3(8.5,5.7,-7.5),Vector3(5,4.95,-4.9),55)
	await capture("foundry-seated-floor",Vector3(-5.5,1.55,2),Vector3(0,.014,0),69)
	await set_site("rooftop-workshop","res://art/native-rooftop-workshop.glb")
	await capture("workshop-rear-canopy",Vector3(-10,8,-12),Vector3(1.2,2.9,-2.5),58)
	await capture("workshop-player-aisle",Vector3(-4.5,1.72,1),Vector3(2.3,2.8,-3.7),74)
	await capture("workshop-clear-upper-bridge",Vector3(-7,5.32,6),Vector3(.5,4.2,3.1),76)
	await capture("workshop-canopy-brackets",Vector3(-.8,3.85,-1.0),Vector3(1.8,4.17,-4.3),62)
	await set_site("quiet-array","res://assets/models/authored/quiet-array.glb")
	await capture("array-vault-seated-cap",Vector3(9,6.5,-2),Vector3(3,3.4,3),58)
	await capture("array-vault-bearing-detail",Vector3(7,3.85,.2),Vector3(4.6,3.61,1.4),50)
	await set_site("glass-orchard","res://assets/models/authored/glass-orchard.glb")
	await capture("orchard-archive-cap",Vector3(13,8,-1),Vector3(5,3.8,-7),58)
	await capture("orchard-archive-bearing-detail",Vector3(10,4.4,-3.5),Vector3(7.3,4.1,-5.5),52)
	await capture("orchard-archive-title",Vector3(5,4.2,-1),Vector3(5,3.88,-5),55)
	await capture("orchard-entry-lettering",Vector3(-2.8,3.6,1.2),Vector3(-5,3.2,-1.6),62)
	await set_site("last-garden-meridian","res://assets/models/authored/last-garden-meridian.glb")
	await capture("meridian-garden-lettering",Vector3(-4.1,3.2,.9),Vector3(-5,2.75,-3.43),59)
	var assets={}
	for path in ["res://assets/models/authored/relay-foundry.glb","res://art/native-rooftop-workshop.glb","res://assets/models/authored/quiet-array.glb","res://assets/models/authored/glass-orchard.glb","res://assets/models/authored/last-garden-meridian.glb","res://assets/models/authored/expedition-wreck.glb"]:assets[path]=FileAccess.get_sha256(path)
	var report={"passed":failures.is_empty(),"failures":failures,"images":images,"baseSiteGlbHashes":assets,"roofManifestSha256":FileAccess.get_sha256(MMFSiteRoofs.DATA),"roofGlbSha256":FileAccess.get_sha256(MMFSiteRoofs.PATH),"foundrySha256":FileAccess.get_sha256("res://assets/models/authored/relay-foundry.glb"),"sourceHash":MMFPlaytestRecorder.source_fingerprint(),"renderer":RenderingServer.get_video_adapter_name(),"fixture":"Visual inspection only; no rewards or progression evidence."}
	var file=FileAccess.open(OUT+"roof-captures.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFSiteRoofs.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)
