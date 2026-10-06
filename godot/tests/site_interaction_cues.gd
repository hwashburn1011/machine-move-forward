extends SceneTree

var output="res://../test-results/v1-presentation-2026-10-05/interactions/"
var game
var checks=0
var failures=[]
var captures=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://presentation-cue-fixtures/"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):output=arg.trim_prefix("--out=").trim_suffix("/")+"/"
	call_deferred("run")

func check(ok: bool,note: String):
	checks+=1
	if not ok:failures.append(note);print("FAIL ",note)

func labels() -> Array:
	var result=[]
	for p in game.campaign.points:result.append(p.label)
	for p in game.opportunities.points:result.append(p.label)
	if is_instance_valid(game.finale.berth):
		for p in game.finale.berth.points:result.append(p.label)
	return result

func full_labels() -> Array:
	return labels().filter(func(l):return l.visible and l.text!=MMFSiteInteractionCues.MARKER)

func capture(id: String,at: Vector3,target: Vector3):
	if DisplayServer.get_name()=="headless":return
	var camera=Camera3D.new();root.add_child(camera);camera.position=at;camera.look_at(target);camera.make_current()
	for i in 6:await process_frame
	await RenderingServer.frame_post_draw
	var path=output+id+".png";root.get_texture().get_image().save_png(path);captures.append(path)
	camera.queue_free()

func run():
	var source_start=MMFPlaytestRecorder.source_fingerprint()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,810));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	for id in ["wake","foundry","array","orchard-caretaker","meridian-quiet","workshop","finale-transfer"]:
		check(game.playtests.launch(id),"Checkpoint loads: "+id)
		game.close_menu();game.cinematic="";game.player.set_physics_process(false)
		var site=game.campaign.destination;var points=game.campaign.points
		if id=="workshop":site=game.opportunities.site;points=game.opportunities.points
		elif id=="finale-transfer":site=game.finale.berth;points=site.points
		game.player.teleport(site.to_global(Vector3(-5,0,4)))
		game.update_interaction(0)
		check(full_labels().size()<=1,"One full action maximum at arrival: "+id)
		await capture(id+"-arrival",site.to_global(Vector3(-4,1.8,3.8)),site.to_global(Vector3(0,1,-.4)))
		var visited=0
		var captured_selected=false
		for p in points:
			var offset=.6 if p.has("entry") else .7 if id=="workshop" else 0.0
			game.player.teleport(site.to_global(p.at)-Vector3.UP*offset)
			game.update_interaction(0)
			var selected=game.interaction_target()
			check(full_labels().size()<=1,"Adjacent target arbitration: "+id+"/"+str(visited))
			if selected.get("kind","") in ["campaign","optional","finale","service-bay"]:
				check(full_labels().size()==1,"Usable site target receives a full label: "+id+"/"+str(visited))
				check(game.interaction_prompt==game.hint(selected.text),"HUD agrees with actual Use target: "+id+"/"+str(visited))
				if not captured_selected:
					await capture(id+"-selected",site.to_global(p.at+Vector3(-2,1.8,3)),site.to_global(p.at+Vector3(0,.7,0)))
					captured_selected=true
			visited+=1
		var before=game.session.native_snapshot();var rng=game.session.rng.state
		MMFSiteInteractionCues.update(game,game.interaction_target())
		check(before==game.session.native_snapshot() and rng==game.session.rng.state,"Presentation does not mutate progression, supplies or RNG: "+id)
		game.open_menu("Inventory");MMFSiteInteractionCues.update(game,{})
		check(labels().all(func(l):return not l.visible),"Reader hides world cues: "+id)
		game.close_menu();game.building.selected="floor";game.update_interaction(0)
		check(labels().all(func(l):return not l.visible),"Placement hides competing cues: "+id)
		game.building.selected="";game.cinematic="review";MMFSiteInteractionCues.update(game,{})
		check(labels().all(func(l):return not l.visible),"Cinematic hides cues: "+id);game.cinematic=""
	# Completed pickups disappear without requiring removal of their physical prop.
	game.playtests.launch("foundry");game.close_menu()
	var pickup=game.campaign.points.filter(func(p):return p.entry.kind=="unique")[0]
	game.session.story.uniques.append(pickup.entry.factId);game.update_interaction(0)
	check(not pickup.label.visible,"Completed unique pickup has no stale marker")
	var source_end=MMFPlaytestRecorder.source_fingerprint()
	check(source_start==source_end,"Runtime stayed frozen during this review")
	var report={"checks":checks,"failures":failures,"captures":captures,"source_hash":source_start,"source_hash_end":source_end,"scope":"Prepared interaction fixtures. No human discovery or earned campaign claim."}
	var mode="headless" if DisplayServer.get_name()=="headless" else "native"
	var file=FileAccess.open(output+mode+".json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	print("SITE_CUES ",checks," checks; failures=",failures.size());quit(0 if failures.is_empty() else 1)
