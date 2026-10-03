extends SceneTree

# Normal controller movement against isolated collision fixtures. The authored
# workshop route is additionally exercised by workshop_first_visit.gd.
var game
var fixture: Node3D
var failures=[]
var checks=0
var samples=[]
const ORIGIN=Vector3(60,100,0)

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-player-step-tests/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count: int):
	for i in count:await physics_frame

func box(at: Vector3,size: Vector3):
	var body=StaticBody3D.new();body.position=at;fixture.add_child(body)
	var collision=CollisionShape3D.new();var shape=BoxShape3D.new()
	shape.size=size;collision.shape=shape;body.add_child(collision)

func prepare():
	game.player.set_physics_process(false)
	Input.action_release("right")
	if is_instance_valid(fixture):fixture.queue_free()
	await frames(2)
	fixture=Node3D.new();fixture.position=ORIGIN;game.world.add_child(fixture)
	# Top is y=0, extending from x=-3 to x=5 unless a case replaces it.
	box(Vector3(1,-.5,0),Vector3(8,1,4))
	game.player.teleport(ORIGIN+Vector3.UP*.03);game.player.yaw=0
	await frames(2)
	game.player.set_physics_process(true);await frames(6)

func walk(ticks: int) -> Dictionary:
	var peak=game.player.position.y
	Input.action_press("right")
	for i in ticks:
		await physics_frame
		peak=maxf(peak,game.player.position.y)
	Input.action_release("right");await frames(3)
	var result={"position":game.player.position-ORIGIN,"peak":peak-ORIGIN.y}
	samples.append({"position":str(result.position),"peak":result.peak})
	return result

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false)
	await frames(6)
	await prepare()
	box(Vector3(2.5,.175,0),Vector3(3,.35,4));await frames(2)
	var curb=await walk(32)
	check(curb.position.x>2 and curb.position.y>.34 and curb.position.y<.40,"Grounded walking clears a supported 35cm curb")

	await prepare()
	box(Vector3(2.5,.7,0),Vector3(3,1.4,4));await frames(2)
	var wall=await walk(32)
	check(wall.position.x<.75 and wall.peak<.10,"Step probe cannot climb a tall wall")

	await prepare()
	box(Vector3(2.5,.175,0),Vector3(3,.35,4))
	box(Vector3(1,2.2,0),Vector3(8,.2,4));await frames(2)
	var ceiling=await walk(32)
	check(ceiling.position.x<1 and ceiling.peak<.18,"Full upward capsule sweep rejects a curb with insufficient headroom")
	check(ceiling.peak+1.92<=2.1+.02,"Step attempt never moves the capsule through the ceiling")

	await prepare()
	box(Vector3(2.5,.05,0),Vector3(3,.10,4))
	box(Vector3(1,2.2,0),Vector3(8,.2,4));await frames(2)
	var low=await walk(32)
	check(low.position.x>2 and low.position.y>.09 and low.peak<.18,"Exact lift allows a small curb when the available headroom is sufficient")

	await prepare()
	# Remove the long support and replace it with a ledge ending at x=1.
	fixture.get_child(0).queue_free()
	box(Vector3(-1,-.5,0),Vector3(4,1,4));await frames(2)
	var edge=await walk(38)
	check(edge.position.x>2 and edge.position.y<-.5 and edge.peak<.10,"Walking beyond unsupported ground falls without a step lift")

	game.player.set_physics_process(false)
	while game.combat.nav.is_baking():await create_timer(.05).timeout
	var audio_refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await preload("res://tests/audio_drain.gd").finish(self,audio_refs);MMFAssets.cache.clear()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"samples":samples}
	var path="res://../test-results/godot-native/player-step-clearance.json"
	var file=FileAccess.open(path,FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("PLAYER_STEP_CLEARANCE ",JSON.stringify(report));quit(0 if failures.is_empty() else 1)
