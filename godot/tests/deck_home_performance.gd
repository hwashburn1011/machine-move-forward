extends "res://tests/beta_home_performance.gd"
## Native-deck rendering fixture. All furniture and three loaded drone pads
## remain on the permanent machine; no expansion floors are created.

func _initialize():
	super._initialize()
	output="res://../test-results/deck-audio/performance/"

func ready_reason(spec: Dictionary) -> String:
	var reason=game.building.validate(spec)
	var count=0
	while reason=="Checking walking access…" and count<120:
		await process_frame;count+=1;reason=game.building.validate(spec)
	return reason

func add_at(spec: Dictionary) -> Dictionary:
	var p=game.session.create_piece(spec.definitionId,spec.cell,spec.rotation,{},true)
	game.building.add_visual(p)
	await physics_frame;await physics_frame
	return p

func furnisher() -> int:
	var s=game.session
	s.inventory.slots.resize(20);s.inventory.slots.fill(null)
	s.inventory.add("scrap",200);s.inventory.add("components",50)
	s.story.uniques.append("salvage-controller");s.customization.restored=true
	game.player.position=Vector3(0,16.1,3)
	workload.dock_cells=[];workload.native_deck_only=true;workload.placed=[]
	for z in [-6,6,-5,5,-4,4,-3,3,-2,2]:
		for x in [3,-3,5,-5,4,-4,2,-2,0]:
			if dock_ids.size()>=3:break
			var spec={"definitionId":"collector-auto","cell":{"x":x,"y":0,"z":z},"rotation":0}
			if await ready_reason(spec)!="":continue
			var p=await add_at(spec);dock_ids.append(p.instanceId);workload.dock_cells.append(spec.cell)
	if dock_ids.size()!=3:push_error("Native home needs three clear interior drone pads; found %d"%dock_ids.size())
	var pending=["generator"]
	for id in game.data.BUILD_PIECE_ORDER:
		if id.begins_with("nomad-") or id.begins_with("nomad2-"):pending.append(id)
	var count=0
	for level in [-2,-1,0]:
		var deck_count=0
		for z in [-6,6,-4,4,-2,2,0,-5,5,-3,3,-1,1]:
			if pending.is_empty() or deck_count>=18:break
			for x in [-5,5,-3,3,-1,1,0,-4,4,-2,2]:
				if pending.is_empty() or deck_count>=18:break
				var spec={"definitionId":pending[0],"cell":{"x":x,"y":level,"z":z},"rotation":count%4}
				if await ready_reason(spec)!="":continue
				var p=await add_at(spec);pending.pop_front();workload.placed.append(spec);deck_count+=1
				if p.definitionId!="generator":count+=1
	if not pending.is_empty():push_error("Native home could place only %d /50 furnishings; pending %s"%[count,pending])
	var painted=0
	for p in s.structures:
		if MMFNomadPersonalization.piece_eligible(p.definitionId):
			p.state.finish=MMFNomadPersonalization.PALETTE_IDS[painted%14];painted+=1
			game.personalization.bind_piece(game.building.bodies[p.instanceId],p)
	s.customization.machinePaint={"lockers":"petrol","benches":"clay"};game.personalization.bind_machine(game.world.machine)
	s.scanner.phase="consumed";s.story.phase="complete";s.update_power();game.combat.layout_changed()
	for id in dock_ids:
		if not s.powered.get(id,false):push_error("Native home dock lacks power: "+id)
	game.journey.quiet_until=s.clock+seconds+30
	workload.docks=dock_ids.size();workload.painted_pieces=painted
	workload.scope="Funded native-deck furnishing/drone/music stress with invulnerable actor; no expansion floors, not earned campaign evidence."
	events.append(workload)
	return count

func camera_update(elapsed: float):
	super.camera_update(elapsed)
	workload.music_starts=game.audio.music.starts
	workload.music_state=game.audio.music.state
	workload.audio_node_count=game.audio.get_child_count()
	workload.received_per_dock={}
	for id in dock_ids:
		var store=game.session.stores.get(id);var received=0
		if store:
			for slot in store.slots:
				if slot:received+=int(slot.count)
		workload.received_per_dock[id]=received
