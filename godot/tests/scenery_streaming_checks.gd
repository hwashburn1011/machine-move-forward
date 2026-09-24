extends SceneTree

var game
var checks=0
var failures=[]

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-streaming-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func prepare_all():
	var stream=game.world.streamer
	for tick in 500:
		if stream.requests.is_empty() and not stream.pending:return
		game.world.update(1.0/60)
		await process_frame
	check(false,"Prefetch queue drains within its bounded preparation window")

func active_coverage() -> bool:
	var current=int(floor(game.session.distance/64));var band=int(floor(game.session.lateral/256))
	if game.world.chunks.size()!=27:return false
	for row in range(-current-6,-current+3):
		for side in range(band-1,band+2):
			var key=Vector2i(row,side)
			if not game.world.chunks.has(key):return false
			var chunk=game.world.chunks[key]
			if not chunk.is_inside_tree() or not chunk.position.is_equal_approx(Vector3(side*256-game.session.lateral,0,game.session.distance+row*64)):return false
	return true

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	var stream=game.world.streamer
	check(active_coverage(),"Startup contains every original visible scenery chunk at its real position")
	await prepare_all()
	check(stream.ready.size()==13 and not stream.pending,"Forward row and nearby side boundary prepare completely")
	check(stream.ready.values().all(func(n):return not n.is_inside_tree()),"Prepared scenery adds no visible nodes or draw submissions")
	var builds=stream.synchronous_builds;var activations=stream.prepared_activations
	game.session.distance=64.2;game.world.update(1.0/60)
	check(stream.synchronous_builds==builds and stream.prepared_activations==activations+3,"Normal forward crossing only activates three prepared chunks")
	check(active_coverage(),"Forward crossing preserves the entire original visible range")
	await prepare_all();activations=stream.prepared_activations
	game.session.lateral=-.2;game.world.update(1.0/60)
	check(stream.synchronous_builds==builds and stream.prepared_activations==activations+9,"Negative lateral crossing activates the nine prepared chunks")
	check(active_coverage(),"Negative coordinates preserve the correct active bands")
	activations=stream.prepared_activations
	game.session.lateral=.2;game.world.update(1.0/60)
	check(stream.synchronous_builds==builds and stream.prepared_activations==activations+9,"Immediate course reversal reuses retired chunks")
	check(stream.ready.size()+(1 if stream.pending else 0)<=13,"Ready and unfinished scenery share a bounded cache")
	game.session.distance=127.8;game.session.lateral=255.8;game.world.update(1.0/60);await prepare_all()
	builds=stream.synchronous_builds;activations=stream.prepared_activations
	game.session.distance+=.4;game.session.lateral+=.4;game.world.update(1.0/60)
	check(active_coverage() and stream.synchronous_builds==builds and stream.prepared_activations==activations+11,"Simultaneous forward/right crossing includes its prepared corner")
	game.session.distance=5012.5;game.session.lateral=1200.25;game.world.update(1.0/60)
	check(active_coverage(),"Unexpected large relocation synchronously fills the complete visible scene")
	await prepare_all()
	check(stream.ready.size()==3,"Away from a side boundary only one forward row stays cached")
	game.world.refresh_chunks(true)
	# Seed one real builder step deterministically. A one-microsecond wall-clock
	# slice can expire before doing any work on a busy host, testing scheduling
	# noise instead of resumability and cancellation.
	stream.pending=MMFSceneryChunk.new(game.world,stream.requests.pop_front())
	var incomplete=not stream.pending.step()
	check(incomplete and stream.pending!=null,"Preparation can stop between authored pieces")
	var cancelled=weakref(stream.pending.root) if stream.pending else null
	game.session.distance+=6400;game.world.update(1.0/60)
	check(cancelled!=null and cancelled.get_ref()==null,"An obsolete unfinished chunk is freed on relocation")
	var stale=[]
	await prepare_all()
	for node in stream.ready.values():stale.append(weakref(node))
	game.session.seed_name="streaming-new-campaign";game.world.refresh_chunks(true)
	check(stale.all(func(n):return n.get_ref()==null) and stream.ready.is_empty(),"Loading a different seed discards all prepared geometry")
	check(active_coverage(),"Forced load rebuilds every visible chunk before returning")
	await prepare_all();game.world.streamer.clear();game.world.atmosphere.update(3)
	check(stream.ready.is_empty() and stream.requests.is_empty() and not stream.pending,"Cache shutdown releases every ready and unfinished root")
	check(game.world.atmosphere.rotors.all(func(r):return is_instance_valid(r.node) and r.node.is_inside_tree()),"Cancelled wind props leave no stale animation entries")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty()}
	var file=FileAccess.open("res://../test-results/godot-native/scenery-streaming-checks.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	while game.combat.nav.is_baking():await create_timer(.1).timeout
	game.queue_free();await create_timer(.1).timeout;MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
