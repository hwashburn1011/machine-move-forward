class_name MMFMissions
extends RefCounted

var game
var route_id=""
var route_signature=""

static func contact_mission(c: Dictionary) -> String:
	var id=str(c.get("kind","")).trim_prefix("mission-")
	return id if id in MMFNativeNarrativeData.MISSION_IDS else ""

func window_id() -> String:
	for id in MMFNativeNarrativeData.MISSION_IDS:
		if MMFMissionContracts.window(game.session,id):return id
	return ""

func update_offers():
	var s=game.session;var id=window_id()
	if id=="" or not game.started or s.health<=0:return
	var r=s.missions.records[id]
	if r.status=="unavailable":r.status="available"
	if (r.status not in ["available","abandoned"] and not MMFMissionContracts.reward_pending(s,id)) or s.distance<r.offer_after or not s.contacts.active.is_empty() or not s.contacts.get("candidates",[]).is_empty():return
	if not s.powered.get("fixed-radio",false):return
	r.offers+=1
	if r.status!="completed":r.status="offered"
	var slot=maxi(1,int(s.contacts.nextSlot))
	var c={"id":"mission-%s-%d"%[id,r.offers],"slot":slot,"kind":"mission-"+id,"state":"detected","atDistanceM":s.distance+300,"worldX":s.lateral,"expiresAtM":s.distance+280,"step":"task-ready","rewards":{},"record":false,"salvageMode":"","risk":"quiet","patrolTriggered":false}
	s.contacts.active=c;s.contacts["candidates"]=[c] if MMFNativeProgression.radar_ready(s) else []
	if MMFNativeProgression.radar_ready(s):
		var discovery=MMFNativeProgression.next_discovery(s)
		var kinds=["fuel-cache","gear-"+discovery if discovery!="" else "salvage-wreck"]
		for i in 2:
			var other=game.opportunities.make_contact(slot)
			other.id=c.id+"-alternative-"+str(i);other.kind=kinds[i];other.atDistanceM=s.distance+500+i*150;other.expiresAtM=other.atDistanceM-20
			other.worldX=s.lateral+([45.0,-65.0][i]);other.rewards={"fuel":6} if other.kind=="fuel-cache" else {"scrap":24,"components":2} if other.kind=="salvage-wreck" else {}
			other["risk"]="patrol" if i==0 else "unknown" if other.kind.begins_with("gear-") else "quiet";other["patrolTriggered"]=false
			s.contacts.candidates.append(other)
	game.journey.enqueue("mission/offer/"+id,MMFNativeNarrativeData.MISSIONS[id].speaker,MMFNativeNarrativeData.MISSIONS[id].description,true)
	s.notify("Optional signal: "+MMFNativeNarrativeData.MISSIONS[id].title+". Review at the receiver; the main course remains available.")

func receiver_authorized() -> bool:
	return game.started and game.session.health>0 and game.menu_open and game.ui.page=="Signal" and game.ui.station_kind=="receiver" and game.near_receiver() and game.session.powered.get("fixed-radio",false) and not game.combat.active_threat()

func offer_action(q: Dictionary):
	if not receiver_authorized() or contact_mission(game.session.contacts.active)!=q.get("id",""):return
	if MMFMissionContracts.act(game.session,q):
		if q.action=="decline":game.opportunities.dismiss()
		game.ui.refresh()

func leave_offer(contact: Dictionary={}):
	var s=game.session;var id=contact_mission(s.contacts.active if contact.is_empty() else contact)
	if id=="":return
	var r=s.missions.records[id]
	if r.status not in ["completed","declined","expired"]:r.status="available";r.offer_after=s.distance+400
	elif MMFMissionContracts.reward_pending(s,id):r.offer_after=s.distance+400

func departed():
	var s=game.session;var id=contact_mission(s.contacts.active)
	if id=="":return
	var r=s.missions.records[id]
	if r.status!="completed":r.status="abandoned";r.offer_after=s.distance+400
	elif MMFMissionContracts.reward_pending(s,id):r.offer_after=s.distance+400

func render_nav(ui):
	var s=game.session;var id=contact_mission(s.contacts.active)
	if id=="":return
	var r=s.missions.records[id];var def=MMFNativeNarrativeData.MISSIONS[id]
	ui.section("OPTIONAL · "+def.title,r.status.replace("_"," ").to_upper())
	ui.text_line(def.description)
	if r.status in ["offered","available","abandoned"]:
		if receiver_authorized():
			var accept=MMFMissionContracts.quote(s,id,"accept");var decline=MMFMissionContracts.quote(s,id,"decline")
			ui.button("ACCEPT REQUEST",func():offer_action(accept))
			ui.button("DECLINE REQUEST",func():offer_action(decline))
			ui.button("LEAVE FOR NOW",func():
				if receiver_authorized():game.opportunities.dismiss();ui.refresh())
		else:ui.text_line("Review and accept at the receiver. The helm handles the intercept.")
	elif r.status=="accepted":ui.text_line("Accepted. Intercept from the helm; the site remains optional.")
	elif MMFMissionContracts.reward_pending(s,id):ui.text_line("Courier already restored. A follow-up service platform holds your remaining cache. Intercept to collect it; the mission will not pay out again.")

func confirm_route(id: String=""):
	if not game.finale.helm_authorized():return
	var s=game.session;var pending=window_id()
	if pending=="" or s.missions.records[pending].status in ["completed","declined","expired"]:
		game.campaign.begin_route(id);return
	route_id=id;route_signature=MMFMissionContracts.signature(s)
	game.open_station("RouteConfirm","helm")

func render_route(ui):
	var id=window_id()
	ui.section("CONTINUE THE MAIN JOURNEY")
	ui.text_line("Continuing closes the current optional mission window. Paid supplies and completed outcomes remain recorded; unfinished requests will expire.")
	if id!="":ui.text_line(MMFNativeNarrativeData.MISSIONS[id].title+": "+game.session.missions.records[id].status)
	ui.button("COMMIT MAIN COURSE",func():
		if game.ui.page!="RouteConfirm" or game.ui.station_kind!="helm" or game.helm_distance()>3 or route_signature!=MMFMissionContracts.signature(game.session):return
		game.campaign.begin_route(route_id))
	ui.button("BACK TO NAVIGATION",func():game.open_station("Helm","helm"))

func site_view():
	var view=game.opportunities.survivor_site
	return view if view is MMFMissionSite else null

func hook_target() -> Dictionary:
	var view=site_view()
	return view.hook_target() if view else {}

func hook_motion(at: Vector3):
	var view=site_view()
	if view:view.hook_motion(at)

func hook_finish():
	var view=site_view()
	if view:view.hook_finish()

func hook_cancel():
	var view=site_view()
	if view:view.hooked=false;view.update()

func render(ui):
	var view=site_view()
	if view:view.render(ui)
	else:ui.text_line("Return to the current mission's local equipment.")

static func summary(s) -> String:
	var lines=[]
	for id in MMFNativeNarrativeData.MISSION_IDS:
		var r=s.missions.records[id]
		if r.status!="unavailable":lines.append(MMFNativeNarrativeData.MISSIONS[id].title+": "+r.status.replace("_"," ")+(" · step %d / 2"%r.step if r.status not in ["completed","declined","expired"] else ""))
	if s.missions.orchard_fuel>0:lines.append("Orchard mission reserve: %d fuel items unclaimed"%s.missions.orchard_fuel)
	return "\n".join(lines) if not lines.is_empty() else "No optional requests discovered yet."
