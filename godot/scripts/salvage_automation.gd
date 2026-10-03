class_name MMFSalvageAutomation
extends RefCounted

const PORT_ID="fixed-port-crane"
const PORT_AT=Vector3(-9.4875,16.03,7.8)
const PORT_CONTROL=Vector3(-8.35,16.03,7.8)
const ACTUATOR="port-crane-actuator"
const DRONE_RANGE=24.0
const PORT_DROP=.70
var game
var salvage
var port: Node3D
var original: Node3D
var claw: Node3D
var cable: MeshInstance3D
var port_job={}
var drones={}
var port_status="Repair required"
var repaired_visible=false
var port_label: Label3D
var crane_collision=preload("res://scripts/beta_crane_collision.gd").new()
var port_body: StaticBody3D
var cargo_shape=BoxShape3D.new()
var safety_exclude=[]

static func apply_data(data: Dictionary):
	data.ITEMS[ACTUATOR]={"id":ACTUATOR,"name":"Port crane actuator","category":"resource","stackSize":1,"weight":.8,"glyph":"+","description":"A replacement clutch and control servo for the seized port recovery arm. Fit at its base after repairing the receiver."}
	if ACTUATOR not in data.ITEM_IDS:data.ITEM_IDS.append(ACTUATOR)
	if not data.RECIPES.any(func(r):return r.id=="craft-port-crane-actuator"):
		data.RECIPES.append({"id":"craft-port-crane-actuator","name":"Port crane actuator","station":"workbench","inputs":{"scrap":8,"components":2},"output":{"itemId":ACTUATOR,"count":1}})
	data.BUILD_PIECES["collector-auto"].name="Salvage drone dock"
	data.BUILD_PIECES["collector-auto"].description="An earned utility drone retrieves ordinary cargo within 24 m into six storage slots. Needs 4 power, an open launch path and room in its store. Heavy cargo still needs a crane."

func setup(owner):
	salvage=owner;game=salvage.game
	var radiation=game.world.get_node_or_null("RadioactiveDesert")
	if radiation:safety_exclude.append(radiation.get_rid())
	original=MMFAssets.find_named(game.world.machine,"CargoCrane_Yaw")
	crane_collision.install(game.world)
	port=Node3D.new();port.name="PortRecoveryArm";salvage.add_child(port);port.position=PORT_AT
	if ResourceLoader.exists("res://art/beta-port-claw.glb"):
		var kit=MMFAssets.scene("res://art/beta-port-claw.glb");port.add_child(kit)
		claw=MMFAssets.find_named(kit,"ClawHead")
		if claw:claw.reparent(salvage,true)
	if not claw:
		claw=Node3D.new();salvage.add_child(claw)
		MMFAssets.box(claw,Vector3(.5,.25,.5),Vector3.ZERO,MMFAssets.material(Color(.36,.39,.34)),false)
	var carry_anchor=MMFAssets.find_named(claw,"CargoAnchor")
	if carry_anchor:carry_anchor.position.y=-PORT_DROP
	cable=MeshInstance3D.new();var mesh=CylinderMesh.new();mesh.top_radius=.022;mesh.bottom_radius=.022;mesh.height=1;mesh.radial_segments=8
	cable.mesh=mesh;cable.material_override=MMFAssets.material(Color(.12,.13,.12));salvage.add_child(cable)
	port_label=Label3D.new();port_label.position=PORT_CONTROL+Vector3.UP*1.5;port_label.text="PORT RECOVERY / SERVICE";port_label.font_size=24;port_label.pixel_size=.003;port_label.billboard=BaseMaterial3D.BILLBOARD_ENABLED;port_label.visibility_range_end=6;salvage.add_child(port_label)
	# Independent runtime collision avoids touching the frozen machine bake.
	port_body=MMFAssets.collider(port,{"position":{"x":.02,"y":.92,"z":0},"half":{"x":.83,"y":.92,"z":.74}})
	cargo_shape.size=salvage.crate_bounds.size
	sync_port()

func near_port() -> bool:
	return game.player.position.distance_to(PORT_CONTROL)<2.2

func authorized() -> bool:
	return near_port() and game.started and game.menu_open and game.ui.page=="PortCrane" and game.session.health>0 and game.cinematic==""

func repair() -> bool:
	var s=game.session
	if not authorized() or s.facts.portCraneRepaired or s.scanner.phase in ["awaiting-receiver","awaiting-module"]:return false
	if not s.pay({ACTUATOR:1}):s.notify("Craft a port crane actuator at the workbench first.");return false
	s.facts.portCraneRepaired=true;s.facts.portCraneEnabled=true;s.update_power();sync_port()
	s.notify("Port recovery arm repaired. The seized load is released; the claw now collects ordinary cargo along the left side.")
	game.record_event("salvage","port_crane_repaired",{"item":ACTUATOR});game.ui.refresh()
	return true

func render(ui):
	ui.text_line("PORT RECOVERY ARM",true)
	if not authorized():ui.text_line("Approach the port crane base to service it.");return
	var s=game.session
	if not s.facts.portCraneRepaired:
		ui.text_line("The clutch is seized around an old load. Restore the receiver, then fit a replacement actuator to release it and bring the claw online.")
		ui.text_line("Workbench: 8 scrap + 2 components → 1 port crane actuator. Fitting consumes one actuator.")
		ui.button("FIT ACTUATOR / RESTORE ARM",repair,s.scanner.phase not in ["awaiting-receiver","awaiting-module"] and s.count_resource(ACTUATOR)>0)
	else:
		ui.text_line(port_status+" · 2 power")
		ui.text_line("Recovers ordinary cargo on the left side. The cable needs a clear path. A full pack leaves the load safely held; free space to resume. Heavy freight needs the later recovery gantry.")
		ui.button("STOP RECOVERY" if s.facts.portCraneEnabled else "START RECOVERY",func():
			if not authorized():return
			s.facts.portCraneEnabled=not s.facts.portCraneEnabled;s.update_power();ui.refresh())

func port_tip() -> Vector3:
	var tip=MMFAssets.find_named(port,"HoistAnchor")
	return tip.global_position if tip else PORT_AT+Vector3(-7,3.5,0)

func port_target(c: Dictionary) -> Vector3:
	return c.node.position+Vector3.UP*PORT_DROP

func sync_port():
	var repaired=game.session.facts.get("portCraneRepaired",false)
	port.visible=repaired;claw.visible=repaired;cable.visible=repaired
	if port_body.collision_layer!=(1 if repaired else 0):port_body.collision_layer=1 if repaired else 0
	if original:original.visible=not repaired
	if repaired!=repaired_visible:crane_collision.set_repaired(repaired)
	if repaired!=repaired_visible or port_job.is_empty():claw.global_position=port_tip()-Vector3.UP*.8
	repaired_visible=repaired
	update_cable()

func update_cable():
	var tip=port_tip();var span=claw.global_position-tip
	cable.position=(tip+claw.global_position)*.5;cable.quaternion=Quaternion(Vector3.UP,span.normalized()) if span.length()>.001 else Quaternion.IDENTITY;cable.scale=Vector3(1,maxf(.001,span.length()),1)
	var closed=not port_job.is_empty() and port_job.phase!="reach"
	var jaw_a=MMFAssets.find_named(claw,"JawA");var jaw_b=MMFAssets.find_named(claw,"JawB")
	if jaw_a:jaw_a.rotation.x=-.2 if closed else .15
	if jaw_b:jaw_b.rotation.x=.2 if closed else -.15

func reset():
	port_job.clear()
	for job in drones.values():
		if is_instance_valid(job.node):job.node.queue_free()
	drones.clear();sync_port()

func moving() -> bool:
	if not port_job.is_empty() and port_job.phase!="wait" and game.session.powered.get(PORT_ID,false):return true
	return drones.values().any(func(job):return job.phase not in ["idle","wait","blocked"])

func drifting(c: Dictionary) -> bool:
	if c.claimed==PORT_ID:return not port_job.is_empty() and port_job.get("cargo")==c and port_job.phase=="reach"
	if drones.has(c.claimed):return drones[c.claimed].phase in ["launch","out","lower"]
	return false

func valid_claim(id: String) -> bool:
	if id==PORT_ID:return game.session.facts.get("portCraneRepaired",false)
	var p=game.session.find_piece(id)
	return not p.is_empty() and p.definitionId=="collector-auto" and p.health>0

func update(dt: float):
	sync_port();update_port(dt);update_drones(dt)

func transfer(c: Dictionary,bag=null) -> bool:
	if not c.opened:c.contents=game.session.salvage_reward();c.opened=true
	for id in c.contents.keys():
		var before=int(c.contents[id]);c.contents[id]=game.session.add_resource(id,before) if bag==null else bag.add(id,before)
		if before>int(c.contents[id]):game.record_event("salvage","automation_received",{"item":id,"count":before-int(c.contents[id]),"instance":c.claimed})
		if c.contents[id]==0:c.contents.erase(id)
	if not c.contents.is_empty():return false
	c.active=false;c.node.hide();c.claimed="";return true

func update_port(dt: float):
	if not game.session.facts.get("portCraneRepaired",false):return
	var tip=port_tip();var powered=game.session.powered.get(PORT_ID,false)
	if port_job.is_empty():
		for c in salvage.crates:
			if c.active and c.claimed==PORT_ID:port_job={"cargo":c,"phase":"lift"};claw.position=port_target(c);break
	if port_job.is_empty() and powered and not game.combat.active_threat():
		var best={};var distance=INF
		for c in salvage.crates:
			if not c.active or c.heavy or c.claimed!="" or c.node.position.x> -14.0:continue
			var at=port_target(c);var horizontal=Vector2(at.x-tip.x,at.z-tip.z).length()
			if horizontal>7 or tip.distance_to(at)>28 or not clear_path(tip,at,false):continue
			if horizontal<distance:best=c;distance=horizontal
		if not best.is_empty():best.claimed=PORT_ID;port_job={"cargo":best,"phase":"reach"}
	port_status="Waiting for left-side cargo" if powered else "Stopped / check power and engineering mode"
	if port_job.is_empty():update_cable();return
	var c=port_job.cargo
	if not c.active or c.claimed!=PORT_ID:port_job.clear();return
	if not powered:
		if port_job.phase=="reach":c.claimed="";port_job.clear();port_status="Stopped before pickup"
		else:port_status="Load held / recovery paused"
		update_cable();return
	var target=port_target(c) if port_job.phase=="reach" else tip-Vector3.UP*.8
	if not clear_path(tip,target,false) or not clear_path(tip,claw.position,false):port_status="Cable path blocked / clear the port side";update_cable();return
	var next=claw.position.move_toward(target,dt*5)
	if port_job.phase!="reach" and not cargo_clear(claw.position,next,PORT_DROP):port_status="Load path blocked / clear the port side";update_cable();return
	claw.position=next
	if port_job.phase=="reach":
		port_status="Lowering claw"
		if claw.position.distance_to(target)<.08:port_job.phase="lift";c.node.basis=Basis.IDENTITY;game.audio.play_sound("hook-catch")
	else:
		c.node.position=claw.position-Vector3.UP*PORT_DROP;c.node.basis=Basis.IDENTITY;port_status="Hoisting cargo"
		if claw.position.distance_to(target)<.08:
			port_job.phase="wait";port_status="Storage full / load held"
			if transfer(c):port_job.clear();port_status="Cargo recovered"
	update_cable()

func drone_home(p: Dictionary) -> Vector3:
	return game.building.piece_transform(p)*Vector3(0,.60,0)

func clear_path(from: Vector3,to: Vector3,wide: bool=true,extra_exclude: Array=[]) -> bool:
	# Check the swept footprint, including a carried crate, against real physics.
	var offsets=[Vector3.ZERO]
	if wide:offsets.append_array([Vector3(.86,0,0),Vector3(-.86,0,0),Vector3(0,0,.7),Vector3(0,0,-.7)])
	for offset in offsets:
		if not game.raycast(from+offset,to+offset,[game.player.get_rid()]+safety_exclude+extra_exclude).is_empty():return false
	return true

func dock_bodies(id: String) -> Array:
	var result=[]
	var dock=game.building.bodies.get(id)
	if is_instance_valid(dock):
		for body in MMFAssets.of_type(dock,"StaticBody3D"):result.append(body.get_rid())
	return result

func cargo_clear(from: Vector3,to: Vector3,drop: float=.9) -> bool:
	var query=PhysicsShapeQueryParameters3D.new();query.shape=cargo_shape;query.collision_mask=1;query.exclude=[game.player.get_rid()]+safety_exclude
	query.transform=Transform3D(Basis.IDENTITY,from-Vector3.UP*drop+salvage.crate_bounds.get_center())
	query.motion=to-from;query.margin=.015
	if not game.get_world_3d().direct_space_state.intersect_shape(query,1).is_empty():return false
	var hit=game.get_world_3d().direct_space_state.cast_motion(query)
	return hit.size()==2 and hit[0]>=.999

func create_drone(p: Dictionary) -> Dictionary:
	var node=MMFAssets.scene("res://art/beta-salvage-drone.glb") if ResourceLoader.exists("res://art/beta-salvage-drone.glb") else Node3D.new()
	salvage.add_child(node);node.position=drone_home(p)
	var rotors=[]
	for id in ["RotorFL","RotorFR","RotorRL","RotorRR"]:
		var rotor=MMFAssets.find_named(node,id)
		if rotor:rotors.append(rotor)
	return {"node":node,"phase":"idle","cargo":{},"home":node.position,"height":node.position.y+3.0,"rotors":rotors,"retry":0.0}

func abort_drone(job: Dictionary):
	var c=job.cargo
	if not c.is_empty() and c.active:
		if job.phase in ["launch","out","lower"]:c.claimed=""
		else:
			# Keep already-recovered supplies aboard when their dock is dismantled.
			c.claimed="parked";salvage.park_crate(c)
	job.cargo={};job.phase="idle"

func update_drones(dt: float):
	var present={}
	for p in game.session.structures:
		if p.definitionId!="collector-auto" or p.health<=0:continue
		var id=p.instanceId;present[id]=true
		if not drones.has(id):drones[id]=create_drone(p)
		var job=drones[id];var home=drone_home(p)
		if job.home.distance_to(home)>.05:abort_drone(job);job.node.position=home;job.home=home
		var powered=game.session.powered.get(id,false)
		if job.cargo.is_empty() and job.phase in ["return-up","return-home","settle"]:
			var target=home
			if job.phase=="return-up":target=Vector3(job.node.position.x,job.height,job.node.position.z)
			elif job.phase=="return-home":target=Vector3(home.x,job.height,home.z)
			var step=job.node.position.move_toward(target,dt*7)
			if clear_path(job.node.position,step,true,dock_bodies(id) if job.phase=="settle" else []):job.node.position=step
			for rotor in job.rotors:rotor.rotate_y(dt*45)
			if job.node.position.distance_to(target)<.08:
				job.phase="return-home" if job.phase=="return-up" else "settle" if job.phase=="return-home" else "idle"
			continue
		if job.phase=="idle":
			job.node.position=home
			# Restore a held load without rerolling its contents.
			for c in salvage.crates:
				if c.active and c.claimed==id:
					job.cargo=c;job.node.position=c.node.position+Vector3.UP*.9;job.phase="raise";job.height=maxf(home.y+3,job.node.position.y+2);break
		if job.phase=="idle" and powered and not game.combat.active_threat():
			job.retry-=dt
			if job.retry<=0:
				job.retry=.5
				for c in salvage.crates:
					if not c.active or c.heavy or c.claimed!="" or c.node.position.distance_to(home)>DRONE_RANGE:continue
					var bag=game.session.stores[id]
					if not ["scrap","components","fuel"].any(func(item):return bag.room_for(item)>0):continue
					var height=maxf(home.y+3,c.node.position.y+3)
					if not clear_path(home,Vector3(home.x,height,home.z)) or not clear_path(Vector3(home.x,height,home.z),Vector3(c.node.position.x,height,c.node.position.z)):continue
					c.claimed=id;job.cargo=c;job.phase="launch";job.height=height;break
		if job.phase in ["idle","wait"] and job.cargo.is_empty():continue
		if job.cargo.is_empty():continue
		var c=job.cargo
		if not c.active or c.claimed!=id:job.cargo={};job.phase="return-up";continue
		if job.phase in ["launch","out","lower"] and (not powered or c.node.position.distance_to(home)>42):
			c.claimed="";job.cargo={};job.phase="return-up";continue
		var target=home
		match job.phase:
			"launch":target=Vector3(home.x,job.height,home.z)
			"out":target=Vector3(c.node.position.x,job.height,c.node.position.z)
			"lower":target=c.node.position+Vector3.UP*.9
			# Rise beyond the exterior stair bays as well as the main deck rim.
			"clear-side":target=Vector3(minf(-18.5,job.node.position.x) if job.node.position.x<0 else maxf(18.5,job.node.position.x),job.node.position.y,job.node.position.z)
			"raise":target=Vector3(job.node.position.x,job.height,job.node.position.z)
			"home":target=Vector3(home.x,job.height,home.z)
			"land","wait":target=home+Vector3.UP*1.75
		var step=job.node.position.move_toward(target,dt*7)
		# Land above the dock with the load held by the latch, never inside it.
		if job.phase!="wait" and not clear_path(job.node.position,step):
			if job.phase in ["launch","out","lower"]:c.claimed="";job.cargo={};job.phase="return-up"
			job.retry=.5;continue
		if job.phase in ["clear-side","raise","home","land"] and not cargo_clear(job.node.position,step):continue
		job.node.position=step
		for rotor in job.rotors:rotor.rotate_y(dt*45)
		if job.phase in ["clear-side","raise","home","land","wait"]:c.node.position=job.node.position-Vector3.UP*.9;c.node.basis=Basis.IDENTITY
		if step.distance_to(target)>.08:continue
		match job.phase:
			"launch":job.phase="out"
			"out":job.phase="lower"
			"lower":job.phase="clear-side";job.height=maxf(job.height,c.node.position.y+4);game.audio.play_sound("hook-catch")
			"clear-side":job.phase="raise"
			"raise":job.phase="home"
			"home":job.phase="land"
			"land","wait":
				job.phase="wait"
				if transfer(c,game.session.stores[id]):job.cargo={};job.phase="settle"
	for id in drones.keys():
		if not present.has(id):abort_drone(drones[id]);drones[id].node.queue_free();drones.erase(id)
