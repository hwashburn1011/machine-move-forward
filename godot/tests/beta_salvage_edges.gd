extends "res://tests/beta_salvage.gd"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-beta-salvage-edge-tests/";call_deferred("run")

func run():
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	await physics_frame;await physics_frame
	var s=game.session;var a=game.salvage.automation
	var probe=a.PORT_AT+Vector3(0,.9,0)
	var hidden_hit=game.raycast(probe+Vector3.RIGHT*.9,probe+Vector3.RIGHT*.55,[],1)
	check(hidden_hit.is_empty(),"Unrepaired arm has no invisible replacement-pedestal contact")
	if not hidden_hit.is_empty():print("HIDDEN_PEDESTAL ",hidden_hit.collider.get_path()," ",hidden_hit.position)
	s.speed=0;s.scanner.phase="installed";s.facts.salvage=true;s.inventory.add(a.ACTUATOR,1)
	game.player.teleport(a.PORT_CONTROL);game.open_station("PortCrane","port-crane");check(a.repair(),"Edge fixture repairs the crane through local service")
	game.close_menu();clear_cargo();s.powered[a.PORT_ID]=true
	var c=cargo(Vector3(-18,2,8));game.salvage.ground_crate(c,0);advance(.2)
	check(a.port_job.get("phase")=="reach","Fixture loses power before the claw reaches its crate")
	var distance=a.claw.position.distance_to(a.port_target(c));s.powered[a.PORT_ID]=false;advance(.1)
	check(c.claimed=="" or game.salvage.machinery_moving(),"Unlatched power-loss state cannot serialize a held-load claim")
	var saved=game.salvage.snapshot();clear_cargo();game.salvage.restore(saved);advance(.05)
	check(a.port_job.get("phase","")!="lift" and a.claw.position.distance_to(a.port_target(game.salvage.crates[0]))>distance*.5,"Reload cannot teleport the claw onto unlatched cargo")
	# A low crossmember lies in the carried crate's volume, but below the
	# drone-center rays. Use real physics with no art or mocked ray responses.
	var from=Vector3(60,20,0);var to=Vector3(64,20,0)
	var beam=MMFAssets.box(game,Vector3(.25,.45,2),Vector3(62,19.1,0))
	await physics_frame;await physics_frame
	var blocked=not a.cargo_clear(from,to) if a.has_method("cargo_clear") else not a.clear_path(from,to)
	check(blocked,"Carried cargo sweep detects a low beam below the drone center")
	beam.queue_free();await physics_frame;await physics_frame
	var clear=a.cargo_clear(from,to) if a.has_method("cargo_clear") else a.clear_path(from,to)
	check(clear,"The same swept route is clear after removing the obstruction")
	var overlap=MMFAssets.box(game,Vector3(.25,.45,2),from-Vector3.UP*.9)
	await physics_frame;await physics_frame
	var overlapping=not a.cargo_clear(from,to) if a.has_method("cargo_clear") else not a.clear_path(from,to)
	check(overlapping,"New construction overlapping a paused load is detected before resuming")
	overlap.queue_free()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty()}
	FileAccess.open(out+"salvage-edges.json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	print("BETA_SALVAGE_EDGES ",JSON.stringify(report))
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
