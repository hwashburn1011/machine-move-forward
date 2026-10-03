extends SceneTree

var game
var checks=0
var failures=[]
var placements=[]
var camera: Camera3D
var captures=false

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://art200-story-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count=3):
	for i in count:await physics_frame

func capture(id: String,site: Node3D):
	if not captures:return
	camera.position=site.to_global(Vector3(-12,11,15));camera.look_at(site.to_global(Vector3(0,.8,0)))
	await frames(6);await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://../assets/art200/story/review/native-"+id+".png")

func clear_of_new_art(group: Node3D,at: Vector3) -> bool:
	var query=PhysicsShapeQueryParameters3D.new();query.shape=game.player.capsule_shape
	query.transform=Transform3D(Basis.IDENTITY,at+Vector3.UP*1.06);query.collision_mask=1
	for hit in game.get_world_3d().direct_space_state.intersect_shape(query,64):
		if group.is_ancestor_of(hit.collider):return false
	return true

func inspect_group(site: Node3D,group: Node3D,id: String):
	for model in group.get_children():
		var entry=MMFArt200Story.entries[model.get_meta("art200_id")]
		var bounds=MMFAssets.bounds(model)
		var exclude=[]
		for body in MMFAssets.of_type(model,"PhysicsBody3D"):exclude.append(body.get_rid())
		var support=true
		# Centre and complete assembly footprint must stay on actual floor.
		for xz in [Vector2.ZERO,Vector2(bounds.position.x,bounds.position.z),Vector2(bounds.end.x,bounds.position.z),Vector2(bounds.position.x,bounds.end.z),Vector2(bounds.end.x,bounds.end.z)]:
			var from=model.to_global(Vector3(xz.x,.012,xz.y));var hit=game.raycast(from,from-Vector3.UP*.08,exclude,1)
			support=support and not hit.is_empty() and site.is_ancestor_of(hit.collider) and absf(hit.position.y-site.global_position.y)<.005
		check(support,entry.id+" complete footprint is supported by "+id+" deck within 5 mm")
		check(absf(bounds.position.y)<.015 and model.is_visible_in_tree(),entry.id+" is visible with grounded manufactured feet")
		check(MMFAssets.of_type(model,"CollisionShape3D").size()==entry.collision_shapes.size(),entry.id+" uses every authored physical primitive")
		var overlaps=[]
		for collision in MMFAssets.of_type(model,"CollisionShape3D"):
			var shape=collision.shape.duplicate()
			if shape is BoxShape3D:shape.size*=.98
			elif shape is CylinderShape3D:shape.radius*=.98;shape.height*=.98
			elif shape is SphereShape3D:shape.radius*=.98
			var query=PhysicsShapeQueryParameters3D.new();query.shape=shape;query.transform=collision.global_transform;query.collision_mask=1;query.margin=.0001;query.exclude=exclude
			for hit in game.get_world_3d().direct_space_state.intersect_shape(query,32):
				var path=String(hit.collider.get_path())
				if path not in overlaps:overlaps.append(path)
		check(overlaps.is_empty(),entry.id+" physical assembly does not intersect other site equipment "+str(overlaps))
		placements.append({"id":entry.id,"site":id,"position":MMFAssets.dict_v(model.position),"rotation_y":model.rotation.y,"dimensions_m":MMFAssets.dict_v(bounds.size),"shapes":entry.collision_shapes.size()})
		if entry.has("clear_opening_m"):
			var open=true
			for i in range(-7,8):
				for x in [-.45,0.0,.45]:open=open and game.player.boundary.fits(model.to_global(Vector3(x,.06,i*.20)))
			check(open,entry.id+" continuous opening clears the actual S-07 capsule")
			var beam=game.raycast(model.to_global(Vector3(0,3.3,0)),model.to_global(Vector3(0,2.3,0)),[],1)
			check(not beam.is_empty() and model.is_ancestor_of(beam.collider),entry.id+" physical top beam remains present above the walkable opening")

func run():
	var manifest=MMFAssets.json(MMFArt200Story.MANIFEST)
	check(manifest.models.size()==25,"Exactly 25 complete new story model assemblies")
	var families={};var ids={}
	for entry in manifest.models:
		ids[entry.id]=true;families[entry.paint_family]=true
		var model=MMFArt200Story.part(entry.id);var bounds=MMFAssets.bounds(model)
		check(entry.status=="new" and entry.id.begins_with("Story2"),entry.id+" has a distinct new assembled-model identity")
		check(bounds.size.distance_to(MMFAssets.v(entry.dimensions_m))<.008,entry.id+" native dimensions match measured Blender metres")
		check(absf(bounds.position.y)<.015,entry.id+" floor origin is grounded")
		var meshes=MMFAssets.of_type(model,"MeshInstance3D");var all_ready=not meshes.is_empty()
		for mesh in meshes:
			for i in mesh.mesh.get_surface_count():
				var material=mesh.get_active_material(i)
				all_ready=all_ready and material!=null
		check(all_ready and meshes.size()==entry.runtime_meshes,entry.id+" has complete native geometry and materials in controlled batches")
		var second=MMFArt200Story.part(entry.id)
		check(MMFAssets.of_type(second,"MeshInstance3D")[0].mesh==meshes[0].mesh,entry.id+" repeated placements share mesh resources")
		second.free();model.free()
	check(ids.size()==25 and families.size()>=8,"All 25 identities are unique and at least eight muted families are represented")
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	await frames(8);game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false)
	captures=DisplayServer.get_name()!="headless"
	if captures:
		DisplayServer.window_set_size(Vector2i(1440,960));game.ui.root.hide();game.player.hide();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
		camera=Camera3D.new();game.add_child(camera);camera.current=true;camera.fov=56
	for index in 5:
		game.session.story.index=index;game.session.story.phase="docked";game.session.story.arrival=game.session.distance
		game.campaign.create_destination(game.campaign.expedition());await frames(4)
		var site=game.campaign.destination
		# Root integrates the same helper in campaign. Idempotence protects reloads.
		MMFArt200Story.decorate_destination(game);await frames(3)
		var group=site.get_node("Art200Destination")
		check(group.get_child_count()==MMFArt200Story.SITES[game.campaign.destination_id].size(),game.campaign.destination_id+" places exactly its authored story set")
		inspect_group(site,group,game.campaign.destination_id)
		for point in game.campaign.points:
			var at=site.to_global(Vector3(point.at.x,0,point.at.z+1))
			check(clear_of_new_art(group,at),"Existing interaction approach remains open: "+point.entry.id)
		for x in range(-5,2):check(clear_of_new_art(group,site.to_global(Vector3(x,.06,0))),game.campaign.destination_id+" entrance aisle remains clear at "+str(x))
		await capture(game.campaign.destination_id,site)
	game.campaign.destination.queue_free();game.campaign.destination=null
	game.session.story.phase="finale-docked";game.session.finale.stage="berth";game.session.finale.berth_distance=game.session.distance
	var berth=MMFMeridianBerth.new();game.finale.berth=berth;game.add_child(berth);berth.setup(game)
	MMFArt200Story.decorate_berth(berth);await frames(4)
	var group=berth.get_node("Art200Berth")
	check(group.get_child_count()==3,"Receiving berth adds only three civic assemblies to its existing equipment")
	inspect_group(berth,group,"meridian-berth")
	for point in berth.points:check(clear_of_new_art(group,berth.to_global(point.at+Vector3(0,.06,.4))),"Receiving berth interaction stays open: "+point.id)
	for x in range(-6,3):check(clear_of_new_art(group,berth.to_global(Vector3(x,.06,0))),"Receiving berth central aisle remains clear at "+str(x))
	check(placements.size()==25,"All 25 new story assemblies are deployed in playable locations")
	await capture("receiving-berth",berth)
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"native_captures":captures,"placements":placements,"source_hash":MMFPlaytestRecorder.source_fingerprint()}
	var file=FileAccess.open("res://../assets/art200/story/native-validation.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("ART200_STORY_RESULT ",checks," checks, ",failures.size()," failures")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFArt200Story.clear_cache();MMFArt100Story.clear_cache();MMFArt100RobotDetails.clear_cache();MMFAssets.cache.clear()
	await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
