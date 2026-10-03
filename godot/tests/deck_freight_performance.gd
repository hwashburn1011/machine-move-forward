extends "res://tests/deck_audio_performance.gd"
## Funded rendering fixture with all recovered modules at their real mounts.
## The live simulation hoists grounded cargo through ordinary collision rays.
var crane={}
var cargo={}
var freight={"kind":"connected_freight_hoist","modules":0,"captures":0,"deliveries":0,"cable_frames":0,"cargo_starts":[]}
var next_load=1.0

func furnisher() -> int:
	var s=game.session
	s.expedition_gear.recovered=["quiet-drive","battery-bank","salvage-crane"]
	s.inventory.slots.resize(20);s.inventory.slots.fill(null)
	s.inventory.add("scrap",200);s.inventory.add("components",50)
	s.scanner.phase="consumed";s.story.phase="complete"
	game.journey.quiet_until=s.clock+seconds+30
	for id in s.expedition_gear.recovered:
		var spec=MMFMachineSpaces.bay_candidate(id)
		game.player.position=MMFMachineSpaces.bay_service(id)+Vector3.UP*.06
		var reason=await ready_reason(spec)
		if reason!="":push_error("Freight fixture mount rejected: "+id+" / "+reason);continue
		var p=s.create_piece(id,spec.cell,int(spec.rotation),{},true)
		game.building.add_visual(p);freight.modules+=1
		if id=="salvage-crane":crane=p
		await physics_frame;await physics_frame
	s.update_power()
	if crane.is_empty() or not s.powered.get(crane.instanceId,false):push_error("Connected freight fixture has no powered crane")
	game.player.position=MMFMachineSpaces.bay_service("salvage-crane")+Vector3.UP*.06
	game.player.set_physics_process(false)
	s.inventory.slots.fill(null)
	for c in game.salvage.crates:c.active=false;c.node.hide();c.claimed=""
	render_camera=Camera3D.new();game.add_child(render_camera);render_camera.fov=58;render_camera.far=1000
	render_camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	freight.scope="Funded isolated native machinery workload; real cargo grounding, cable rays and inventory transfer; invulnerable actor."
	events.append(freight)
	return int(freight.modules)

func camera_update(elapsed: float):
	if not is_instance_valid(render_camera):return
	render_camera.global_position=Vector3(25,23,9)
	render_camera.look_at(Vector3(10,15,-4));render_camera.make_current();render_camera.reset_physics_interpolation()
	if not cargo.is_empty() and not cargo.active:
		if cargo.contents.is_empty():freight.deliveries+=1
		else:push_error("Freight cargo deactivated before transfer")
		cargo={};next_load=elapsed+1.0
	if elapsed>=next_load and cargo.is_empty() and not crane.is_empty():
		var at=Vector3(20,2,[-14,-4,8][int(freight.captures)%3])
		if not game.salvage.spawn_heavy(at):push_error("Freight fixture cargo pool exhausted");next_load=elapsed+5;return
		cargo=game.salvage.crates.filter(func(c):return c.active and c.get("heavy",false) and c.claimed=="").back()
		freight.cargo_starts.append(MMFAssets.dict_v(cargo.node.position))
		if game.salvage.operate_crane(crane):freight.captures+=1
		else:
			var hit=game.raycast(game.salvage.crane_tip(crane),cargo.node.position+Vector3.UP*.45)
			push_error("Freight fixture cannot reach actual grounded load: "+str(game.session.polish.get("receipts",[]).back())+" / "+str(hit));next_load=elapsed+5
	if not game.salvage.crane_cables.is_empty():freight.cable_frames+=1
