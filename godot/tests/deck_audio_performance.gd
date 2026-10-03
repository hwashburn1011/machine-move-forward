extends "res://tests/art200_performance.gd"

func _initialize():
	super._initialize()
	output="res://../test-results/deck-audio/performance/"

func ready_reason(spec: Dictionary) -> String:
	var reason=game.building.validate(spec);var frames=0
	while reason=="Checking walking access…" and frames<120:
		await process_frame;frames+=1;reason=game.building.validate(spec)
	return reason

func furnisher() -> int:
	# All 50 models on the three permanent decks. The old outboard grid cannot
	# fit all pieces while preserving the new access routes; never bypass those
	# rules just to retain its obsolete fixture arrangement.
	var ids=[]
	for id in game.data.BUILD_PIECE_ORDER:
		if id.begins_with("nomad-") or id.begins_with("nomad2-"):ids.append(id)
	game.session.inventory.slots.resize(20);game.session.inventory.slots.fill(null)
	game.session.inventory.add("scrap",200);game.session.inventory.add("components",50)
	var index=0
	for level in [-2,-1,0]:
		var deck_count=0
		for z in [-6,6,-4,4,-2,2,0,-5,5,-3,3,-1,1]:
			if index>=ids.size() or deck_count>=18:break
			for x in [-5,5,-3,3,-1,1,0,-4,4,-2,2]:
				if index>=ids.size() or deck_count>=18:break
				var cell={"x":x,"y":level,"z":z}
				var spec={"definitionId":ids[index],"cell":cell,"rotation":index%4}
				if await ready_reason(spec)!="":continue
				game.building.add_visual(game.session.create_piece(ids[index],cell,index%4,{},true));index+=1;deck_count+=1
				await physics_frame;await physics_frame
	game.combat.layout_changed()
	if index!=ids.size():push_error("Furnished workload could place only %d of %d models"%[index,ids.size()])
	events.append({"kind":"native_three_deck_furnishings","count":index,"scope":"Funded validated interior fixture; different arrangement from the historical exterior furnishing baseline."})
	return index
