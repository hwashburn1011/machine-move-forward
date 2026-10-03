extends RefCounted

# State-fixture helper only. physical_expeditions.gd separately proves input-driven walking.
static func frames(game,count: int):
	for i in count:await game.get_tree().physics_frame

static func stand_at(game,point: Dictionary) -> bool:
	var target=game.campaign.destination.to_global(point.at)
	for radius in [1.0,1.5,1.9,2.2]:
		for i in 16:
			var angle=i*TAU/16
			var at=Vector3(target.x+sin(angle)*radius,16.09,target.z+cos(angle)*radius)
			if not game.player.boundary.fits(at):continue
			game.player.position=at;game.player.velocity=Vector3.ZERO
			if game.activity.interaction_refusal(point.entry)=="":return true
	return false

static func point(game,id: String) -> Dictionary:
	for p in game.campaign.points:
		if p.entry.id==id:return p
	return {}

static func open_step(game,id: String,action: String) -> bool:
	var found=point(game,"mechanism-"+id+"-"+action)
	if found.is_empty() or not stand_at(game,found):return false
	game.activity.open(found.entry)
	return true

static func act(game) -> bool:
	var accepted=game.activity.act()
	for i in 130:
		if not game.activity.moving():break
		await game.get_tree().physics_frame
	return accepted and not game.activity.moving()

static func complete(game,item: Dictionary) -> bool:
	# Scene replacement queues old colliders for removal; query the rebuilt space.
	await frames(game,3)
	var id=game.activity.key(item)
	if id!="" and not game.activity.completed(item):
		for action in MMFExpeditionMechanisms.STEPS[id]:
			if action in game.activity.state(id).mechanism.milestones:continue
			if not open_step(game,id,action):print("FIXTURE_NO_REACH ",id,"/",action);return false
			if id=="power" and action=="bus":
				for i in 3:game.activity.adjust(i,[2,1,0][i])
			if id=="array" and action!="lock":
				var index=MMFExpeditionMechanisms.STEPS.array.find(action)
				game.activity.adjust(index,[25,60,85][index])
			if not await act(game):print("FIXTURE_ACTION_REFUSED ",id,"/",action," ",game.activity.feedback);return false
			game.close_menu()
	var found=point(game,item.id)
	if found.is_empty() or not stand_at(game,found):print("FIXTURE_PICKUP_NO_REACH ",item.id);return false
	return game.campaign.interact(item)
