extends SceneTree

var game
var checks=0
var failures=[]
var report={}

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-salvage-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func reset_cargo():
	game.salvage.cancel();game.salvage.next_distance=1e12
	for c in game.salvage.crates:c.active=false;c.node.hide();c.claimed="";c.ground.clear()

func aim(c,angle=0):
	var direction=(c.node.position-game.salvage.hand_position()).normalized()
	game.player.yaw=atan2(-direction.x,-direction.z)+deg_to_rad(angle);game.player.pitch=asin(direction.y);game.player.update_camera(1)

func flight(dt):
	game.salvage.throw_hook();var caught=-1;var elapsed=0.0
	while game.salvage.busy() and elapsed<4:
		game.session.clock+=dt;game.session.distance+=game.session.speed*dt
		game.session.lateral+=sin(deg_to_rad(game.session.course))*game.session.speed*dt
		game.salvage.update(dt);elapsed+=dt
		if game.salvage.reel_index>=0:caught=game.salvage.reel_index
	return caught

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	var s=game.session;var salvage=game.salvage;var p=game.player;var c=salvage.crates[0]
	p.teleport(Vector3(-12,8.95,-4));reset_cargo();s.lateral=0;salvage.last_lateral=0
	var min_gap=INF;var max_gap=-INF;var corner_samples=0;var random_state=s.rng.state
	for frame in 1500:
		s.clock=frame/60.0;s.distance=frame*.07
		if frame%250==0:s.distance+=frame*3
		for i in 6:
			var box=salvage.crates[i];box.active=true;box.claimed="";box.node.position=Vector3((-1 if i%2==0 else 1)*(15+i),2,-28+i*6)
			salvage.ground_crate(box,i)
			for x in [salvage.crate_bounds.position.x,salvage.crate_bounds.end.x]:
				for z in [salvage.crate_bounds.position.z,salvage.crate_bounds.end.z]:
					var at=box.node.transform*Vector3(x,salvage.crate_bounds.position.y,z)
					var gap=at.y-MMFDunes.height_at(at.x+s.lateral,at.z-s.distance)
					min_gap=minf(min_gap,gap);max_gap=maxf(max_gap,gap);corner_samples+=1
	report.groundCorners={"samples":corner_samples,"minClearanceM":min_gap,"maxClearanceM":max_gap}
	check(min_gap>.015 and max_gap<.24,"All 36000 lower corners remain just above the dunes, including cached fits and discontinuous travel")
	check(s.rng.state==random_state,"Grounding and passive movement do not consume gameplay random numbers")
	reset_cargo();s.distance=0;s.speed=0;s.lateral=0;salvage.last_lateral=0
	for i in 3:
		var box=salvage.crates[i];box.active=true;box.node.position=Vector3(-20,2,-20);box.claimed=["","manual","parked"][i]
	s.lateral=3;salvage.update(0)
	check(is_equal_approx(c.node.position.x,-23) and salvage.crates[1].node.position.x==-20 and salvage.crates[2].node.position.x==-20,"Steering shifts free cargo with the world and leaves carried/parked cargo aboard")
	reset_cargo();s.lateral=110
	salvage.restore([{"position":{"x":-20,"y":2,"z":-20},"contents":{"fuel":3},"opened":true,"claimed":""}]);salvage.update(0)
	check(is_equal_approx(c.node.position.x,-20) and c.contents=={"fuel":3},"Loading cargo resets lateral history instead of shifting it by the previous campaign's course")
	var predicted_hits=0;var observed_hits=0;var flight_cases=0
	for speed in [0,3,7.4]:
		for course in [-28,0,28]:
			for angle in [-15,0,15]:
				reset_cargo();s.speed=speed;s.course=course;s.lateral=0;s.distance=150;salvage.last_lateral=0
				c.active=true;c.node.show();c.opened=true;c.contents={"scrap":1};c.node.position=Vector3(-20,2,-26);salvage.ground_crate(c,0)
				aim(c,angle);var predicted=salvage.aimed_crate()
				var before=s.rng.state;var at=c.node.transform
				for i in 20:salvage.aimed_crate();salvage.nearby_crate()
				check(s.rng.state==before and c.node.transform==at and c.claimed=="","Readout query is observational: "+str([speed,course,angle]))
				var observed=flight(1.0/60)
				check(predicted==observed,"Predicted cue agrees with actual moving-cargo catch: "+str([speed,course,angle]))
				predicted_hits+=int(predicted>=0);observed_hits+=int(observed>=0);flight_cases+=1
	report.flights={"cases":flight_cases,"predictedHits":predicted_hits,"actualHits":observed_hits}
	for course in [-28,0,28]:
		reset_cargo();s.speed=7.4;s.course=course;s.lateral=0;s.distance=150;salvage.last_lateral=0
		c.active=true;c.opened=true;c.contents={"scrap":1};c.node.position=Vector3(-20,2,-26);salvage.ground_crate(c,0)
		var direction=salvage.suggested_direction(0)
		p.yaw=atan2(-direction.x,-direction.z);p.pitch=asin(direction.y);p.update_camera(1)
		check(salvage.aimed_crate()==0 and flight(1.0/60)==0,"Following the lead diamond catches cargo while steering "+str(course)+" degrees")
	for rate in [30,120]:
		reset_cargo();s.speed=7.4;s.course=0;s.lateral=0;salvage.last_lateral=0
		c.active=true;c.opened=true;c.contents={"scrap":1};c.node.position=Vector3(-20,2,-20);salvage.ground_crate(c,0);aim(c)
		check(flight(1.0/rate)==0,"Physical sweep catches cargo at "+str(rate)+" Hz")
	reset_cargo();s.speed=0;s.course=0;s.lateral=0;salvage.last_lateral=0
	c.active=true;c.opened=false;c.node.position=Vector3(-20,2,-20);var was_salvage=s.facts.salvage
	salvage.receive(c)
	check(not was_salvage and s.facts.salvage and s.scanner.phase=="awaiting-module","First successful cargo still unlocks the existing receiver objective")
	check(game.ui.toast.text.contains("Receiver recovered") and game.ui.toast.text.contains("Cargo secured: +") and game.ui.toast.text.contains("Scrap Metal"),"One receipt preserves the receiver message and actual recovered item names")
	var receipt=game.ui.toast.text
	# Force partial transfer: two units of free scrap capacity, no other room.
	for bag in s.containers():
		bag.slots.fill(null);bag.add("scrap",bag.slots.size()*int(game.data.ITEMS.scrap.stackSize))
	s.inventory.remove("scrap",2);c.active=true;c.opened=true;c.claimed="manual";c.contents={"scrap":5,"fuel":2}
	p.teleport(Vector3(0,16.1,0));var plane=MMFAssets.box(game,Vector3(8,.2,8),Vector3(50,15.9,0));p.teleport(Vector3(50,16.02,0))
	for i in 3:await physics_frame
	var rng_before=s.rng.state;salvage.receive(c)
	check(c.active and c.claimed=="parked" and c.contents=={"scrap":3,"fuel":2},"Partial transfer preserves exact overflow cargo")
	check(game.ui.toast.text.contains("+2 Scrap Metal") and not game.ui.toast.text.contains("+2 Fuel"),"Receipt reports only transferred quantities")
	check(absf(c.node.position.y+salvage.crate_bounds.position.y-16.02)<.015,"Parked overflow rests on a real platform at mesh-bottom height")
	var snapshot=salvage.snapshot();s.inventory.remove("scrap",3);s.inventory.remove("scrap",int(game.data.ITEMS.scrap.stackSize));salvage.receive(c)
	check(not c.active and c.contents.is_empty() and s.rng.state==rng_before,"Reclaiming overflow does not reroll or duplicate the reward")
	reset_cargo();salvage.restore(snapshot);check(c.opened and c.claimed=="parked" and c.contents=={"scrap":3,"fuel":2},"Existing save format preserves parked overflow contents")
	# Marker readability in actual viewport space, without opaque-wall x-ray.
	reset_cargo();p.teleport(Vector3(50,16.02,0));p.yaw=0;p.pitch=0;p.update_camera(1)
	c.active=true;c.claimed="parked";c.node.position=Vector3(50,17.33,-20);c.node.show();c.node.reset_physics_interpolation()
	game.ui.salvage_readout.update();check(game.ui.salvage_readout.visible and game.ui.salvage_readout.label.text.contains("READY"),"Aligned cargo has a visible ready bracket")
	# Open railing safety boxes block movement, not the sight between their bars.
	var rail=MMFAssets.box(game,Vector3(6,6,.08),Vector3(50,17,-6));rail.get_child(0).set_meta("open_railing",true)
	for i in 3:await physics_frame
	game.ui.salvage_readout.update();check(game.ui.salvage_readout.visible,"Open rail safety collision leaves the cargo bracket visible")
	var blocker=MMFAssets.box(game,Vector3(6,6,.4),Vector3(50,17,-8))
	for i in 3:await physics_frame
	game.ui.salvage_readout.update();check(not game.ui.salvage_readout.visible,"Opaque walls behind open rails still hide the cargo bracket")
	blocker.queue_free();rail.queue_free();for i in 3:await physics_frame
	p.teleport(Vector3(50,.8,0));c.node.position=Vector3(50,-1,-20);c.node.reset_physics_interpolation()
	p.camera.global_position=Vector3(50,2.1,1);p.camera.look_at(c.node.position)
	game.ui.salvage_readout.update();check(game.ui.salvage_readout.visible,"The flat radiation safety collider cannot hide visible cargo in a dune trough")
	game.open_menu("Inventory");game.ui.salvage_readout.update();check(not game.ui.salvage_readout.visible,"Terminal hides salvage guidance")
	report.receipt=receipt;report.checks=checks;report.failures=failures
	var file=FileAccess.open("res://../test-results/godot-native/salvage-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var audio_refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	p=null;c=null;plane=null;MMFAssets.cache.clear()
	await preload("res://tests/audio_drain.gd").finish(self,audio_refs)
	print("SALVAGE_RESULT ",checks," checks, ",failures.size()," failures");call_deferred("quit",0 if failures.is_empty() else 1)
