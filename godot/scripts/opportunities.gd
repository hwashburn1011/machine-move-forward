class_name MMFOpportunities
extends Node3D

var game
var site: Node3D
var site_id=""
var definition={}
var points=[]
var service_timer=0.0
var leaving_at=0.0
var schedule_armed=false

func setup(owner_game):
	game=owner_game
	var active=game.session.contacts.active
	if active.get("state","") in ["committed","docked","visited"]: create_site()

func make_contact(slot: int) -> Dictionary:
	var s=game.session
	var rng=MMFRandom.new()
	rng.seed=MMFRandom.hash_seed([s.seed_name,"route-chart",slot])
	var tier=3 if "vector-governor" in s.story.uniques else (2 if "course-actuator" in s.story.uniques else 1)
	var depot=tier>=2 and slot%3==0
	var kinds=["water-cache","salvage-wreck","memorial"]
	var kind="repair-depot" if depot else kinds[posmod(MMFRandom.hash_seed([s.seed_name,"route-chart-kind"])+slot-1,3)]
	var offset=rng.randf_range(265 if tier==3 else 120,290 if tier==3 else 150) if depot else rng.randf_range(45,70)
	offset*=(-1 if rng.randf()<0.5 else 1)
	var rewards={"water":4} if kind=="water-cache" else ({"scrap":24,"components":2} if kind=="salvage-wreck" else ({"repair-kit":1} if depot else {}))
	return {"id":"route-contact-%d"%slot,"slot":slot,"kind":kind,"state":"detected","atDistanceM":slot*700.0,"worldX":s.lateral+offset,"expiresAtM":slot*700.0+180,"step":"task-ready","rewards":rewards,"record":false,"salvageMode":""}

func story_priority() -> bool:
	return game.session.story.phase not in ["route-selection","ending-ready","complete"]

func update(dt: float):
	var s=game.session
	var chart=s.contacts
	if s.navigation_limit()<=0: return
	if story_priority(): return
	var c=chart.active
	if c.is_empty():
		if not schedule_armed:
			chart.nextSlot=maxi(int(chart.nextSlot),int(ceil((s.distance+450)/700)))
			schedule_armed=true
		var slot=int(chart.nextSlot)
		if s.distance>=slot*700-450:
			chart.active=make_contact(slot)
			s.notify("Optional signal detected: "+game.data.OPPORTUNITIES[chart.active.kind].title)
		return
	if c.state=="detected" and s.distance>c.expiresAtM:
		chart.missed.append(c.id)
		chart.nextSlot=int(c.slot)+1
		chart.active={}
		return
	if c.state=="committed":
		var remaining=c.atDistanceM-s.distance
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
		site.position=Vector3(19,16.03,s.distance-c.atDistanceM)
		for point in points: point.label.visible=c.state in ["docked","visited"]
		if c.state=="departing" and s.distance-leaving_at>40:
			site.queue_free();site=null;points.clear()
			chart.visited.append(c.id)
			chart.nextSlot=int(c.slot)+1
			chart.active={}
	if c.get("state","")=="docked":
		var near=nearest()
		if near.get("id","")=="service" and Input.is_action_pressed("use") and not game.menu_open:
			service_timer+=dt
			if service_timer>=1.2:
				c.step="service-done"
				service_timer=0
				s.notify("Service complete. Reach the deeper retrieval point.")
		else: service_timer=0

func preview() -> Dictionary:
	var c=game.session.contacts.active
	if c.is_empty(): return {}
	var forward=maxf(0,c.atDistanceM-game.session.distance)
	var lateral=c.worldX-game.session.lateral
	var bearing=rad_to_deg(atan2(lateral,maxf(forward,0.01)))
	return {"bearing":bearing,"remaining":forward,"fuel":ceil(sqrt(forward*forward+lateral*lateral)*0.008),"reachable":forward>0 and absf(bearing)<=game.session.navigation_limit()}

func commit() -> bool:
	var s=game.session
	var c=s.contacts.active
	if c.is_empty() or c.state!="detected" or story_priority() or game.combat.active_threat() or s.capacity<=0 or not game.aboard(): return false
	var p=preview()
	if not p.reachable: s.notify("This contact is outside the helm's current steering range.");return false
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
	site_id=c.id
	definition={}
	for value in game.data.DESERT_OPPORTUNITIES.values():
		if value.contactKind==c.kind: definition=value
	var model_id={"water-cache":"route-water-cache","salvage-wreck":"route-salvage-wreck","memorial":"route-memorial","repair-depot":"route-repair-depot"}[c.kind]
	site.add_child(MMFAssets.scene("models/authored/"+model_id+".glb"))
	if not definition.is_empty():
		for spec in definition.colliders: MMFAssets.collider(site,{"position":spec.at,"half":spec.half})
		add_point("service",definition.interactions.service.label+" [HOLD E]",MMFAssets.v(definition.interactions.service.fallback))
		add_point("retrieval",definition.interactions.retrieval.label,MMFAssets.v(definition.interactions.retrieval.fallback))
	else:
		MMFAssets.collider(site,{"position":{"y":-0.1},"half":{"x":6,"y":0.1,"z":5}})
		MMFAssets.collider(site,{"position":{"x":-6.5,"y":-0.08},"half":{"x":0.5,"y":0.08,"z":1}})
		add_point("recruit","Restore L–12 · 6 components",Vector3(-1,1,1.5))
	add_point("reward","Recover supplies / read record",Vector3(-2.8,1,-1.8))
	site.position=Vector3(19,16.03,game.session.distance-c.atDistanceM)

func add_point(id: String,label_text: String,at: Vector3):
	var label=Label3D.new()
	label.text=label_text;label.position=at+Vector3.UP*0.25
	label.billboard=BaseMaterial3D.BILLBOARD_ENABLED
	label.pixel_size=0.007;label.font_size=26;label.visibility_range_end=7
	site.add_child(label)
	points.append({"id":id,"at":at,"label":label,"text":label_text})

func nearest() -> Dictionary:
	if not site or game.session.contacts.active.get("state","") not in ["docked","visited"]: return {}
	var c=game.session.contacts.active
	for point in points:
		if point.id=="service" and c.step!="task-ready": continue
		if point.id=="recruit" and game.session.caretaker.recovered: continue
		if game.player.position.distance_to(site.to_global(point.at)-Vector3.UP*0.7)<2.2: return point
	return {}

func interact(point: Dictionary):
	var s=game.session
	var c=s.contacts.active
	if c.is_empty(): return
	match point.id:
		"service": s.notify("Hold E for 1.2 seconds to service this control.")
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
	c.salvageMode=mode
	if mode=="broadcast": game.world.set_dock_open(false);game.combat.begin_ship("skiff")
	game.close_menu()

func depart():
	var s=game.session
	var c=s.contacts.active
	if not game.aboard() or game.combat.active_threat(): return
	if c.get("state","") not in ["docked","visited"]: return
	c.state="departing"
	leaving_at=s.distance
	s.target_course=0
	game.world.set_dock_open(false)
	game.close_menu()
