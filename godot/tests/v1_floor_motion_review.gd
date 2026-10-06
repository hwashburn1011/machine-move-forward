extends "res://tests/floor_surface_review.gd"
## Journal follow-up: shallow moving views across permanent decks and all sites.
## Prepared scenes, not campaign progression, performance timing or human play.

func _initialize():
	super._initialize()
	output="res://../test-results/v1-journal-2026-10-05/floors/"
	if label=="before":label="current"
	MMFSaves.DIRECTORY="user://v1-floor-motion/"

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
		await clip("deck%d-bare"%(level+3),Vector3(6,y+.58,-10) if level<0 else Vector3(10,y+.58,3),Vector3(5,y,-4) if level<0 else Vector3(8,y,0),Vector3(1.6,0,1))
		await clip("deck%d-port-landing"%(level+3),Vector3(-13.8,y+.55,-6),Vector3(-12.25,y,-3.7),Vector3(.65,0,.35))
		var piece=game.session.create_piece("floor",{"x":4,"y":level,"z":0},0,{},true)
		game.building.add_visual(piece)
		await clip("deck%d-constructed-overlay"%(level+3),Vector3(10,y+.55,3),Vector3(8,y,0),Vector3(.6,0,.55))
	for id in ["wake","foundry","array","orchard-caretaker","meridian-quiet","workshop","finale-transfer"]:
		await prepare(id)
		var site=game.campaign.destination
		if id=="workshop":site=game.opportunities.survivor_site.site
		elif id=="finale-transfer":site=game.finale.berth
		assert(is_instance_valid(site),"Missing floor review site: "+id)
		# The Orchard planter occludes a low inspection camera; look down into its aisle.
		var at=Vector3(-4,2.2,3.8) if id=="orchard-caretaker" else Vector3(-4,.65,3.8)
		await clip(id+"-floor",site.to_global(at),site.to_global(Vector3(0,0,-.4)),Vector3(1.4,0,-.4))
	var report={"source_hash":MMFPlaytestRecorder.source_fingerprint(),"renderer":RenderingServer.get_video_adapter_name(),"resolution":[1280,720],"quality":"High Forward+ 4x MSAA; original near/far and depth settings","records":records,"scope":"Static prepared worlds with moving shallow cameras. Stocked constructed caps on all three permanent decks. JPEG readback affects timing. Clips are visual evidence only; no campaign or performance claim."}
	var file=FileAccess.open(output+label+"/capture.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache();MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0)
