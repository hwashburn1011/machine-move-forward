extends SceneTree

var game
var checks=0
var failures=[]
var out="res://../test-results/beta-iteration/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-beta-salvage-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func clear_cargo():
	game.salvage.cancel();game.salvage.automation.reset();game.salvage.next_distance=1e12
	for c in game.salvage.crates:c.active=false;c.node.hide();c.claimed="";c.opened=true;c.contents={};c.ground.clear();game.salvage.set_heavy(c,false)

func cargo(at: Vector3,contents: Dictionary={"scrap":7,"fuel":2}) -> Dictionary:
	var c=game.salvage.crates[0];c.active=true;c.node.show();c.node.position=at;c.contents=contents.duplicate();c.opened=true;c.claimed="";return c

func advance(seconds: float):
	for tick in int(seconds*60):game.salvage.update(1.0/60)

func run():
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	await physics_frame;await physics_frame
	var s=game.session;var a=game.salvage.automation
	s.speed=0;s.scanner.phase="awaiting-module";s.facts.salvage=true;s.inventory.add(a.ACTUATOR,1)
	game.player.teleport(a.PORT_CONTROL);game.open_station("PortCrane","port-crane")
	check(not a.repair() and s.count_resource(a.ACTUATOR)==1,"Receiver repair precedes fitting, without consuming the actuator")
	s.scanner.phase="installed"
	check(a.repair() and s.facts.portCraneRepaired and s.count_resource(a.ACTUATOR)==0,"Physical crane service consumes one actuator and persists repair")
	check(not a.repair(),"Repeated repair cannot debit supplies twice")
	check(not a.original.visible and a.port.visible and a.claw.visible,"Repair replaces the seized crane and suspended box with the claw assembly")
	check(a.crane_collision.removed_triangles==3020,"Repair removes matched old crane collision triangles")
	var power=MMFPowerBudget.calculate(s,s.structures)
	check(power.consumers.any(func(c):return c.id==a.PORT_ID and c.draw==2),"Port crane requests two real power units only after repair")
	var legacy=s.native_snapshot();legacy.facts.erase("portCraneRepaired");legacy.facts.erase("portCraneEnabled")
	var old=MMFSession.new(game.data)
	check(old.restore_native(legacy) and not old.facts.portCraneRepaired,"Existing saves retain an unrepaired crane without invented progress")
	var current=s.native_snapshot();var restored=MMFSession.new(game.data)
	check(restored.restore_native(current) and restored.facts.portCraneRepaired,"Actuator repair and operating switch survive a save round trip")
	current.facts.portCraneRepaired="yes";check(not restored.restore_native(current),"Malformed repair state rejects before mutating a campaign")
	game.close_menu();clear_cargo();s.powered[a.PORT_ID]=true
	var c=cargo(Vector3(18,2,8));advance(1)
	check(c.claimed=="" and a.port_job.is_empty(),"Port arm never collects starboard cargo")
	clear_cargo();c=cargo(Vector3(-18,2,8));game.salvage.ground_crate(c,0)
	var scrap=s.count_resource("scrap");var fuel=s.count_resource("fuel")
	advance(.2);check(c.claimed==a.PORT_ID and a.port_job.phase=="reach","Left-side crate is acquired through the real cleared cable path")
	check(game.salvage.machinery_moving() and not game.save_game("moving"),"In-flight cargo prevents a transient save")
	advance(15)
	check(not c.active and s.count_resource("scrap")==scrap+7 and s.count_resource("fuel")==fuel+2,"Animated port hoist delivers exact contents once")
	advance(5);check(s.count_resource("scrap")==scrap+7,"Idle crane cannot repeat its reward")
	clear_cargo();c=cargo(Vector3(-18,2,8));game.salvage.ground_crate(c,0);s.powered[a.PORT_ID]=false;advance(1)
	check(c.claimed=="","Unpowered crane does not acquire cargo")
	s.powered[a.PORT_ID]=true;advance(4);var held_at=c.node.position;s.powered[a.PORT_ID]=false;advance(2)
	check(c.claimed==a.PORT_ID and c.node.position.distance_to(held_at)<.01,"Power loss holds a gripped load instead of dropping it through the world")
	var snapshot=game.salvage.snapshot();clear_cargo();game.salvage.restore(snapshot)
	check(game.salvage.crates[0].claimed==a.PORT_ID,"Saved held cargo retains its repaired arm ownership")
	s.powered[a.PORT_ID]=true;advance(15)
	check(not game.salvage.crates[0].active,"A restored load completes without being rerolled")
	clear_cargo();s.facts.portCraneEnabled=false;s.powered[a.PORT_ID]=false
	var p=s.create_piece("collector-auto",{"x":-5,"y":0,"z":-5},0,{},true);game.building.add_visual(p)
	s.powered[p.instanceId]=true
	await physics_frame;await physics_frame
	c=cargo(Vector3(-18,2,-12));game.salvage.ground_crate(c,0);advance(.25)
	check(a.drones.has(p.instanceId) and a.drones[p.instanceId].phase!="idle","Earned dock dispatches a visible drone for reachable cargo")
	advance(18)
	check(not c.active and s.stores[p.instanceId].count_item("scrap")==7 and s.stores[p.instanceId].count_item("fuel")==2,"Drone flies out, latches, returns and transfers exact cargo into its own store")
	advance(2)
	check(a.drones[p.instanceId].phase=="idle" and a.drones[p.instanceId].node.position.distance_to(a.drone_home(p))<.01,"Empty drone settles onto its authored landing supports")
	clear_cargo();c=cargo(Vector3(-18,2,-12));game.salvage.set_heavy(c,true);advance(2)
	check(c.claimed=="","Small drones cannot lift heavy freight")
	clear_cargo();var roof=MMFAssets.box(game,Vector3(3,.3,3),a.drone_home(p)+Vector3.UP*1.3)
	await physics_frame;await physics_frame
	c=cargo(Vector3(-18,2,-12));advance(2)
	check(c.claimed=="" and a.drones[p.instanceId].phase=="idle","A real ceiling blocks dispatch instead of letting the drone pass through it")
	roof.free();await physics_frame
	clear_cargo();c=cargo(Vector3(-18,2,-12));advance(1);s.powered[p.instanceId]=false;advance(10)
	check(c.active and c.claimed=="" and a.drones[p.instanceId].phase=="idle","Power loss before pickup releases the free crate and returns the drone")
	s.powered[p.instanceId]=true;clear_cargo();c=cargo(Vector3(-18,2,-12));advance(8)
	check(a.drones[p.instanceId].phase in ["raise","home","land","wait","settle","idle"],"Pickup has a separate carried phase")
	s.powered[p.instanceId]=false;advance(14)
	check(not c.active,"A latched drone load returns on reserve after dock power loss")
	clear_cargo();s.powered[p.instanceId]=true
	var bag=s.stores[p.instanceId];bag.slots.fill(null);bag.add("scrap",int(game.data.ITEMS.scrap.stackSize)*bag.slots.size()-1)
	c=cargo(Vector3(-18,2,-12),{"scrap":5,"fuel":2});advance(20)
	check(c.active and c.contents=={"scrap":4,"fuel":2} and a.drones[p.instanceId].phase=="wait","Full drone storage holds exact partial overflow at the latch")
	var saved=game.salvage.snapshot();clear_cargo();game.salvage.restore(saved);advance(6)
	check(c.active and c.contents=={"scrap":4,"fuel":2},"Held overflow survives reload without duplicating the first transfer")
	bag.slots.fill(null);advance(3)
	check(not c.active and bag.count_item("scrap")==4 and bag.count_item("fuel")==2,"Freeing the store resumes the pending delivery")
	for heading in [-12,0,12]:
		clear_cargo();bag.slots.fill(null);s.speed=4.5;s.course=heading;s.lateral=0;s.distance=800;game.salvage.last_lateral=0
		c=cargo(Vector3(-18,2,-12));game.salvage.ground_crate(c,0)
		for tick in 900:
			var dt=1.0/30;s.clock+=dt;s.distance+=s.speed*dt;s.lateral+=sin(deg_to_rad(s.course))*s.speed*dt;game.salvage.update(dt)
		check(not c.active and bag.count_item("scrap")==7,"Drone intercepts moving cargo while the Nomad steers %d degrees at 30 Hz"%heading)
	s.speed=0;s.course=0
	var report={"checks":checks,"failures":failures,"renderer":RenderingServer.get_video_adapter_name()}
	FileAccess.open(out+"salvage-result.json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "))
	print("BETA_SALVAGE_RESULT ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free()
	while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
