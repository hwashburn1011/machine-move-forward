extends SceneTree

var game

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://machine-space-probe/"
	call_deferred("run")

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	for i in 3:await physics_frame
	var rows=[]
	for level in [-2,-1,0]:
		for x in range(-5,6):
			for z in range(-6,7):
				var id="salvage-crane" if level==0 else "battery-bank" if level==-1 else "quiet-drive"
				var cell={"x":x,"y":level,"z":z};var spec={"definitionId":id,"cell":cell,"rotation":0}
				var at=game.building.center(cell);var supported=true
				for delta in [Vector3.ZERO,Vector3(-.65,0,-.62),Vector3(.65,0,-.62),Vector3(-.65,0,.62),Vector3(.65,0,.62)]:
					var hit=game.raycast(at+delta+Vector3.UP*.15,at+delta-Vector3.UP*.2)
					if hit.is_empty() or hit.normal.y<.65:supported=false
				var hits=[]
				for part in game.building.build_preview.clearance_shapes(id):
					var query=PhysicsShapeQueryParameters3D.new();query.shape=part.shape;query.transform=game.building.piece_transform(spec)*part.transform;query.collision_mask=1
					for hit in game.get_world_3d().direct_space_state.intersect_shape(query,16):
						var name=str(hit.collider.get_path())
						if name not in hits:hits.append(name)
				rows.append({"cell":cell,"at":MMFAssets.dict_v(at),"supported":supported,"blocked":game.building.blocked(cell),"hits":hits})
	var report={"source_hash":MMFPlaytestRecorder.source_fingerprint(),"rows":rows,"engineering":game.engineering.anchors.map(func(at):return MMFAssets.dict_v(at)),"helm":MMFAssets.dict_v(game.world.helm_model.root.global_position),"crate_bounds":{"position":MMFAssets.dict_v(game.salvage.crate_bounds.position),"size":MMFAssets.dict_v(game.salvage.crate_bounds.size)}}
	var path="res://../test-results/deck-audio/space-probe.json"
	var f=FileAccess.open(path,FileAccess.WRITE);f.store_string(JSON.stringify(report,"  "));f.close()
	print("MACHINE_SPACE_PROBE_COMPLETE ",rows.size())
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit()
