class_name MMFArt100Story
extends RefCounted

# Static presentation upgrade. No new progression gates or save schema.
const PATH="res://art/art100-story-robots.glb"
const CONSOLES=[
	["BerthReferenceDesk",Vector3(-3.7,0,-2.6)],
	["BerthReceivingCoupler",Vector3(-1.5,0,-4.6)],
	["BerthSeedEnclosure",Vector3(1.6,0,-4.6)],
	["BerthArchiveReceiver",Vector3(3.6,0,-2.1)],
	["BerthAccessTransmitter",Vector3(3.6,0,1.9)]]
const REAR_SERVICE=[
	["IsolatorCabinet",Vector3(-4.8,0,-5.9),0.0],
	["ArchiveTransitCore",Vector3(-3.45,0,5.5),PI],
	["MemoryReader",Vector3(-1.75,0,5.5),PI],
	["SeedVault",Vector3(.1,0,5.5),PI],
	["EmergencyFuelPump",Vector3(-4.8,0,3.65),PI/2],
	["CourierChargeCradle",Vector3(1.7,0,5.5),PI],
	["RecoveryToolCart",Vector3(-4.8,0,-3.9),PI/2],
	["NavGyroCradle",Vector3(3.9,0,-5.7),0.0],
	["FoundryPowerBus",Vector3(5.25,0,.4),-PI/2],
	["ArrayPhaseRack",Vector3(-1.6,0,-5.9),0.0]]
static var parts={}
static var status_ready: StandardMaterial3D
static var status_waiting: StandardMaterial3D
static var policy_open: StandardMaterial3D
static var policy_relay: StandardMaterial3D

static func clear_cache():
	parts.clear();status_ready=null;status_waiting=null;policy_open=null;policy_relay=null

static func status_material(powered: bool) -> StandardMaterial3D:
	if not status_ready:status_ready=MMFAssets.material(Color(.12,.6,.35),.6)
	if not status_waiting:status_waiting=MMFAssets.material(Color(.65,.22,.035),.6)
	return status_ready if powered else status_waiting

static func own_descendants(node: Node,owner_root: Node):
	for child in node.get_children():
		child.owner=owner_root
		own_descendants(child,owner_root)

static func part(id: String) -> Node3D:
	# Cache individual packed roots instead of instantiating all 25 each time.
	if parts.is_empty():
		var kit=MMFAssets.scene(PATH)
		MMFArt100Materials.prepare(kit)
		for child in kit.get_children():
			if not child is Node3D:continue
			own_descendants(child,child)
			var packed=PackedScene.new()
			if packed.pack(child)==OK:parts[String(child.name)]=packed
		kit.free()
	if not parts.has(id):
		push_error("Missing Art100 story model: "+id)
		return Node3D.new()
	var result=parts[id].instantiate()
	result.set_meta("art100_id",id)
	return result

static func box_shape(body: StaticBody3D,size: Vector3,at: Vector3):
	var shape=CollisionShape3D.new();var box=BoxShape3D.new();box.size=size;shape.shape=box;shape.position=at;body.add_child(shape)

static func cylinder_shape(body: StaticBody3D,radius: float,height: float,at: Vector3,tilt: float=0.0):
	var shape=CollisionShape3D.new();var cylinder=CylinderShape3D.new();cylinder.radius=radius;cylinder.height=height
	shape.shape=cylinder;shape.position=at;shape.rotation.x=tilt;body.add_child(shape)

static func physical_body(parent: Node3D,id: String) -> StaticBody3D:
	var body=StaticBody3D.new();body.name=id;parent.add_child(body);return body

static func collider(model: Node3D,id: String):
	var bounds=MMFAssets.bounds(model)
	if id in ["OpenChannelMast","RelayChallengeMast"]:
		# A 4m-high whole antenna AABB would be an invisible walking wall.
		var body=physical_body(model,"MastCollision")
		var open=id=="OpenChannelMast";var height=4.15 if open else 3.63
		cylinder_shape(body,.058 if open else .063,height,Vector3(0,.05+height*.5,0))
		box_shape(body,Vector3(.45 if open else .44,.07,.45 if open else .44),Vector3(0,.035,0))
		if open:
			for y in [.22,2.7,3.9]:cylinder_shape(body,.077,.08,Vector3(0,y,0))
			box_shape(body,Vector3(.13,.24,.11),Vector3(0,3.6,.08))
			cylinder_shape(body,.013,3.38,Vector3(.068,1.81,0))
		else:box_shape(body,Vector3(.23,.35,.13),Vector3(0,1.0,.08))
		return
	if id=="PreservationReservoir":
		var body=physical_body(model,"ReservoirCollision")
		cylinder_shape(body,.24,1.27,Vector3(0,.735,0))
		for y in [.10,1.36]:cylinder_shape(body,.2544,.07,Vector3(0,y,0))
		for x in [-.168,.168]:box_shape(body,Vector3(.13,.12,.25),Vector3(x,.06,0))
		cylinder_shape(body,.072,.13,Vector3(0,1.425,0))
		cylinder_shape(body,.101,.025,Vector3(0,1.53,0))
		cylinder_shape(body,.04,.18,Vector3(0,.22,.27),PI/2)
		return
	if id=="SeedPropagationBench":
		var body=physical_body(model,"PropagationFrameCollision")
		box_shape(body,Vector3(2.5,.10,.60),Vector3(0,.82,0))
		for z in [-.28,.28]:box_shape(body,Vector3(2.48,.07,.025),Vector3(0,.9,z))
		for x in [-1.12,1.12]:
			for z in [-.22,.22]:
				box_shape(body,Vector3(.17,.05,.17),Vector3(x,.025,z))
				cylinder_shape(body,.026,.76,Vector3(x,.43,z))
		for i in 6:
			# The lower 2 cm of each cup seats into its receiving tray. The
			# visible cylindrical wall starts at the actual tray top, 0.87 m.
			var cup=physical_body(model,"SeedCupCollision"+str(i))
			cylinder_shape(cup,.145,.21,Vector3(-1+i*.4,.975,0))
		return
	var compounds={
		"BerthReferenceDesk":[[Vector3(.18,.92,.5),Vector3(-.38,.5,0)],[Vector3(.18,.92,.5),Vector3(.38,.5,0)],[Vector3(.99,.1,.66),Vector3(0,.96,0)],[Vector3(.70,.39,.12),Vector3(0,1.24,-.13)]],
		"MemoryReader":[[Vector3(.75,.12,.48),Vector3(0,.06,0)],[Vector3(.22,.78,.23),Vector3(0,.44,0)],[Vector3(.76,.09,.49),Vector3(0,.84,0)],[Vector3(.56,.37,.1),Vector3(0,1.13,-.10)]],
		"CourierChargeCradle":[[Vector3(1.03,.09,.83),Vector3(0,.045,0)],[Vector3(.12,.34,.66),Vector3(-.35,.25,0)],[Vector3(.12,.34,.66),Vector3(.35,.25,0)],[Vector3(.63,.75,.2),Vector3(0,.44,-.27)]]}
	if compounds.has(id):
		var body=StaticBody3D.new();body.name="AuthoredCompoundCollision";model.add_child(body)
		for spec in compounds[id]:
			var shape=CollisionShape3D.new();var box=BoxShape3D.new();box.size=spec[0];shape.shape=box;shape.position=spec[1];body.add_child(shape)
		return
	var body=StaticBody3D.new();body.name="AuthoredCollision";model.add_child(body)
	var shape=CollisionShape3D.new();var box=BoxShape3D.new()
	# Tight silhouette footprint with low protrusions retained. Every normal
	# walking obstruction belongs to visible, connected authored equipment.
	box.size=bounds.size;shape.shape=box;shape.position=bounds.get_center();body.add_child(shape)

static func place(parent: Node3D,id: String,at: Vector3,turn: float=0.0,solid: bool=true) -> Node3D:
	var model=part(id);parent.add_child(model);model.position=at;model.rotation.y=turn
	if solid:collider(model,id)
	return model

static func retire_mesh(mesh: MeshInstance3D):
	mesh.hide()
	for body in MMFAssets.of_type(mesh,"StaticBody3D"):
		body.collision_layer=0;body.collision_mask=0

static func decorate_berth(berth: Node3D):
	if berth.has_node("Art100Berth"):return
	# Preserve the original interaction anchors and signal references. Only the
	# primitive presentation and its duplicate collision are retired.
	for mesh in berth.get_children():
		if not mesh is MeshInstance3D:continue
		var at=mesh.position
		var replace=String(mesh.name).begins_with("SeedCup_") or String(mesh.name).begins_with("BerthReservoir_") or mesh.name=="SeedPropagationBench"
		if mesh in berth.sprouts or mesh in berth.lamps or mesh==berth.lever:replace=true
		if mesh==berth.public_mast or mesh==berth.relay_mast:replace=true
		if is_equal_approx(at.z,4.2) and (is_equal_approx(at.x,4.2) or is_equal_approx(at.x,4.8)) and at.y<.2:replace=true
		for spec in CONSOLES:
			var center=spec[1]
			if absf(at.x-center.x)<.53 and absf(at.z-center.z)<.4 and at.y>0 and at.y<1.5:replace=true
		if at.x>-.5 and at.x<2.1 and at.z> -5.5 and at.z< -4.8 and at.y>0 and at.y<1.6:replace=true
		if absf(at.x-4.8)<.03 and at.z>=-2.11 and at.z<=-1.09 and at.y>0 and at.y<1.65:replace=true
		if replace:retire_mesh(mesh)
	var group=Node3D.new();group.name="Art100Berth";berth.add_child(group)
	for spec in CONSOLES:place(group,spec[0],spec[1])
	place(group,"SeedPropagationBench",Vector3(.8,0,-5.15))
	for z in [-2.1,-1.1]:place(group,"PreservationReservoir",Vector3(4.8,0,z))
	place(group,"OpenChannelMast",Vector3(4.8,0,4.2))
	place(group,"RelayChallengeMast",Vector3(4.2,0,4.2))
	for id in ["OpenChannelMast","RelayChallengeMast"]:
		var model=group.get_node(id)
		var light=MMFAssets.box(model,Vector3(.11,.04,.012),Vector3(0,.24,.078) if id=="OpenChannelMast" else Vector3(0,1.13,.152),status_material(false),false)
		light.name="PolicyStatus"
	for spec in REAR_SERVICE:place(group,spec[0],spec[1],spec[2])
	# Status lights stay explicitly driven by the existing finale state.
	for spec in CONSOLES:
		var node=group.get_node(spec[0]);var bounds=MMFAssets.bounds(node)
		var light=MMFAssets.box(node,Vector3(.22,.018,.014),Vector3(0,minf(bounds.size.y-.06,1.12),bounds.end.z+.009),status_material(false),false)
		light.name="FinaleStatus"
	sync_berth(berth)

static func sync_berth(berth: Node3D):
	var group=berth.get_node_or_null("Art100Berth")
	if not group:return
	var f=berth.game.session.finale
	# Legacy sync maintains its old references; they remain retired even after
	# restoring a save whose seed-transfer state is already true.
	for sprout in berth.sprouts:sprout.hide()
	var state=[f.powered,f.seeds,f.policy]
	if group.get_meta("finale_art_state",[])==state:return
	group.set_meta("finale_art_state",state)
	var sprouts=MMFAssets.find_named(group,"LivingSprouts")
	if sprouts:sprouts.visible=f.seeds
	for spec in CONSOLES:
		var node=group.get_node_or_null(spec[0]+"/FinaleStatus")
		if node:node.material_override=status_material(f.powered)
	if not policy_open:policy_open=MMFAssets.material(Color(.1,.65,.55),1.0)
	if not policy_relay:policy_relay=MMFAssets.material(Color(.35,.45,.9),1.0)
	group.get_node("OpenChannelMast/PolicyStatus").material_override=policy_open if f.policy=="open" else status_material(false)
	group.get_node("RelayChallengeMast/PolicyStatus").material_override=policy_relay if f.policy=="relay" else status_material(false)

static func decorate_destination(game):
	# Every item is deployed at the receiving berth; these additional early
	# service installations make the vocabulary legible before the finale.
	var destination=game.campaign.destination
	if not is_instance_valid(destination) or destination.has_node("Art100Destination"):return
	var sites={
		"wreck-one":[["NavGyroCradle",Vector3(5.1,0,5.8),0.0]],
		"relay-foundry":[["EmergencyFuelPump",Vector3(-5.6,0,-3.8),0.0],["RecoveryToolCart",Vector3(-4.3,0,-3.8),0.0]],
		"quiet-array":[["ArrayPhaseRack",Vector3(7.3,0,5.8),PI]],
		"glass-orchard":[["SeedVault",Vector3(7.6,0,3.3),PI]],
		"last-garden-meridian":[["ArchiveTransitCore",Vector3(-7.1,0,5.6),PI]]}
	var group=Node3D.new();group.name="Art100Destination";destination.add_child(group)
	for spec in sites.get(game.campaign.destination_id,[]):place(group,spec[0],spec[1],spec[2])
