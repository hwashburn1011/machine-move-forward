extends SceneTree

var checks=0
var failures=[]
var game
var report={}

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-caretaker-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

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

func live_checks():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	drive_checks()
	var bot=game.caretaker;var s=game.session
	s.caretaker.recovered=true;s.caretaker.mode="companion"
	game.player.teleport(Vector3(-9,16.1,-5));bot.position=Vector3(-9,16.1,6);bot.spawned=true
	while game.combat.nav.is_baking():await physics_frame
	for i in 900:await physics_frame
	check(bot.position.distance_to(game.player.position)<3,"Companion follows a real baked deck route")
	check(bot.job.is_empty() and bot.phase=="idle" and bot.status=="Following","Companion never schedules retired gardening work")
	var parked=bot.position;var travel=bot.drive.travel.duplicate()
	for i in 120:await physics_frame
	check(bot.position.distance_to(parked)<.03 and bot.drive.travel==travel,"Parked companion leaves tracks stationary")
	var old=s.create_piece("planter",{"x":4,"y":0,"z":4},0,{},true);old.state={"legacyStock":{"scrap":3,"fuel":2}}
	var stock=old.state.duplicate(true);var inventory=s.inventory.slots.duplicate(true)
	s.fuel=0;s.update_power()
	for i in 120:await physics_frame
	check(bot.choose_job().is_empty() and old.state==stock and s.inventory.slots==inventory,"Retired stock remains untouched with or without dock power")
	game.player.teleport(Vector3(-9,16.1,6));bot.position=Vector3(-9,16.1,-5)
	var wall=MMFAssets.box(game,Vector3(6,2,.5),Vector3(-9,17.03,-3.5))
	for i in 180:await physics_frame
	check(bot.position.z<-4,"Companion collision cannot walk through a newly placed wall")
	wall.queue_free();game.queue_free()
	for i in 3:await physics_frame
	MMFAssets.cache.clear()

func run():
	await live_checks()
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/caretaker-workload.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	call_deferred("quit",0 if failures.is_empty() else 1)
