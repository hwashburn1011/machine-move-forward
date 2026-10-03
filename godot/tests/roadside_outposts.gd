extends SceneTree

var game
var checks=0
var failures=[]
var evidence={"sides":[]}
const OUT="res://../test-results/roadside-outposts/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://roadside-outpost-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func posed_bounds(enemy,skip: Node=null) -> AABB:
	var initialized=false;var result=AABB();var relative=enemy.global_transform.affine_inverse()
	for mesh in MMFAssets.of_type(enemy.visual,"MeshInstance3D"):
		if skip and skip.is_ancestor_of(mesh):continue
		var matrices=[]
		if mesh.skin:
			var skeleton=mesh.get_node(mesh.skeleton)
			for b in mesh.skin.get_bind_count():
				var name=mesh.skin.get_bind_name(b);var bone=skeleton.find_bone(name) if name!=&"" else mesh.skin.get_bind_bone(b)
				matrices.append(relative*skeleton.global_transform*skeleton.get_bone_global_pose(bone)*mesh.skin.get_bind_pose(b))
		for s in mesh.mesh.get_surface_count():
			var arrays=mesh.mesh.surface_get_arrays(s);var vertices=arrays[Mesh.ARRAY_VERTEX];var bones=arrays[Mesh.ARRAY_BONES];var weights=arrays[Mesh.ARRAY_WEIGHTS]
			var stride=bones.size()/vertices.size() if bones!=null else 0
			for v in vertices.size():
				var at=Vector3.ZERO
				if stride and not matrices.is_empty():
					for i in stride:
						var weight=weights[v*stride+i]
						if weight>0:at+=matrices[bones[v*stride+i]]*vertices[v]*weight
				else:at=relative*mesh.global_transform*vertices[v]
				if not initialized:result=AABB(at,Vector3.ZERO);initialized=true
				else:result=result.expand(at)
	return result

func active_fixture(side: int,variant: int=0):
	game.roadside.reset();game.session.distance=600;game.session.lateral=0
	game.session.roadside={"nextSlot":1,"active":{"slot":0,"atDistance":600.0,"worldX":side*35.0,"side":side,"variant":variant,"health":[60.0],"shots":[0]}}
	if variant==1:game.session.roadside.active.health.append(60.0);game.session.roadside.active.shots.append(0)
	game.roadside.update(0)
	game.world.update(0)

func run():
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	var previous=-INF
	for i in 200:
		var a=MMFRoadsideOutposts.slot_spec("schedule-test",i);var b=MMFRoadsideOutposts.slot_spec("schedule-test",i)
		check(a==b,"Seeded slot %d is reproducible"%i)
		check(i==0 or a.atDistance-previous>=890,"Slot %d preserves sparse minimum separation"%i)
		previous=a.atDistance
	var first=MMFRoadsideOutposts.slot_spec("schedule-test",0)
	check(first.atDistance>=520 and first.atDistance<=680 and first.variant==0,"First travel tower is an early solo watch")
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	# This isolated fixture owns the scene before the first title frame. It does
	# not depend on unrelated opening/site staging currently under construction.
	game.cinematics.opening_stage.set_process(false)
	for preparer in MMFAssets.scene_preparers:preparer.set_process(false)
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.started=true;game.session.opening_done=true;game.cinematic="";game.close_menu();game.invulnerable=true
	for i in 3:await physics_frame
	# Compare the clearance prediction with the actual scenery builder, including
	# its unprefixed density random stream and real transformed source bounds.
	var retained_seed=game.session.seed_name
	var clearance_cost=[]
	for seed_name in ["mmf-default-seed","clearance-iron","clearance-dust"]:
		game.session.seed_name=seed_name
		for band in [-1,0,1]:
			for chunk in [-13,-9,4]:
				var builder=MMFSceneryChunk.new(game.world,Vector2i(chunk,band))
				for p in builder.placements:builder.landmark(p)
				for scatter in MMFSceneryChunk.SCATTER:
					if scatter[0] in ["rocks","slabs","wreck-wreck","wreck-containers","wreck-debris"]:builder.scatter(scatter)
				var predicted=game.roadside.scenery_envelopes(seed_name,band,chunk)
				var same=predicted.size()==builder.clearance_bounds.size()
				for bounds in builder.clearance_bounds:
					var wanted=Rect2(Vector2(bounds.position.x+band*256,bounds.position.z+chunk*64),Vector2(bounds.size.x,bounds.size.z))
					if not predicted.any(func(found):return found.position.is_equal_approx(wanted.position) and found.size.is_equal_approx(wanted.size)):same=false
				check(same,"Clearance envelopes match actual chunk %s/%d/%d"%[seed_name,band,chunk])
				builder.root.free()
		for slot in range(8):
			var choice=MMFRoadsideOutposts.slot_spec(seed_name,slot)
			var started=Time.get_ticks_usec()
			var place=game.roadside.clear_placement(choice,0)
			clearance_cost.append((Time.get_ticks_usec()-started)/1000.0)
			check(place.is_empty() or absf(float(place.worldX))>=32 and absf(float(place.worldX))<=42,"Clearance chooses a bounded verge or safely skips")
	clearance_cost.sort();evidence.clearance_ms={"median":clearance_cost[clearance_cost.size()/2],"max":clearance_cost.back(),"samples":clearance_cost.size(),"scope":"headless preliminary CPU timing, not final native frame acceptance"}
	game.session.seed_name=retained_seed
	var session_rng=game.session.rng.state
	var spec=MMFRoadsideOutposts.slot_spec(game.session.seed_name,0)
	game.session.distance=spec.atDistance-MMFRoadsideOutposts.REVEAL-1
	game.roadside.update(.1)
	check(not is_instance_valid(game.roadside.tower),"No early tower before reveal range")
	game.session.distance+=2
	for i in 20:game.roadside.update(.1)
	check(is_instance_valid(game.roadside.tower) and game.roadside.guards.size()==1,"Normal travel reveals one solo tower far ahead")
	check(game.session.rng.state==session_rng,"Scheduling and assembly leave gameplay RNG unchanged")
	check(not game.combat.active_threat() and game.combat.enemies.is_empty(),"Roadside watch never becomes a global raid/docking lock")
	check(MMFRoadsideOutposts.valid(game.session.roadside),"Live seeded tower has a bounded valid save record")
	for side in [-1,1]:
		active_fixture(side,1)
		game.player.position=Vector3(side*12.0,16.03,0)
		for i in 3:await physics_frame
		# MMFAssets.box defaults to solid=true. Verify those real sampled base
		# colliders rather than adding duplicate shapes to TowerStructure.
		var pads=0;var piles=0;var matched=true;var physical=true
		for mesh in game.roadside.tower.get_children():
			if not mesh is MeshInstance3D or not mesh.mesh is BoxMesh:continue
			if is_equal_approx(mesh.mesh.size.x,1.05):pads+=1
			elif is_equal_approx(mesh.mesh.size.x,.29):piles+=1
			else:continue
			var bodies=mesh.get_children().filter(func(child):return child is StaticBody3D)
			if bodies.size()!=1:matched=false;physical=false;continue
			var body=bodies[0];var shapes=body.get_children().filter(func(child):return child is CollisionShape3D)
			if shapes.size()!=1 or not shapes[0].shape is BoxShape3D:matched=false;physical=false;continue
			matched=matched and shapes[0].shape.size.is_equal_approx(mesh.mesh.size) and shapes[0].global_transform.is_equal_approx(mesh.global_transform)
			var sphere=SphereShape3D.new();sphere.radius=.01
			var query=PhysicsShapeQueryParameters3D.new();query.shape=sphere;query.transform=Transform3D(Basis.IDENTITY,mesh.global_position);query.collision_mask=1
			physical=physical and game.get_world_3d().direct_space_state.intersect_shape(query,32).any(func(hit):return hit.collider==body)
		check(pads==4,"Side %d has four individually sampled solid concrete pads"%side)
		check(matched,"Side %d every visible pad and pile has one exact matching box collider"%side)
		check(physical,"Side %d actual world physics detects every sampled pad and pile"%side)
		var guard=game.roadside.guards[0]
		guard.visual.rotation.y=atan2((guard.get_parent().global_basis.inverse()*(game.player.global_position-guard.global_position)).x,(guard.get_parent().global_basis.inverse()*(game.player.global_position-guard.global_position)).z)
		guard.animator.advance(0)
		var origin=guard.equipment.shot_origin(guard)
		var body_clear=MMFEnemyBallistics.trace(game,guard.global_position+Vector3.UP*1.35,origin,[guard.get_rid()],1)
		var aim=game.player.global_position+Vector3.UP
		var player_to_guard=game.raycast(game.player.global_position+Vector3.UP*1.45,guard.global_position+Vector3.UP*1.25,[game.player.get_rid()],5)
		check(body_clear.is_empty(),"Side %d guard muzzle is outside its tower structure"%side)
		check(not player_to_guard.is_empty() and player_to_guard.collider==guard,"Side %d top deck rifle ray reaches real guard capsule"%side)
		var cover=MMFAssets.box(game,Vector3(1,7,8),(origin+aim)*.5,null,true)
		for i in 2:await physics_frame
		var cover_body=cover.get_child(0)
		var blocked=MMFEnemyBallistics.trace(game,origin,aim,[guard.get_rid()],3)
		check(not blocked.is_empty() and blocked.collider==cover_body,"Side %d real cover blocks the guard"%side)
		var counter=game.raycast(aim,guard.global_position+Vector3.UP,[game.player.get_rid()],5)
		check(not counter.is_empty() and counter.collider==cover_body,"Side %d same real cover blocks the player's countershot"%side)
		guard.committed=aim
		var health=game.session.health
		guard.shoot_committed()
		check(game.session.health==health and guard.last_ray.hit.get("collider")==cover_body,"Side %d authoritative guard fire lands on cover"%side)
		cover.queue_free();for i in 2:await physics_frame
		var hits=0;var rays=[]
		for shot in 100:
			guard.committed=aim;guard.shoot_committed()
			if guard.last_ray.hit.get("collider")==game.player:hits+=1
			rays.append([guard.last_ray.origin.x,guard.last_ray.origin.y,guard.last_ray.origin.z,guard.last_ray.end.x,guard.last_ray.end.y,guard.last_ray.end.z])
		check(hits>0 and hits<100,"Side %d top deck has physical hits and visible misses"%side)
		game.player.position=Vector3(side*5,8.0,0)
		var lower=MMFEnemyBallistics.trace(game,origin,game.player.global_position+Vector3.UP,[guard.get_rid()],3)
		check(not lower.is_empty() and lower.collider!=game.player,"Side %d machine structure shelters lower deck"%side)
		evidence.sides.append({"side":side,"hits_of100":hits,"origin":MMFAssets.dict_v(origin),"lower_cover":str(lower.get("collider")),"footpads":pads,"pile_extensions":piles,"rays":rays})
		game.player.position=Vector3(side*12,16.03,0)
		var before=guard.shots_fired;guard.windup=.01
		game.open_menu("Pause");game.roadside.update(1)
		check(guard.shots_fired==before,"Pause emits no outpost shot")
		game.close_menu();game.cinematic="test";game.roadside.update(1)
		check(guard.shots_fired==before,"Cinematic emits no outpost shot")
		game.cinematic="";game.session.story.phase="docked";game.roadside.update(1)
		check(guard.shots_fired==before and not game.roadside.may_fire(),"Docked sanctuary emits no outpost shot")
		game.session.story.phase="locked"
		var damaged=guard.take_damage(1000,guard.global_position+Vector3.UP)
		check(damaged>0 and guard.dead and guard.collision_layer==0 and game.session.roadside.active.health[0]==0,"Dead guard becomes a durable, nonblocking visible corpse")
		guard.animator.seek(guard.animator.get_animation(guard.presentation.current).length,true);guard.animator.pause();guard.update(0,false)
		for i in 2:await process_frame
		var corpse=posed_bounds(guard)
		check(corpse.position.y>=-.005 and corpse.position.y<.015,"Defeated guard contacts platform within 5 mm without sinking")
		check(corpse.position.x+guard.position.x> -2.5 and corpse.end.x+guard.position.x<2.5 and corpse.position.z+guard.position.z> -1.52 and corpse.end.z+guard.position.z<1.5,"Defeated guard remains inside twin tower rails including weapon and attachments")
		var raw=game.session.native_snapshot();var trial=MMFSession.new(game.data)
		check(trial.restore_native(raw) and trial.roadside.active.health[0]==0,"Save/load retains a killed guard")
		var late=raw.duplicate(true);late.erase("roadside");var old=MMFSession.new(game.data)
		check(old.restore_native(late) and old.roadside==MMFRoadsideOutposts.defaults(),"Older saves default to an empty schedule without changing progression")
		game.roadside.reset();game.session.roadside=trial.roadside;game.roadside.update(0)
		check(game.roadside.guards[0].dead and game.roadside.guards[1].health==60,"Reassembled tower keeps its individual dead/live guards")
		for i in 2:await process_frame
	# Use actual durable save files and main.load_game, then allow normal main
	# physics to reassemble. This covers the shipping session-swap/reset hooks.
	game.player.position=Vector3(4,16.03,0);game.session.attack_recent=0
	game.open_menu("Pause")
	check(game.safe_to_save() and game.save_game("roadside-live"),"Production save accepts an active roadside tower with a defeated guard")
	var loaded=MMFSaves.read("roadside-live")
	check(MMFRoadsideOutposts.valid(loaded.get("session",{}).get("roadside",{})),"JSON numeric enums survive disk serialization")
	game.roadside.guards[1].take_damage(1000,game.roadside.guards[1].global_position)
	game.load_game("roadside-live");game.set_physics_process(true)
	for i in 5:await physics_frame
	game.set_physics_process(false)
	check(game.roadside.guards.size()==2 and game.roadside.guards[0].dead and not game.roadside.guards[1].dead,"Production load and normal main update restore each guard's saved outcome")
	check(not game.combat.active_threat(),"Reloaded roadside guards still do not block docking")
	var restored_corpse=posed_bounds(game.roadside.guards[0])
	check(restored_corpse.position.y>=-.005 and restored_corpse.position.y<.015,"Production reload preserves the seated death pose")
	var second=game.roadside.guards[1];second.take_damage(1000,second.global_position)
	second.animator.seek(second.animator.get_animation(second.presentation.current).length,true);second.animator.pause();second.update(0,false)
	for i in 2:await process_frame
	var second_corpse=posed_bounds(second)
	check(second_corpse.position.x+second.position.x>restored_corpse.end.x+game.roadside.guards[0].position.x and second_corpse.end.x+second.position.x<2.5,"Two defeated guards occupy separate supported bays without intersecting each other or a side rail")
	game.roadside.reset();game.session.roadside=MMFRoadsideOutposts.defaults()
	game.session.distance=spec.atDistance-25;game.roadside.update(.1)
	check(not is_instance_valid(game.roadside.tower) and game.session.roadside.nextSlot==1,"Late discovery skips nearby tower instead of spawning an ambush")
	game.session.distance=1000000000;game.roadside.update(.1)
	check(game.session.roadside.nextSlot>700000,"Huge distance jump catches up with bounded arithmetic work")
	active_fixture(1);var next=game.session.roadside.nextSlot
	game.session.distance+=MMFRoadsideOutposts.RETIRE+1;game.roadside.update(.1)
	check(not is_instance_valid(game.roadside.tower) and game.session.roadside.active.is_empty() and game.session.roadside.nextSlot==next,"Passed tower retires all actors while retaining consumed slot watermark")
	var retained_story=game.session.story.duplicate(true)
	game.roadside.reset();game.session.roadside=MMFRoadsideOutposts.defaults()
	game.session.distance=spec.atDistance-250;game.session.story.phase="locked";game.roadside.update(.1)
	check(not game.roadside.placement_job.is_empty() and int(game.roadside.placement_job.index)==1,"Production preparation evaluates only one scenery chunk per update")
	game.session.story.index=2;game.session.story.arrival=spec.atDistance;game.session.story.phase="approach"
	game.campaign.create_destination(game.campaign.expedition())
	check(is_instance_valid(game.campaign.destination) and game.campaign.destination_id=="quiet-array","Approach fixture contains the actual large Array destination")
	for i in 20:game.roadside.update(.1)
	check(not is_instance_valid(game.roadside.tower) and game.session.roadside.nextSlot==1 and game.roadside.placement_job.is_empty(),"Route chosen during preparation prevents tower/destination intersection before commit")
	game.session.story.phase="locked";active_fixture(1)
	game.session.story.arrival=600;game.session.story.phase="approach";game.roadside.update(.1)
	check(not is_instance_valid(game.roadside.tower) and game.session.roadside.active.is_empty(),"Newly selected nearby destination retires an already visible tower and preserves its watermark")
	game.campaign.destination.queue_free();game.campaign.destination=null;game.campaign.points.clear();game.session.story=retained_story
	for corrupt in [{"nextSlot":-1,"active":{}},{"nextSlot":1,"active":{"health":[0]}},{"nextSlot":1,"active":[]}]:
		check(not MMFRoadsideOutposts.valid(corrupt),"Malformed roadside save is rejected")
	var raw=game.session.native_snapshot();raw.roadside={"nextSlot":-1,"active":{}}
	check(not MMFSession.new(game.data).restore_native(raw),"Invalid roadside state cannot bypass whole-session validation")
	evidence.production_preparation_peak_ms=game.roadside.preparation_peak_usec/1000.0;evidence.assembly_ms=game.roadside.last_reveal_usec/1000.0
	evidence.assembly_scope="Deliberately cold headless fixture with title preparation disabled; actual prewarmed native reveal is measured in the separate performance fixture."
	var report={"checks":checks,"failures":failures,"evidence":evidence,"source_hash":MMFPlaytestRecorder.source_fingerprint()}
	var file=FileAccess.open(OUT+"headless.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause");while game.combat.nav.is_baking():await process_frame
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();MMFRoadsideOutposts.clear_cache();await drain.finish(self,refs)
	print("ROADSIDE_OUTPOSTS_RESULT ",checks," checks; failures: ",failures);quit(0 if failures.is_empty() else 1)
