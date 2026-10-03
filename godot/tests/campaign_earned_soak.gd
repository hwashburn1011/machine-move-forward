extends SceneTree

# A scripted native actor, not a human playtest. It never edits progression,
# stock, damage, clocks, distance or cargo. Movement and combat use live input;
# paid crafting/building and local controls use named production authorities.
var game
var output=""
var run_id=""
var seed_name="mmf-default-seed"
var wall_limit=1200.0
var stop_after="wake"
var started_ms=0
var next_heartbeat=0.0
var last_sample_ms=0
var active_wall=0.0
var stage="startup"
var failures=[]
var events=[]
var milestones=[]
var transactions=[]
var source_start=""
var normal_saves={}
var starting_resources={}
var last_health=100.0
var damage_taken=0.0
var walked_m=0.0
var throws=0
var cargo_receipts=0
var ending=false
var turret={}
var refinery={}
var workbench={}
var initial_scope=""
var runtime_ready=false
var minima={"fuel":INF,"health":INF,"engine":INF,"scrap":2147483647,"components":2147483647}
var time_by_phase={}
var previous_resources={}
var resource_movements=[]
var combat_transitions=[]
var previous_carrier_state=""

func _initialize():
	set_meta("test_mode",true)
	run_id="earned-"+str(Time.get_unix_time_from_system()).replace(".","-")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--run-id="):run_id=arg.trim_prefix("--run-id=").validate_filename()
		elif arg.begins_with("--seed="):seed_name=arg.trim_prefix("--seed=")
		elif arg.begins_with("--max-wall="):wall_limit=clampf(float(arg.trim_prefix("--max-wall=")),20,3600)
		elif arg.begins_with("--stop-after="):stop_after=arg.trim_prefix("--stop-after=")
	output="res://../test-results/campaign-earned-soak/"+run_id+"/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	initial_scope=MMFSaves.DIRECTORY
	normal_saves=save_hashes(initial_scope)
	MMFSaves.DIRECTORY=ProjectSettings.globalize_path(output+"saves/").simplify_path()+"/"
	Engine.time_scale=1.0
	Engine.max_fps=60
	started_ms=Time.get_ticks_msec();last_sample_ms=started_ms
	call_deferred("run")

func save_hashes(directory: String) -> Dictionary:
	var result={}
	for name in DirAccess.get_files_at(directory):
		result[name]=FileAccess.get_sha256(directory.path_join(name))
	return result

func elapsed() -> float:return (Time.get_ticks_msec()-started_ms)/1000.0

func resources() -> Dictionary:
	var result={}
	if not runtime_ready:return result
	for bag in game.session.containers():
		for slot in bag.slots:
			if slot:result[slot.itemId]=int(result.get(slot.itemId,0))+int(slot.count)
	return result

func state() -> Dictionary:
	if not runtime_ready:return {"stage":stage,"wall_seconds":elapsed()}
	var s=game.session
	return {"stage":stage,"wall_seconds":elapsed(),"simulation_seconds":s.clock,"active_wall_seconds":active_wall,
		"fuel":s.fuel,"health":s.health,"engine":s.subsystems.engine,"distance":s.distance,"speed":s.speed,
		"supplies":resources(),"story":s.story.duplicate(true),"scanner":s.scanner.duplicate(true),
		"objective":game.guidance.current_task().get("text",""),"threat":game.combat.ship_state,
		"defenses":s.facts.defenses,"damage_taken":damage_taken,"walked_m":walked_m,
		"throws":throws,"cargo_receipts":cargo_receipts,"player":MMFAssets.dict_v(game.player.position)}

func event(name: String,details: Dictionary={}):
	var entry={"event":name,"wall_seconds":elapsed(),"simulation_seconds":game.session.clock if runtime_ready else 0.0,"details":details}
	events.append(entry)
	print("EARNED_EVENT ",JSON.stringify(entry))

func fail(reason: String) -> bool:
	if reason not in failures:failures.append(reason);event("failure",{"reason":reason})
	return false

func _process(_delta):
	var now=Time.get_ticks_msec()
	if runtime_ready and not paused and game.cinematic=="":active_wall+=(now-last_sample_ms)/1000.0
	last_sample_ms=now
	if runtime_ready:
		if game.invulnerable or not is_equal_approx(Engine.time_scale,1.0):
			fail("Normal damage/time invariant violated during live sampling")
		var carrier=str(game.combat.ship_state)
		if carrier!=previous_carrier_state:
			combat_transitions.append({"state":carrier,"wall_seconds":elapsed(),"simulation_seconds":game.session.clock,"ship_health":game.combat.ship_health,"player_health":game.session.health})
			previous_carrier_state=carrier
		if game.session.health<last_health:damage_taken+=last_health-game.session.health
		last_health=game.session.health
		for key in ["fuel","health"]:minima[key]=minf(minima[key],float(game.session.get(key)))
		minima.engine=minf(minima.engine,game.session.subsystems.engine)
		for key in ["scrap","components"]:minima[key]=mini(minima[key],game.session.count_resource(key))
		var phase=str(game.session.story.phase)
		time_by_phase[phase]=float(time_by_phase.get(phase,0))+_delta
		var observed=resources()
		if observed!=previous_resources:
			var delta={}
			for key in previous_resources.keys()+observed.keys():
				var amount=int(observed.get(key,0))-int(previous_resources.get(key,0))
				if amount!=0:delta[key]=amount
			resource_movements.append({"wall_seconds":elapsed(),"simulation_seconds":game.session.clock,"actor_stage":stage,"delta":delta,"after":observed,"carrier":game.combat.ship_state,"hook":game.salvage.hook_phase})
			previous_resources=observed
	if ending:return false
	if elapsed()>=next_heartbeat:
		next_heartbeat=elapsed()+10
		var snapshot=state();snapshot["complete"]=false
		write_json("progress.json",snapshot)
		print("EARNED_HEARTBEAT ",JSON.stringify(snapshot))
	if elapsed()>wall_limit:
		fail("Hard wall timeout during "+stage)
		finish.call_deferred(false)
	return false

func write_json(name: String,value):
	var file=FileAccess.open(output+name,FileAccess.WRITE)
	if file:file.store_string(JSON.stringify(value,"  "));file.flush()

func release_inputs():
	for key in ["forward","back","left","right","fire","aim","use","sprint","reel"]:Input.action_release(key)

func wait_seconds(seconds: float):
	var until=elapsed()+seconds
	while elapsed()<until and not ending:await process_frame

func alive() -> bool:return not ending and failures.is_empty()

func clear_ray(at: Vector3,target: Vector3) -> bool:
	var hit=game.raycast(at+Vector3.UP*1.35,target,[game.player.get_rid()])
	return hit.is_empty() or hit.position.distance_to(target)<.55

func path_to(target: Vector3,radius: float=1.7,require_sight: bool=false) -> Array:
	# Upper deck and real expedition floors. No teleport, gravity override or
	# boundary suppression. A path failure is evidence, not a reason to warp.
	var start=Vector2i(roundi(game.player.position.x*2),roundi(game.player.position.z*2))
	var queue=[start];var previous={start:start};var cursor=0;var goal=start;var found=false
	while cursor<queue.size() and queue.size()<18000:
		var cell=queue[cursor];cursor+=1
		var at=Vector3(cell.x*.5,16.09,cell.y*.5)
		if Vector2(at.x-target.x,at.z-target.z).length()<radius and (not require_sight or clear_ray(at,target)):goal=cell;found=true;break
		for delta in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
			var next=cell+delta
			if previous.has(next) or next.x< -26 or next.x>80 or absi(next.y)>29:continue
			var candidate=Vector3(next.x*.5,16.09,next.y*.5)
			if not game.player.boundary.fits(candidate):continue
			if game.player.test_move(Transform3D(Basis.IDENTITY,at),candidate-at):continue
			previous[next]=cell;queue.append(next)
	if not found:return []
	var reverse=[goal]
	while goal!=start:goal=previous[goal];reverse.append(goal)
	reverse.reverse();var points=[]
	for i in range(1,reverse.size()):
		if i+1<reverse.size() and reverse[i]-reverse[i-1]==reverse[i+1]-reverse[i]:continue
		points.append(Vector3(reverse[i].x*.5,16.09,reverse[i].y*.5))
	if points.is_empty():points.append(Vector3(start.x*.5,16.09,start.y*.5))
	return points

func walk_to(target: Vector3,radius: float=1.7,require_sight: bool=false) -> bool:
	release_inputs();game.close_menu()
	if game.manual_turret!="":game.dismount_turret()
	var path=path_to(target,radius,require_sight)
	if path.is_empty():return fail("Actor found no supported walk path to "+str(target)+" from "+str(game.player.position))
	for point in path:
		var deadline=elapsed()+game.player.position.distance_to(point)/2.0+4
		while elapsed()<deadline and alive():
			var delta=(point-game.player.position)*Vector3(1,0,1)
			if delta.length()<.18:break
			game.player.yaw=atan2(-delta.x,-delta.z)
			var before=game.player.position
			Input.action_press("forward");await physics_frame
			walked_m+=game.player.position.distance_to(before)
		Input.action_release("forward")
		if not alive():return false
		if Vector2(game.player.position.x-point.x,game.player.position.z-point.z).length()>.5:
			return fail("Actor blocked while walking to "+str(point)+" at "+str(game.player.position))
	return true

func aim_at(target: Vector3,origin: Vector3):
	var direction=(target-origin).normalized()
	game.player.yaw=atan2(-direction.x,-direction.z)
	game.player.pitch=asin(clampf(direction.y,-1,1))

func collect_cargo(deadline_seconds: float=110) -> bool:
	stage="collect_spawned_salvage"
	var before=resources();var limit=elapsed()+deadline_seconds
	while elapsed()<limit and alive():
		if game.cinematic!="" or game.combat.active_threat():return false
		var index=-1;var distance=INF
		for i in game.salvage.crates.size():
			var c=game.salvage.crates[i]
			if not c.active or c.heavy or c.claimed not in ["","parked"]:continue
			var length=c.node.position.distance_to(game.salvage.hand_position())
			if length<distance:index=i;distance=length
		if index<0:await physics_frame;continue
		var cargo=game.salvage.crates[index]
		if distance>31:
			await physics_frame;continue
		var direction=game.salvage.suggested_direction(index)
		game.player.yaw=atan2(-direction.x,-direction.z);game.player.pitch=asin(direction.y)
		game.player.update_camera(1.0/60.0)
		await physics_frame
		# Production throw authority performs the actual projectile intercept
		# and return. No receive(), reward(), spawn() or cargo mutation is used.
		game.salvage.throw_hook();throws+=1
		event("actor_hook_throw",{"crate_index":index,"range":distance,"actor_api":"MMFSalvage.throw_hook"})
		while game.salvage.busy() and alive():await physics_frame
		if resources()!=before:
			cargo_receipts+=1;event("earned_cargo",{"before":before,"after":resources()});return true
		await wait_seconds(.3)
	return false

func build_paid(id: String,cell: Dictionary) -> Dictionary:
	stage="build_"+id
	if not await walk_to(game.building.center(cell)+Vector3(0,1.2,0),3.0):return {}
	var spec={"definitionId":id,"cell":cell,"rotation":0}
	var report=game.building.placement_report(spec)
	if not report.valid:fail("Paid placement refused for "+id+": "+report.reason);return {}
	var before=resources()
	var piece=game.session.create_piece(id,cell)
	if piece.is_empty():fail("Ordinary supplies cannot fund "+id);return {}
	game.building.add_visual(piece);game.session.update_power();game.combat.layout_changed()
	event("actor_paid_construction",{"id":id,"cell":cell,"cost":game.data.BUILD_PIECES[id].cost,"before":before,"after":resources(),"actor_api":"placement_report + create_piece(free=false) + add_visual"})
	await wait_seconds(1.5)
	return piece

func craft_paid(id: String,station: Dictionary) -> bool:
	stage="craft_"+id
	if not await walk_to(game.building.center(station.cell)+Vector3.UP):return false
	game.service_piece(station)
	if not game.menu_open or game.ui.page!="Workshop":return fail("Craft station was not reached: "+id)
	await wait_seconds(2)
	var result=game.session.craft(id,1,station.instanceId)
	event("actor_craft",{"recipe":id,"success":result,"actor_api":"MMFSession.craft at reached Workshop"})
	game.close_menu()
	return result or fail("Ordinary supplies/power cannot craft "+id)

func milestone(label: String):
	release_inputs()
	if game.manual_turret!="":game.dismount_turret()
	var saved=game.save_game(label)
	var snapshot=state();snapshot["save_succeeded"]=saved
	milestones.append({"id":label,"snapshot":snapshot})
	write_json(label+".json",snapshot);event("milestone",{"id":label,"saved":saved})

func fight_until_clear(seconds: float=240) -> bool:
	stage="live_defense"
	var until=elapsed()+seconds
	if not await walk_to(game.building.center(turret.cell)+Vector3.UP):return false
	game.service_piece(turret)
	await wait_seconds(.2)
	while elapsed()<until and alive():
		if game.session.story.phase=="route-selection" and not game.combat.active_threat():break
		if game.session.health<=0:
			release_inputs();await physics_frame;continue
		var target=Vector3.INF
		for enemy in game.combat.enemies:
			if is_instance_valid(enemy) and not enemy.dead and not enemy.inactive:target=enemy.position+Vector3.UP*1.1;break
		if not target.is_finite() and is_instance_valid(game.combat.ship) and game.combat.ship_health>0:
			target=game.combat.ship.to_global(Vector3(0,3,0))
		if target.is_finite():
			var origin=game.building.center(turret.cell)+Vector3.UP*1.35 if game.manual_turret!="" else game.player.position+Vector3.UP*1.45
			aim_at(target,origin)
			Input.action_press("fire")
			if game.manual_turret=="":
				Input.action_press("aim")
				if game.session.weapons[game.session.current_weapon].ammoInMag==0 and game.player.reload_left<=0:game.player.reload_weapon()
		else:Input.action_release("fire")
		await physics_frame
	release_inputs();game.dismount_turret()
	return game.session.story.phase=="route-selection" or fail("Live defense failed to clear within its actor timeout")

func find_point(id: String) -> Dictionary:
	for point in game.campaign.points:
		if point.entry.id==id:return point
	return {}

func reach_point(point: Dictionary) -> bool:
	if point.is_empty():return fail("Missing authored expedition interaction")
	var at=game.campaign.destination.to_global(point.at)
	if not await walk_to(at,1.7,true):return false
	var reason=game.activity.interaction_refusal(point.entry)
	return reason=="" or fail("Reached control refused: "+point.entry.id+" / "+reason)

func complete_wake() -> bool:
	stage="wake_local_work"
	for point in game.campaign.points.duplicate():
		if point.entry.kind!="journal" or not game.campaign.can_show(point.entry):continue
		if not await reach_point(point):return false
		if not game.campaign.interact(point.entry):return fail("Wake record transaction refused")
		event("actor_read_record",{"id":point.entry.id,"minimum_dwell_seconds":5})
		await wait_seconds(5);game.close_menu()
	for action in MMFExpeditionMechanisms.STEPS.gyro:
		var point=find_point("mechanism-gyro-"+action)
		if not await reach_point(point):return false
		game.activity.open(point.entry);await wait_seconds(2)
		if not game.activity.act():return fail("Wake mechanism refused: "+action+" / "+game.activity.feedback)
		game.close_menu()
		while game.activity.moving() and alive():await physics_frame
		if not alive():return false
	for point in game.campaign.points.duplicate():
		if point.entry.kind!="unique" or not game.campaign.can_show(point.entry):continue
		if not await reach_point(point):return false
		if not game.campaign.interact(point.entry):return fail("Wake recovery refused: "+point.entry.id)
	if not await walk_to(game.world.helm_model.root.global_position):return false
	game.interact()
	if not game.campaign.depart():return fail("Wake departure refused: "+game.campaign.departure_reason())
	while "wreck-one" not in game.session.story.completed and alive():await physics_frame
	milestone("wake-earned")
	return alive()

func run():
	source_start=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	if not game.has_method("new_game") or game.get("session")==null:
		fail("Native runtime did not initialize; inspect compile/startup errors before interpreting actor results")
		await finish(false);return
	runtime_ready=true
	game.session.seed_name=seed_name;game.session.rng.seed=MMFRandom.hash_seed([seed_name])
	starting_resources=resources()
	previous_resources=starting_resources.duplicate()
	game.recorder.configure({"run_id":run_id,"seed":seed_name,"mode":"campaign","source_hash":source_start,"tuning_revision":"native-earned-soak"},true,16384)
	game.session.transaction.connect(func(name,details):transactions.append({"event":name,"details":details.duplicate(true),"wall_seconds":elapsed(),"simulation_seconds":game.session.clock,"supplies":resources()}))
	if game.invulnerable:fail("Fresh game unexpectedly invulnerable");await finish(false);return
	stage="normal_new_game";game.new_game()
	while (not game.session.opening_done or game.cinematic!="") and alive():await process_frame
	if not alive():return
	event("normal_opening_completed",{"supplies":resources()})
	if not await collect_cargo():fail("No actual spawned cargo collected within opening actor budget");await finish(false);return
	if stop_after=="cargo":milestone("cargo-earned");await finish(true);return
	var floor_a=await build_paid("floor",{"x":3,"y":0,"z":3})
	if floor_a.is_empty():await finish(false);return
	refinery=await build_paid("refinery",{"x":3,"y":0,"z":3})
	if refinery.is_empty():await finish(false);return
	while game.session.count_resource("components")<12 and alive():
		if not await craft_paid("refine-components",refinery):await finish(false);return
	if (await build_paid("floor",{"x":4,"y":0,"z":3})).is_empty():await finish(false);return
	workbench=await build_paid("workbench",{"x":4,"y":0,"z":3})
	if workbench.is_empty() or not await craft_paid("craft-scanner-replacement-module",workbench):await finish(false);return
	if not await walk_to(game.world.receiver.global_position):await finish(false);return
	game.interact()
	if not game.near_receiver() or not game.session.install_scanner() or not game.session.start_scan(game.aboard()):fail("Reached receiver installation/start refused");await finish(false);return
	game.close_menu();event("paid_scanner_started")
	if (await build_paid("floor",{"x":3,"y":0,"z":4})).is_empty():await finish(false);return
	turret=await build_paid("turret-manual",{"x":3,"y":0,"z":4})
	if turret.is_empty():await finish(false);return
	if not await walk_to(game.building.center(turret.cell)+Vector3.UP):await finish(false);return
	game.service_piece(turret);await wait_seconds(1);game.dismount_turret()
	stage="normal_clock_scanning"
	while game.session.scanner.phase!="consumed" and alive():await physics_frame
	while game.cinematic!="" and alive():await physics_frame
	if not alive():return
	if not await fight_until_clear():await finish(false);return
	milestone("opening-earned")
	if stop_after=="opening":await finish(true);return
	if not await walk_to(game.world.helm_model.root.global_position):await finish(false);return
	game.interact()
	if not game.campaign.begin_route():fail("First Wake route refused at reached helm");await finish(false);return
	stage="normal_clock_wake_travel"
	while game.session.story.phase!="docked" and alive():
		if game.combat.active_threat():
			fail("Unexpected additional encounter during bounded first Wake transit; actor continuation needed")
			break
		await physics_frame
	if not alive():await finish(false);return
	milestone("wake-arrival-earned")
	await finish(await complete_wake())

func finish(success: bool):
	if ending:return
	ending=true;release_inputs()
	var final_state=state()
	var source_end=MMFPlaytestRecorder.source_fingerprint()
	if source_end!=source_start:fail("Runtime source changed during run; evidence is diagnostic only")
	if save_hashes(initial_scope)!=normal_saves:fail("Normal campaign save scope changed")
	if runtime_ready and (game.invulnerable or not is_equal_approx(Engine.time_scale,1.0)):fail("Normal damage/time invariant violated")
	var ratio=float(final_state.get("simulation_seconds",0))/maxf(.001,active_wall)
	if success and ratio<.90:fail("Simulation fell below90% of active wall time; do not treat result as normal-clock pacing")
	if success and ratio>1.10:fail("Simulation exceeded110% of active wall time; do not treat result as normal-clock pacing")
	var combat_summary={"carrier_transitions":combat_transitions,"manual_turret_shots":0,"manual_turret_damaging_hits":0,"recorder_overflow":0}
	if runtime_ready:
		combat_summary.recorder_overflow=game.recorder.overflow
		for receipt in game.recorder.events:
			if receipt.event=="manual_turret_shot":
				combat_summary.manual_turret_shots+=1
				if receipt.payload.get("damaging_hit",false):combat_summary.manual_turret_damaging_hits+=1
	for key in minima:
		if not is_finite(float(minima[key])):minima[key]=null
	var report={"schema":1,"run_id":run_id,"human_test":false,"mode":"scripted native normal-clock earned-supply soak","stop_after":stop_after,
		"passed":success and failures.is_empty(),"failures":failures,"source_hash":source_start,"source_hash_end":source_end,"source_stable":source_start==source_end,
		"seed":seed_name,"time_scale":Engine.time_scale,"simulation_to_active_wall_ratio":ratio,"starting_resources":starting_resources,"final":final_state,
		"milestones":milestones,"transactions":transactions,"events":events,"resource_movements":resource_movements,"minimum_resources":minima,"wall_seconds_by_phase":time_by_phase,"save_directory":MMFSaves.DIRECTORY,"normal_campaign_saves_unchanged":save_hashes(initial_scope)==normal_saves,"combat_observations":combat_summary,
		"actor_contract":{"movement":"Input forward with collision-checked route planning; no position edits","aim":"Programmatic yaw/pitch target selection; not measured human aiming","salvage":"Actual distance-spawned cargo and production hook flight; no direct receive/reward calls","building":"Reach/support/occupancy/unlock placement_report then paid create_piece and visual add; not UI pointer placement","crafting":"Production craft authority at physically reached Workshop","controls":"Reached local authorities and normal mechanism durations; reading waits are scripted five-second minima","combat":"Damage enabled, normal fire input/raycast/rate/reload; no direct enemy health writes","pacing":"Real engine physics; no fixed-fps, time acceleration or manual ticks","limits":"Opening through Wake only; no uncoached comprehension, expected novice skill or complete campaign balance claim. Scripted minimal read/build decisions underestimate exploratory dwell."}}
	write_json("report.json",report)
	var completed_progress=final_state.duplicate(true);completed_progress["complete"]=true;completed_progress["passed"]=report.passed
	write_json("progress.json",completed_progress)
	if runtime_ready:
		game.recorder.write_report(output+"recorder.json",game.session.clock)
		game.open_menu("Pause")
		game.autosaver.flush()
		var deadline=elapsed()+10
		while game.combat.nav.is_baking() and elapsed()<deadline:await process_frame
		var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
		game.queue_free();runtime_ready=false
		while is_instance_valid(game):await process_frame
		MMFAssets.cache.clear();await drain.finish(self,refs)
	elif is_instance_valid(game):
		game.queue_free();while is_instance_valid(game):await process_frame
	print("CAMPAIGN_EARNED_SOAK_RESULT ",JSON.stringify({"passed":report.passed,"failures":failures,"directory":output,"final":final_state}))
	quit(0 if report.passed else 1)
