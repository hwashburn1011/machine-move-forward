extends SceneTree
var game
var checks=0
var failures=[]
var observed={}
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-loot-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func frames(count=2):
	for i in count:await physics_frame
func clear_loot():
	for item in game.combat.loot:item.node.queue_free()
	game.combat.loot.clear();game.combat.loot_view.clear();game.ui.loot_readout.clear();await process_frame
func drop(id="scrap",count=10,at=Vector3(50,16.04,0)):
	game.combat.drop_loot(at,id,count);game.combat.loot_view.update();return game.combat.loot.back()
func instances() -> int:
	var total=0
	for batch in game.combat.loot_view.batches.values():total+=batch.multimesh.visible_instance_count
	return total
func capture(name):
	if DisplayServer.get_name()=="headless":return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/loot-feedback-"+name+".png"))

func art():
	var kit=MMFAssets.scene("res://art/recovered-supplies.glb")
	for id in MMFLootView.MODELS:
		var source=MMFAssets.find_named(kit,MMFLootView.MODELS[id]);var mesh: ArrayMesh=source.mesh
		var tris=0;var collapsed=0;var bottom=INF
		for s in mesh.get_surface_count():
			var a=mesh.surface_get_arrays(s);var v=a[Mesh.ARRAY_VERTEX];var indices=a[Mesh.ARRAY_INDEX];tris+=indices.size()/3
			for p in v:bottom=minf(bottom,p.y)
			for t in range(0,indices.size(),3):
				if (v[indices[t+1]]-v[indices[t]]).cross(v[indices[t+2]]-v[indices[t]]).length_squared()<1e-24:collapsed+=1
		check(tris>5000 and tris<20000 and collapsed==0,id+" keeps detailed imported geometry below 20000 triangles without collapsed faces")
		check(absf(bottom)<.0001 and source.transform.is_equal_approx(Transform3D.IDENTITY),id+" is authored at its actual supporting base, with an identity instance transform")
		check(game.combat.loot_view.batches[id].multimesh.mesh==mesh,id+" batch reuses the original mesh, materials and imported LODs")
		observed[id]={"triangles":tris,"collapsed":collapsed,"surfaces":mesh.get_surface_count()}
	check(MMFAssets.of_type(kit,"Light3D").is_empty() and MMFAssets.of_type(kit,"CollisionObject3D").is_empty(),"Kit adds no persistent lights or blocking physics")
	kit.free()

func placement():
	var rng=game.session.rng.state;var a=drop();var b=drop("components",2);var c=drop("fuel",3)
	check(game.session.rng.state==rng,"Presentation consumes none of the seeded reward/director RNG")
	check(instances()==3 and game.combat.loot.size()==3,"Three overlapping logical drops produce three distinct recoverable models")
	for item in [a,b,c]:
		check(not item.view.is_empty() and absf(item.view.world.origin.y-16.001)<.002,item.id+" rests on the physical floor")
		for other in [a,b,c]:
			if item==other:continue
			check(not (item.view.world*MMFLootView.FOOTPRINT).intersects(other.view.world*MMFLootView.FOOTPRINT),item.id+" does not interpenetrate "+other.id)
	var rebuilds=game.combat.loot_view.rebuilds
	for i in 120:game.combat.loot_view.update()
	check(game.combat.loot_view.rebuilds==rebuilds,"Stationary supplies do not rebuild instance buffers every frame")
	game.combat.drop_loot(Vector3.ZERO,"scrap",0);game.combat.drop_loot(Vector3.ZERO,"invalid",10)
	check(game.combat.loot.size()==3,"Empty and unknown reward records create no pickups")
	await clear_loot()
	var platform=MMFAssets.box(game,Vector3(2,.2,2),Vector3(55,18,0));await frames()
	a=drop("scrap",4,Vector3(55,18.15,0));var original=a.node.global_position;var model=a.view.world
	platform.position+=Vector3(0,0,1);await frames();game.combat.loot_view.update()
	check(a.node.global_position.distance_to(original+Vector3(0,0,1))<.001 and a.view.world.origin.distance_to(model.origin+Vector3(0,0,1))<.001,"Pickup and model follow a translated supporting platform together")
	platform.rotation.y=.4;await frames();game.combat.loot_view.update()
	check(a.view.world.basis.is_equal_approx(platform.global_basis),"Supply orientation follows a turning support")
	platform.queue_free();await frames();game.combat.loot_view.update()
	check(not a.view.is_empty() and absf(a.view.world.origin.y-16.001)<.002 and a.node.position.y<16.25,"Removed support settles supplies onto the lower real floor")
	await clear_loot()
	for at in [Vector3(-12,10.5,0),Vector3(-12,14.2,0),Vector3(8,16.08,8),Vector3(8,12.5,8),Vector3(8,8.9,8)]:
		a=drop("scrap",1,at)
		check(not a.view.is_empty(),"Real machine stair/deck accepts a supported drop at "+str(at))
		if not a.view.is_empty():
			var pose=a.view.world;var hit=game.raycast(pose.origin+Vector3.UP*.02,pose.origin-Vector3.UP*.04,[],1)
			check(not hit.is_empty() and hit.normal.y>.65,"Real machine model remains in contact with its supporting surface")
	await clear_loot()
	for i in 36:drop("scrap",1)
	check(game.combat.loot.size()==36 and instances()<36,"Crowded identical salvage shares visual piles without deleting logical resources")
	check(game.combat.loot_view.batches.size()==3,"Accumulation never creates a batch/node/material per visible pickup")
	await clear_loot()

func pickup():
	var state=game.session;state.inventory=MMFInventory.new(game.data.ITEMS,1);state.stores.clear()
	var cap=int(game.data.ITEMS.scrap.stackSize);state.inventory.add("scrap",cap-3)
	var item=drop();var center: Vector3=item.node.position
	game.player.teleport(center+Vector3(1.71,0,0));game.combat.update(0)
	check(item.count==10 and state.inventory.count_item("scrap")==cap-3,"Existing 1.7 metre collection radius remains exclusive outside its edge")
	game.player.teleport(center+Vector3(1.69,0,0));game.combat.update(0)
	check(item.count==7 and state.inventory.count_item("scrap")==cap and instances()==1,"Partial collection transfers exactly available room and retains the visible remainder")
	check(game.ui.loot_readout.received=={"scrap":3},"Recovery receipt reports only the amount actually transferred")
	# Use a fixed inspection camera; the native spring arm otherwise repositions
	# its child at each physics tick even when the player controller is frozen.
	game.player.camera.reparent(game);game.player.camera.position=Vector3(50,18.1,3);game.player.camera.look_at(Vector3(50,16.05,0));await frames()
	var ui=game.ui.loot_readout;ui.update(.26)
	check(ui.label.visible and ui.label.text.contains("×7") and ui.label.text.contains("STORAGE FULL"),"Nearby remaining pickup names its actual contents and explains full storage")
	await capture("full-storage")
	var wall=MMFAssets.box(game,Vector3(3,3,.1),Vector3(50,17,1.4));await frames();ui.update(.26)
	check(not ui.label.visible,"Supply readout does not identify loot through a solid wall")
	wall.queue_free();await frames();ui.update(.26)
	game.open_menu("Inventory");var left=ui.receipt_left;ui.update(1)
	check(not ui.label.visible and not ui.receipt.visible and ui.receipt_left==left,"Menus hide pickup feedback and pause its receipt duration")
	game.close_menu();game.cinematic="test";ui.update(.3)
	check(not ui.label.visible and not ui.receipt.visible,"Cutscenes hide pickup feedback")
	game.cinematic="";game.building.selected="floor";ui.update(.3)
	check(not ui.label.visible,"Build placement hides loot labels")
	game.building.selected="";state.stores["test-loot-store"]=MMFInventory.new(game.data.ITEMS,1)
	game.combat.update(0)
	check(game.combat.loot.is_empty() and instances()==0 and state.stores["test-loot-store"].count_item("scrap")==7,"Existing shared storage receives the full remainder, removing the model in the same tick")
	ui.update(.1);check(not ui.label.visible and ui.receipt.text.contains("+7"),"Collected object leaves only an accurate receipt")
	await capture("recovered")
	ui.update(3);check(not ui.receipt.visible,"Receipt expires without replacing a story notification")
	state.stores.clear();state.inventory=MMFInventory.new(game.data.ITEMS,20);await clear_loot()

func persistence():
	game.player.teleport(Vector3(0,16.1,-1));game.session.attack_recent=0;game.session.health=100
	drop("scrap",7,Vector3(8,16.1,8));drop("components",2,Vector3(8,16.1,8))
	var expected=game.combat.loot_view.snapshot()
	check(game.save_game("loot-checkpoint"),"Safe manual checkpoint saves uncollected earned supplies")
	var saved=MMFSaves.read("loot-checkpoint")
	var exact=saved.get("loot",[]).size()==expected.size()
	for i in expected.size():
		exact=exact and saved.loot[i].id==expected[i].id and saved.loot[i].count==expected[i].count and MMFAssets.v(saved.loot[i].position)==MMFAssets.v(expected[i].position)
	check(exact,"Written checkpoint retains every remaining resource ID, amount and native vector anchor")
	var snapshot=JSON.stringify(game.session.native_snapshot());var live_nodes=game.combat.loot.map(func(e):return e.node)
	for invalid in [null,{},[{"id":"scrap","count":-1,"position":{"x":0,"y":16,"z":0}}],[{"id":"invalid","count":2,"position":{"x":0,"y":16,"z":0}}],[{"id":"fuel","count":1.5,"position":{"x":0,"y":16,"z":0}}],[{"id":"scrap","count":1,"position":{"x":NAN,"y":16,"z":0}}]]:
		var payload=saved.duplicate(true);payload.loot=invalid;game.load_payload(payload)
		check(JSON.stringify(game.session.native_snapshot())==snapshot and game.combat.loot.map(func(e):return e.node)==live_nodes,"Malformed loot rejects the entire load without changing live progress or drops")
	game.load_payload(saved);await frames(4)
	for i in 3:game.combat.loot_view.update()
	check(game.combat.loot_view.snapshot()==expected and instances()==2,"Real checkpoint load restores remaining supplies exactly once with visible supported models")
	check(game.ui.loot_readout.received.is_empty(),"Load clears stale pickup receipts")
	var older=saved.duplicate(true);older.erase("loot");game.load_payload(older);await frames()
	check(game.combat.loot.is_empty() and instances()==0,"Older native saves without loot remain valid and clear old instances")
	drop("fuel",3,Vector3(8,16.1,8));game.session.attack_recent=0
	check(game.save_game("autosave"),"Background autosave accepts loose supplies")
	game.autosaver.flush();var auto=MMFSaves.read("autosave")
	check(auto.has("loot") and auto.loot.size()==1 and auto.loot[0].id=="fuel" and auto.loot[0].count==3,"Autosave worker writes the actual remaining fuel stack")
	await clear_loot()

func run():
	root.size=Vector2i(1920,1080)
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false);game.player.set_process(false);game.ui.set_process(false)
	# Initialize transparent damage and conditional overlays before freezing UI.
	game.ui._process(0)
	game.player.teleport(Vector3(62,16.1,0));MMFAssets.box(game,Vector3(24,1,24),Vector3(50,15.5,0))
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	await art();await placement();await pickup();await persistence()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"models":observed}
	var file=FileAccess.open("res://../test-results/godot-native/loot-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("LOOT_FEEDBACK ",report)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit",0 if failures.is_empty() else 1)
