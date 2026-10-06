extends "res://tests/beta_salvage.gd"

class Readout extends RefCounted:
	var lines=[]
	func text_line(value):lines.append(value)

func fill(bag,id: String):
	bag.slots.fill(null)
	bag.add(id,bag.slots.size()*int(bag.definitions[id].stackSize))

func run():
	out="res://../test-results/cargo-capacity/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	await physics_frame;await physics_frame
	var s=game.session;var a=game.salvage.automation;s.facts.salvage=true;s.speed=0
	var items=game.data.ITEMS;var cap=int(items.scrap.stackSize)
	var bag=MMFInventory.new(items,1)
	var mixed={"opened":true,"contents":{"scrap":7,"fuel":2}}
	var preview=MMFCargoCapacity.preview(mixed,[bag])
	check(preview.state=="partial" and preview.accepted=={"scrap":7} and preview.remaining=={"fuel":2},"One empty slot is not counted for two different items")
	check(bag.slots==[null] and bag.mutation_revision==0,"Capacity preview never mutates real inventory")
	bag.add("scrap",cap-3);preview=MMFCargoCapacity.preview(mixed,[bag])
	check(preview.accepted=={"scrap":3} and preview.remaining=={"scrap":4,"fuel":2},"Partial matching stack reports exact retained mixed cargo")
	check(not a.drone_can_accept({"opened":true,"contents":{"fuel":2}},bag),"Drone does not launch for known cargo that cannot fit despite other matching room")
	check(a.drone_can_accept(mixed,bag),"Drone can retrieve a partially fitting known load")
	var rng=s.rng.state
	check(a.drone_can_accept({"opened":false,"contents":{}},bag) and s.rng.state==rng,"Sealed cargo remains eligible without sampling its reward")
	fill(bag,"scrap")
	check(not a.drone_can_accept({"opened":false},bag),"Completely full dock stays idle for sealed cargo")
	bag.slots.fill(null);bag.add(MMFNomadPersonalization.PART,1)
	check(a.drone_can_accept({"opened":false},bag),"Sealed-cargo capacity includes the existing cosmetic salvage item")
	# Actual manual delivery, full remainder, save/restore and a freed partial stack.
	clear_cargo();game.player.teleport(Vector3(0,16.03,-1))
	for container in s.containers():fill(container,"components")
	s.inventory.slots[0]={"itemId":"scrap","count":cap-3}
	s.inventory.slots[1]={"itemId":"fuel","count":int(items.fuel.stackSize)-1}
	var c=cargo(Vector3(-2,16.1,-1));var before_scrap=s.count_resource("scrap");var before_fuel=s.count_resource("fuel")
	rng=s.rng.state;game.salvage.receive(c)
	check(s.count_resource("scrap")==before_scrap+3 and s.count_resource("fuel")==before_fuel+1,"Actual manual transfer accepts only compatible remaining space")
	check(c.active and c.claimed=="parked" and c.contents=={"scrap":4,"fuel":1},"Actual partial remainder stays in a visible parked crate")
	check(game.salvage.recovery_blocked(c),"Full parked remainder is recognized as temporarily blocked")
	var aim=(c.node.position-game.salvage.hand_position()).normalized();game.player.yaw=atan2(-aim.x,-aim.z);game.player.pitch=asin(aim.y);game.player.update_camera(1)
	check(game.salvage.aimed_crate()==game.salvage.crates.find(c),"Blocked-hook fixture is genuinely aligned")
	game.ui.salvage_readout.update()
	check(game.ui.salvage_readout.recovery_blocked and game.ui.salvage_readout.label.text.contains("STORAGE FULL"),"Existing targeted bracket identifies full retained cargo")
	game.salvage.throw_hook();check(not game.salvage.busy(),"Aligned full parked load does not start another futile hook flight")
	var saved=game.salvage.snapshot();clear_cargo();game.salvage.restore(saved);c=game.salvage.crates[0]
	check(c.contents=={"scrap":4,"fuel":1} and c.claimed=="parked","Save/restore retains exact partial remainder and parked ownership")
	s.inventory.remove("scrap",4);s.inventory.remove("fuel",1)
	check(not game.salvage.recovery_blocked(c),"Freeing matching capacity enables recovery immediately")
	game.salvage.receive(c)
	check(not c.active and c.contents.is_empty() and s.rng.state==rng,"Recovering the remainder empties it once without a reward reroll")
	# Real drone destination bag retains a partial load, then resumes exactly once.
	clear_cargo();c=cargo(Vector3(-3,16,-1));bag=MMFInventory.new(items,2)
	bag.add("scrap",cap-3);bag.add("fuel",int(items.fuel.stackSize)-1);c.claimed="test-dock"
	check(not a.transfer(c,bag) and c.contents=={"scrap":4,"fuel":1} and c.active,"Actual automated transfer holds mixed leftovers")
	var previous=c.contents.duplicate();check(not a.transfer(c,bag) and c.contents==previous,"Repeated full unload loses and duplicates nothing")
	bag.remove("scrap",4);bag.remove("fuel",1)
	check(a.transfer(c,bag) and not c.active and c.contents.is_empty(),"Freed dock space completes the existing held load")
	clear_cargo();c=cargo(Vector3(-3,16,-1));c.opened=false;c.contents={};fill(bag,"scrap")
	check(not a.transfer(c,bag) and c.opened,"Sealed actual cargo opens once even if storage cannot receive it")
	previous=c.contents.duplicate();rng=s.rng.state;a.transfer(c,bag)
	check(c.contents==previous and s.rng.state==rng,"Sealed cargo retained at full storage is never rerolled on retry")
	# The actual player-facing collector page is Storage, not Equipment.
	var dock=s.create_piece("collector-auto",{"x":4,"y":0,"z":1},0,{},true)
	var dock_id=str(dock.instanceId);s.powered[dock_id]=true
	fill(s.stores[dock_id],"components")
	a.drones[dock_id]={"cargo":c,"phase":"wait","node":Node3D.new()}
	var readout=Readout.new();a.render_storage(readout,dock_id)
	check(readout.lines.any(func(line):return line.begins_with("HELD CARGO:")) and readout.lines.any(func(line):return "free space in this dock" in line),"Local drone storage status names held supplies and the specific destination to clear")
	dock.health=0;s.stores[dock_id].slots.fill(null);readout=Readout.new();a.render_storage(readout,dock_id)
	check(readout.lines.any(func(line):return "Dock damaged" in line) and readout.lines.any(func(line):return line.begins_with("HELD CARGO:")) and not readout.lines.any(func(line):return "resume unloading" in line),"Destroyed dock retains damage status and held contents without promising unload")
	a.drones[dock_id].node.free();a.drones.erase(dock_id)
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"kind":"headless prepared cargo fixtures; no campaign or human feedback claim"}
	FileAccess.open(out+"report.json",FileAccess.WRITE).store_string(JSON.stringify(report,"  "));print("CARGO_CAPACITY_RESULT ",JSON.stringify(report))
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)
