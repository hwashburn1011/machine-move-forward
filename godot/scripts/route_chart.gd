class_name MMFRouteChart
extends RefCounted

var owner_site
var game

func setup(owner):owner_site=owner;game=owner.game

func powered() -> bool:
	return MMFNativeProgression.radar_ready(game.session) and game.session.powered.get("fixed-radio",false)

func update() -> bool:
	var s=game.session;var chart=s.contacts
	if not MMFNativeProgression.radar_ready(s):return false
	if not chart.has("candidates"):chart.candidates=[]
	# A legacy single contact is allowed to finish before the first sweep.
	if not chart.active.is_empty() and chart.candidates.is_empty():return false
	if not chart.active.is_empty() and chart.active.state!="detected":return false
	for c in chart.candidates.duplicate():
		if s.distance>c.expiresAtM:
			game.missions.leave_offer(c)
			if c.id not in chart.missed:chart.missed.append(c.id)
			chart.candidates.erase(c)
			if chart.active.get("id","")==c.id:chart.active={}
			chart.nextSlot=maxi(chart.nextSlot,int(c.slot)+1)
	if chart.active.is_empty() and not chart.candidates.is_empty():chart.active=chart.candidates[0]
	if not chart.candidates.is_empty() or not powered():return false
	if not owner_site.schedule_armed:
		chart.nextSlot=maxi(int(chart.nextSlot),int(ceil((s.distance+450)/700)))
		owner_site.schedule_armed=true
	if s.distance<float(chart.nextSlot)*700-450:return false
	var slot=int(chart.nextSlot)
	var primary=owner_site.make_contact(slot,"friendly-refuge" if not s.survivor_content.refuge.offered else "")
	var discovery=MMFNativeProgression.next_discovery(s)
	var kinds=[primary.kind,"fuel-cache","gear-"+discovery if discovery!="" else "salvage-wreck"]
	if kinds[0]==kinds[1]:kinds[0]="memorial"
	if kinds[0]==kinds[2]:kinds[0]="repair-depot"
	for i in 3:
		var c=owner_site.make_contact(slot)
		c.id="route-contact-%d-%d"%[slot,i];c.kind=kinds[i]
		c.atDistanceM=slot*700.0+i*170;c.expiresAtM=c.atDistanceM-20
		c.worldX=s.lateral+[-45.0,65.0,-95.0][i]*(1.7 if s.navigation_limit()>=28 else 1)
		c.rewards={"fuel":6} if c.kind=="fuel-cache" else ({"scrap":24,"components":2} if c.kind=="salvage-wreck" else ({"repair-kit":1} if c.kind=="repair-depot" else {}))
		c["risk"]="patrol" if c.kind in ["fuel-cache","salvage-wreck"] and i==1 else "unknown" if c.kind.begins_with("gear-") else "quiet"
		c["patrolTriggered"]=false
		chart.candidates.append(c)
	chart.active=chart.candidates[0]
	s.notify("Route radar: three signals ahead. Review bearings at the receiver or helm.")
	game.journey.enqueue("radar/first-sweep","RECEIVER","The Array's calibration separates nearby signals. Choose a bearing when you're ready; the main journey can wait.")
	return true

func select(id: String) -> bool:
	var chart=game.session.contacts
	if not powered() or chart.active.get("state","detected")!="detected" or owner_site.story_priority():return false
	for c in chart.get("candidates",[]):
		if c.id==id and c.state=="detected" and game.session.distance<=c.expiresAtM:
			chart.active=c
			return true
	return false

func dismiss_selected() -> bool:
	var chart=game.session.contacts
	if chart.get("candidates",[]).is_empty():return false
	var c=chart.active
	if c.id not in chart.missed:chart.missed.append(c.id)
	chart.candidates=chart.candidates.filter(func(other):return other.id!=c.id)
	chart.nextSlot=maxi(int(chart.nextSlot),int(c.slot)+1)
	chart.active={} if chart.candidates.is_empty() else chart.candidates[0]
	return true

func finish_visit():
	var chart=game.session.contacts
	for c in chart.get("candidates",[]):
		if c.id!=chart.active.get("id",""):
			game.missions.leave_offer(c)
			if c.id not in chart.missed:chart.missed.append(c.id)
	chart["candidates"]=[]

func patrol():
	var c=game.session.contacts.active
	if c.get("risk","")!="patrol" or c.get("patrolTriggered",false) or c.get("state","")!="committed":return
	if c.atDistanceM-game.session.distance>240 or game.combat.active_threat() or game.combat.scout.active():return
	game.combat.scout.begin()
	if game.combat.scout.active():c.patrolTriggered=true

func render(ui):
	if not MMFNativeProgression.radar_ready(game.session):return
	ui.section("ROUTE RADAR","ONLINE" if powered() else "NO POWER")
	if not powered():ui.text_line("Restore receiver power to select or intercept signals.")
	var contacts=game.session.contacts.get("candidates",[])
	if contacts.is_empty():ui.text_line("Sweep pending · continue the journey");return
	var radar=MMFRouteRadar.new();radar.game=game;ui.content.add_child(radar)
	for i in contacts.size():
		var c=contacts[i];var p=owner_site.preview(c)
		var label=game.data.OPPORTUNITIES.get(c.kind,{}).get("title",c.kind)
		var risk={"quiet":"NO PATROL SIGNAL","patrol":"PATROL SIGNAL","unknown":"UNSURVEYED"}.get(c.get("risk","unknown"),"UNSURVEYED")
		ui.compact_row(("› " if c.id==game.session.contacts.active.get("id","") else "")+str(i+1)+" · "+label,"%dm · ~%d fuel · %s"%[p.remaining,p.fuel,"IN RANGE" if p.reachable else "OUT OF RANGE"],func():select(c.id);ui.refresh())
		if c.id==game.session.contacts.active.get("id",""):
			ui.text_line(risk+" · "+("equipment signal" if c.kind.begins_with("gear-") else "fuel reserve" if c.kind=="fuel-cache" else "salvage" if c.kind=="salvage-wreck" else "personal transmission"))
