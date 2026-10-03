extends SceneTree

var game
var checks=0
var failures=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-friendly-encounter-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func run():
	Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	for i in 5:await physics_frame
	game.started=true;game.session.opening_done=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.teleport(Vector3(0,16.1,-1))
	var s=game.session;var opportunities=game.opportunities
	s.story.phase="route-selection";s.story.index=2;s.story.uniques=["course-actuator"]
	s.distance=4300;game.journey.reset()
	opportunities.update(0)
	s.distance=s.contacts.nextSlot*700-450;opportunities.update(0)
	check(s.contacts.active.kind=="friendly-refuge","First eligible optional contact introduces the friendly robot")
	check(game.journey.queue.any(func(line):return line.id=="survivor/refuge-offer"),"Radio gives a short personal request before choosing the stop")
	var before=s.inventory.slots.duplicate(true);var story=s.story.duplicate(true)
	game.open_menu("Signal")
	var skip=game.ui.content.find_children("*","Button",true,false).filter(func(button):return button.text=="PASS BY")
	if not skip.is_empty():skip[0].pressed.emit()
	check(not skip.is_empty() and s.contacts.active.is_empty() and s.inventory.slots==before and s.story==story,"Pass by leaves inventory and campaign progression untouched")
	check(not game.journey.queue.any(func(line):return line.id=="survivor/refuge-offer"),"Declined request does not play later as a stale invitation")
	game.close_menu()
	s.contacts.active=opportunities.make_contact(11);s.contacts.active.state="docked";s.distance=s.contacts.active.atDistanceM;s.speed=0
	opportunities.create_site();game.world.set_dock_open(true)
	var site=opportunities.survivor_site
	for bag in s.containers():bag.slots.fill(null)
	s.add_resource("components",3)
	site.interact("survivor")
	check(s.survivor_content.refuge.components==1 and "1/3" in site.point_text("survivor"),"Donation label reflects the actual partial exchange")
	var resumed=MMFSession.new(game.data)
	check(resumed.restore_native(s.native_snapshot()) and resumed.survivor_content.refuge.components==1,"Saving preserves the component already donated")
	site.interact("survivor");site.interact("survivor")
	opportunities.update_service_hold(1.2,true)
	check(not s.survivor_content.refuge.repaired,"Partial repair hold cannot award supplies or a destination")
	opportunities.update_service_hold(1.3,true)
	check(s.survivor_content.refuge.repaired and s.survivor_content.refuge.workshopKnown,"Completed repair earns a real workshop bearing")
	check(site.point_visible("survivor") and site.point_text("survivor")=="R-9 · talk","R-9 remains available to talk after helping")
	site.interact("reward");site.interact("reward")
	check(s.count_resource("scrap")==4 and s.count_resource("fuel")==3 and not site.point_visible("reward"),"Exchange transfers supplies once and hides the emptied crate")
	check(opportunities.make_contact(12).kind=="rooftop-workshop","Earned bearing selects the next actual optional workshop contact")
	var legacy=s.native_snapshot()
	legacy.survivorContent.refuge.erase("workshopKnown");legacy.survivorContent.refuge.erase("offered");legacy.survivorContent.workshop.erase("charted")
	check(resumed.restore_native(legacy) and resumed.survivor_content.refuge.workshopKnown,"Earlier completed repairs inherit the location reward on load")
	var invalid=s.native_snapshot();invalid.survivorContent.refuge.workshopKnown="yes"
	check(not resumed.restore_native(invalid),"Malformed location-reward state is rejected")
	game.journey.queue.clear();game.journey.current.clear()
	s.distance=s.survivor_content.refuge.ackAt+5;MMFSurvivorSite.acknowledge(game)
	check(game.journey.queue.is_empty(),"Later acknowledgment cannot play while still at R-9's stop")
	opportunities.depart();opportunities.update(0)
	s.distance+=45;opportunities.update(0)
	MMFSurvivorSite.acknowledge(game);MMFSurvivorSite.acknowledge(game)
	check(game.journey.queue.filter(func(line):return line.id=="survivor/refuge-later").size()==1,"Departure and quiet travel queue only one acknowledgment")
	s.story.index+=1;game.journey.update(0)
	check(game.journey.current.get("id","")=="survivor/refuge-later" and s.survivor_content.refuge.acknowledged,"Personal follow-up survives chapter changes and persists on delivery")
	check(resumed.restore_native(s.native_snapshot()) and resumed.survivor_content.refuge.acknowledged,"Delivered acknowledgment survives native restoration")
	game.journey.queue.clear();game.journey.current.clear();MMFSurvivorSite.acknowledge(game)
	check(game.journey.queue.is_empty(),"Completed acknowledgment cannot replay")
	# R-9's pointer is still optional. Once charted, skipping it resumes the ordinary pool.
	s.contacts.active={};s.distance=s.contacts.nextSlot*700-450;opportunities.update(0)
	check(s.contacts.active.kind=="rooftop-workshop" and s.survivor_content.workshop.charted,"Marked workshop appears through the normal signal schedule")
	check(opportunities.dismiss(),"Marked workshop can also be passed by")
	s.survivor_content.workshop.powered=true;s.survivor_content.workshop.isolated=true;s.survivor_content.workshop.fuse=true
	for loot in [s.survivor_content.workshop.mainLoot,s.survivor_content.workshop.upperLoot]:
		for id in loot:loot[id]=0
	check(opportunities.make_contact(16).kind not in MMFSurvivorSite.KINDS and opportunities.make_contact(17).kind not in MMFSurvivorSite.KINDS,"Exhausted unique sites do not replace fresh optional encounters")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"renderer":RenderingServer.get_video_adapter_name()}
	var output=FileAccess.open("res://../test-results/godot-native/friendly-encounter.json",FileAccess.WRITE);output.store_string(JSON.stringify(report,"\t"));output.close()
	print("FRIENDLY_ENCOUNTER ",JSON.stringify(report))
	paused=true
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)
