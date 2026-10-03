extends SceneTree

const Fixture=preload("res://tests/expedition_fixture.gd")
var game
var checks=0
var failures=[]
var events=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://expedition-lifecycle-tests/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count: int):
	for i in count:await physics_frame

func ready_gantry():
	game.playtests.launch("foundry");await frames(5)
	game.set_physics_process(false);game.player.set_physics_process(false)
	Fixture.open_step(game,"power","bus")
	for i in 3:game.activity.adjust(i,[2,1,0][i])
	await Fixture.act(game)
	Fixture.open_step(game,"power","unlock");await Fixture.act(game)
	game.close_menu()

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	await frames(8)
	game.activity.semantic_event.connect(func(kind,data):events.append({"kind":kind,"data":data}))
	await ready_gantry()
	check(game.activity.entry.get("action")=="move","Shared gantry pendant offers travel immediately after unlocking")
	var view=game.activity.view;var spec=view.movers.power
	game.player.position=view.to_global(spec.from-Vector3.UP*.9)
	check(not view.begin_motion("power","move"),"Occupied full sweep refuses motion before collider moves")
	check(spec.body.position==spec.from and not game.activity.moving(),"Refused motion leaves stable pose and no pending operation")
	Fixture.open_step(game,"power","move")
	check(game.activity.act(),"Reachable pendant starts clear-sweep motion")
	await frames(12)
	var elapsed=view.pending.elapsed;var at=spec.body.position
	game.player.position=view.to_global(at-Vector3.UP*.9)
	await frames(12)
	check(is_equal_approx(view.pending.elapsed,elapsed) and spec.body.position==at,"Player entering moving sweep safely holds time and collider")
	game.player.position=Vector3(0,16.1,-1)
	check(game.aboard() and not game.safe_to_save() and not game.save_game("moving"),"Save guard refuses motion even after player returns aboard")
	paused=true;await frames(5)
	check(is_equal_approx(view.pending.elapsed,elapsed),"Pause does not advance motion")
	paused=false;await frames(100)
	check(not game.activity.moving() and "move" in game.activity.state("power").mechanism.milestones,"Clear sweep resumes and commits one stable milestone")
	check(spec.body.position==spec.to,"Completed collider exactly reaches stable endpoint")
	var step_events=events.filter(func(e):return e.kind=="activity_step_completed" and e.data.step_id=="move").size()
	game.activity.finish_step("power","move")
	check(events.filter(func(e):return e.kind=="activity_step_completed" and e.data.step_id=="move").size()==step_events,"Repeated completion emits no duplicate milestone event")
	check(game.save_game("stable"),"Stable partial activity can be saved normally aboard")
	var stored=MMFSaves.read("stable")
	game.load_payload(stored);await frames(5)
	check(game.activity.view.movers.power.body.position==game.activity.view.movers.power.to,"Restore directly establishes committed collider endpoint")
	check(not game.activity.state("power").done,"Restoring moved carriage does not invent final latch or rewards")
	check(events.filter(func(e):return e.kind=="activity_step_completed" and e.data.step_id=="move").size()==step_events,"Restore emits no replayed transition event")
	await ready_gantry()
	Fixture.open_step(game,"power","move");game.activity.act();await frames(9)
	var old_view=weakref(game.activity.view);var stale_entry=game.activity.entry.duplicate(true)
	game.playtests.launch("wake");await frames(6)
	check(old_view.get_ref()==null and not game.activity.moving(),"Checkpoint exit during motion frees old actor and pending operation")
	game.activity.entry=stale_entry
	check(not game.activity.act(),"Stale control from exited site cannot mutate new activity")
	var scene_counts=[]
	for i in 12:
		game.playtests.launch("foundry");await frames(4)
		scene_counts.append(MMFAssets.of_type(game.campaign.destination,"CollisionShape3D").size())
	check(scene_counts.all(func(n):return n==scene_counts[0]),"Repeated restore keeps mechanism collider counts bounded")
	# A legacy paired reward proves the shared instrument only, never the second pickup.
	var old=game.playtests.payload("foundry")
	old.session.polish.erase("activities");old.session.story.uniques.append("salvage-controller")
	game.load_payload(old);await frames(5)
	check(game.activity.state("power").done and game.activity.view.movers.power.body.position==game.activity.view.movers.power.to,"Old recovered controller restores shared gantry as already complete")
	check("tracking-servo" not in game.session.story.uniques,"Migration never awards unclaimed paired reward")
	var old_gyro=game.playtests.payload("wake")
	old_gyro.session.polish.activities={"gyro":{"step":1,"values":[0,0,0],"done":false}}
	game.load_payload(old_gyro);await frames(5)
	check(game.activity.describe_step().step_id=="brake","Old partial gyro resumes at remaining physical brake control")
	var counts_before=game.session.story.uniques.size()
	var reward=Fixture.point(game,"course-gyro")
	for p in game.campaign.points:
		if p.entry.get("factId","")=="course-gyro":reward=p;break
	Fixture.stand_at(game,reward)
	check(not game.campaign.interact(reward.entry) and game.session.story.uniques.size()==counts_before,"Direct local reward call still cannot bypass incomplete physical mechanism")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty()}
	var file=FileAccess.open("res://../test-results/expedition-lifecycle.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("EXPEDITION_LIFECYCLE_RESULT ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
