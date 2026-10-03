extends SceneTree

var game
var checks=0
var failures=[]
var output=""

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-story-polish-tests/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1
	print("PASS " if ok else "FAIL ",label)
	if not ok: failures.append(label)

func frames(count: int):
	for i in count: await physics_frame

func capture(name: String):
	if DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output+name+".png")

func at_console(index: int,wanted: String,action: String="") -> Dictionary:
	game.session.story.index=index;game.session.story.phase="docked"
	game.session.story.arrival=game.session.distance
	game.campaign.create_destination(game.campaign.expedition())
	await frames(3)
	if action=="":action=MMFExpeditionMechanisms.STEPS[wanted][0]
	for point in game.campaign.points:
		if point.entry.get("kind")=="mechanism" and point.entry.activity==wanted and point.entry.action==action:
			preload("res://tests/expedition_fixture.gd").stand_at(game,point)
			game.activity.open(point.entry)
			return point.entry
	return {}

func operate(index: int,wanted: String,action: String) -> bool:
	await at_console(index,wanted,action)
	var ok=await preload("res://tests/expedition_fixture.gd").act(game)
	game.close_menu()
	return ok and action in game.activity.state(wanted).mechanism.milestones

func collect(wanted: String) -> Dictionary:
	for point in game.campaign.points:
		if point.entry.get("factId",point.entry.get("objectiveId",""))!=wanted:continue
		preload("res://tests/expedition_fixture.gd").stand_at(game,point)
		check(game.campaign.interact(point.entry),"Physical completion permits existing reward "+wanted)
		return point.entry
	return {}

func run():
	output=ProjectSettings.globalize_path("res://../test-results/deck-audio/")
	DirAccess.make_dir_recursive_absolute(output)
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	await frames(8)
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	await frames(8)
	# Prevent background travel or physics from moving our controlled local-console setup.
	game.set_physics_process(false);game.player.set_physics_process(false)
	var item=await at_console(0,"gyro","release")
	check(not game.activity.act(),"Gyro refuses premature cradle release")
	check(await operate(0,"gyro","isolate"),"Gyro feed isolation latches")
	var save=game.session.native_snapshot()
	var restored=MMFSession.new(game.data)
	check(restored.restore_native(save) and restored.polish.activities.gyro.step==1,"Partial activity survives a native save round trip")
	var bad=save.duplicate(true);bad.polish.activities.gyro.values="bad"
	check(not restored.restore_native(bad),"Malformed activity state rejected")
	bad=save.duplicate(true);bad.polish.activities.gyro.done=true
	check(not restored.restore_native(bad),"Forged completed interlock rejected")
	await at_console(0,"gyro","brake")
	var near=game.player.position;game.player.position+=Vector3(20,0,0)
	check(not game.activity.act(),"Console cannot be operated remotely after walking away")
	game.player.position=near
	check(await operate(0,"gyro","brake") and await operate(0,"gyro","release"),"Gyro safety sequence completes")
	check("course-gyro" not in game.session.story.uniques,"Service action does not remotely award component")
	item=collect("course-gyro")
	check("course-gyro" in game.session.story.uniques,"Gyro completion permits existing reward at cradle")
	var count=game.session.story.uniques.size();game.campaign.interact(item)
	check(count==game.session.story.uniques.size(),"Repeated console action never duplicates reward")
	game.activity.entry={};game.close_menu()
	item=await at_console(1,"power","bus")
	game.activity.adjust(0,4);game.activity.adjust(1,2)
	check(not game.activity.act(),"Foundry overload is rejected without consuming materials")
	for i in 3: game.activity.adjust(i,[2,1,0][i])
	check(game.activity.act(),"Foundry accepts recovery and tracking allocation")
	check(not game.activity.state("power").done,"Valid bus cannot bypass physical gantry")
	for action in ["unlock","move","latch"]:check(await operate(1,"power",action),"Foundry gantry operation "+action)
	item=await at_console(2,"array","lock")
	check(not game.activity.act(),"Array retains calibration and record gates")
	for id in game.campaign.expedition().requiredJournals:
		if id not in game.session.story.journals: game.session.story.journals.append(id)
	check(not game.activity.act(),"Unaligned array cannot lock")
	for i in 3:
		await at_console(2,"array",["port","central","starboard"][i])
		var sliders=game.ui.content.get_children().filter(func(n):return n is HSlider)
		check(sliders.size()==1,"Each physical wheel exposes its own channel")
		sliders[0].value=[25,60,85][i]
		check(game.activity.act(),"Local wheel calibration latches")
	check(game.activity.state("array").values==[25,60,85],"Native slider controls update the actual receiver channels")
	await at_console(2,"array","lock");await capture("story-array-console")
	game.ui.content.get_children().filter(func(n):return n is Button and n.text=="LOCK CALIBRATED PHASE")[0].pressed.emit()
	await frames(100)
	check(game.activity.state("array").done,"Native lock button commits the calibrated array")
	for id in ["port","starboard"]:
		for action in MMFExpeditionMechanisms.STEPS[id]:check(await operate(3,id,action),"Orchard "+id+" interlock "+action)
		collect("orchard-"+id+"-isolator")
	check("orchard-port-isolator" in game.session.story.objectives and "orchard-starboard-isolator" in game.session.story.objectives,"Both Orchard archive circuits restored")
	item=await at_console(4,"transmitter","link")
	check(not game.activity.act(0),"Meridian requires Orchard core")
	game.session.story.uniques.append("orchard-memory-core")
	for id in ["transmitter","archive"]:
		for action in MMFExpeditionMechanisms.STEPS[id]:check(await operate(4,id,action),"Meridian "+id+" operation "+action)
		item=collect("meridian-transmitter-online" if id=="transmitter" else "meridian-archive-installed")
	game.close_menu()
	var old=game.session.native_snapshot();old.erase("polish")
	check(MMFSession.new(game.data).restore_native(old),"Pre-polish native save remains compatible")
	game.session.polish.activities.clear()
	check(game.activity.completed(item),"Previously earned objective bypasses new console requirements")
	# Transmission delivery is bounded, contextual and idempotent.
	game.session.story.index=0;game.session.story.phase="approach";game.journey.reset()
	game.journey.enqueue("test-depart","NAVIGATION","A recovered bearing gives the Nomad direction.")
	game.open_menu("Inventory");game.journey.update(1)
	check(game.journey.current.is_empty(),"Transmission waits while terminal is open")
	game.close_menu();game.journey.update(.01)
	check(game.journey.current.id=="test-depart" and "test-depart" in game.session.polish.seen,"Transmission delivered and persisted once")
	game.journey.remaining=0;game.journey.update(.1);game.journey.enqueue("test-depart","NAVIGATION","Duplicate")
	check(game.journey.queue.is_empty(),"Delivered radio line does not repeat")
	game.journey.reset(true);game.journey.update(.01)
	check(game.journey.current.id=="recap","Load recap identifies current objective")
	game.journey.reset();game.settings.objective_reminders=false;game.journey.update(130)
	check(game.journey.queue.is_empty(),"Optional reminders honour disabled setting")
	game.settings.objective_reminders=true;game.journey.update(1)
	check(game.journey.queue.size()==1,"Quiet idle period offers one contextual reminder")
	game.journey.update(1);game.journey.update(130)
	check(game.journey.queue.is_empty(),"Idle reminder does not spam the same objective")
	game.journey.reset();game.journey.enqueue("hint","HELP","Optional reminder",true);game.journey.enqueue("chapter/depart","NAVIGATION","Priority briefing")
	check(game.journey.queue[0].id=="chapter/depart","Journey briefing takes priority over optional hints")
	game.journey.update(.01);game.session.story.index=1;game.journey.update(.01)
	check(game.journey.current.is_empty(),"Obsolete destination caption expires when chapter changes")
	game.journey.reset()
	game.session.story.uniques.append("annika-archive-shard");game.session.story.uniques.append("human-seed-bank")
	game.story_art.update(0)
	check(game.story_art.archive.visible and game.story_art.seeds.visible,"Earned archive and living seeds appear aboard")
	check(game.story_art.archive.get_parent()==game.world.receiver and game.story_art.seeds.get_parent()==game.world.receiver,"Progress hardware is attached to the receiver assembly")
	check(game.world.receiver_body.get_child(0).shape.size.y>=1.85,"Earned hardware has collision coverage above the receiver")
	game.terminal_pages.favorite("crate");game.terminal_pages.category="favorites"
	check(game.terminal_pages.catalog_ids()==["crate"],"Build favourites filter contains only selected equipment")
	var round_trip=MMFSession.new(game.data)
	check(round_trip.restore_native(game.session.native_snapshot()) and "crate" in round_trip.polish.favorites,"Build favourites persist")
	game.terminal_pages.category="structure"
	var filter_ok=true
	for id in game.terminal_pages.catalog_ids(): filter_ok=filter_ok and game.data.BUILD_PIECES[id].category=="structure"
	check(filter_ok,"Build category excludes unrelated equipment")
	game.player.position=Vector3(0,16.1,0);game.session.story.phase="complete"
	var crate=game.session.create_piece("crate",{"x":3,"y":0,"z":3},0,{},true);game.building.add_visual(crate)
	game.terminal_pages.selected=crate.instanceId;game.player.position=game.engineering.nearest_anchor();game.open_station("Machine","engineering")
	await frames(3);await capture("story-terminal-map")
	var generator_controls=game.ui.content.find_children("*","Button",true,false).filter(func(n):return n.text.contains("Generator"))
	check(game.engineering.authorized() and not generator_controls.is_empty(),"Reached engineering page contains live generator controls")
	if DisplayServer.get_name()!="headless":
		DisplayServer.window_set_size(Vector2i(1200,900));await frames(4)
		await capture("story-terminal-4x3")
		check(game.ui.panel.get_global_rect().end.x<=root.get_visible_rect().size.x+1,"Terminal remains within viewport at 4:3")
		DisplayServer.window_set_size(Vector2i(1440,810));await frames(4)
	game.terminal_pages.locate(crate.instanceId);game.terminal_pages.update(.1)
	check(game.terminal_pages.marker.visible and game.terminal_pages.marker.text.contains("DECK 3"),"Locate equipment creates accurate deck marker")
	game.open_menu("Build");await frames(2);await capture("story-build-catalog")
	game.close_menu()
	game.session.facts.salvage=true;game.world.update(0);game.story_art.update(0)
	game.player.visual.hide()
	var review_camera=Camera3D.new();game.add_child(review_camera);review_camera.make_current();review_camera.fov=45
	review_camera.global_position=game.world.receiver.global_position+Vector3(.7,1.9,2.8)
	review_camera.look_at(game.world.receiver.global_position+Vector3(0,1.2,0))
	review_camera.reset_physics_interpolation()
	await frames(4);await capture("story-receiver-hardware")
	item=await at_console(3,"port");game.close_menu();game.campaign.update(0)
	game.terminal_pages.locate_left=0;game.terminal_pages.update(0);game.ui.toast_time=0
	var at=game.campaign.destination.to_global(game.campaign.points.filter(func(p):return p.entry.id==item.id)[0].at)
	review_camera.global_position=at+Vector3(1,.7,-2)
	review_camera.look_at(at+Vector3(0,.15,0));review_camera.reset_physics_interpolation()
	await frames(4);await capture("story-isolator-installed")
	check(game.audio.spatial_voices.size()==12,"Spatial combat voices are bounded to a fixed pool")
	game.close_menu();game.audio.muted=true;game.audio.play_at("rifle",game.player.position)
	check(game.audio.spatial_voices.all(func(v):return not v.playing),"Muted spatial effects cannot play")
	game.audio.muted=false;game.audio.play_at("rifle",game.player.position+Vector3(100,0,0))
	check(game.audio.spatial_voices.all(func(v):return not v.playing),"Distant effects are culled outside their audible radius")
	var bastion=game.combat.spawn("bastion",game.player.position+Vector3(3,0,0));bastion.set_physics_process(false)
	var health=bastion.health;var damage=maxf(0,40-bastion.definition.armor)
	var hit={"collider":bastion,"position":bastion.position+Vector3.UP*1.4,"normal":Vector3.UP}
	var impact=MMFOwnedShot.resolve(hit,40,0,100,1,"player_weapon")
	MMFCombatFeedback.present(game,impact);MMFCombatFeedback.confirm(game,impact)
	check(is_equal_approx(health-bastion.health,damage) and game.ui.hit_readout.text=="ARMOUR HIT","Armour feedback preserves actual armour mitigation")
	health=bastion.health;bastion.phase="vent"
	impact=MMFOwnedShot.resolve(hit,40,0,100,1,"player_weapon")
	MMFCombatFeedback.present(game,impact);MMFCombatFeedback.confirm(game,impact)
	check(is_equal_approx(health-bastion.health,damage*2) and game.ui.hit_readout.text=="EXPOSED HIT","Bastion exposure feedback preserves existing double-damage window")
	game.ui.hit_readout.text=""
	impact=MMFOwnedShot.resolve(hit,5,0,100,1,"owned_auto_turret");MMFCombatFeedback.confirm(game,impact)
	check(game.ui.hit_readout.text=="","World-owned damage does not impersonate personal hit confirmation")
	var sword=game.combat.spawn("revenant",game.player.position+Vector3(5,0,0));sword.set_physics_process(false)
	sword.lunge_direction=((game.player.position-sword.position)*Vector3(1,0,1)).normalized()
	sword.phase="telegraph";sword.timer=0;sword.cooldown=5;sword._physics_process(.54)
	check(sword.phase=="telegraph" and sword.hp_label.text=="━".repeat(7) and sword.tells.state=="blade_commit" and sword.tells.arrow.visible and is_equal_approx(sword.tells.arrow.rotation.y,atan2(sword.lunge_direction.x,sword.lunge_direction.z)),"Sword keeps its physical committed direction and original .55-second windup without floating instructions")
	sword._physics_process(.02);check(sword.phase=="lunge","Sword attacks at existing windup boundary")
	sword._physics_process(.38);check(sword.phase=="recovery","Sword lunge retains original duration")
	bastion.queue_free();sword.queue_free();game.combat.enemies.clear()
	game.combat.begin_ship();game.combat.update_ship(game.combat.approach_duration);game.combat.update_ship(1.1)
	game.ui._process(0)
	check(not game.ui.boarding.visible and is_instance_valid(game.combat.hook) and "cut grapple" in game.combat.hook.label,"Live grapple keeps its local cut interaction without a boarding banner")
	game.combat.cut_hook(game.combat.hook.position);game.ui._process(0)
	check(not game.ui.boarding.visible,"Cutting grapple clears boarding indicator")
	game.open_menu("Pause")
	while game.combat.nav.is_baking(): await create_timer(.1).timeout
	var audio_refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();await frames(4);MMFAssets.cache.clear()
	check(await preload("res://tests/audio_drain.gd").finish(self,audio_refs),"Shutdown releases all mixer-owned audio streams")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"renderer":RenderingServer.get_video_adapter_name()}
	var file=FileAccess.open(output+"story-polish.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	# Match the physical-parity harness: release suspended locals before exit.
	call_deferred("quit",0 if failures.is_empty() else 1)
