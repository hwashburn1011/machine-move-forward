class_name MMFPlaytestCheckpoints
extends RefCounted

# These are fresh, playable starting states, not completed-area cheat saves.
# Inventory previews and launches both come from payload(), so they cannot drift.
var game
var selected="first-steps"
var active_id=""
var campaign_directory=""
var campaign_return={}
var list_scroll=0
const PRESETS=[
	{"id":"first-steps","title":"01 / First steps aboard","stage":0,"mode":"start","goal":"Build, salvage and repair the receiver after the opening. The tool locker is unopened."},
	{"id":"scanner","title":"02 / Receiver ready","stage":0,"mode":"scanner","goal":"Use the receiver to start scanning. Try refining, crafting and construction."},
	{"id":"crossfire","title":"03 / The intercepted signal","stage":0,"mode":"crossfire","goal":"Play the crossfire sequence, then prepare the Nomad's defenses."},
	{"id":"defense","title":"04 / First boarding defense","stage":0,"mode":"defense","goal":"Mount the deck gun or fight on foot. A boarding skiff approaches shortly after you start."},
	{"id":"wake","title":"05 / The Wake","stage":0,"mode":"docked","goal":"Cross the gangway, explore the wreck and recover the course gyro."},
	{"id":"foundry-route","title":"06 / Foundry route choice","stage":1,"mode":"route","goal":"Choose the direct patrol route or the quiet detour at the helm, then travel to the Foundry."},
	{"id":"foundry","title":"07 / Relay Foundry","stage":1,"mode":"docked","route":"foundry-detour","goal":"Explore the Foundry and operate its recovery equipment."},
	{"id":"array","title":"08 / The Quiet Array","stage":2,"mode":"docked","goal":"Calibrate the array and recover its archive and course actuator."},
	{"id":"refuge","title":"09 / R-9's refuge","stage":3,"mode":"optional","kind":"friendly-refuge","goal":"Meet R-9, supply three components, and repair his relay."},
	{"id":"workshop","title":"10 / Shared rooftop workshop","stage":3,"mode":"optional","kind":"rooftop-workshop","goal":"Restore the workshop and build the upper access route. Materials are included; the bridge is unbuilt."},
	{"id":"scout","title":"11 / Scout encounter","stage":3,"mode":"scout","goal":"Test scout detection, combat and the signal decoy while travelling."},
	{"id":"crane","title":"12 / Recovery gantry","stage":3,"mode":"optional","kind":"gear-salvage-crane","goal":"Recover the crane, install it aboard and try its heavy cargo demonstration."},
	{"id":"orchard-caretaker","title":"13 / Glass Orchard — caretaker","stage":3,"mode":"docked","route":"orchard-caretaker","goal":"Explore the caretaker approach. The port isolator is restored; the other tasks remain."},
	{"id":"orchard-cold-vault","title":"14 / Glass Orchard — cold vault","stage":3,"mode":"docked","route":"orchard-cold-vault","goal":"Explore the cold-vault approach. The starboard isolator is restored; the other tasks remain."},
	{"id":"battery","title":"15 / Silent substation","stage":4,"mode":"optional","kind":"gear-battery-bank","goal":"Recover and install the battery, then test charging and backup power."},
	{"id":"quiet-drive","title":"16 / Screened relay","stage":4,"mode":"optional","kind":"gear-quiet-drive","goal":"Recover the quiet-running assembly and compare normal and quiet travel."},
	{"id":"meridian-quiet","title":"17 / Meridian — quiet line","stage":4,"mode":"docked","route":"meridian-quiet-line","goal":"Restore the transmitter and install the archive via the civilian route."},
	{"id":"meridian-cordon","title":"18 / Meridian — cordon gap","stage":4,"mode":"docked","route":"meridian-cordon-gap","goal":"Explore the defense route and complete the Meridian instruments."},
	{"id":"final-bearing","title":"19 / The final bearing","stage":5,"mode":"ending","goal":"Use the helm to commit to the final journey and play the arrival."},
	{"id":"recovery-empty","title":"20 / Emergency — empty supplies","stage":0,"mode":"start","fault":"empty","goal":"Reach the engineering cabinets one deck below. Request service with no fuel or owned supplies; restart normal salvage afterward."},
	{"id":"recovery-destroyed","title":"21 / Emergency — destroyed machinery","stage":0,"mode":"start","fault":"destroyed","goal":"Recover from a destroyed engine, no generators, no fuel and empty storage. No receiver, cutter or companion is required."},
	{"id":"operations-shutdown","title":"22 / Engineering — generators stopped","stage":0,"mode":"scanner","fault":"shutdown","goal":"Restart the stopped generator at its own controls or a service-deck engineering cabinet. Continue the scan without a free rescue award."},
	{"id":"operations-loads","title":"23 / Engineering — Foundry equipment","stage":2,"mode":"route","fault":"loads","goal":"Compare Salvage and Defense with two generators, collector, refinery and automatic turret. Preview and apply changes at engineering."},
	{"id":"story-wake-link","title":"24 / Story — Wake dispatch","stage":0,"mode":"docked","goal":"Recover the Wake's course gyro, review its dispatch and follow the lead toward Foundry."},
	{"id":"story-array-comparison","title":"25 / Story — Array comparison","stage":2,"mode":"docked","evidence":"annika-archive-shard","goal":"The archive shard is recovered. Compare the altered route with the original dispatch at its local record terminal. The remaining Array work is unfinished."},
	{"id":"mission-courier","title":"26 / Mission — stranded courier","stage":2,"mode":"route","mission":"stranded-courier","goal":"After Foundry: accept at the receiver, intercept from the helm and reel the loose coupling. No steering upgrade is required."},
	{"id":"mission-supply-relay","title":"27 / Mission — rooftop supplies","stage":3,"mode":"route","mission":"roof-supplies","goal":"After Array: donate two components and four fuel items at the relay, then restart its dispatch bus. The reward waits at Orchard."},
	{"id":"mission-watch-relay","title":"28 / Mission — quiet watch","stage":4,"mode":"route","mission":"quiet-watch","goal":"After Orchard: physically isolate and cut the uplink, or spend one decoy. This prevents one designated finale interception."},
	{"id":"finale-no-support","title":"29 / Finale — no optional support","stage":5,"mode":"ending","support":"none","goal":"Use the helm to review and commit, secure the receiver link, then make the final journey. Personal weapons, ordinary equipment and explicit test supplies are provided; no ally or optional mission is completed."},
	{"id":"finale-supported","title":"30 / Finale — mission support","stage":5,"mode":"ending","support":"all","goal":"All three mission outcomes and R-9's repaired relay are recorded. Compare the commitment brief and receiving handshake with the unsupported finale."},
	{"id":"finale-transfer","title":"31 / Finale — receiving berth","stage":5,"mode":"berth","goal":"The final journey is complete. Walk across the gangway, restore channel B, transfer seeds and an archive copy, then choose the communication policy."},
	{"id":"gatekeeper","title":"32 / Meridian — Gatekeeper guardian","stage":4,"mode":"guardian","route":"meridian-cordon-gap","goal":"The cordon guardian is 20 metres ahead. Dodge its fixed salvo marks; shoot the cyan fire-control unit during cooling to force retreat, destroy its hull, or spend a supplied signal decoy. Continue to Meridian after contact clears."},
	{"id":"port-repair","title":"33 / Port recovery — restore the claw","stage":0,"mode":"scanner","goal":"The receiver is repaired and one actuator is provided. Fit it at the left-side crane base to release the seized load. In a normal campaign, craft the actuator at the workbench for 8 scrap and 2 components."},
	{"id":"salvage-drone","title":"34 / Salvage — Mender utility drone","stage":2,"mode":"route","goal":"A powered drone dock sits near the front-left edge. Watch it retrieve ordinary cargo, then use its storage. Try interrupted power, a full store and overhead obstructions. The salvage controller is already recovered."}
]

func definition(id: String) -> Dictionary:
	for entry in PRESETS:
		if entry.id==id:return entry
	return {}

func add_station(s,id: String,x: int,z: int):
	s.create_piece("floor",{"x":x,"y":0,"z":z},0,{},true)
	s.create_piece(id,{"x":x,"y":0,"z":z},0,{},true)

func payload(id: String) -> Dictionary:
	var entry=definition(id)
	if entry.is_empty():return {}
	var s=MMFSession.new(game.data)
	s.opening_done=true;s.seed_name="playtest-"+id;s.rng.seed=MMFRandom.hash_seed([s.seed_name])
	s.distance=800+entry.stage*1700;s.speed=0;s.fuel=85
	s.threat.remaining=800;s.contacts.nextSlot=int(ceil((s.distance+700)/700))
	if entry.mode!="start":
		s.inventory.slots.fill(null)
		var stock={"scrap":260+entry.stage*40,"components":16+entry.stage*4,"fuel":12,"repair-kit":3,"signal-decoy":2}
		for item in stock:s.inventory.add(item,stock[item])
		s.facts.merge({"salvage":true,"refined":12,"refineryBuilt":true,"workbenchBuilt":true,"defenses":maxi(1,entry.stage),"tutorialStarted":true,"defenseCrewed":true},true)
		s.scanner.phase="consumed";s.survivor_content.toolAcquired=true
		add_station(s,"refinery",3,3);add_station(s,"workbench",4,3)
		if entry.mode not in ["scanner","crossfire"]:
			s.unlocks.append("manual-turret");add_station(s,"turret-manual",3,4)
	s.story.index=mini(entry.stage,4);s.story.phase="route-selection"
	for index in entry.stage:
		var expedition=game.data.STORY_EXPEDITIONS[index]
		s.story.completed.append(expedition.id)
		for unique in expedition.requiredUniques:s.story.uniques.append(unique)
		for journal in expedition.journals:s.story.journals.append(journal.id)
		for objective in expedition.get("requiredObjectives",[]):s.story.objectives.append(objective)
	if entry.stage>=4 or entry.id=="crane":
		s.survivor_content.workshop.merge({"charted":true,"isolated":true,"fuse":true,"powered":true,"record":true},true)
	if entry.stage>=4:
		s.expedition_gear.recovered.append("salvage-crane")
		s.expedition_gear.lastRecoveryDistance=s.distance-900
		add_station(s,"salvage-crane",-3,4)
	s.story.routeId=entry.get("route","")
	match entry.mode:
		"start":s.distance=0;s.story.phase="locked";s.fuel=60
		"scanner":s.story.phase="locked";s.scanner.phase="installed";s.facts.defenses=0;s.facts.tutorialStarted=false;s.facts.defenseCrewed=false
		"crossfire":s.story.phase="locked";s.scanner.phase="contact-ready";s.scanner.elapsedS=MMFSession.SCAN_DURATION_SECONDS;s.scanner.pendingDelayS=1;s.facts.defenses=0;s.facts.tutorialStarted=false;s.facts.defenseCrewed=false
		"defense":s.story.phase="raids";s.facts.defenses=0;s.facts.tutorialStarted=false;s.threat.tutorialWait=13
		"docked":
			s.story.phase="docked";s.story.arrival=s.distance;s.story.scripted="done"
			if entry.stage==3:s.story.objectives.append("orchard-port-isolator" if entry.route=="orchard-caretaker" else "orchard-starboard-isolator")
		"optional":
			var slot=int(ceil(s.distance/700))
			s.contacts.active={"id":"playtest-contact-"+id,"slot":slot,"kind":entry.kind,"state":"docked","atDistanceM":s.distance,"worldX":19.0,"expiresAtM":s.distance+180,"step":"task-ready","rewards":{},"record":false,"salvageMode":""}
			if entry.kind=="rooftop-workshop":s.survivor_content.workshop.charted=true
			if entry.kind=="friendly-refuge":s.survivor_content.refuge.offered=true
		"scout":s.threat.merge({"phase":"buildup","remaining":0,"legacy":0,"draws":1,"warning":true},true)
		"ending":s.story.phase="ending-ready"
		"guardian":s.story.phase="approach";s.story.arrival=s.distance+640;s.story.scripted="not-due"
	match entry.get("fault",""):
		"empty","destroyed":
			s.fuel=0
			for bag in s.containers():bag.slots.fill(null)
			if entry.fault=="destroyed":
				s.subsystems.engine=0
				s.structures=s.structures.filter(func(p):return p.definitionId!="generator")
		"shutdown":
			for p in s.structures:
				if p.definitionId=="generator":s.operations.sources[p.instanceId]=false
		"loads":
			add_station(s,"generator",-3,3);add_station(s,"collector-auto",-3,4);add_station(s,"turret-auto",-4,4)
	if entry.stage>=4:s.operations=MMFMachineOperations.proposal(s,"cruise").config
	prepare_narrative(s,entry)
	if id=="port-repair":s.inventory.add(MMFSalvageAutomation.ACTUATOR,1)
	if id=="salvage-drone":
		if "salvage-controller" not in s.story.uniques:s.story.uniques.append("salvage-controller")
		add_station(s,"collector-auto",-5,-5)
		add_station(s,"generator",-4,-5)
		s.operations=MMFMachineOperations.proposal(s,"salvage").config
	s.update_power()
	var result={"session":s.native_snapshot(),"player":{"position":{"x":0,"y":16.1,"z":-1},"yaw":0,"pitch":-.08},"salvageDistance":s.distance+60,"cargo":[],"loot":[]}
	if id in ["port-repair","salvage-drone"]:
		result.player.position={"x":-7.8 if id=="port-repair" else -10.0,"y":16.1,"z":7.8 if id=="port-repair" else -8.0}
		result.player.yaw=PI/2 if id=="port-repair" else 0.0
		result.cargo=[{"position":{"x":-18,"y":2,"z":8 if id=="port-repair" else -12},"contents":{"scrap":18,"components":2,"fuel":3},"opened":true,"claimed":"","heavy":false,"elevated":false}]
	return result

func prepare_narrative(s,entry: Dictionary):
	if entry.has("evidence") and entry.evidence not in s.story.uniques:s.story.uniques.append(entry.evidence)
	s.narrative=MMFNarrativeProgress.migrated(s)
	if entry.has("mission"):
		var id=entry.mission;var slot=int(s.contacts.nextSlot)
		s.missions.records[id].status="offered";s.missions.records[id].offers=1
		var c={"id":"mission-"+id+"-1","slot":slot,"kind":"mission-"+id,"state":"detected","atDistanceM":s.distance+300,"worldX":s.lateral,"expiresAtM":s.distance+280,"step":"task-ready","rewards":{},"record":false,"salvageMode":"","risk":"quiet","patrolTriggered":false}
		s.contacts.active=c;s.contacts["candidates"]=[c] if MMFNativeProgression.radar_ready(s) else []
	if entry.get("support","")=="none":
		s.structures=s.structures.filter(func(p):return p.definitionId not in ["salvage-crane","turret-manual"])
		s.expedition_gear=MMFNativeProgression.gear_defaults()
		s.survivor_content=MMFSurvivorContent.defaults()
		s.inventory.slots.fill(null)
		for item in {"scrap":80,"components":8,"fuel":8,"repair-kit":2,"signal-decoy":1}:s.inventory.add(item,{"scrap":80,"components":8,"fuel":8,"repair-kit":2,"signal-decoy":1}[item])
	if entry.get("support","")=="all":
		for id in MMFNativeNarrativeData.MISSION_IDS:
			var r=s.missions.records[id];r.status="completed";r.step=2;r.offers=1
			r.paid=id=="roof-supplies";r.method="physical" if id=="quiet-watch" else ""
		s.missions.orchard_fuel=8
		s.survivor_content.refuge.merge({"offered":true,"components":3,"repaired":true,"workshopKnown":true},true)
	if entry.mode=="berth":
		s.story.phase="finale-docked";s.story.ending="committed"
		s.finale.merge({"commit":1,"stage":"berth","encounter":"resolved","berth_distance":s.distance},true)

func directory(id: String) -> String:
	var base=campaign_directory if campaign_directory!="" else MMFSaves.DIRECTORY
	return base.path_join("playtests").path_join(id)+"/"

func can_launch() -> bool:
	return active_id!="" or not game.started or game.safe_to_save()

func launch(id: String,resume: bool=false) -> bool:
	if definition(id).is_empty() or not can_launch():return false
	game.autosaver.flush()
	var target=directory(id)
	var state=MMFSaves.decode(target+"autosave.json") if resume else payload(id)
	if resume and state.is_empty():state=MMFSaves.decode(target+"autosave.json.bak")
	if state.is_empty() or not MMFSession.new(game.data).restore_native(state.get("session",{})):return false
	if active_id=="":
		if game.started:
			if not game.save_game("before-playtest"):return false
			campaign_return=MMFSaves.read("before-playtest")
		campaign_directory=MMFSaves.DIRECTORY
	MMFSaves.DIRECTORY=target;active_id=id;selected=id
	game.load_payload(state)
	if id=="gatekeeper":game.combat.guardian.brief()
	game.session.notify("PLAYTEST: "+definition(id).title+". Escape opens restart / checkpoint selection.")
	return true

func leave_scope():
	if active_id=="":return
	game.autosaver.flush()
	MMFSaves.DIRECTORY=campaign_directory
	active_id="";campaign_directory=""

func return_to_campaign():
	if active_id=="":return
	leave_scope()
	var saved=campaign_return;campaign_return={}
	if not saved.is_empty():game.load_payload(saved)
	else:
		game.started=false;game.building.cancel();game.open_menu("Title")

func render(ui):
	ui.section("PLAYTEST CHECKPOINTS",str(PRESETS.size())+" STARTS")
	ui.text_line("Suggested progression loadouts. Each area starts with its tasks unfinished. Saves are kept separately for each playtest.")
	var record=CheckButton.new();record.text="Record playtest timings locally";record.button_pressed=game.recorder.enabled
	record.toggled.connect(func(value):
		if value and game.recorder.metadata.source_hash=="":game.recorder.metadata.source_hash=MMFPlaytestRecorder.source_fingerprint()
		game.recorder.set_recording(value,game.session.clock))
	ui.content.add_child(record)
	# Independent panes keep the chosen loadout visible when selecting late areas.
	var columns=HBoxContainer.new();columns.add_theme_constant_override("separation",28)
	columns.custom_minimum_size.y=maxf(280,ui.scroller.size.y-145);ui.content.add_child(columns)
	var original=ui.content
	for side in 2:
		var scroll=ScrollContainer.new();scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
		scroll.size_flags_horizontal=Control.SIZE_EXPAND_FILL;scroll.size_flags_stretch_ratio=1.15 if side==0 else 1.0;scroll.follow_focus=true;columns.add_child(scroll)
		var contents=VBoxContainer.new();contents.size_flags_horizontal=Control.SIZE_EXPAND_FILL;contents.add_theme_constant_override("separation",10);scroll.add_child(contents)
		ui.content=contents
		if side==0:
			for entry in PRESETS:
				var b=ui.compact_row(entry.title,"",func():selected=entry.id;ui.refresh(),selected==entry.id)
				b.tooltip_text=entry.goal
				if selected==entry.id:ui.preferred_focus=b
			scroll.get_v_scroll_bar().value_changed.connect(func(value):list_scroll=int(value))
			scroll.set_deferred("scroll_vertical",list_scroll)
		else:preview(ui,selected)
	ui.content=original
	if active_id!="":ui.button("RETURN TO CAMPAIGN",return_to_campaign)

func preview(ui,id: String):
	var entry=definition(id);var saved=payload(id).session
	ui.text_line(entry.title,true);ui.text_line(entry.goal)
	if not can_launch():ui.text_line("Return aboard outside combat before starting a playtest. Your current campaign will be saved first.")
	ui.button("START FRESH CHECKPOINT",func():launch(id),can_launch())
	var target=directory(id)
	var resumable=MMFSaves.decode(target+"autosave.json")
	if resumable.is_empty():resumable=MMFSaves.decode(target+"autosave.json.bak")
	if not resumable.is_empty():ui.button("CONTINUE THIS PLAYTEST",func():launch(id,true),can_launch())
	ui.section("STARTING SUPPLIES")
	ui.text_line("Health 100%% · Generator fuel %d%% · Engine %.0f%%"%[saved.fuel,100*saved.subsystems.engine/game.data.SUBSYSTEMS.engine.maxHealth])
	if entry.has("fault"):ui.text_line("Fault scenario: "+entry.fault+". Supplies below are exact; no hidden cargo or resources.")
	var totals={}
	for slot in saved.inventory:
		if slot:totals[slot.itemId]=totals.get(slot.itemId,0)+slot.count
	for item in totals:ui.text_line("%d × %s"%[totals[item],game.data.ITEMS[item].name])
	for weapon in saved.weapons:
		var spec=saved.weapons[weapon]
		ui.text_line("%s · %d loaded / unlimited reserve"%[game.data.WEAPONS[weapon].name,spec.ammoInMag])
	if saved.survivorContent.toolAcquired:ui.text_line("Salvage cutter acquired")
	ui.text_line("Receiver: "+saved.scanner.phase.replace("-"," "))
	ui.text_line("Operating mode: "+("Manual" if saved.operations.mode=="legacy" else saved.operations.mode.capitalize()))
	ui.section("INSTALLED EQUIPMENT")
	for p in saved.structures:
		if p.definitionId!="floor":ui.text_line(game.data.BUILD_PIECES[p.definitionId].name+(" · STOPPED" if p.definitionId=="generator" and not MMFMachineOperations.source_enabled(saved.operations,p.instanceId) else ""))
	ui.section("PRIOR PROGRESS")
	if saved.story.completed.is_empty():ui.text_line("No expeditions completed.")
	for expedition in game.data.STORY_EXPEDITIONS:
		if expedition.id in saved.story.completed:ui.text_line(expedition.title+" · objectives, components and journals recovered")
	for id_unique in saved.story.uniques:ui.text_line(id_unique.replace("-"," ").capitalize())
	if saved.survivorContent.workshop.powered:ui.text_line("Shared workshop power restored")
	for objective in saved.story.objectives:
		if objective.begins_with("orchard") and entry.stage==3:ui.text_line(objective.replace("-"," ").capitalize())
	if not saved.expeditionGear.recovered.is_empty():ui.text_line("Recovered equipment: "+", ".join(saved.expeditionGear.recovered))
	ui.section("STORY AND MISSION STATE")
	for beat in saved.narrative.known:ui.text_line(MMFNativeNarrativeData.BEATS[beat].title+" · known")
	var mission_session=MMFSession.new(game.data)
	mission_session.missions=saved.missions
	ui.text_line(MMFMissions.summary(mission_session))
	ui.text_line("Final operation: "+saved.finale.stage+" · interception: "+saved.finale.encounter)
