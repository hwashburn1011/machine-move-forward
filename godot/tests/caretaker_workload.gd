extends SceneTree

class Fixture extends RefCounted:
	var session: MMFSession
class Probe extends MMFCaretaker:
	var access={}
	var queries=[]
	func reachable(p: Dictionary) -> bool:
		queries.append(p.instanceId)
		return access.get(p.instanceId,true)

var checks=0
var failures=[]
var game
var report={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-caretaker-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

# Frozen selector from 127df8c, retained as an independent behavioral oracle.
func legacy(bot) -> Dictionary:
	var session=bot.game.session;var water=[];var outputs=[]
	var pieces=session.structures.duplicate();pieces.sort_custom(func(a,b):return a.instanceId<b.instanceId)
	for p in pieces:
		if p.health<=0 or not bot.reachable(p):continue
		if p.definitionId=="seed-garden" and p.state.get("water",0)<2:
			for id in session.stores:
				var source=session.find_piece(id)
				if not source.is_empty() and session.stores[id].count_item("water")>0 and bot.reachable(source):water.append({"kind":"water-garden","source":id,"target":p.instanceId,"item":"water"})
		if p.definitionId in ["condenser","planter","seed-garden"] and p.state.get("stored",0)>0:
			var item="water" if p.definitionId=="condenser" else "greens"
			for id in session.stores:
				var target=session.find_piece(id)
				if not target.is_empty() and session.stores[id].room_for(item)>0 and bot.reachable(target):outputs.append({"kind":"store-output","source":p.instanceId,"target":id,"item":item})
	for list in ([outputs,water] if session.caretaker.priority=="outputs" else [water,outputs]):
		if not list.is_empty():return list[0]
	return {}

func selector_checks(data):
	var rng=RandomNumberGenerator.new();rng.seed=829374
	var mismatch=[];var query_repeated=[];var old_queries=0;var new_queries=0
	var fixture=Fixture.new();var bot=Probe.new();bot.game=fixture
	for sample in 512:
		var session=MMFSession.new(data);fixture.session=session;session.structures.clear();session.stores.clear()
		bot.access.clear();bot.queries.clear()
		for i in rng.randi_range(5,90):
			var kind=["floor","wall","chair","generator","condenser","planter","seed-garden","crate","collector-auto"][rng.randi_range(0,8)]
			var p=session.create_piece(kind,{"x":i%10,"y":-i%3,"z":i/10},0,{},true)
			if rng.randf()<.2:p.health=0
			p.state.stored=rng.randi_range(0,3);p.state.water=rng.randi_range(0,2)
			bot.access[p.instanceId]=rng.randf()>.3
			if session.stores.has(p.instanceId):
				var bag=session.stores[p.instanceId]
				bag.add("water",rng.randi_range(0,12));bag.add("greens",rng.randi_range(0,12))
				if rng.randf()<.5:bag.add("scrap",100000)
		# Piece order differs from storage insertion order, including bp-2 / bp-10.
		for i in range(session.structures.size()-1,0,-1):
			var j=rng.randi_range(0,i);var held=session.structures[i];session.structures[i]=session.structures[j];session.structures[j]=held
		session.caretaker.priority=["auto","water","outputs"][sample%3]
		var expected=legacy(bot);old_queries+=bot.queries.size();bot.queries.clear()
		var actual=bot.choose_job();new_queries+=bot.queries.size()
		if actual!=expected:mismatch.append({"sample":sample,"expected":expected,"actual":actual})
		var unique={}
		for id in bot.queries:unique[id]=true
		if unique.size()!=bot.queries.size():query_repeated.append(sample)
	check(mismatch.is_empty(),"512 mixed layouts preserve exact job, priority, storage order and blocked-route behavior")
	check(query_repeated.is_empty(),"Each candidate route is checked at most once per search")
	report.selector={"cases":512,"mismatches":mismatch,"legacyQueries":old_queries,"refinedQueries":new_queries}
	var session=MMFSession.new(data);fixture.session=session;session.structures.clear();session.stores.clear();bot.access.clear();bot.queries.clear()
	for i in 500:session.create_piece("floor",{"x":i%20,"y":0,"z":i/20},0,{},true)
	check(bot.choose_job().is_empty() and bot.queries.is_empty(),"An idle 500-piece deck performs no navigation queries")
	var producer=session.create_piece("condenser",{"x":0,"y":0,"z":0},0,{},true);producer.state.stored=1
	var crate=session.create_piece("crate",{"x":1,"y":0,"z":0},0,{},true)
	bot.queries.clear();var selected=bot.choose_job()
	check(selected.get("source")==producer.instanceId and selected.get("target")==crate.instanceId and bot.queries.size()==2,"First valid job needs only the producer and destination routes")
	bot.access[crate.instanceId]=false;bot.queries.clear()
	check(bot.choose_job().is_empty(),"Changed route reachability is visible on the next search")
	bot.access[crate.instanceId]=true;session.stores[crate.instanceId].add("scrap",100000);bot.queries.clear()
	check(bot.choose_job().is_empty() and bot.queries.is_empty(),"Full storage prevents unnecessary producer navigation")
	session.stores[crate.instanceId].slots.fill(null);producer.health=0;bot.queries.clear()
	check(bot.choose_job().is_empty() and bot.queries.is_empty(),"Destroyed producer is excluded before route lookup")
	producer.health=100;session.structures.erase(crate);bot.queries.clear()
	check(bot.choose_job().is_empty() and bot.queries.is_empty(),"A removed storage piece cannot supply a stale job")
	bot.free()

func step(count: int):
	for i in count:
		await physics_frame
		game.session.clock+=1.0/60
		game.caretaker.update(1.0/60)

func drive_checks():
	var bot=game.caretaker;var drive=bot.drive
	check(drive.belts.size()==2 and drive.belts[0].multimesh.instance_count==48 and drive.belts[1].multimesh.instance_count==48,"96 articulated shoes use two instanced belts")
	check(drive.belts[0].multimesh.mesh==drive.belts[1].multimesh.mesh,"Both belts share the same authored mesh and materials")
	var circumference=MMFCaretakerDrive.LENGTH
	var closure=MMFCaretakerDrive.shoe_frame(0,.44).is_equal_approx(MMFCaretakerDrive.shoe_frame(circumference,.44))
	var continuous=true
	for boundary in [2*.29,2*.29+PI*.17,4*.29+PI*.17,circumference]:
		var a=MMFCaretakerDrive.shoe_frame(boundary-.00001,.44);var b=MMFCaretakerDrive.shoe_frame(boundary+.00001,.44)
		if a.origin.distance_to(b.origin)>.00003 or a.basis.z.distance_to(b.basis.z)>.0002:continuous=false
	check(closure and continuous,"Shoe position and tangent remain continuous around both drive arcs and the loop seam")
	drive.positioned=false;drive.update(Transform3D.IDENTITY,true)
	drive.update(Transform3D(Basis.IDENTITY,Vector3(0,0,-.3)),true)
	check(absf(drive.travel[0]-.3)<.00001 and absf(drive.travel[1]-.3)<.00001,"Straight travel advances both belts by actual ground distance")
	drive.update(Transform3D.IDENTITY,true)
	check(absf(drive.travel[0])<.00001 and absf(drive.travel[1])<.00001,"Reverse travel reverses the belts without accumulating false forward movement")
	drive.update(Transform3D(Basis(Vector3.UP,.2),Vector3.ZERO),true)
	check(drive.travel[0]<-.08 and drive.travel[1]>.08 and absf(drive.travel[0]+drive.travel[1])<.00001,"Turning in place drives the inner and outer tracks in opposite directions")
	var before=drive.travel.duplicate();var phases=drive.phases.duplicate()
	drive.update(Transform3D(Basis(Vector3.UP,.2),Vector3.ZERO),true)
	check(drive.travel==before and drive.phases==phases,"Stationary frames leave the complete drive unchanged")
	drive.update(Transform3D(Basis.IDENTITY,Vector3(0,0,20)),true)
	drive.update(Transform3D(Basis.IDENTITY,Vector3(0,0,20.3)),false)
	check(drive.travel==before,"Recovery teleports and airborne travel do not spin the drive")
	drive.positioned=false;drive.travel=[0.0,0.0];drive.phases=[0.0,0.0]
	for index in 2:drive.pose_belt(index)
	for wheel in bot.wheels:wheel.rotation.x=0

func capture_service(label: String):
	if DisplayServer.get_name()=="headless":return
	game.player.camera.reparent(game);game.player.camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	game.player.camera.position=game.caretaker.position-game.caretaker.visual.global_basis.z*.9+game.caretaker.visual.global_basis.x*2+Vector3.UP*1.15
	game.player.camera.look_at(game.caretaker.position+Vector3.UP*.60)
	game.player.visual.hide();game.ui.root.hide()
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/caretaker-"+label+".png"))

func live_checks():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	game.player.teleport(Vector3(-1,16.1,8));game.session.caretaker.recovered=true;game.session.caretaker.mode="automation"
	drive_checks()
	game.session.caretaker.priority="outputs"
	var pieces={}
	for entry in [["condenser",2],["crate",4],["caretaker-dock",5]]:
		var cell={"x":-3,"y":0,"z":entry[1]}
		check(not game.building.blocked(cell),"Live fixture keeps "+entry[0]+" clear of built-in machinery")
		game.building.add_visual(game.session.create_piece("floor",cell,0,{},true))
		var p=game.session.create_piece(entry[0],cell,0,{},true);game.building.add_visual(p);pieces[entry[0]]=p
	pieces.condenser.state.stored=1;game.session.update_power()
	game.caretaker.spawned=true;game.caretaker.position=Vector3(-4.5,16.1,6)
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.combat.nav.bake_navigation_mesh(true)
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	for i in 4:await physics_frame
	check(game.session.powered.get(pieces["caretaker-dock"].instanceId,false),"Live automation fixture has a powered dock")
	check(game.caretaker.reachable(pieces.condenser) and game.caretaker.reachable(pieces.crate),"Both real service points are reachable on the baked deck")
	check(game.caretaker.service_point(pieces.crate).distance_to(Vector3(-4.7,16.03,8))<.01,"Storage beside the dock uses its clear side instead of the blocked front")
	var bag=game.session.stores[pieces.crate.instanceId]
	var saw_source=false;var saw_target=false;var premature=false;var serviced_pose=false;var facing_station=false;var facing_motion=false;var captures={}
	var start=game.caretaker.position
	check(game.caretaker.wheels.size()==6,"All six authored drive-wheel pivots are available")
	var initial_wheel=game.caretaker.wheels[0].rotation.x
	for i in 1800:
		await step(1)
		var motion=game.caretaker.velocity*Vector3(1,0,1)
		if motion.length()>.5 and (-game.caretaker.visual.global_basis.z).dot(motion.normalized())>.9:facing_motion=true
		if game.caretaker.phase=="service-source":saw_source=true
		if game.caretaker.phase=="service-target":saw_target=true
		if game.caretaker.phase.begins_with("service-") and not game.caretaker.arms.is_empty() and game.caretaker.arms[0].rotation.x<-.15:
			serviced_pose=true
			var station=pieces.condenser if game.caretaker.phase=="service-source" else pieces.crate
			var toward=(game.building.center(station.cell)-game.caretaker.position)*Vector3(1,0,1)
			if (-game.caretaker.visual.global_basis.z).dot(toward.normalized())>.9:facing_station=true
			if game.caretaker.service_time<1.3 and not captures.has(game.caretaker.phase):
				captures[game.caretaker.phase]=true;await capture_service(game.caretaker.phase)
		if not saw_target and (pieces.condenser.state.stored!=1 or bag.count_item("water")!=0):premature=true
		if bag.count_item("water")==1:break
	check(game.caretaker.position.distance_to(start)>1 and saw_source and saw_target,"L-12 physically visits and services both stations")
	check(not premature and pieces.condenser.state.stored==0 and bag.count_item("water")==1,"Water transfer commits exactly once after both visits")
	check(serviced_pose,"Service states visibly engage the cached manipulator pivots")
	check(facing_station,"L-12 faces the equipment while servicing it")
	check(facing_motion,"The authored binocular face points along the travel direction")
	check(absf(game.caretaker.wheels[0].rotation.x-initial_wheel)>.5,"Drive wheels rotate with the actual completed journey")
	await step(240)
	var stopped_wheel=game.caretaker.wheels[0].rotation.x;await step(60)
	check(is_equal_approx(stopped_wheel,game.caretaker.wheels[0].rotation.x),"Drive wheels stop when the companion parks")
	var parked=game.caretaker.position;await step(120)
	check(game.caretaker.position.distance_to(parked)<.02,"An idle companion parks instead of walking toward the world origin")
	if DisplayServer.get_name()=="headless":
		# Dummy rendering returns identity MultiMesh transforms, not the posed
		# track shoes. This visual assertion must run with the native renderer.
		report.trackContact={"available":false,"reason":"Headless MultiMesh readback is a placeholder"}
		print("SKIP Rendered track contact requires a native renderer")
	else:
		var sole=INF
		for belt in game.caretaker.drive.belts:
			var batch=belt.multimesh
			for link in batch.instance_count:sole=minf(sole,(batch.get_instance_transform(link)*batch.mesh.get_aabb()).position.y)
		var contact_y=game.caretaker.position.y+game.caretaker.visual.position.y+sole
		var floor_hit=game.raycast(game.caretaker.position+Vector3.UP*.05,game.caretaker.position-Vector3.UP*.5,[game.caretaker.get_rid()],1)
		report.trackContact={"available":true,"feet":str(game.caretaker.position),"visualY":game.caretaker.visual.position.y,"soleY":sole,"contactY":contact_y,"floor":str(floor_hit.get("position",Vector3.INF)),"onFloor":game.caretaker.is_on_floor()}
		print("CARETAKER_CONTACT ",JSON.stringify(report.trackContact))
		check(absf(contact_y-16.03)<.02,"Authored track contact plane rests on the actual deck within 2 cm")
	check(bag.count_item("water")==1 and pieces.condenser.state.stored==0,"Idle updates cannot duplicate delivered output")
	pieces.condenser.state.stored=1;game.caretaker.wait_time=0;await step(1)
	check(not game.caretaker.job.is_empty(),"Another available output can schedule the next job")
	game.session.attack_recent=5;await step(1)
	check(game.caretaker.job.is_empty() and pieces.condenser.state.stored==1 and bag.count_item("water")==1,"Attack interruption cancels work without moving or losing inventory")
	var barriers=Node3D.new();game.add_child(barriers)
	var center=game.building.center(pieces.condenser.cell)
	for offset in [Vector3(0,0,1.3),Vector3(1.3,0,0),Vector3(-1.3,0,0),Vector3(0,0,-1.3)]:
		MMFAssets.box(barriers,Vector3(.7,1.6,.7),center+offset+Vector3.UP*.8)
	for i in 3:await physics_frame
	check(not game.caretaker.service_point(pieces.condenser).is_finite() and not game.caretaker.reachable(pieces.condenser),"A station blocked on every side cannot become a navigation target")
	barriers.queue_free();for i in 3:await physics_frame
	game.session.attack_recent=0;game.session.fuel=0;game.session.update_power();await step(1)
	check(game.caretaker.job.is_empty() and pieces.condenser.state.stored==1 and bag.count_item("water")==1,"Loss of dock power leaves pending supplies intact")
	game.open_menu("Pause");game.queue_free();await create_timer(.1).timeout;MMFAssets.cache.clear()

func run():
	selector_checks(MMFAssets.json("res://data/definitions.json"))
	await live_checks()
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/caretaker-workload.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	call_deferred("quit",0 if failures.is_empty() else 1)
