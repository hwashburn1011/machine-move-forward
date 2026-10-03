class_name MMFOpportunities
extends Node3D

var game
var site: Node3D
var site_id=""
var definition={}
var points=[]
var service_timer=0.0
var service_hold_site=""
var leaving_at=0.0
var schedule_armed=false
var survivor_site
var radar=MMFRouteChart.new()

func title() -> String:
	var kind=game.session.contacts.active.get("kind","")
	return {"friendly-refuge":"A light still on","rooftop-workshop":"Shared workshop"}.get(kind,game.data.OPPORTUNITIES.get(kind,{}).get("title","Optional signal"))

func description() -> String:
	match game.session.contacts.active.get("kind",""):
		"friendly-refuge":
			var refuge=game.session.survivor_content.refuge
			if refuge.repaired:return "R-9's relay is running. Your remaining exchange is %d scrap and %d fuel. The workshop bearing is on your receiver."%[refuge.reward.scrap,refuge.reward.fuel]
			return "R-9 needs %d more components and a relay repair. He offers four scrap, three fuel, and a nearby workshop bearing. Leave whenever you need to."%(3-refuge.components)
		"rooftop-workshop": return "A roof-level workshop with a safe arrival gangway and raised entrance. Restore its bus, search for shared history, and build an upper boarding extension for additional salvage."
	var kind=game.session.contacts.active.get("kind","")
	var mission=MMFMissions.contact_mission(game.session.contacts.active)
	if mission!="":return MMFNativeNarrativeData.MISSIONS[mission].description
	if kind.begins_with("gear-"):return "Isolate the feed, release the locks, and recover the machine assembly. Return aboard to install it. This stop is optional."
	return "Optional elevated stop. Return aboard before departure."

func setup(owner_game):
	game=owner_game
	radar.setup(self)
	var active=game.session.contacts.active
	if active.get("state","") in ["committed","docked","visited"]: create_site()

func make_contact(slot: int,preferred: String="") -> Dictionary:
	var s=game.session
	var rng=MMFRandom.new()
	rng.seed=MMFRandom.hash_seed([s.seed_name,"route-chart",slot])
	var tier=3 if "vector-governor" in s.story.uniques else (2 if "course-actuator" in s.story.uniques else 1)
	var depot=tier>=2 and slot%3==0
	var kinds=["fuel-cache","salvage-wreck","memorial"]
	var kind="repair-depot" if depot else kinds[posmod(MMFRandom.hash_seed([s.seed_name,"route-chart-kind"])+slot-1,3)]
	var refuge=s.survivor_content.refuge
	var workshop=s.survivor_content.workshop
	var workshop_open=not workshop.powered or workshop.mainLoot.values().any(func(n):return n>0) or workshop.upperLoot.values().any(func(n):return n>0)
	var refuge_open=not refuge.repaired or refuge.reward.values().any(func(n):return n>0)
	if refuge.workshopKnown and not workshop.charted and workshop_open:kind="rooftop-workshop"
	elif refuge_open and (preferred=="friendly-refuge" or slot%5==1):kind="friendly-refuge"
	elif workshop_open and slot%5==2:kind="rooftop-workshop"
	if kind in MMFSurvivorSite.KINDS: depot=false
	var offset=rng.randf_range(265 if tier==3 else 120,290 if tier==3 else 150) if depot else rng.randf_range(45,70)
	offset*=(-1 if rng.randf()<0.5 else 1)
	var rewards={"fuel":6} if kind=="fuel-cache" else ({"scrap":24,"components":2} if kind=="salvage-wreck" else ({"repair-kit":1} if depot else {}))
	return {"id":"route-contact-%d"%slot,"slot":slot,"kind":kind,"state":"detected","atDistanceM":slot*700.0,"worldX":s.lateral+offset,"expiresAtM":slot*700.0+180,"step":"task-ready","rewards":rewards,"record":false,"salvageMode":""}

func story_priority() -> bool:
	return game.session.story.phase not in ["route-selection","ending-ready","complete"]

func update(dt: float):
	var s=game.session
	MMFSurvivorSite.acknowledge(game)
	var chart=s.contacts
	# A main course can be selected while clearing an optional platform. Keep
	# that platform moving out of view and retire it even during story travel.
	if chart.active.get("state","")=="departing":
		if is_instance_valid(site):site.position.z=s.distance-chart.active.atDistanceM
		if s.distance-leaving_at>40:
			if is_instance_valid(site):site.queue_free()
			site=null;points.clear();survivor_site=null;radar.finish_visit()
			chart.visited.append(chart.active.id);chart.nextSlot=int(chart.active.slot)+1;chart.active={}
		return
	game.missions.update_offers()
	if s.navigation_limit()<=0 and MMFMissions.contact_mission(s.contacts.active)=="": return
	if story_priority(): return
	if radar.update():return
	var c=chart.active
	if c.get("kind","")=="rooftop-workshop":s.survivor_content.workshop.charted=true
	if c.get("kind","")=="friendly-refuge":s.survivor_content.refuge.offered=true
	if c.is_empty():
		if MMFNativeProgression.radar_ready(s):return
		if not schedule_armed:
			chart.nextSlot=maxi(int(chart.nextSlot),int(ceil((s.distance+450)/700)))
			schedule_armed=true
		var slot=int(chart.nextSlot)
		if s.distance>=slot*700-450:
			chart.active=make_contact(slot,"friendly-refuge" if not s.survivor_content.refuge.offered else "")
			s.notify("Optional signal detected: "+title())
			if chart.active.kind=="friendly-refuge":
				s.survivor_content.refuge.offered=true
				var request="Your supplies are still by the charger. Stop in if you're passing. The light's steady now." if s.survivor_content.refuge.repaired else "Three relay components, if you can spare them. I have spare metal and fuel to trade. Look for the roof light."
				game.journey.enqueue("survivor/refuge-offer","R-9 / OPEN CHANNEL",request,true)
			elif chart.active.kind=="rooftop-workshop":
				s.survivor_content.workshop.charted=true
				if s.survivor_content.refuge.workshopKnown:game.journey.enqueue("survivor/workshop-bearing","R-9","That's the workshop I mentioned. Marked its signal for you. There may still be spare equipment upstairs.")
		return
	if c.state=="detected" and s.distance>c.expiresAtM:
		dismiss()
		return
	if c.state=="committed":
		radar.patrol()
		var remaining=c.atDistanceM-s.distance
		s.target_course=clampf(rad_to_deg(atan2(c.worldX-s.lateral,maxf(remaining,.1))),-s.navigation_limit(),s.navigation_limit())
		if remaining<0.75 and s.speed<0.16 and not game.combat.active_threat():
			c.state="docked"
			s.distance=c.atDistanceM
			s.speed=0
			s.target_course=0
			game.world.set_dock_open(true)
			s.notify("Optional site docked. Use the elevated gangway.")
	if c.salvageMode=="broadcast" and not game.combat.active_threat():
		c.salvageMode="defended"
		c.rewards={"scrap":48,"components":6}
		game.world.set_dock_open(true)
		s.notify("Deep cache unlocked. Collect it across the gangway.")
	if site:
		if survivor_site: survivor_site.update()
		if survivor_site:refresh_labels()
		site.position=Vector3(19,16.03,s.distance-c.atDistanceM)
		for point in points: point.label.visible=c.state in ["docked","visited"] and (not survivor_site or survivor_site.point_visible(point.id))
		if c.state=="departing" and s.distance-leaving_at>40:
			site.queue_free();site=null;points.clear();survivor_site=null
			radar.finish_visit()
			chart.visited.append(c.id)
			chart.nextSlot=int(c.slot)+1
			chart.active={}

func reset_service_hold():
	service_timer=0
	service_hold_site=""

func update_service_hold(dt: float,active: bool):
	var c=game.session.contacts.active
	if survivor_site and c.get("kind","") in MMFSurvivorSite.KINDS:
		if not active or c.get("state","") not in ["docked","visited"] or not survivor_site.service_ready(): reset_service_hold();return
		if service_hold_site!=c.id: service_timer=0;service_hold_site=c.id
		service_timer+=dt
		if service_timer>=2.4: survivor_site.finish_service();reset_service_hold()
		return
	if not active or story_priority() or game.session.navigation_limit()<=0 or c.get("state","")!="docked" or c.get("step","")!="task-ready":
		reset_service_hold()
		return
	if service_hold_site!=c.id: service_timer=0;service_hold_site=c.id
	service_timer+=dt
	if service_timer>=1.2:
		c.step="service-done"
		reset_service_hold()
		game.session.notify("Service complete. Reach the deeper retrieval point.")

func preview(contact: Dictionary={}) -> Dictionary:
	var c=game.session.contacts.active if contact.is_empty() else contact
	if c.is_empty(): return {}
	var forward=maxf(0,c.atDistanceM-game.session.distance)
	var lateral=c.worldX-game.session.lateral
	var bearing=rad_to_deg(atan2(lateral,maxf(forward,0.01)))
	var estimate=MMFMachineOperations.travel(game.session,sqrt(forward*forward+lateral*lateral))
	return {"bearing":bearing,"remaining":forward,"fuel":ceil(estimate.fuel),"estimate_available":estimate.available,"reachable":forward>0 and absf(bearing)<=game.session.navigation_limit()}

func commit() -> bool:
	var s=game.session
	var c=s.contacts.active
	if c.is_empty() or c.state!="detected" or story_priority() or game.combat.active_threat() or MMFMachineOperations.departure_reason(s)!="" or not game.aboard(): return false
	if MMFNativeProgression.radar_ready(s) and not radar.powered():s.notify("Receiver power is required to intercept a signal.");return false
	if s.distance>c.expiresAtM:return false
	var p=preview()
	if not p.reachable: s.notify("This contact is outside the helm's current steering range.");return false
	var mission=MMFMissions.contact_mission(c)
	if mission!="":
		if s.missions.records[mission].status!="accepted" and not MMFMissionContracts.reward_pending(s,mission):s.notify("Accept this request at the receiver first.");return false
		if not MMFMissionContracts.completed(s,mission):s.missions.records[mission].status="in_progress"
	c.state="committed"
	s.target_course=p.bearing
	create_site()
	game.close_menu()
	return true

func create_site():
	if site: site.queue_free()
	points.clear()
	var c=game.session.contacts.active
	site=Node3D.new();add_child(site)
	site.position=Vector3(19,16.03,game.session.distance-c.atDistanceM)
	site_id=c.id
	definition={}
	survivor_site=null
	if MMFMissions.contact_mission(c)!="":
		survivor_site=MMFMissionSite.new();survivor_site.setup(self,site)
		MMFSiteGrounding.attach(site,"mission-"+MMFMissions.contact_mission(c),game)
		return
	if c.kind.begins_with("gear-"):
		survivor_site=MMFGearSite.new();survivor_site.setup(self,site)
		site.position=Vector3(19,16.03,game.session.distance-c.atDistanceM)
		MMFSiteGrounding.attach(site,c.kind,game)
		return
	if c.kind in MMFSurvivorSite.KINDS:
		survivor_site=MMFSurvivorSite.new();survivor_site.setup(self,site)
		site.position=Vector3(19,16.03,game.session.distance-c.atDistanceM)
		MMFSiteGrounding.attach(site,c.kind,game)
		return
	for value in game.data.DESERT_OPPORTUNITIES.values():
		if value.contactKind==c.kind: definition=value
	var model_id={"fuel-cache":"route-water-cache","salvage-wreck":"route-salvage-wreck","memorial":"route-memorial","repair-depot":"route-repair-depot"}[c.kind]
	site.add_child(MMFAssets.scene("models/authored/"+model_id+".glb"))
	if not definition.is_empty():
		for spec in definition.colliders: MMFAssets.collider(site,{"position":spec.at,"half":spec.half})
		add_point("service",definition.interactions.service.label,MMFAssets.v(definition.interactions.service.fallback))
		add_point("retrieval",definition.interactions.retrieval.label,MMFAssets.v(definition.interactions.retrieval.fallback))
	else:
		MMFAssets.collider(site,{"position":{"y":-0.1},"half":{"x":6,"y":0.1,"z":5}})
		MMFAssets.collider(site,{"position":{"x":-6.5,"y":-0.08},"half":{"x":0.5,"y":0.08,"z":1}})
		add_point("recruit","Restore L–12 · 6 components",Vector3(-1,1,1.5))
	add_point("reward","Recover supplies / read record",Vector3(-2.8,1,-1.8))
	site.position=Vector3(19,16.03,game.session.distance-c.atDistanceM)
	MMFSiteGrounding.attach(site,c.kind,game)

func add_point(id: String,label_text: String,at: Vector3):
	var label=Label3D.new()
	label.text=game.hint(label_text+(" [HOLD {key:use}]" if id=="service" else ""));label.position=at+Vector3.UP*0.25
	label.billboard=BaseMaterial3D.BILLBOARD_ENABLED
	label.pixel_size=0.007;label.font_size=26;label.visibility_range_end=7
	site.add_child(label)
	points.append({"id":id,"at":at,"label":label,"text":label_text})

func refresh_labels():
	for point in points:
		point.label.visible=game.session.contacts.active.get("state","") in ["docked","visited"] and (not survivor_site or survivor_site.point_visible(point.id))
		if survivor_site and not survivor_site.point_visible(point.id): continue
		if survivor_site:
			var updated=survivor_site.point_text(point.id)
			if updated!="":point.text=updated
		point.label.text=game.hint(point.text+(" [HOLD {key:use}]" if point.id=="service" else ""))

func dismiss() -> bool:
	var chart=game.session.contacts
	if chart.active.get("state","")!="detected":return false
	game.missions.leave_offer()
	if radar.dismiss_selected():return true
	if chart.active.id not in chart.missed:chart.missed.append(chart.active.id)
	chart.nextSlot=int(chart.active.slot)+1;chart.active={}
	game.journey.queue=game.journey.queue.filter(func(line):return line.id not in ["survivor/refuge-offer","survivor/workshop-bearing"])
	if game.journey.current.get("id","") in ["survivor/refuge-offer","survivor/workshop-bearing"]:game.journey.current.clear()
	return true

func nearest() -> Dictionary:
	if not site or game.session.contacts.active.get("state","") not in ["docked","visited"]: return {}
	var c=game.session.contacts.active
	var best={}
	var distance=2.2
	for point in points:
		if survivor_site and not survivor_site.point_visible(point.id): continue
		if point.id=="service" and c.step!="task-ready": continue
		if point.id=="recruit" and game.session.caretaker.recovered: continue
		var length=game.player.position.distance_to(site.to_global(point.at)-Vector3.UP*.7)
		if length<distance:
			if not survivor_site: return point
			best=point;distance=length
	return best

func interact(point: Dictionary):
	var s=game.session
	var c=s.contacts.active
	if c.is_empty(): return
	if survivor_site:
		survivor_site.interact(point.id);return
	match point.id:
		"service": s.notify("Hold {key:use} for 1.2 seconds to service this control.")
		"retrieval":
			if c.step=="service-done": c.step="task-complete";s.notify("Retrieval complete. The site's supplies are now accessible.")
			else: s.notify("Service the first control before opening the deep reserve.")
		"recruit":
			if not s.caretaker.recovered and not game.combat.active_threat() and s.pay({"components":6}):
				s.caretaker.recovered=true
				s.notify("L–12 restored. Build a caretaker dock aboard the Nomad.")
		"reward":
			if c.kind!="repair-depot" and c.step!="task-complete": s.notify("Complete the service and retrieval task first.");return
			if c.kind=="salvage-wreck" and c.salvageMode=="": game.open_menu("Signal");return
			if c.salvageMode=="broadcast": return
			for id in c.rewards: c.rewards[id]=s.add_resource(id,int(c.rewards[id]))
			if c.kind in ["memorial","repair-depot"] and not c.record:
				c.record=true
				var id="memorial-transmission" if c.kind=="memorial" else "depot-linekeeper-record"
				if id not in s.story.uniques: s.story.uniques.append(id)
				game.ui.show_record(game.data.OPPORTUNITIES[c.kind].title,game.data.MEMORIAL_MESSAGE if c.kind=="memorial" else game.data.DEPOT_MESSAGE)
			var remaining=0
			for count in c.rewards.values(): remaining+=count
			if remaining==0: c.state="visited"
			s.notify("Supplies transferred." if remaining==0 else "Storage full. Unclaimed supplies remain here.")

func choose_salvage(mode: String):
	var c=game.session.contacts.active
	if c.get("kind","")!="salvage-wreck" or c.get("salvageMode","")!="": return
	if mode=="broadcast" and (not game.aboard() or game.combat.active_threat()): return
	if mode not in ["secure","broadcast"]:return
	if mode=="broadcast" and not game.combat.begin_ship("skiff"):return
	c.salvageMode=mode
	if mode=="broadcast": game.world.set_dock_open(false)
	game.close_menu()

func depart():
	var s=game.session
	var c=s.contacts.active
	if not game.aboard() or game.combat.active_threat(): return
	if c.get("state","") not in ["docked","visited"]: return
	var config=MMFMachineOperations.resume_config(s)
	var blocked=MMFMachineOperations.departure_reason(s,config)
	if blocked!="":s.notify(blocked);return
	s.operations=config;s.update_power()
	game.missions.departed()
	c.state="departing"
	leaving_at=s.distance
	s.target_course=0
	game.world.set_dock_open(false)
	game.close_menu()
