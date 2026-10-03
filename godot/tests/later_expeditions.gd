extends SceneTree

var game
var checks=0
var failures=[]
var metrics={}
var output="res://../test-results/godot-native/"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-later-expeditions-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count: int=3):
	for i in count:await physics_frame

func placement_ready(spec: Dictionary) -> Dictionary:
	var report=game.building.placement_report(spec)
	for i in 180:
		if not report.get("pending",false):break
		await frames(1);report=game.building.placement_report(spec)
	return report

func piece(id: String,cell: Dictionary) -> Dictionary:
	var p=game.session.create_piece(id,cell,0,{},true);game.building.add_visual(p);return p

func capture(name: String,eye: Vector3=Vector3.INF,target: Vector3=Vector3.ZERO):
	if DisplayServer.get_name()=="headless":return
	game.ui.toast_time=0;game.ui.toast.hide()
	var review_camera: Camera3D
	if eye.is_finite():
		review_camera=Camera3D.new();game.add_child(review_camera);review_camera.global_position=eye;review_camera.look_at(target);review_camera.fov=55;review_camera.make_current()
		game.ui.root.hide()
	await frames(16);await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+name+".png")
	if review_camera:
		review_camera.queue_free();game.player.camera.make_current();game.ui.root.show()

func walk_to(at: Vector3) -> bool:
	game.player.yaw=0;game.player.set_physics_process(true)
	for i in 600:
		var delta=at-game.player.position
		for action in ["forward","back","left","right"]:Input.action_release(action)
		if Vector2(delta.x,delta.z).length()<.18:break
		if absf(delta.x)>.12:Input.action_press("right" if delta.x>0 else "left")
		if absf(delta.z)>.12:Input.action_press("back" if delta.z>0 else "forward")
		await physics_frame
	for action in ["forward","back","left","right"]:Input.action_release(action)
	await frames();game.player.set_physics_process(false)
	return game.player.position.distance_to(at)<.4

func migration():
	var data=game.data;var s=MMFSession.new(data)
	check(s.expedition_gear.recovered.is_empty() and not MMFNativeProgression.radar_ready(s),"New campaign grants no radar or expedition hardware")
	check(MMFNativeProgression.next_discovery(s)=="","New campaign offers no equipment recovery")
	check(data.RECIPES.all(func(r):return r.output.itemId not in MMFNativeProgression.RETIRED_ITEMS and r.inputs.keys().all(func(id):return id not in MMFNativeProgression.RETIRED_ITEMS)),"Workshop contains no food recipes")
	check(data.BUILD_PIECE_ORDER.all(func(id):return id not in MMFNativeProgression.RETIRED_PIECES),"Construction excludes retired producers")
	check(not s.native_snapshot().has("hydration") and not s.native_snapshot().has("nourishment"),"Robot save has no hunger or thirst meters")
	for id in MMFNativeProgression.MODULES:
		check(s.create_piece(id,{"x":0,"y":0,"z":0}).is_empty(),"Recovery required before paid installation: "+id)
	var old=s.native_snapshot();old.erase("expeditionGear");old["hydration"]=0;old["nourishment"]=0
	old.inventory.fill(null);old.inventory[0]={"itemId":"water","count":20};old.inventory[1]={"itemId":"rations","count":20};old.inventory[2]={"itemId":"greens","count":30}
	for i in range(3,old.inventory.size()):old.inventory[i]={"itemId":"scrap","count":100}
	old.structures.append({"instanceId":"old-planter","definitionId":"planter","cell":{"x":2,"y":0,"z":1},"rotation":0,"health":data.BUILD_PIECES.planter.maxHealth,"state":{"stored":3,"water":2,"elapsedS":8000}})
	old.structures.append({"instanceId":"old-crate","definitionId":"crate","cell":{"x":3,"y":0,"z":1},"rotation":0,"health":data.BUILD_PIECES.crate.maxHealth,"state":{}})
	old.stores["old-crate"]=[{"itemId":"water","count":20},{"itemId":"greens","count":30}]
	old.survivorContent.refuge.reward={"water":4,"fuel":3};old.caretaker.mode="steward";old.caretaker.priority="gardens"
	old.contacts.active=game.opportunities.make_contact(1);old.contacts.active.kind="water-cache";old.contacts.active.rewards={"water":4,"rations":2}
	check(s.restore_native(old),"Legacy full inventory, storage, producer and optional reward load successfully")
	check(s.count_resource("fuel")==40 and s.count_resource("scrap")==1780,"Migration conserves full stacks without requiring an empty slot")
	check(s.find_piece("old-planter").state=={"legacyStock":{"scrap":3,"fuel":2}},"Retired output and stored water remain recoverable")
	check(s.survivor_content.refuge.reward=={"scrap":0,"fuel":7},"Unclaimed legacy exchange converts water to fuel without adding a new reward")
	check(s.contacts.active.kind=="fuel-cache" and s.contacts.active.rewards=={"fuel":4,"scrap":2},"Legacy optional signal and pending rewards migrate")
	check(s.caretaker.mode=="companion" and s.caretaker.priority=="auto","Legacy gardener resumes as companion")
	var once=s.native_snapshot();var twice=MMFSession.new(data)
	check(twice.restore_native(once) and twice.native_snapshot()==once,"Saving and reloading migrated supplies is idempotent")
	s.health=40;s.inventory.slots[4]={"itemId":"repair-kit","count":1}
	check(s.use_item("repair-kit") and s.health==80,"Legacy starvation does not reduce robot repair")
	for bad_value in [{"recovered":["unknown"],"sites":{},"quiet":false,"lastRecoveryDistance":0},{"recovered":[],"sites":{"salvage-crane":{"step":3,"record":false,"trialSpawned":false}},"quiet":false,"lastRecoveryDistance":0}]:
		var bad=once.duplicate(true);bad.expeditionGear=bad_value
		check(not twice.restore_native(bad),"Malformed equipment state rejected atomically")
	var malformed=once.duplicate(true);malformed.survivorContent.refuge=[]
	check(not twice.restore_native(malformed),"Malformed legacy reward section rejects without a script error")
	for id in MMFNativeProgression.RETIRED_ITEMS:
		check(data.ITEMS[MMFNativeProgression.RETIRED_ITEMS[id]].stackSize>=data.ITEMS[id].stackSize,"Converted stack fits its original slot: "+id)

func power_checks():
	var s=MMFSession.new(game.data);s.facts.salvage=true;s.story.uniques=["course-gyro"]
	s.expedition_gear.recovered=["battery-bank","quiet-drive","salvage-crane"]
	var battery=s.create_piece("battery-bank",{"x":0,"y":0,"z":0},0,{},true)
	var crane=s.create_piece("salvage-crane",{"x":1,"y":0,"z":0},0,{},true)
	s.update_power(10)
	check(battery.state.charge==20 and s.powered[crane.instanceId] and s.demand==6,"Spare generation charges the bank and crane consumes four power")
	s.update_power(100);check(battery.state.charge==120,"Battery stops charging at capacity")
	var restored=MMFSession.new(game.data)
	check(restored.restore_native(JSON.parse_string(JSON.stringify(s.native_snapshot()))) and restored.find_piece(battery.instanceId).state.charge==120,"Installed battery charge survives a JSON save")
	s.fuel=0;s.fieldwork_active=true;s.update_power(10)
	check(s.powered["fixed-radio"] and s.powered["fixed-helm"] and s.powered["fixed-fieldwork"] and not s.powered[crane.instanceId] and battery.state.charge==90,"Battery backs up fixed equipment without powering a crane")
	var remaining=battery.state.charge;s.update_power();s.update_power()
	check(battery.state.charge==remaining,"Read-only power refresh never consumes battery charge")
	s.update_power(30);s.update_power(1)
	check(battery.state.charge==0 and not s.powered["fixed-radio"],"Exhausted bank cleanly removes receiver backup")
	s.fuel=100;s.create_piece("quiet-drive",{"x":2,"y":0,"z":0},0,{},true)
	s.expedition_gear.quiet=true;s.update_power()
	check(is_equal_approx(s.modifiers().speedMultiplier,.65) and s.capacity==12,"Quiet assembly reduces speed and generator output")
	var saved=s.native_snapshot();saved.structures.filter(func(p):return p.definitionId=="battery-bank")[0].state.charge=121
	check(not MMFSession.new(game.data).restore_native(saved),"Overcharged imported batteries are rejected")
	s.structures.filter(func(p):return p.definitionId=="quiet-drive")[0].health=0
	check(not MMFNativeProgression.quiet_running(s),"Destroyed quiet assembly cannot suppress detection")

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	await frames();migration();power_checks()
	var s=game.session;var op=game.opportunities
	s.facts.salvage=true;s.scanner.phase="consumed";s.story.phase="route-selection";s.story.uniques=["course-gyro","course-actuator"]
	s.story.completed=["wreck-one","relay-foundry"]
	check(not MMFNativeProgression.radar_ready(s),"Actuator alone cannot skip the Quiet Array milestone")
	s.story.completed.append("quiet-array");s.story.index=3
	check(MMFNativeProgression.radar_ready(s) and not MMFNativeProgression.eligible(s,"salvage-crane"),"Array unlocks radar while crane still requires workshop recovery")
	s.survivor_content.workshop.isolated=true;s.survivor_content.workshop.fuse=true;s.survivor_content.workshop.powered=true
	check(MMFNativeProgression.next_discovery(s)=="salvage-crane" and not MMFNativeProgression.eligible(s,"battery-bank"),"Workshop unlocks crane discovery before later hardware")
	s.distance=7250;s.fuel=0;s.update_power();op.update(0)
	check(s.contacts.candidates.is_empty(),"Unpowered receiver cannot generate a sweep")
	s.fuel=100;s.update_power();op.update(0)
	check(s.contacts.candidates.size()==3 and s.contacts.candidates[2].kind=="gear-salvage-crane","Powered Array receiver separates three signals including eligible recovery")
	check(s.contacts.candidates.all(func(c):return op.preview(c).reachable and op.preview(c).fuel>0),"First sweep provides reachable bearings and nonzero fuel estimates")
	var contacts=s.native_snapshot();var restored=MMFSession.new(game.data)
	check(restored.restore_native(contacts) and restored.contacts==s.contacts,"All candidates and selected signal survive a native save")
	restored.contacts.active.state="committed"
	check(restored.contacts.candidates[0].state=="committed","Restored selection shares its candidate state")
	var bad=contacts.duplicate(true);bad.contacts.candidates[1].worldX="bad"
	check(not restored.restore_native(bad),"Malformed unselected signal is rejected")
	bad=contacts.duplicate(true);bad.contacts.candidates[1].id=bad.contacts.candidates[0].id
	check(not restored.restore_native(bad),"Duplicate radar identities are rejected")
	bad=contacts.duplicate(true);bad.contacts.active.state="visited"
	check(not restored.restore_native(bad),"Conflicting saved candidate and selection are rejected")
	var desired=s.contacts.candidates[2].id
	s.fuel=0;s.update_power()
	check(not op.radar.select(desired) and not op.commit(),"No-power selection and interception are blocked")
	s.fuel=100;s.update_power()
	check(op.radar.select(desired),"Selecting an equipment signal updates the active route")
	game.open_menu("Signal");await frames(24)
	await capture("later-radar")
	if DisplayServer.get_name()!="headless":
		var window_size=DisplayServer.window_get_size()
		DisplayServer.window_set_size(Vector2i(1200,900));game.settings.terminal_text_scale=1.4;game.ui.terminal.apply_preferences();game.ui.refresh()
		await capture("later-radar-large-4x3")
		DisplayServer.window_set_size(window_size);game.settings.terminal_text_scale=1.0;game.ui.terminal.apply_preferences();game.ui.refresh()
	game.close_menu();await frames(20)
	check(op.commit(),"Selected equipment route commits from aboard")
	check(not op.radar.select(s.contacts.candidates[0].id),"Committed route cannot be replaced by another dot")
	for i in 18000:
		s.tick(.1);op.update(.1)
		if s.contacts.active.state=="docked":break
	metrics.routeLateralError=absf(s.lateral-s.contacts.active.worldX)
	check(s.contacts.active.state=="docked" and metrics.routeLateralError<5,"Real travel steers to the selected bearing and docks")
	await frames()
	game.player.teleport(Vector3(10.5,16.1,0));await frames()
	check(await walk_to(Vector3(14.2,16.03,0)),"Normal movement crosses the recovery gangway")
	check(await walk_to(Vector3(17,16.03,0)),"Normal movement reaches the isolated feed from the platform")
	var site=op.survivor_site
	site.interact("gear-recover")
	check(s.expedition_gear.recovered.is_empty(),"Retaining sequence cannot be skipped")
	site.interact("gear-isolate")
	check(site.state().step==1,"Physical feed isolation advances recovery")
	var partial=s.native_snapshot()
	check(MMFSession.new(game.data).restore_native(partial),"Partially completed equipment recovery saves")
	check(await walk_to(Vector3(19.2,16.03,1.4)),"Normal movement reaches retaining locks")
	site.interact("gear-release")
	check(await walk_to(Vector3(21.5,16.03,-.5)),"Normal movement reaches the released assembly")
	site.interact("gear-recover");site.interact("gear-recover")
	check(s.expedition_gear.recovered==["salvage-crane"] and not MMFNativeProgression.available(s,"salvage-crane"),"Recovery grants one blueprint; installation remains separate")
	check(game.salvage.crates.any(func(c):return c.active and c.heavy and c.elevated),"Crane recovery leaves a real heavy trial load")
	await capture("later-recovery",Vector3(28,23,12),Vector3(18,17,0))
	check(await walk_to(Vector3(19,16.03,0)) and await walk_to(Vector3(10.5,16.03,0)),"Normal movement returns from the recovered assembly to the Nomad")
	var crane_bay=MMFMachineSpaces.bay_candidate("salvage-crane")
	game.player.teleport(MMFMachineSpaces.bay_service("salvage-crane")+Vector3.UP*.06);await frames()
	s.inventory.add("scrap",100);s.inventory.add("components",30)
	var before=s.count_resource("scrap")
	var crane_report=await placement_ready(crane_bay)
	if not crane_report.valid:
		var volume=game.building.access.crane_volume(crane_bay);var shape=BoxShape3D.new();shape.size=volume.size
		var query=PhysicsShapeQueryParameters3D.new();query.shape=shape;query.transform=Transform3D(Basis.IDENTITY,volume.get_center());query.collision_mask=1
		for hit in game.get_world_3d().direct_space_state.intersect_shape(query,16):print("CRANE_BAY_OBSTACLE ",hit.collider.get_path()," ",MMFAssets.bounds(hit.collider)," world ",hit.collider.global_transform)
	check(crane_report.valid,"Normal construction accepts the guided crane mount on the permanent upper deck: "+crane_report.reason)
	var crane=s.create_piece("salvage-crane",crane_bay.cell,crane_bay.rotation);game.building.add_visual(crane);s.update_power();await frames()
	check(s.count_resource("scrap")==before-45 and MMFNativeProgression.available(s,"salvage-crane"),"Recovered crane installs with its fitting materials")
	game.player.teleport(MMFMachineSpaces.bay_service("salvage-crane")+Vector3.UP*.06);await frames()
	check(game.salvage.aimed_crate()==-1,"Handheld hook does not advertise heavy cargo")
	s.fuel=0;s.update_power();check(not game.salvage.operate_crane(crane),"Unpowered crane cannot capture a load")
	s.fuel=100;s.update_power()
	check(game.salvage.operate_crane(crane),"Powered nearby crane secures the platform load through a clear cable path")
	for i in 180:game.salvage.update_cranes(.05)
	check(not game.salvage.crates.any(func(c):return c.active and c.heavy),"Crane hoists and transfers the complete trial cargo")
	await capture("later-crane",Vector3(18,20,11),Vector3(12,17,4))
	var bags=[]
	for bag in s.containers():
		bags.append(bag.slots.duplicate(true))
		for i in bag.slots.size():bag.slots[i]={"itemId":"scrap","count":100}
	# Reuse the recovery cargo pad. The former (21,16.13,2) fixture's cable
	# crossed the release-control cabinet, which now correctly has collision.
	var overflow_at=op.site.to_global(Vector3(4.6,0,2.2))
	var support=game.raycast(overflow_at+Vector3.UP*.2,overflow_at-Vector3.UP*.2)
	var cable_hit=game.raycast(game.salvage.crane_tip(crane),overflow_at+Vector3.UP*.45)
	check(not support.is_empty() and absf(support.position.y-overflow_at.y)<.005 and cable_hit.is_empty(),"Overflow fixture rests on the recovery deck with an unobstructed cable path")
	check(game.salvage.spawn_heavy(overflow_at,true),"Overflow fixture creates an actual heavy cargo load")
	check(game.salvage.operate_crane(crane),"Crane captures the supported overflow fixture before testing full storage")
	for i in 180:game.salvage.update_cranes(.05)
	var waiting=game.salvage.crates.filter(func(c):return c.active and c.heavy)[0]
	check(waiting.claimed==crane.instanceId and waiting.contents=={"scrap":48,"components":8,"fuel":4},"Full storage leaves every supply suspended in the hoist")
	var cargo=JSON.parse_string(JSON.stringify(game.salvage.snapshot()))
	game.salvage.restore(cargo)
	check(game.salvage.crates[0].claimed==crane.instanceId and game.salvage.crates[0].contents==waiting.contents,"Saved suspended cargo retains its crane and full contents")
	for i in bags.size():s.containers()[i].slots=bags[i]
	game.salvage.update_cranes(.05)
	check(not game.salvage.crates.any(func(c):return c.active and c.heavy),"Freeing storage finishes the waiting cargo transfer")
	s.story.completed.append("glass-orchard");s.story.index=4;s.story.uniques.append("vector-governor")
	check(MMFNativeProgression.eligible(s,"battery-bank") and not MMFNativeProgression.eligible(s,"quiet-drive"),"Orchard unlocks bank while quiet hardware waits for further travel")
	s.distance+=600
	check(MMFNativeProgression.eligible(s,"quiet-drive"),"Quiet hardware becomes discoverable after another 600 metres")
	# Physical persisted candidates also produce their advertised live patrol.
	op.depart();s.distance+=45;op.update(0);await frames()
	op.schedule_armed=false;s.contacts.nextSlot=ceili((s.distance+450)/700.0);s.distance=s.contacts.nextSlot*700-450;op.update(0)
	var patrol=s.contacts.candidates[1];op.radar.select(patrol.id);op.commit();s.distance=patrol.atDistanceM-200;op.radar.patrol()
	check(game.combat.scout.active() and patrol.patrolTriggered,"Patrol risk produces a real scout encounter")
	var seq=s.scout_state.sequence;op.radar.patrol()
	check(s.scout_state.sequence==seq,"One patrol signal cannot spawn duplicate scouts")
	game.combat.scout.finish("disabled")
	s.expedition_gear.recovered.append("quiet-drive");var quiet=piece("quiet-drive",{"x":4,"y":0,"z":2})
	game.player.teleport(Vector3(8,16.1,6));game.service_piece(quiet)
	check(game.ui.page=="Equipment" and game.ui.storage_id==quiet.instanceId and not game.ui.terminal.active,"Quiet assembly opens its own equipment interface")
	for b in game.ui.content.find_children("*","Button",true,false):
		if b.text=="ENABLE QUIET RUNNING":b.pressed.emit();break
	check(s.expedition_gear.quiet,"Quiet mode toggles through the physical assembly's control")
	game.close_menu()
	# Hold an unobstructed scout lane to compare the actual detector at equal time.
	game.player.teleport(Vector3(10,22,0));game.combat.scout.begin();game.combat.scout.update(1)
	var quiet_progress=s.scout_state.progress;game.combat.scout.finish("disabled")
	s.expedition_gear.quiet=false;game.combat.scout.begin();game.combat.scout.side=1;game.combat.scout.update(1)
	var normal_progress=s.scout_state.progress
	check(normal_progress>0 and is_equal_approx(normal_progress,quiet_progress*2),"Quiet running halves actual visible scout detection buildup")
	s.scout_state.phase="tracking";game.combat.scout.broadcast_left=4;s.expedition_gear.quiet=true;game.combat.scout.update(1)
	check(game.combat.scout.broadcast_left==3,"Quiet switch does not cancel an existing lock")
	game.combat.scout.finish("disabled")
	# Pending world cargo and combat rewards migrate independently of inventory.
	game.salvage.restore([{"position":{"x":15,"y":16,"z":0},"contents":{"water":20,"rations":5},"opened":true,"claimed":"parked"}])
	check(game.salvage.crates[0].contents=={"fuel":20,"scrap":5},"Pending legacy cargo converts without loss")
	game.combat.loot_view.restore([{"id":"water","count":20,"position":{"x":0,"y":16.3,"z":0}}])
	check(game.combat.loot.back().id=="fuel" and game.combat.loot.back().count==20,"Uncollected legacy combat rewards become fuel")
	# Recover each later module through its own physical service controls.
	s.expedition_gear.recovered.erase("quiet-drive");s.expedition_gear.quiet=false
	for id in ["battery-bank","quiet-drive"]:
		s.distance+=650;s.contacts.candidates=[]
		var c=op.make_contact(ceili(s.distance/700));c.kind="gear-"+id;c.state="docked";c.atDistanceM=s.distance;s.contacts.active=c
		op.create_site();await frames()
		var recovery=op.survivor_site
		await capture("later-"+id,Vector3(26,20,5),Vector3(21,17,-1.6))
		for action in ["gear-isolate","gear-release","gear-recover"]:
			var point=op.points.filter(func(p):return p.id==action)[0]
			game.player.teleport(op.site.to_global(point.at)-Vector3.UP);recovery.interact(action)
		check(id in s.expedition_gear.recovered and not recovery.device.visible,"Physical optional site recovers "+id)
		var saved=s.native_snapshot();var loaded=MMFSession.new(game.data)
		check(loaded.restore_native(JSON.parse_string(JSON.stringify(saved))) and id in loaded.expedition_gear.recovered,"JSON round trip preserves recovered "+id)
	check(MMFNativeProgression.next_discovery(s)=="","Completed assemblies are not offered again")
	op.site.queue_free();op.site=null;op.points.clear();op.survivor_site=null;await frames()
	s.contacts={"nextSlot":50,"active":{},"candidates":[],"visited":[],"missed":[]};s.distance=34550;op.schedule_armed=true
	op.update(0);var missed_id=s.contacts.active.id
	check(op.dismiss() and s.contacts.candidates.size()==2 and missed_id in s.contacts.missed,"Passing a selected dot preserves the other two choices")
	s.fuel=0;s.update_power();s.distance=36000;op.update(0)
	check(s.contacts.candidates.is_empty() and s.contacts.active.is_empty() and s.contacts.missed.size()==3,"Signals expire by travel distance even when receiver power is lost")
	s.fuel=100;s.update_power();op.update(0)
	check(s.contacts.candidates.size()==3,"An expired sweep is replaced when power returns")
	var full=s.native_snapshot();full.contacts.active.state="departing";full.contacts.candidates[0].state="departing"
	game.load_payload({"session":full,"cargo":[],"loot":[]})
	check(game.session.contacts.active.is_empty() and game.session.contacts.candidates.is_empty(),"Continuing a departure clears its remaining sweep")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"metrics":metrics,"renderer":RenderingServer.get_video_adapter_name()}
	var file=FileAccess.open(output+"later-expeditions.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
