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
var completed_sites=[]
var frame_ms=[]
var ground_recoveries=0
var resume_save=""
var initial_clock=0.0
var combat_observation={}
var review_enabled=false
var review_next=0.0
var review_capture_at=-100.0
var review_pending=false
var review_signature=""
var review_rows=[]
var review_slow=[]

func _initialize():
	set_meta("test_mode",true)
	run_id="earned-"+str(Time.get_unix_time_from_system()).replace(".","-")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--run-id="):run_id=arg.trim_prefix("--run-id=").validate_filename()
		elif arg.begins_with("--seed="):seed_name=arg.trim_prefix("--seed=")
		elif arg.begins_with("--max-wall="):wall_limit=clampf(float(arg.trim_prefix("--max-wall=")),20,7200)
		elif arg.begins_with("--stop-after="):stop_after=arg.trim_prefix("--stop-after=")
		elif arg.begins_with("--resume-save="):resume_save=arg.trim_prefix("--resume-save=")
		elif arg=="--review":review_enabled=true
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
	if not DirAccess.dir_exists_absolute(directory):return result
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
		"throws":throws,"cargo_receipts":cargo_receipts,"ground_recoveries":game.player.boundary.recoveries,"combat_observation":combat_observation,"player":MMFAssets.dict_v(game.player.position)}

func event(name: String,details: Dictionary={}):
	var entry={"event":name,"wall_seconds":elapsed(),"simulation_seconds":game.session.clock if runtime_ready else 0.0,"details":details}
	events.append(entry)
	print("EARNED_EVENT ",JSON.stringify(entry))

func fail(reason: String) -> bool:
	if reason not in failures:failures.append(reason);event("failure",{"reason":reason})
	return false

func _process(_delta):
	if review_enabled and runtime_ready and not ending:observe_review(_delta)
	var now=Time.get_ticks_msec()
	if runtime_ready and not paused and game.cinematic=="":active_wall+=(now-last_sample_ms)/1000.0
	last_sample_ms=now
	if runtime_ready:
		if not paused and game.cinematic=="" and frame_ms.size()<250000:frame_ms.append(_delta*1000.0)
		if game.player.boundary.recoveries>ground_recoveries:
			ground_recoveries=game.player.boundary.recoveries
			fail("Production ground recovery occurred; inspect walking route and floor before acceptance")
			finish.call_deferred(false)
		if game.started and game.session.opening_done and game.session.health<=0:
			fail("Player died during the earned run; preserve this attempt for combat review")
			finish.call_deferred(false)
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

func observe_review(delta: float):
	# Observation only: never move the camera/player, pause, or change play.
	# PNG readback can stall a frame; nearby samples are explicitly tagged.
	var now=elapsed()
	if delta>.033 and review_slow.size()<4000:
		review_slow.append({"wall_seconds":now,"frame_ms":delta*1000,"stage":stage,"phase":game.session.story.phase,"cinematic":game.cinematic,"menu":game.ui.page if game.menu_open else "","near_capture":now-review_capture_at<1.0})
	var signature=stage+"|"+game.cinematic+"|"+(game.ui.page if game.menu_open else "")+"|"+str(game.guidance.current_task().get("text",""))
	if now<review_next and (signature==review_signature or now-review_capture_at<3.0):return
	review_signature=signature;review_next=now+15.0
	if not review_pending and DisplayServer.get_name()!="headless":
		review_pending=true;capture_review.call_deferred()

func capture_review():
	await RenderingServer.frame_post_draw
	if runtime_ready and not ending:
		var name="review-%04d.png"%review_rows.size()
		var snapshot=state()
		snapshot["capture"]=name;snapshot["cinematic"]=game.cinematic
		snapshot["menu"]=game.ui.page if game.menu_open else ""
		snapshot["prompt"]=game.ui.prompt.text;snapshot["toast"]=game.ui.toast.text
		snapshot["caption"]=game.ui.caption.text
		review_capture_at=elapsed()
		root.get_texture().get_image().save_png(output+name)
		snapshot["capture_wall_ms"]=(elapsed()-review_capture_at)*1000
		review_rows.append(snapshot)
		write_review()
	review_pending=false

func write_review():
	write_json("visual-review.json",{"scope":"Automated earned route with sparse native screenshots; not continuous video, human play, or a performance benchmark. PNG/readback and observer work can stall frames; near-capture samples are tagged.","captures":review_rows,"frames_over33ms":review_slow})

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
	var check_deadline=elapsed()+15
	while report.get("pending",false) and elapsed()<check_deadline and alive():
		await physics_frame
		report=game.building.placement_report(spec)
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
	# Destroying a carrier can finish just before the last crew hit's ordinary
	# five-second combat-save lock expires. Wait for the same gate as the player.
	var safe_deadline=elapsed()+12
	while not game.safe_to_save() and elapsed()<safe_deadline and alive():await physics_frame
	if not alive():return
	if not game.safe_to_save():
		fail("Milestone still unsafe after waiting: "+label)
		return
	var saved=game.save_game(label)
	if not saved:fail("Milestone save failed: "+label)
	var snapshot=state();snapshot["save_succeeded"]=saved
	milestones.append({"id":label,"snapshot":snapshot})
	write_json(label+".json",snapshot);event("milestone",{"id":label,"saved":saved})
	if DisplayServer.get_name()!="headless":
		if game.session.story.phase=="docked" and is_instance_valid(game.campaign.destination):aim_at(game.campaign.destination.to_global(Vector3(0,1.5,0)),game.player.position+Vector3.UP*1.45)
		elif is_instance_valid(game.finale.berth):aim_at(game.finale.berth.to_global(Vector3(0,1.5,0)),game.player.position+Vector3.UP*1.45)
		capture_milestone.call_deferred(label)

func capture_milestone(label: String):
	await RenderingServer.frame_post_draw
	if runtime_ready and not ending:
		if review_enabled:review_capture_at=elapsed()
		root.get_texture().get_image().save_png(output+label+".png")

func fight_until_clear(seconds: float=240,first_defense: bool=false) -> bool:
	stage="live_defense"
	var until=elapsed()+seconds
	var blocked_since=elapsed()
	if not await walk_to(game.building.center(turret.cell)+Vector3.UP):return false
	game.service_piece(turret)
	await wait_seconds(.2)
	while elapsed()<until and alive():
		if not game.combat.active_threat() and game.combat.ship_state=="none" and (not first_defense or game.session.story.phase=="route-selection"):break
		if game.session.health<=0:
			release_inputs();await physics_frame;continue
		if game.session.health<=60 and game.session.count_resource("repair-kit")>0:
			game.session.use_item("repair-kit")
			event("actor_owned_healing",{"health":game.session.health})
		var candidates=[]
		for enemy in game.combat.enemies:
			if is_instance_valid(enemy) and not enemy.dead and not enemy.inactive:candidates.append(enemy.position+Vector3.UP*1.1)
		if is_instance_valid(game.combat.scout.actor):candidates.append(game.combat.scout.actor.global_position)
		if is_instance_valid(game.combat.ship) and game.combat.ship_health>0:
			if game.combat.ship_kind=="gunboat" and game.combat.weapon_health>0:candidates.append(game.combat.ship.to_global(Vector3(0,3.4,-1.7)))
			candidates.append(game.combat.ship.to_global(Vector3(0,2.3 if game.combat.ship_kind=="gunboat" else 1.9,0)))
		var origin=game.building.center(turret.cell)+Vector3.UP*1.35 if game.manual_turret!="" else game.player.camera.global_position
		var exclusions=[game.player.get_rid()]
		if game.manual_turret!="":
			for body in MMFAssets.of_type(game.building.bodies[game.manual_turret],"StaticBody3D"):exclusions.append(body.get_rid())
		var target=Vector3.INF
		for candidate in candidates:
			if candidate.distance_to(origin)>43:continue
			if game.manual_turret!="":
				var direction=(candidate-origin).normalized();var traverse=game.data.TURRETS["manual-turret"].traverse
				var yaw=wrapf(atan2(-direction.x,-direction.z)+int(turret.rotation)*PI/2,-PI,PI)
				if yaw<traverse.yawMin or yaw>traverse.yawMax or asin(direction.y)<traverse.pitchMin or asin(direction.y)>traverse.pitchMax:continue
			var hit=game.raycast(origin,candidate,exclusions,5)
			if not hit.is_empty() and (hit.collider is MMFEnemy or hit.collider is MMFHitZone):target=candidate;break
		var visible=target.is_finite()
		if not visible and not candidates.is_empty():target=candidates[0]
		var ready=visible
		if target.is_finite():
			aim_at(target,origin)
			if game.manual_turret=="":
				Input.action_press("aim")
				var pose=game.player.weapon_pose
				var trace=MMFOwnedShot.trace(game,pose.resolved_muzzle,game.player.camera.global_position,-game.player.camera.global_basis.z,game.weapon_definition().range,[game.player.get_rid()],pose.resolved_origin)
				ready=not trace.hit.is_empty() and (trace.hit.collider is MMFEnemy or trace.hit.collider is MMFHitZone)
				if game.session.weapons[game.session.current_weapon].ammoInMag==0 and game.player.reload_left<=0:game.player.reload_weapon()
		combat_observation={"mounted":game.manual_turret!="","ship_health":game.combat.ship_health,"weapon_health":game.combat.weapon_health,"target_visible":visible,"shot_ready":ready,"candidates":candidates.size()}
		if ready:
			blocked_since=elapsed();Input.action_press("fire")
		else:Input.action_release("fire")
		if not candidates.is_empty() and candidates[0].distance_to(origin)<43 and game.combat.ship_state!="approach" and elapsed()-blocked_since>2.5:
			event("actor_reposition_for_sight",combat_observation)
			game.dismount_turret()
			if not await walk_to(candidates[0],12,true):return false
			game.player.switch_weapon("rifle");await wait_seconds(.5)
			blocked_since=elapsed()
		await physics_frame
	release_inputs();game.dismount_turret()
	return (not game.combat.active_threat() and game.combat.ship_state=="none" and (not first_defense or game.session.story.phase=="route-selection")) or fail("Live defense failed to clear within its actor timeout")

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

func complete_site() -> bool:
	var site_id=str(game.campaign.expedition().id)
	stage=site_id+"_local_work"
	for point in game.campaign.points.duplicate():
		if point.entry.kind!="journal" or not game.campaign.can_show(point.entry):continue
		if not await reach_point(point):return false
		if not game.campaign.interact(point.entry):return fail(site_id+" record transaction refused")
		var dwell=5.0
		for record in game.campaign.expedition().journals:
			if record.id==point.entry.id:dwell=clampf(str(record.text).length()/16.0,5,40)
		event("actor_read_record",{"id":point.entry.id,"minimum_dwell_seconds":dwell})
		await wait_seconds(dwell);game.close_menu()
	for mechanism in MMFExpeditionMechanisms.SITES[site_id]:
		for action in MMFExpeditionMechanisms.STEPS[mechanism]:
			if action in game.activity.state(mechanism).mechanism.milestones:continue
			var point=find_point("mechanism-"+mechanism+"-"+action)
			if not await reach_point(point):return false
			game.activity.open(point.entry);await wait_seconds(2)
			if mechanism=="power" and action=="bus":
				for i in 3:
					if not game.activity.adjust(i,[2,1,0][i]):return fail("Foundry bus adjustment refused")
			if mechanism=="array" and action!="lock":
				var i=MMFExpeditionMechanisms.STEPS.array.find(action)
				if not game.activity.adjust(i,[25,60,85][i]):return fail("Array calibration adjustment refused")
			if not game.activity.act():return fail(site_id+" mechanism refused: "+action+" / "+game.activity.feedback)
			event("actor_local_mechanism",{"site":site_id,"mechanism":mechanism,"action":action})
			game.close_menu()
			while game.activity.moving() and alive():await physics_frame
			if not alive():return false
	# Objective equipment must be acknowledged before its dependent recoveries.
	for kind in ["objective","unique"]:
		for point in game.campaign.points.duplicate():
			if point.entry.kind!=kind or not game.campaign.can_show(point.entry):continue
			if not await reach_point(point):return false
			if not game.campaign.interact(point.entry):return fail(site_id+" recovery refused: "+point.entry.id)
	await wait_seconds(1.2)
	for point in game.campaign.points.duplicate():
		if point.entry.kind!="narrative" or not game.campaign.can_show(point.entry):continue
		if not await reach_point(point):return false
		if not game.campaign.interact(point.entry):return fail("Recovered signal unavailable")
		if point.entry.beat=="array-false-corridor":
			await wait_seconds(5)
			if not game.narrative.authorized():return fail("Array comparison lost local reader authorization")
			game.narrative.comparison=true;game.ui.refresh()
		event("actor_story_reader",{"beat":point.entry.beat})
		if game.story_voice.catalog.has(point.entry.beat):
			if not game.story_voice.play(point.entry.beat):return fail("Story recording playback refused at reached reader")
			event("actor_story_listen",{"beat":point.entry.beat})
		if DisplayServer.get_name()!="headless":capture_milestone.call_deferred("reader-"+str(point.entry.beat))
		await wait_seconds(25);game.close_menu()
	if not await service_at_site():return false
	if not await walk_to(game.world.helm_model.root.global_position):return false
	game.interact()
	if not game.campaign.depart():return fail(site_id+" departure refused: "+game.campaign.departure_reason())
	while site_id not in game.session.story.completed and alive():await physics_frame
	completed_sites.append(site_id)
	await milestone(site_id+"-earned")
	return alive()

func service_at_site() -> bool:
	var bay=game.engineering.bay()
	if bay.is_empty():return true
	if not await walk_to(bay.at,1.8):return false
	game.open_station("Service","service-bay",bay.id)
	if not game.engineering.authorized(true):return fail("Reached service bay refused authorization")
	await wait_seconds(3)
	var s=game.session
	if s.count_resource("fuel")>0 and s.fuel<95:MMFMachineService.refill(s)
	for id in s.subsystems:
		var quote=MMFMachineService.repair_quote(s,id)
		if quote.needed and s.can_pay({"scrap":quote.cost}):s.repair(id)
	for piece in s.structures:
		if piece.definitionId!="generator":continue
		var quote=MMFMachineService.repair_quote(s,piece.instanceId)
		if quote.needed and s.can_pay({"scrap":quote.cost}):s.repair(piece.instanceId)
	var purchase=mini(20,mini(int(floor(100-s.fuel)),int(s.count_resource("scrap")/2)))
	if purchase>0:MMFMachineService.buy_fuel(s,bay.id,purchase)
	event("actor_site_service",{"site":bay.id,"fuel":s.fuel,"supplies":resources(),"actor_api":"authorized reached Service bay / paid repair, refill and fuel pump"})
	game.close_menu();return true

func travel_to_site() -> bool:
	stage="normal_clock_"+str(game.campaign.expedition().id)+"_travel"
	while game.session.story.phase!="docked" and alive():
		if game.combat.active_threat() or game.combat.ship_state!="none":
			if not await fight_until_clear():return false
		elif game.session.health<65:
			if game.session.count_resource("repair-kit")==0:
				if not await craft_paid("craft-repair-kit",workbench):return false
			if not game.session.use_item("repair-kit"):return fail("Owned repair kit unavailable")
		else:
			# Opportunistic live hook interception; a missed crate is not a failure.
			var close_crate=false
			for crate in game.salvage.crates:
				if crate.active and not crate.heavy and crate.claimed=="" and crate.node.position.distance_to(game.salvage.hand_position())<29:close_crate=true;break
			if close_crate:await collect_cargo(8)
		stage="normal_clock_"+str(game.campaign.expedition().id)+"_travel"
		await physics_frame
	return alive()

func prepare_route() -> bool:
	while game.session.count_resource("repair-kit")<2:
		if game.session.count_resource("components")<2:
			if not await craft_paid("refine-components",refinery):return false
		if not await craft_paid("craft-repair-kit",workbench):return false
	return true

func continue_campaign() -> bool:
	var routes=["","foundry-direct","","orchard-caretaker","meridian-quiet-line"]
	while game.session.story.phase!="ending-ready" and alive():
		if game.session.story.phase=="route-selection":
			if not await prepare_route():return false
			if not await walk_to(game.world.helm_model.root.global_position):return false
			game.interact();await wait_seconds(5)
			if not game.campaign.begin_route(routes[int(game.session.story.index)]):return fail("Route refused at reached helm")
		if game.session.story.phase in ["approach","braking"]:
			if not await travel_to_site():return false
			await milestone(str(game.campaign.expedition().id)+"-arrival-earned")
		if game.session.story.phase=="docked":
			if not await complete_site():return false
		else:return fail("Unsupported actor continuation phase: "+game.session.story.phase)
	return await complete_finale() if alive() else false

func complete_finale() -> bool:
	stage="final_operation"
	if not await walk_to(game.world.helm_model.root.global_position):return false
	game.interact();await wait_seconds(5)
	game.finale.review()
	if not game.finale.helm_authorized("FinaleBrief"):return fail("Final operation briefing not authorized at helm")
	await wait_seconds(8)
	if not game.finale.commit(game.finale.commit_quote):return fail("Final operation refused at helm")
	if not await walk_to(game.world.receiver.global_position):return false
	game.interact();await wait_seconds(3);game.finale.secure_link()
	if game.session.finale.encounter=="launched" and not await fight_until_clear():return false
	await wait_seconds(1)
	if not await walk_to(game.world.helm_model.root.global_position):return false
	game.interact()
	if not game.finale.resume_travel():return fail("Final protected travel refused")
	while game.session.finale.stage!="berth" and alive():await physics_frame
	while game.cinematic!="" and alive():await physics_frame
	if not alive():return false
	await milestone("receiving-berth-arrival-earned")
	for id in ["reference","receiver","seeds","archive","transmitter"]:
		var point={}
		for candidate in game.finale.berth.points:
			if candidate.id==id:point=candidate;break
		if point.is_empty():return fail("Missing berth control: "+id)
		if not await walk_to(game.finale.berth.to_global(point.at),1.6):return false
		game.finale.interact(point)
		if not game.finale.authorized(id):return fail("Berth control not authorized: "+id)
		await wait_seconds(7)
		if id=="receiver":
			game.finale.act("channel",game.finale.signature())
			game.finale.act("power",game.finale.signature())
		elif id in ["seeds","archive"]:game.finale.act("transfer",game.finale.signature())
		elif id=="transmitter":
			game.finale.pending_policy="relay";game.finale.pending_signature=game.finale.signature()
			await wait_seconds(10);game.finale.publish()
			if not game.story_voice.play("berth-keep-the-channel"):return fail("Berth recording playback refused")
			await wait_seconds(15)
		game.close_menu()
	if game.session.finale.stage!="aftermath":return fail("Berth completion missing")
	await milestone("receiving-berth-payoff-earned");await wait_seconds(25)
	if not await walk_to(game.world.helm_model.root.global_position):return false
	game.interact()
	if not game.finale.depart():return fail("Keep-walking departure refused")
	await wait_seconds(15);await milestone("campaign-complete-earned")
	return game.session.story.phase=="complete" and game.session.finale.completion==1

func run():
	source_start=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	if not game.has_method("new_game") or game.get("session")==null:
		fail("Native runtime did not initialize; inspect compile/startup errors before interpreting actor results")
		await finish(false);return
	runtime_ready=true
	if resume_save!="":
		var payload=MMFSaves.decode(resume_save)
		if payload.is_empty():fail("Diagnostic earned save invalid");await finish(false);return
		game.load_payload(payload)
		initial_clock=game.session.clock;seed_name=game.session.seed_name
		starting_resources=resources();previous_resources=starting_resources.duplicate();last_health=game.session.health
		ground_recoveries=game.player.boundary.recoveries
		completed_sites=game.session.story.completed.duplicate()
		game.recorder.configure({"run_id":run_id,"seed":seed_name,"mode":"earned-resume-diagnostic","source_hash":source_start},true,16384)
		game.session.transaction.connect(func(name,details):transactions.append({"event":name,"details":details.duplicate(true),"wall_seconds":elapsed(),"simulation_seconds":game.session.clock,"supplies":resources()}))
		for piece in game.session.structures:
			if piece.definitionId=="turret-manual":turret=piece
			elif piece.definitionId=="refinery":refinery=piece
			elif piece.definitionId=="workbench":workbench=piece
		if turret.is_empty() or refinery.is_empty() or workbench.is_empty():fail("Earned continuation is missing built equipment");await finish(false);return
		event("diagnostic_earned_save_resumed",{"path":resume_save,"sha256":FileAccess.get_sha256(resume_save),"initial_clock":initial_clock})
		await wait_seconds(1)
		await finish(await continue_campaign());return
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
	if stop_after=="cargo":await milestone("cargo-earned");await finish(true);return
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
	if not await fight_until_clear(240,true):await finish(false);return
	await milestone("opening-earned")
	if stop_after=="opening":await finish(true);return
	if not await walk_to(game.world.helm_model.root.global_position):await finish(false);return
	game.interact()
	if not game.campaign.begin_route():fail("First Wake route refused at reached helm");await finish(false);return
	if not await travel_to_site():await finish(false);return
	await milestone("wake-arrival-earned")
	if not await complete_site():await finish(false);return
	if stop_after=="wake":await finish(true);return
	await finish(await continue_campaign())

func finish(success: bool):
	if ending:return
	if review_enabled:write_review()
	ending=true;release_inputs()
	var final_state=state()
	var source_end=MMFPlaytestRecorder.source_fingerprint()
	if source_end!=source_start:fail("Runtime source changed during run; evidence is diagnostic only")
	if save_hashes(initial_scope)!=normal_saves:fail("Normal campaign save scope changed")
	if runtime_ready and (game.invulnerable or not is_equal_approx(Engine.time_scale,1.0)):fail("Normal damage/time invariant violated")
	var ratio=(float(final_state.get("simulation_seconds",0))-initial_clock)/maxf(.001,active_wall)
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
	frame_ms.sort()
	var frame_summary={"rendered":DisplayServer.get_name()!="headless","samples":frame_ms.size(),"cap_fps":60,"p95_ms":frame_ms[int(frame_ms.size()*.95)] if not frame_ms.is_empty() else 0,"p99_ms":frame_ms[int(frame_ms.size()*.99)] if not frame_ms.is_empty() else 0}
	var report={"schema":1,"run_id":run_id,"human_test":false,"mode":"scripted native normal-clock earned-supply soak","stop_after":stop_after,"uninterrupted_new_game":resume_save=="","resumed_save":resume_save,"initial_clock":initial_clock,
		"passed":success and failures.is_empty(),"failures":failures,"source_hash":source_start,"source_hash_end":source_end,"source_stable":source_start==source_end,
		"seed":seed_name,"time_scale":Engine.time_scale,"simulation_to_active_wall_ratio":ratio,"starting_resources":starting_resources,"final":final_state,
		"milestones":milestones,"transactions":transactions,"events":events,"resource_movements":resource_movements,"minimum_resources":minima,"wall_seconds_by_phase":time_by_phase,"save_directory":MMFSaves.DIRECTORY,"normal_campaign_saves_unchanged":save_hashes(initial_scope)==normal_saves,"combat_observations":combat_summary,"completed_sites":completed_sites,"frame_timing":frame_summary,
		"actor_contract":{"movement":"Input forward with collision-checked route planning; no position edits","aim":"Programmatic yaw/pitch target selection; not measured human aiming","salvage":"Actual distance-spawned cargo and production hook flight; no direct receive/reward calls","building":"Reach/support/occupancy/unlock placement_report then paid create_piece and visual add; not UI pointer placement","crafting":"Production craft authority at physically reached Workshop","controls":"Reached local authorities and normal mechanism durations; scripted reading dwell based on record length","combat":"Damage enabled, normal fire input/raycast/rate/reload; no direct enemy health writes","pacing":"Real engine physics; no fixed-fps, time acceleration or manual ticks","limits":"Main campaign branch only (Foundry direct, Orchard caretaker, Meridian quiet, relay ending); optional missions/alternate routes need separate coverage. No uncoached comprehension or expected novice skill claim. Scripted read/build decisions underestimate exploratory dwell."}}
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
