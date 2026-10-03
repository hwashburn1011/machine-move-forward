extends SceneTree

var game
var checks=[]
var contracts=[]
var source_start=""

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://construction-crane-delivery/";call_deferred("run")

func frames(count: int=2):
	for i in count:await physics_frame

func run():
	source_start=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.load_payload(game.playtests.payload("scanner"))
	game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	game.session.expedition_gear.recovered=["salvage-crane"];game.session.fuel=100
	var bay=MMFMachineSpaces.bay_candidate("salvage-crane")
	var crane=game.session.create_piece("salvage-crane",bay.cell,bay.rotation,{},true);game.building.add_visual(crane)
	game.player.position=MMFMachineSpaces.bay_service("salvage-crane")+Vector3.UP*.06
	game.session.update_power();await frames()
	for z in [-18.0,-14.0,-4.0,10.0]:
		for c in game.salvage.crates:c.active=false;c.node.hide()
		for bag in game.session.containers():bag.slots.fill(null)
		var spawned=game.salvage.spawn_heavy(Vector3(20,2,z))
		var cargo=game.salvage.crates.filter(func(c):return c.active and c.heavy)[0]
		var ground_gap=INF;var bounds=game.salvage.heavy_bounds
		for x in [bounds.position.x,bounds.end.x]:
			for zz in [bounds.position.z,bounds.end.z]:
				var corner=cargo.node.global_transform*Vector3(x,bounds.position.y,zz)
				ground_gap=minf(ground_gap,corner.y-MMFDunes.height_at(corner.x+game.session.lateral,corner.z-game.session.distance))
		var target=cargo.node.position+Vector3.UP*.45;var tip=game.salvage.crane_tip(crane)
		var hit=game.raycast(tip,target);var probes=[]
		for lead in [.65,1.5,2.0,2.5,3.0,3.5,4.0]:
			var at=game.building.piece_transform(crane)*Vector3(0,2.25,-lead)
			var test=game.raycast(at,target)
			probes.append({"lead":lead,"tip":MMFAssets.dict_v(at),"clear":test.is_empty(),"hit":MMFAssets.dict_v(test.position) if not test.is_empty() else {}})
		var captured=game.salvage.operate_crane(crane)
		for i in 1200:
			if not cargo.active:break
			game.salvage.update_cranes(1.0/60.0)
		var delivered=not cargo.active and game.session.count_resource("scrap")==48 and game.session.count_resource("components")==8 and game.session.count_resource("fuel")==4
		checks.append({"z":z,"spawned":spawned,"ground_y":target.y-.45,"ground_gap_m":ground_gap,"real_heavy_meshes":MMFAssets.of_type(cargo.heavyModel,"MeshInstance3D").size(),"tip":MMFAssets.dict_v(tip),"hit":MMFAssets.dict_v(hit.position) if not hit.is_empty() else {},"collider":str(hit.collider.get_path()) if not hit.is_empty() else "","captured":captured,"delivered":delivered,"lead_probes":probes})
		print("CRANE_GROUND ",JSON.stringify(checks.back()))
	game.salvage.spawn_heavy(Vector3(20,2,-4))
	var blocked_load=game.salvage.crates.filter(func(c):return c.active and c.heavy)[0]
	var middle=game.salvage.crane_tip(crane).lerp(blocked_load.node.position+Vector3.UP*.45,.5)
	var obstacle=MMFAssets.collider(game.world,{"position":MMFAssets.dict_v(middle),"half":{"x":.5,"y":.5,"z":.5}})
	await frames()
	var before=game.session.native_snapshot();var refused=not game.salvage.operate_crane(crane)
	contracts.append({"label":"Real solid blocks the cable without claiming or transacting cargo","passed":refused and blocked_load.claimed=="" and blocked_load.contents=={"scrap":48,"components":8,"fuel":4} and preload("res://tests/wrist_receipt_contract.gd").same_campaign(before,game.session.native_snapshot())})
	obstacle.queue_free();blocked_load.active=false;blocked_load.node.hide();await frames()
	var old={"definitionId":"salvage-crane","cell":{"x":4,"y":0,"z":-2},"rotation":0}
	contracts.append({"label":"Off-bay legacy crane retains original tip and exact original collider list","passed":MMFMachineSpaces.crane_tip_local(old)==Vector3(0,2.25,-.65) and MMFMachineSpaces.piece_colliders(old,game.runtime)==game.runtime.pieceColliders["salvage-crane"]})
	contracts.append({"label":"Only connected D3 instance receives two jib collider boxes","passed":MMFMachineSpaces.piece_colliders(crane,game.runtime).size()==game.runtime.pieceColliders["salvage-crane"].size()+2})
	contracts.append({"label":"Cable still rejects actual dune penetration after excluding the flat safety proxy","passed":not game.salvage.crane_cable_clear(Vector3(20,10,-4),Vector3(20,-8,-4))})
	game.player.position=Vector3(-6,8.89,-6);game.salvage.park_crate(blocked_load)
	var parked_bottom=blocked_load.node.position.y+game.salvage.heavy_bounds.position.y
	contracts.append({"label":"Heavy parking uses its own mesh base with 20 mm deck contact clearance","passed":absf(parked_bottom-(8.83+.02))<.002,"bottom":parked_bottom})
	var passed=checks.all(func(c):return c.spawned and c.captured and c.delivered and c.real_heavy_meshes>0 and c.ground_gap_m>=0 and c.ground_gap_m<.03) and contracts.all(func(c):return c.passed)
	var report={"passed":passed,"checks":checks,"contracts":contracts,"source_hash":source_start,"source_hash_end":MMFPlaytestRecorder.source_fingerprint(),"scope":"Synthetic compiled-native spawn_heavy / operate_crane / transfer probe; 60 Hz direct automation steps, not normal-clock campaign play"}
	var f=FileAccess.open("res://../test-results/deck-audio/crane-ground-delivery.json",FileAccess.WRITE);f.store_string(JSON.stringify(report,"  "));f.close()
	while game.combat.nav.is_baking():await process_frame
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if passed else 1)
