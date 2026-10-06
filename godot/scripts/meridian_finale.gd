class_name MMFMeridianFinale
extends RefCounted

var game
var berth: MMFMeridianBerth
var pending_policy=""
var pending_signature=""
var commit_quote=""
var gangway_open=false
const STAGES=["idle","secure","ready","travel","berth","aftermath","departed","legacy"]
const POLICIES={"open":"OPEN CHANNEL\nPublish a public invitation and safe approach instructions. Isolated unknown travellers may hear it; hostile machines can listen too. Personal archive records and residents' identities remain private.","relay":"RELAY CHAIN\nPass the invitation from one working relay to the next. Each asks for the agreed reply before sharing the safe way in, keeping the berth's approach off the open channel. Fewer strangers will hear it, and some may take longer to find their way. The relays can carry the message on their own; friends along the route can help, but the chain does not depend on them."}

static func defaults() -> Dictionary:
	return {"version":1,"mode":"new","stage":"idle","encounter":"pending","channel":0,"powered":false,"seeds":false,"archive":false,"policy":"","berth_distance":0.0,"commit":0,"completion":0}

static func valid(value) -> bool:
	if not value is Dictionary or value.get("version")!=1 or value.get("mode") not in ["new","legacy"] or value.get("stage") not in STAGES:return false
	if value.get("encounter") not in ["pending","launched","resolved","suppressed"] or value.get("policy") not in ["","open","relay"]:return false
	for key in ["powered","seeds","archive"]:
		if not value.get(key) is bool:return false
	if not MMFSaveValidation.number(value.get("channel"),0,2,true) or not MMFSaveValidation.number(value.get("berth_distance"),0,1e12):return false
	for key in ["commit","completion"]:
		if not MMFSaveValidation.number(value.get(key),0,1,true):return false
	if value.mode=="legacy":return value.stage=="legacy" and value.commit==0 and value.completion==0 and value.policy=="" and not value.seeds and not value.archive and not value.powered
	if value.stage=="legacy" or (value.stage=="idle")!=(value.commit==0):return false
	if value.powered and value.channel!=1:return false
	if (value.seeds or value.archive) and not value.powered:return false
	if value.policy!="" and not (value.seeds and value.archive):return false
	if (value.stage in ["aftermath","departed"])!=(value.completion==1):return false
	if (value.completion==1)!=(value.policy!=""):return false
	if value.stage in ["ready","travel","berth","aftermath","departed"] and value.encounter not in ["resolved","suppressed"]:return false
	if value.stage in ["idle","secure","ready","travel"] and (value.powered or value.seeds or value.archive or value.channel!=0 or value.berth_distance!=0):return false
	if value.stage=="idle" and value.encounter!="pending":return false
	if value.stage=="secure" and value.encounter not in ["pending","launched"]:return false
	return true

static func valid_phase(f: Dictionary,story: Dictionary) -> bool:
	var phase=story.get("phase","")
	if f.mode=="legacy":return phase in ["ending-journey","arrival","complete"]
	match f.stage:
		"idle":return phase not in ["finale-link","finale-docked","ending-journey","arrival","complete"]
		"secure","ready":return phase=="finale-link"
		"travel":return phase in ["ending-journey","arrival"]
		"berth","aftermath":return phase=="finale-docked"
		"departed":return phase=="complete"
	return false

static func legacy(story: Dictionary) -> Dictionary:
	var f=defaults()
	if story.phase in ["ending-journey","arrival","complete"]:f.mode="legacy";f.stage="legacy"
	return f

func signature() -> String:
	var s=game.session
	return JSON.stringify([s.finale,s.missions,s.story]).sha256_text()

func commit_signature() -> String:
	return (signature()+MMFMachineOperations.signature(game.session)).sha256_text()

func helm_authorized(page: String="Helm") -> bool:
	return game.started and game.menu_open and game.ui.page==page and game.ui.station_kind=="helm" and game.helm_distance()<3 and game.session.health>0 and game.cinematic==""

func review():
	if not helm_authorized():return
	commit_quote=commit_signature();game.open_station("FinaleBrief","helm")

func commit(expected: String="") -> bool:
	var s=game.session
	if s.story.phase!="ending-ready" or s.finale.stage!="idle" or not game.aboard() or game.combat.active_threat() or game.combat.ship_state!="none" or s.contacts.active.get("state","") in ["committed","docked","visited"]:return false
	if expected!="" and expected!=commit_signature():return false
	var config=MMFMachineOperations.resume_config(s)
	var blocked=MMFMachineOperations.departure_reason(s,config)
	if blocked!="":s.notify(blocked);return false
	if not game.save_game("meridian-checkpoint"):return false
	s.operations=config;s.update_power();s.finale.commit=1;s.finale.stage="secure";s.story.phase="finale-link";s.story.ending="committed"
	s.transaction.emit("finale_committed",{});game.close_menu();s.notify("Final operation committed. Secure the receiving link at the receiver before starting the protected journey.");return true

func secure_link():
	var s=game.session;var f=s.finale
	if f.stage!="secure" or f.encounter!="pending" or not game.missions.receiver_authorized() or not game.safe_to_save():return
	if MMFMissionContracts.completed(s,"quiet-watch") and not s.missions.records["quiet-watch"].effect_used:
		s.missions.records["quiet-watch"].effect_used=true;f.encounter="suppressed";f.stage="ready"
		game.journey.enqueue("finale/suppressed","RECEIVER","Your work at the watch relay blocked the Order's interception uplink. Receiving link secured. Resume travel at the helm.")
		s.transaction.emit("mission_effect_consumed",{"mission":"quiet-watch","effect":"finale-link-interception"})
		game.ui.refresh()
	elif game.combat.begin_ship("skiff"):
		f.encounter="launched";game.close_menu();s.notify("Order skiff approaching the receiving link. Defend the Nomad or use the supported decoy / disengagement controls.")

func resume_travel() -> bool:
	var s=game.session;var f=s.finale
	if f.stage!="ready" or not helm_authorized() or not game.safe_to_save():return false
	var config=MMFMachineOperations.resume_config(s);var blocked=MMFMachineOperations.departure_reason(s,config)
	if blocked!="":s.notify(blocked);return false
	if not game.save_game("receiving-link-checkpoint"):return false
	s.operations=config;s.update_power();f.stage="travel";s.story.phase="ending-journey";s.story.endingDistance=s.distance+400;s.target_course=32
	game.close_menu();return true

func update():
	var s=game.session;var f=s.finale
	if f.stage=="secure" and f.encounter=="launched" and game.combat.ship_state=="none" and not game.combat.active_threat():
		f.encounter="resolved";f.stage="ready";s.notify("Receiving link secured. Service the Nomad if needed, then resume the final journey at the helm.")
	if is_instance_valid(berth):
		berth.position.z=s.distance-f.berth_distance
		if f.stage in ["berth","aftermath"] and not gangway_open and not access_obstructed():
			gangway_open=true;game.world.set_dock_open(true)
		if f.stage=="departed" and s.distance-f.berth_distance>40:berth.queue_free();berth=null

func access_obstructed() -> bool:
	# Check player construction along the fixed passage, excluding the factory
	# safety rail which is intentionally still shut while this check runs.
	for x in [10.5,11.0,11.5,12.0,12.5,13.0,13.5,14.0]:
		var query=PhysicsShapeQueryParameters3D.new()
		query.shape=game.player.capsule_shape;query.transform=Transform3D(Basis.IDENTITY,Vector3(x,17.1,0))
		query.collision_mask=1;query.exclude=[game.player.get_rid()]
		for hit in game.player.get_world_3d().direct_space_state.intersect_shape(query,64):
			if game.building.is_ancestor_of(hit.collider):return true
	return false

func arrive():
	var s=game.session
	s.finale.stage="berth";s.finale.berth_distance=s.distance;s.story.phase="finale-docked";s.speed=0;s.target_course=0
	rebuild();s.notify("Receiving berth moored. Clear construction from the starboard gangway if obstructed, then cross to its maintenance reference. The equipment has its own power.")

func rebuild():
	if is_instance_valid(berth):berth.queue_free()
	berth=null;gangway_open=false;pending_policy="";pending_signature="";commit_quote=""
	if game.session.finale.mode=="new" and game.session.finale.stage in ["berth","aftermath"]:
		berth=MMFMeridianBerth.new();game.add_child(berth);berth.setup(game);game.world.set_dock_open(false)
		if not access_obstructed():gangway_open=true;game.world.set_dock_open(true)

func nearest() -> Dictionary:
	return berth.nearest() if is_instance_valid(berth) and game.session.story.phase=="finale-docked" else {}

func interact(point: Dictionary):
	if not is_instance_valid(berth) or not berth.reached(point.id) or game.combat.active_threat():return
	if point.id=="return":game.session.notify("Return aboard and use the helm after the transfer is complete.");return
	pending_policy="";game.open_station("Finale","receiving-berth",point.id)

func authorized(id: String="") -> bool:
	return is_instance_valid(berth) and game.session.story.phase=="finale-docked" and game.session.health>0 and game.cinematic=="" and not game.combat.active_threat() and game.menu_open and game.ui.page=="Finale" and game.ui.station_kind=="receiving-berth" and berth.reached(game.ui.storage_id) and (id=="" or game.ui.storage_id==id)

func act(action: String,expected: String):
	if not authorized() or expected!=signature():return
	var s=game.session;var f=s.finale;var id=game.ui.storage_id
	if id=="receiver":
		if action=="channel" and not f.powered:f.channel=(int(f.channel)+1)%3
		elif action=="power" and f.channel==1 and not f.powered:f.powered=true
		else:return
	elif id=="seeds" and action=="transfer" and f.powered and not f.seeds:f.seeds=true
	elif id=="archive" and action=="transfer" and f.powered and not f.archive:f.archive=true
	else:return
	s.transaction.emit("finale_step",{"station":id,"action":action});berth.sync();game.ui.refresh()

func publish():
	if not authorized("transmitter") or pending_signature!=signature() or pending_policy not in POLICIES:return
	var s=game.session;var f=s.finale
	if not f.seeds or not f.archive or f.policy!="":return
	f.policy=pending_policy;f.stage="aftermath";f.completion=1
	if "berth-keep-the-channel" not in s.narrative.known:s.narrative.known.append("berth-keep-the-channel")
	s.transaction.emit("finale_completed",{"policy":f.policy});berth.sync()
	game.journey.enqueue("finale/complete","RECEIVING BERTH",MMFNativeNarrativeData.BEATS["berth-keep-the-channel"].text)
	game.journey.enqueue("finale/response","PUBLIC BAND" if f.policy=="open" else "RELAY NETWORK","Unidentified request received. An invitation can travel farther than certainty." if f.policy=="open" else "Autonomous endpoint acknowledged. The approach will be shared through authenticated requests.")
	if s.survivor_content.refuge.repaired:game.journey.enqueue("finale/r9","R-9","The light is still on here. Your relay repair gave this message a way through.")
	if MMFMissionContracts.completed(s,"stranded-courier"):game.journey.enqueue("finale/courier","COURIER","Cradle holding. I heard the berth answer. Thank you for stopping.")
	if MMFMissionContracts.completed(s,"roof-supplies"):game.journey.enqueue("finale/supply-relay","RELAY CARETAKER","Your dispatch reached the next roof. We have a receiving channel to pass onward now.")
	if s.caretaker.recovered:game.journey.enqueue("finale/l12","L–12","Seeds and archive verified. There is room for someone to come after us.")
	pending_policy="";game.ui.refresh()

func depart() -> bool:
	var s=game.session
	if s.finale.stage!="aftermath" or not helm_authorized() or not game.safe_to_save():return false
	var config=MMFMachineOperations.resume_config(s);var blocked=MMFMachineOperations.departure_reason(s,config)
	if blocked!="":s.notify(blocked);return false
	if not game.save_game("receiving-berth-checkpoint"):return false
	s.operations=config;s.update_power();s.finale.stage="departed";s.story.phase="complete";s.story.ending="complete"
	game.world.set_dock_open(false);game.close_menu();s.notify("Keep walking. The receiving channel remains open behind you.");return true

func safe_at_berth() -> bool:
	return is_instance_valid(berth) and game.session.finale.stage in ["berth","aftermath"] and game.session.story.phase=="finale-docked" and berth.safe_support()

func render_brief(ui):
	if not helm_authorized("FinaleBrief"):ui.text_line("Return to the navigation helm.");return
	ui.section("FINAL OPERATION / RECEIVING BERTH")
	ui.text_line("A verified checkpoint will be saved before commitment. Secure the link at the receiver, then travel the protected final 400 metres. The berth needs local power restoration and seed/archive transfer.")
	var s=game.session;var config=MMFMachineOperations.resume_config(s);var travel=MMFMachineOperations.travel(s,400,config)
	ui.text_line("Travel plan: %s · tank %.1f · estimated final leg %.1f fuel / %.0f seconds"%[config.mode.capitalize(),s.fuel,travel.fuel,travel.seconds])
	var refusal=MMFMachineOperations.departure_reason(s,config)
	if refusal!="":ui.text_line(refusal)
	ui.text_line("Watch relay disabled: the designated interception will be prevented." if MMFMissionContracts.completed(game.session,"quiet-watch") else "One Order skiff may intercept the link before the protected journey. Standard personal weapons remain usable; optional guns and allies are not required.")
	ui.text_line("Courier checksum available." if MMFMissionContracts.completed(game.session,"stranded-courier") else "A maintenance reference at the berth supplies the receiver channel.")
	ui.text_line(MMFMissions.summary(game.session))
	ui.button("COMMIT FINAL OPERATION",func():
		if helm_authorized("FinaleBrief"):commit(commit_quote))
	ui.button("NOT YET",func():game.open_station("Helm","helm"))

func render(ui):
	if not authorized():ui.text_line("Approach the receiving berth's local equipment.");return
	var f=game.session.finale;var id=ui.storage_id;var revision=signature()
	ui.section("RECEIVING BERTH",id.to_upper())
	match id:
		"reference":ui.text_line("MAINTENANCE PLATE\nSelect channel B, then close the isolator. Channel A repeats the altered Order bearing; C is the old test loop. Transfer the seed enclosure and archive copy separately once power is restored.")
		"receiver":
			ui.text_line("Channel "+["A / ORDER RETURN","B / FIXED REFERENCE","C / TEST LOOP"][f.channel]+(" · ONLINE" if f.powered else " · ISOLATED"))
			ui.text_line("Courier checksum confirms channel B." if MMFMissionContracts.completed(game.session,"stranded-courier") else "The nearby maintenance plate identifies the correct channel.")
			ui.button("SELECT NEXT CHANNEL",func():act("channel",revision),not f.powered)
			ui.button("CLOSE ISOLATOR / RESTORE POWER",func():act("power",revision),f.channel==1 and not f.powered)
		"seeds","archive":
			ui.text_line("Seed enclosure connected and stable." if id=="seeds" and f.seeds else "Archive copy received; original core remains at Meridian." if id=="archive" and f.archive else "Restore the local receiving coupler first." if not f.powered else "Receiving equipment ready. Confirm this transfer.")
			ui.button("TRANSFER SEEDS" if id=="seeds" else "IMPORT ARCHIVE COPY",func():act("transfer",revision),f.powered and not f[id])
		"transmitter":
			if f.policy!="":
				game.story_voice.render(ui,"berth-keep-the-channel")
				ui.text_line(MMFNativeNarrativeData.BEATS["berth-keep-the-channel"].text)
				ui.text_line(POLICIES[f.policy]+"\n\nSeeds stable. Archive preserved. Return aboard whenever ready.")
				ui.button("CREDITS / KEEP WALKING",func():game.ui.show_record("KEEP WALKING","Original game & art / HWashburn\nDevelopment with Codex\nThree.js · Rapier · Blender / Native port: Godot\n\nThe receiving berth is ready for the next traveller."))
			elif not f.seeds or not f.archive:ui.text_line("Complete both seed and archive transfers before publishing access information.")
			else:
				for policy in ["open","relay"]:
					ui.button("PREVIEW "+("OPEN CHANNEL" if policy=="open" else "RELAY CHAIN"),func():
						if authorized("transmitter"):pending_policy=policy;pending_signature=signature();ui.refresh())
				if pending_policy!="":ui.text_line(POLICIES[pending_policy]);ui.button("CONFIRM COMMUNICATION POLICY",publish)
