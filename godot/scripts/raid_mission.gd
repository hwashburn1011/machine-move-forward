class_name MMFRaidMission
extends RefCounted

var game
var carrier
var objective="assault"
var source_id=""
var subsystem_id=""
var entry=Vector3.ZERO
var target=Vector3.ZERO
var phase="none"
var elapsed=0.0
var held=0.0

func setup(owner_game): game=owner_game

func choose(wave: int) -> String:
	if wave<=1: return "assault"
	var rng=MMFRandom.new();rng.seed=MMFRandom.hash_seed([game.session.seed_name,"raid-objectives",int((wave-2)/3)])
	var bag=["assault","sabotage","theft"]
	for i in range(2,0,-1):
		var j=rng.randi_range(0,i);var temp=bag[i];bag[i]=bag[j];bag[j]=temp
	return bag[(wave-2)%3]

func assign(enemy,wave: int):
	carrier=enemy;entry=enemy.position;elapsed=0;held=0
	objective=choose(wave);phase="intent"
	if objective=="sabotage":
		for id in game.session.subsystems:
			if game.session.subsystems[id]<=0: continue
			subsystem_id=id;target=MMFAssets.v(game.data.SUBSYSTEMS[id].repairAt)
			enemy.mission="sabotage";enemy.mission_subsystem=id;enemy.mission_point=target
			game.session.notify("Saboteur aboard — protect the "+game.data.SUBSYSTEMS[id].name+".")
			return
	elif objective=="theft":
		var candidates=[]
		for id in game.session.stores:
			var bag=game.session.stores[id]
			if bag.count_item("scrap")+bag.count_item("components")+bag.count_item("fuel")<=0: continue
			var p=game.session.find_piece(id)
			var at=game.building.center(p.cell)
			var path=NavigationServer3D.map_get_path(game.get_world_3d().navigation_map,entry,at,true)
			if path.is_empty() or path[-1].distance_to(at)>2.5: continue
			candidates.append({"id":id,"at":at,"distance":entry.distance_to(at)})
		candidates.sort_custom(func(a,b):return a.distance<b.distance or (a.distance==b.distance and a.id<b.id))
		if not candidates.is_empty():
			source_id=candidates[0].id;target=candidates[0].at
			enemy.mission="travel";enemy.mission_point=target
			game.session.notify("Supply raider aboard — defend storage or cut its grapple.")
			return
	cancel()

func extraction_active() -> bool:
	return objective=="theft" and phase in ["intent","carrying"] and is_instance_valid(carrier) and not carrier.dead

func cancel():
	if is_instance_valid(carrier): carrier.mission="assault"
	phase="cancelled"

func update(dt: float):
	if not is_instance_valid(carrier) or carrier.dead or phase not in ["intent","carrying"]: return
	elapsed+=dt
	if elapsed>90 or (objective=="theft" and (game.combat.ship_state!="grapple" or game.combat.hook_health<=0)):
		cancel();return
	if objective=="sabotage":
		if game.session.subsystems.get(subsystem_id,0)<=0: cancel()
		return
	if objective!="theft": return
	var close=carrier.position.distance_to(target)<2.5 and absf(carrier.position.y-target.y)<1.25
	if not close: held=0;return
	held+=dt
	if phase=="intent" and held>=1.2:
		var bag=game.session.stores.get(source_id)
		if bag==null: cancel();return
		for spec in [["scrap",6],["components",2],["fuel",2]]:
			var count=mini(spec[1],bag.count_item(spec[0]))
			if count<=0: continue
			bag.remove(spec[0],count);carrier.stolen={spec[0]:count}
			phase="carrying";held=0;target=entry;carrier.mission_point=entry
			game.session.notify("Carrier returning to the grapple with stolen "+spec[0]+"!")
			return
		cancel()
	elif phase=="carrying" and held>=3:
		phase="escaped";carrier.stolen.clear();carrier.dead=true;carrier.queue_free()
		game.session.notify("Supply raider escaped.")

func recover(enemy):
	if enemy!=carrier: return
	for id in enemy.stolen:
		var remaining=int(enemy.stolen[id])
		if game.session.stores.has(source_id): remaining=game.session.stores[source_id].add(id,remaining)
		remaining=game.session.add_resource(id,remaining)
		if remaining>0: game.combat.drop_loot(enemy.position,id,remaining)
	if not enemy.stolen.is_empty(): game.session.notify("Stolen supplies recovered.")
	enemy.stolen.clear();phase="recovered"
