extends "res://tests/narrative_delivery.gd"

func contracts():
	pass

func press(prefix: String):
	for button in game.ui.content.find_children("*","Button",true,false):
		if button.text.begins_with(prefix):button.pressed.emit();return true
	return false

func world_tests():
	await dock_mission("mission-supply-relay")
	var s=game.session;var view=mission_console();var fuel=total(s,"fuel");var parts=total(s,"components")
	view.action(MMFMissionContracts.quote(s,view.id,"donate"));game.close_menu();game.player.position=Vector3(0,16.1,0)
	game.opportunities.depart()
	check(s.missions.records["roof-supplies"].status=="abandoned" and s.missions.records["roof-supplies"].paid,"Leaving partially paid mission records abandonment")
	check(game.save_game("partial-mission"),"Partial mission can be saved after returning aboard")
	game.load_payload(MMFSaves.read("partial-mission"));await frames(4);s=game.session
	check(s.missions.records["roof-supplies"].paid and s.missions.records["roof-supplies"].step==1,"Paid durable step survives departing-state load")
	s.distance+=450;game.missions.update_offers()
	check(MMFMissions.contact_mission(s.contacts.active)=="roof-supplies" and s.contacts.active.atDistanceM>s.distance and s.contacts.candidates.size()<=3,"Abandoned request gets a new reachable offer with bounded radar")
	check(s.contacts.candidates.any(func(c):return MMFMissions.contact_mission(c)==""),"Mission offer preserves alternative ordinary discoveries")
	local_station("Signal","receiver",game.world.receiver.global_position+Vector3(0,0,1));game.missions.offer_action(MMFMissionContracts.quote(s,"roof-supplies","accept"))
	local_station("Helm","helm",game.world.helm_model.root.global_position+Vector3(0,0,1));game.opportunities.commit()
	for i in 3000:
		s.tick(.1);game.opportunities.update(.1)
		if s.contacts.active.state=="docked":break
	await frames(4);view=mission_console()
	view.action(MMFMissionContracts.quote(s,view.id,"donate"));view.action(MMFMissionContracts.quote(s,view.id,"restart"))
	check(total(s,"fuel")==fuel-4 and total(s,"components")==parts-2 and s.missions.orchard_fuel==8,"Resumed mission completes without paying a second donation")
	var completed=s.missions.duplicate(true)
	for checkpoint in ["orchard-caretaker","orchard-cold-vault"]:
		check(game.playtests.launch(checkpoint),"Orchard cache fixture: "+checkpoint);await frames(4);s=game.session;s.missions=completed.duplicate(true)
		check(game.engineering.bay().is_empty(),"Mission reserve waits for ordinary Orchard recoveries: "+checkpoint)
		for id in game.campaign.expedition().requiredUniques:
			if id not in s.story.uniques:s.story.uniques.append(id)
		for id in game.campaign.expedition().requiredObjectives:
			if id not in s.story.objectives:s.story.objectives.append(id)
		var bay=game.engineering.bay();check(not bay.is_empty(),"Common service bay owns mission reserve: "+checkpoint)
		local_station("Service","service-bay",bay.at)
		for bag in s.containers():
			for i in bag.slots.size():bag.slots[i]={"itemId":"scrap","count":game.data.ITEMS.scrap.stackSize}
		game.ui.refresh();check(press("COLLECT MISSION FUEL RESERVE") and s.missions.orchard_fuel==8,"Full bags preserve downstream mission stock: "+checkpoint)
		s.inventory.slots[0]={"itemId":"fuel","count":game.data.ITEMS.fuel.stackSize-3};game.ui.refresh();press("COLLECT MISSION FUEL RESERVE")
		check(s.missions.orchard_fuel==5 and s.recovery.stock["glass-orchard"]==20,"Partial reward debit leaves independent pump untouched: "+checkpoint)
		s.inventory.slots[1]=null;game.ui.refresh();press("COLLECT MISSION FUEL RESERVE");game.ui.refresh()
		check(s.missions.orchard_fuel==0 and not press("COLLECT MISSION FUEL RESERVE"),"Empty mission cache cannot refill: "+checkpoint)
	check(game.playtests.launch("mission-courier"),"Skipped courier route fixture");await frames(4);s=game.session
	local_station("Signal","receiver",game.world.receiver.global_position+Vector3(0,0,1));game.missions.offer_action(MMFMissionContracts.quote(s,"stranded-courier","decline"))
	local_station("Helm","helm",game.world.helm_model.root.global_position+Vector3(0,0,1));game.missions.confirm_route()
	check(s.story.phase=="approach" and s.missions.records["stranded-courier"].status=="declined","Declining courier permits immediate main route")
	check(game.playtests.launch("mission-courier"),"Route expiry confirmation fixture");await frames(4);s=game.session
	local_station("Helm","helm",game.world.helm_model.root.global_position+Vector3(0,0,1));game.missions.confirm_route()
	check(game.ui.page=="RouteConfirm" and s.story.phase=="route-selection","Unfinished mission warns before main-course commitment")
	press("COMMIT MAIN COURSE")
	check(s.story.phase=="approach" and s.missions.records["stranded-courier"].status=="expired","Confirmed route expires unfinished mission without reward")
	check(game.playtests.launch("mission-supply-relay"),"Alternate-contact scheduler fixture");await frames(4);s=game.session
	s.contacts.active={};s.contacts.candidates=[];s.missions.records["roof-supplies"].status="available"
	s.fuel=0;s.update_power();game.missions.update_offers();check(s.contacts.active.is_empty(),"No power cannot acquire new mission signals")
	s.fuel=85;s.update_power();game.missions.update_offers()
	var alternatives=s.contacts.candidates.duplicate();check(alternatives.size()==3,"Powered mission sweep has exactly three choices")
	s.contacts.active=s.contacts.candidates[1];s.contacts.active.state="visited";game.opportunities.radar.finish_visit()
	check(s.missions.records["roof-supplies"].status=="available","Choosing another contact does not permanently lose mission offer")
	await dock_mission("mission-courier");s=game.session
	apply(s,"stranded-courier","recover");apply(s,"stranded-courier","connect")
	game.player.position=Vector3(0,16.1,0);game.opportunities.depart();s.distance+=450;game.opportunities.update(0);game.opportunities.update(0)
	check(MMFMissionContracts.reward_pending(s,"stranded-courier") and s.contacts.active.get("state","")=="detected","Completed courier with unclaimed supplies offers collection revisit")
	check(game.opportunities.commit() and s.missions.records["stranded-courier"].status=="completed","Collection intercept preserves earned outcome without another acceptance or payout")
	# Critical evidence is recoverable from proven uniques, independent of line delivery.
	check(game.playtests.launch("finale-no-support"),"Narrative availability fixture");await frames(4);s=game.session
	s.narrative=MMFNarrativeProgress.defaults();game.journey.reset();game.narrative.observe()
	check(s.narrative.known.size()==5 and not game.journey.queue.any(func(line):return line.id in ["narrative/courier-array","narrative/l12-orchard","narrative/r9-meridian"]),"Required knowledge arrives without invented ally responses")
	var count=game.journey.queue.size();game.narrative.observe();check(game.journey.queue.size()==count,"Repeated observation does not duplicate evidence or dialogue")
	game.building.selected="floor";game.journey.update(1);check(game.journey.current.is_empty(),"Critical text waits during construction placement");game.building.selected=""
	var snapshot=s.native_snapshot();game.player.position=Vector3(0,16.1,0);check(game.save_game("interrupted-story"),"Known evidence saves before its queued line finishes")
	game.load_payload(MMFSaves.read("interrupted-story"));await frames(4)
	check(game.session.narrative.known.size()==5 and MMFNarrativeProgress.recap(game.session).contains("CURRENT LEAD"),"Reload recap preserves interrupted critical evidence and next lead")
	var bad=snapshot.duplicate(true);bad.story.uniques.erase("course-gyro")
	check(not MMFSession.new(game.data).restore_native(bad),"Unproven story knowledge rejects instead of inventing discovery")
	for phase in ["ending-journey","arrival","complete"]:
		var legacy=game.playtests.payload("finale-no-support");legacy.session.erase("finale");legacy.session.erase("narrative");legacy.session.erase("missions");legacy.session.story.phase=phase
		legacy.session.story["endingDistance"]=legacy.session.distance+400
		game.load_payload(legacy);await frames(3)
		if phase=="ending-journey":game.session.distance=game.session.story.endingDistance;game.campaign.update(0)
		if game.cinematic=="arrival":game.cinematics.finish()
		check(game.session.story.phase=="complete" and game.session.finale.mode=="legacy" and not is_instance_valid(game.finale.berth),"Legacy committed campaign keeps original ending: "+phase)

func finish():
	var report={"checks":checks,"failures":failures,"source_hash":source,"source_hash_end":MMFPlaytestRecorder.source_fingerprint(),"human_test":false}
	var file=FileAccess.open("res://../test-results/narrative-edge-cases.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	print("NARRATIVE_EDGE_CASES_RESULT ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	# Unwind the suspended site fixtures before shutting down renderer-owned
	# label resources; a direct quit can outlive temporary references on this stack.
	call_deferred("quit",0 if failures.is_empty() else 1)
