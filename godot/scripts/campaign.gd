class_name MMFCampaign
extends Node3D

var game
var destination: Node3D
var destination_id = ""
var points: Array = []
var departing_distance = 0.0
var ending_time = 0.0

func setup(owner_game):
	game=owner_game
	restore_destination()

func expedition() -> Dictionary:
	return game.data.STORY_EXPEDITIONS[clampi(int(game.session.story.index),0,4)]

func routes() -> Array:
	var index=int(game.session.story.index)
	if index==1: return game.data.FOUNDRY_ROUTES
	if index==3: return game.data.ORCHARD_ROUTES
	if index==4: return game.data.MERIDIAN_ROUTES
	return []

func begin_route(id: String="") -> bool:
	var s=game.session
	if game.combat.active_threat() or not game.aboard() or s.capacity<=0:
		s.notify("Secure the deck and power the helm before committing a route.")
		return false
	if s.story.phase!="route-selection": return false
	if s.contacts.active.get("state","") in ["committed","docked","visited"]: s.notify("Finish or depart the current optional stop first.");return false
	var length=float(expedition().approachDistanceM)
	var route={}
	for candidate in routes():
		if candidate.id==id: route=candidate
	if not routes().is_empty() and route.is_empty(): return false
	if not route.is_empty(): length=route.distanceM
	s.story.routeId=id
	s.story.arrival=s.distance+length
	s.story.phase="approach"
	s.story.scripted="not-due"
	if id=="orchard-caretaker" and "orchard-port-isolator" not in s.story.objectives: s.story.objectives.append("orchard-port-isolator")
	if id=="orchard-cold-vault" and "orchard-starboard-isolator" not in s.story.objectives: s.story.objectives.append("orchard-starboard-isolator")
	create_destination(expedition())
	s.notify("Course committed: "+expedition().title)
	game.close_menu()
	return true

func create_destination(def: Dictionary):
	if destination: destination.queue_free()
	points.clear()
	destination=Node3D.new()
	add_child(destination)
	destination_id=def.id
	var model_path="models/authored/"+def.modelId+".glb"
	if def.modelId=="relay-wreck": model_path="models/authored/expedition-wreck.glb"
	var visual=MMFAssets.scene(model_path)
	destination.add_child(visual)
	for spec in def.colliders: MMFAssets.collider(destination,{"position":spec.at,"half":spec.half})
	for entry in def.interactables:
		var at=MMFAssets.v(entry.fallback)
		var anchor=MMFAssets.find_named(visual,entry.anchor)
		if anchor: at=destination.to_local(anchor.global_position)
		var label=Label3D.new()
		label.text=entry.label
		label.position=at+Vector3.UP*0.3
		label.font_size=28
		label.pixel_size=0.007
		label.billboard=BaseMaterial3D.BILLBOARD_ENABLED
		label.modulate=Color(0.35,0.9,0.85)
		label.visibility_range_end=8
		destination.add_child(label)
		points.append({"entry":entry,"at":at,"label":label})
	update_position()

func restore_destination():
	if game.session.story.phase in ["approach","braking","docked"]:
		create_destination(expedition())
		game.world.set_dock_open(game.session.story.phase=="docked")

func update_position():
	if not destination: return
	var def=expedition()
	destination.position=Vector3(def.placement.root.x,16.03,game.session.distance-game.session.story.arrival)

func update(dt: float):
	var s=game.session
	var st=s.story
	if st.phase in ["approach","braking"]:
		var remaining=st.arrival-s.distance
		for route in routes():
			if route.id!=st.routeId or route.scriptedVehicle==null: continue
			if remaining<=route.scriptedVehicleRemainingM and st.get("scripted","")=="not-due":
				if not game.combat.active_threat():
					game.combat.begin_ship(route.scriptedVehicle)
					st.scripted="queued"
		if st.get("scripted","")=="queued" and not game.combat.active_threat(): st.scripted="resolved"
		if remaining<expedition().brakingDistanceM: st.phase="braking"
		if remaining<0.75 and s.speed<0.16 and not game.combat.active_threat():
			s.distance=st.arrival
			s.speed=0
			st.phase="docked"
			game.world.set_dock_open(true)
			s.notify("Docked at "+expedition().title+". Stay above the radioactive ground.")
			game.save_game("autosave")
	if destination:
		update_position()
		for point in points:
			point.label.visible=st.phase=="docked" and can_show(point.entry)
	if st.phase=="departing" and s.distance-departing_distance>40:
		if destination: destination.queue_free()
		destination=null
		points.clear()
		st.completed.append(expedition().id)
		if st.index>=4:
			st.phase="ending-ready"
		else:
			st.index+=1
			st.phase="route-selection"
			st.routeId=""
			if routes().is_empty(): begin_route()
	if st.phase=="ending-journey" and s.distance>=st.get("endingDistance",INF):
		st.phase="arrival"
		ending_time=0
		game.cinematics.begin_arrival()

func can_show(entry: Dictionary) -> bool:
	var st=game.session.story
	if entry.kind=="journal":
		if entry.id=="orchard-caretaker-record": return st.routeId=="orchard-caretaker"
		if entry.id=="orchard-evacuation-record": return st.routeId=="orchard-cold-vault"
		if entry.id=="meridian-civilian-record": return st.routeId=="meridian-quiet-line"
		if entry.id=="meridian-defense-record": return st.routeId=="meridian-cordon-gap"
	if entry.kind=="unique" and entry.factId in st.uniques: return false
	if entry.kind=="objective" and entry.objectiveId in st.objectives: return false
	return true

func nearest() -> Dictionary:
	if not destination or game.session.story.phase!="docked": return {}
	var best={}
	var distance=2.5
	for p in points:
		if not can_show(p.entry): continue
		var length=game.player.position.distance_to(destination.to_global(p.at)-Vector3.UP*0.6)
		if length<distance:
			best=p.entry
			distance=length
	return best

func requirement(id: String) -> String:
	var st=game.session.story
	if id=="human-seed-bank" and "orchard-port-isolator" not in st.objectives: return "Restore the port isolator first."
	if id=="orchard-memory-core" and "orchard-starboard-isolator" not in st.objectives: return "Restore the starboard isolator first."
	if id in ["vector-governor","meridian-solution"]:
		for objective in expedition().get("requiredObjectives",[]):
			if objective not in st.objectives: return "Complete the archive controls first."
		var needed=[]
		if id=="vector-governor": needed=["orchard-memory-record","orchard-caretaker-record" if st.routeId=="orchard-caretaker" else "orchard-evacuation-record"]
		else: needed=["meridian-common-record","meridian-civilian-record" if st.routeId=="meridian-quiet-line" else "meridian-defense-record"]
		for journal in needed:
			if journal not in st.journals: return "Read the remaining archive records first."
	if id=="course-actuator":
		for journal in expedition().requiredJournals:
			if journal not in st.journals: return "Read both relay calibration records first."
	return ""

func interact(entry: Dictionary) -> bool:
	if game.session.story.phase!="docked" or not can_show(entry): return false
	var st=game.session.story
	match entry.kind:
		"journal":
			if entry.id not in st.journals: st.journals.append(entry.id)
			for journal in expedition().journals:
				if journal.id==entry.id: game.ui.show_record(journal.title,journal.text)
		"unique":
			var blocked=requirement(entry.factId)
			if blocked!="":
				game.session.notify(blocked)
				return false
			if entry.factId not in st.uniques: st.uniques.append(entry.factId)
			game.session.notify(entry.label+" — recovered.")
		"objective":
			if expedition().id=="last-garden-meridian" and "orchard-memory-core" not in st.uniques: return false
			if entry.objectiveId not in st.objectives: st.objectives.append(entry.objectiveId)
			game.session.notify(entry.label+" — complete.")
		"departure": game.open_menu("Helm")
	return true

func departure_reason() -> String:
	var st=game.session.story
	if st.phase!="docked": return "Not docked."
	if not game.aboard(): return "Return aboard before retracting the gangway."
	if game.combat.active_threat(): return "Secure the deck before departure."
	for id in expedition().requiredUniques:
		if id not in st.uniques: return "Recover every required component before departure."
	for id in expedition().get("requiredObjectives",[]):
		if id not in st.objectives: return "Complete the destination objectives first."
	return ""

func depart() -> bool:
	var reason=departure_reason()
	if reason!="":
		game.session.notify(reason)
		return false
	departing_distance=game.session.distance
	game.session.story.phase="departing"
	game.world.set_dock_open(false)
	game.close_menu()
	return true

func begin_ending() -> bool:
	var s=game.session
	if s.story.phase!="ending-ready" or not game.aboard() or game.combat.active_threat(): return false
	# The durable checkpoint precedes the point of no return.
	if not game.save_game("meridian-checkpoint"): return false
	s.story.phase="ending-journey"
	s.story.ending="committed"
	s.story.endingDistance=s.distance+400
	s.target_course=32
	game.close_menu()
	return true
