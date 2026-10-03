extends "res://tests/art200_performance.gd"
## Synthetic rendered stress: all 50 furnishings painted independently, three
## powered drone docks and live cargo/streaming. Not an earned campaign run.
var dock_ids=[]
var workload={"kind":"painted_home_three_drones","docks":0,"received_items":0,"phase_samples":{},"samples":[]}
var next_observation=0.0

func _initialize():
	super._initialize()
	output="res://../test-results/beta-next/performance/"
	label="painted-home";scenario="furnished";seconds=180.0
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--seconds="):seconds=float(arg.trim_prefix("--seconds="))

func furnisher() -> int:
	var count=await super.furnisher()
	var s=game.session
	s.customization.restored=true
	s.story.uniques.append("salvage-controller")
	var index=0
	for piece in s.structures:
		if MMFNomadPersonalization.piece_eligible(piece.definitionId):
			piece.state.finish=MMFNomadPersonalization.PALETTE_IDS[index%14];index+=1
			game.personalization.bind_piece(game.building.bodies[piece.instanceId],piece)
	s.customization.machinePaint={"lockers":"petrol","benches":"clay"}
	game.personalization.bind_machine(game.world.machine)
	var pending=["generator"]
	for z in range(-6,11):
		for x in range(-7,8):
			if pending.is_empty():break
			var cell={"x":x,"y":0,"z":z}
			if not game.building.floor_at(cell):continue
			var spec={"definitionId":pending[0],"cell":cell,"rotation":0}
			if game.building.validate(spec)!="":continue
			var p=s.create_piece(pending.pop_front(),cell,0,{},true)
			game.building.add_visual(p)
			await physics_frame;await physics_frame
	if not pending.is_empty():push_error("Home stress fixture could not place its second generator")
	# A valid dock footprint alone does not guarantee room for its wider held
	# crate. Keep these stress-test landing pads away from the dense prop rows.
	# Ordinary collision checks remain active throughout pickup and delivery.
	workload.dock_cells=[]
	for pad in [Vector2i(-9,-5),Vector2i(9,-2),Vector2i(-9,1)]:
		var side=-1 if pad.x<0 else 1
		for bridge in [8,9]:
			var cell={"x":side*bridge,"y":0,"z":pad.y}
			if game.building.floor_at(cell):continue
			var spec={"definitionId":"floor","cell":cell,"rotation":0}
			if game.building.validate(spec)!="":push_error("Home stress landing floor rejected: "+game.building.validate(spec));continue
			game.building.add_visual(s.create_piece("floor",cell,0,{},true))
			await physics_frame;await physics_frame
		var cell={"x":pad.x,"y":0,"z":pad.y}
		var spec={"definitionId":"collector-auto","cell":cell,"rotation":0}
		if game.building.validate(spec)!="":push_error("Home stress landing dock rejected: "+game.building.validate(spec));continue
		var p=s.create_piece("collector-auto",cell,0,{},true)
		game.building.add_visual(p);dock_ids.append(p.instanceId);workload.dock_cells.append(cell)
		await physics_frame;await physics_frame
	s.scanner.phase="consumed";s.story.phase="complete"
	s.update_power();game.combat.layout_changed()
	# Hold random raids for this isolated machinery workload. Combat is measured
	# independently by the native combat and guardian scenarios.
	game.journey.quiet_until=s.clock+seconds+30
	workload.docks=dock_ids.size();workload.painted_pieces=index
	workload.scope="Fixture-funded, invulnerable rendering stress, not progression or difficulty evidence."
	events.append(workload)
	return count

func camera_update(elapsed: float):
	super.camera_update(elapsed)
	if not is_instance_valid(game) or dock_ids.is_empty() or elapsed<next_observation:return
	next_observation=elapsed+10
	var received=0
	for id in dock_ids:
		var store=game.session.stores.get(id)
		if store:
			for slot in store.slots:
				if slot:received+=int(slot.count)
	workload.received_items=received
	for job in game.salvage.automation.drones.values():
		workload.phase_samples[job.phase]=int(workload.phase_samples.get(job.phase,0))+1
	var sample={"seconds":elapsed,"static_bytes":Performance.get_monitor(Performance.MEMORY_STATIC),"video_bytes":Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED),"chunks":game.world.chunks.size(),"collision_cache":game.world.scenery_collision.shapes.size(),"received_items":received,"fuel":game.session.fuel,"drone_phases":game.salvage.automation.drones.values().map(func(job):return job.phase)}
	workload.samples.append(sample)
	print("HOME_SOAK_SAMPLE ",JSON.stringify(sample))
