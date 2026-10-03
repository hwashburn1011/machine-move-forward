class_name MMFExpeditionMechanismView
extends Node3D

var game
var activity
var site_id=""
var controls={}
var movers={}
var antennas=[]
var pending={}
var metal: StandardMaterial3D
var amber: StandardMaterial3D
var green: StandardMaterial3D
var dark: StandardMaterial3D

func setup(id: String):
	site_id=id;name="PhysicalExpedition";process_mode=Node.PROCESS_MODE_PAUSABLE
	metal=MMFAssets.material(Color(.22,.25,.25));metal.metallic=.75;metal.roughness=.47
	amber=MMFAssets.material(Color(.7,.36,.06),.45)
	green=MMFAssets.material(Color(.12,.75,.52),.9)
	dark=MMFAssets.material(Color(.055,.065,.07));dark.metallic=.5
	for instrument in MMFExpeditionMechanisms.SITES.get(site_id,[]):
		activity.state(instrument)
		for spec in MMFExpeditionMechanisms.CONTROLS[instrument]:add_control(instrument,spec)
	match site_id:
		"wreck-one":
			add_mover("gyro",Vector3(4.5,1.18,2.45),Vector3(4.5,2.1,2.45),Vector3(1.2,.65,.13),"release")
			add_rotor(Vector3(4.5,1.32,3),.4)
		"relay-foundry":
			# A local gantry reveals the recovery bay; it never crosses the return spine.
			add_mover("power",Vector3(3.45,1.25,-.9),Vector3(5.5,1.25,-.9),Vector3(1.7,2.2,.18),"move")
			for x in [2.35,6.5]:beam(Vector3(x,1.45,-1),Vector3(.13,2.9,.18),metal,true)
			beam(Vector3(4.4,2.85,-.9),Vector3(4.3,.2,.24),metal,true)
			for x in [2.5,3.1,3.7,4.3,4.9,5.5,6.1]:beam(Vector3(x,.012,-.5),Vector3(.27,.018,.14),amber,false)
		"quiet-array":
			add_mover("array",Vector3(-3,1.65,-5.4),Vector3(-3,2.7,-5.4),Vector3(2,.8,.13),"lock")
			for i in 3:
				var root=Node3D.new();add_child(root);root.position=Vector3([-6.3,-.8,6.3][i],2.4,-2.15)
				beam(root.position-Vector3.UP*.75,Vector3(.08,1.5,.08),metal,false)
				beam_at(root,Vector3.ZERO,Vector3(.12,.7,.09),metal)
				for y in [-.2,0,.2]:beam_at(root,Vector3(0,y,0),Vector3(1.1,.035,.035),amber)
				antennas.append(root)
		"glass-orchard":
			add_mover("port",Vector3(-4.9,1.15,-1.6),Vector3(-4.9,3.45,-1.6),Vector3(1.95,2.2,.13),"energize")
			add_mover("starboard",Vector3(5,1.1,-4.1),Vector3(5,3.15,-4.1),Vector3(2,1.7,.13),"energize")
		"last-garden-meridian":
			add_mover("archive",Vector3(-4,1.38,5.2),Vector3(-4,1.0,5.7),Vector3(1.4,.25,.6),"seat")
			add_mover("transmitter",Vector3(5,3.1,-6),Vector3(5,3.75,-6),Vector3(.8,.65,.6),"synchronize")
	sync()

func beam(at: Vector3,size: Vector3,material: Material,solid: bool) -> MeshInstance3D:
	return MMFAssets.box(self,size,at,material,solid)

func beam_at(parent: Node3D,at: Vector3,size: Vector3,material: Material):
	return MMFAssets.box(parent,size,at,material,false)

func add_rotor(at: Vector3,radius: float):
	var root=Node3D.new();add_child(root);root.position=at;root.name="GyroRotor"
	for i in 8:
		var spoke=beam_at(root,Vector3.ZERO,Vector3(radius*2,.035,.035),metal)
		spoke.rotation.y=i*PI/8
	set_meta("rotor",root)

func add_control(instrument: String,spec: Dictionary):
	var id="mechanism-"+instrument+"-"+spec.id
	var root=Node3D.new();root.name=id;add_child(root);root.position=spec.at
	var shared=instrument=="power" and spec.id=="move"
	var body
	if not shared:
		var part_name=MMFStoryArt.PARTS[instrument]
		var panel=game.story_art.part(part_name);root.add_child(panel);panel.scale=Vector3.ONE*.6;panel.position=Vector3(0,-.2,0)
		# Service faces look into the central walking aisle, not into the machine.
		if spec.at.z<0:panel.rotation.y=PI
		beam_at(root,Vector3(0,-.58,.045),Vector3(.09,1.16,.08),metal)
		beam_at(root,Vector3(0,-spec.at.y+.02,.03),Vector3(.38,.04,.3),metal)
		body=MMFAssets.collider(root,{"position":{"y":-.34,"z":.03},"half":{"x":.18,"y":.36,"z":.12}})
		body.set_meta("expedition_control",id)
	else:body=controls["mechanism-power-unlock"].body
	var label=Label3D.new();root.add_child(label);label.position=Vector3(0,.4,0);label.font_size=22;label.pixel_size=.0025;label.billboard=BaseMaterial3D.BILLBOARD_ENABLED;label.visibility_range_end=7;label.text=spec.label;label.modulate=Color(.85,.73,.39)
	var light=controls["mechanism-power-unlock"].lamp if shared else beam_at(root,Vector3(.19,.04,.065 if spec.at.z<0 else -.065),Vector3(.035,.18,.03),amber)
	var item={"id":id,"kind":"mechanism","activity":instrument,"action":spec.id,"label":spec.label,"generation":activity.generation}
	# Current controls win ties with reward consoles; completed controls are hidden.
	game.campaign.points.push_front({"entry":item,"at":spec.at,"label":label})
	controls[id]={"root":root,"body":body,"lamp":light,"entry":item,"label":label}

func add_mover(id: String,from: Vector3,to: Vector3,size: Vector3,action: String):
	var body=AnimatableBody3D.new();body.name="ServiceMechanism_"+id;body.sync_to_physics=false;body.collision_layer=1;body.collision_mask=0;add_child(body)
	var shape=CollisionShape3D.new();var box=BoxShape3D.new();box.size=size;shape.shape=box;body.add_child(shape)
	# Ribbed panels share the site's small service-instrument palette.
	beam_at(body,Vector3.ZERO,size,dark)
	var count=maxi(3,roundi(size.y/.14))
	for side in [-1,1]:
		for i in count:beam_at(body,Vector3(0,-size.y*.5+(i+.5)*size.y/count,side*size.z*.55),Vector3(size.x,.035,.04),metal)
		for x in [-size.x*.44,size.x*.44]:beam_at(body,Vector3(x,0,side*size.z*.6),Vector3(.055,size.y,.035),amber)
	movers[id]={"body":body,"from":from,"to":to,"size":size,"action":action}
	if is_equal_approx(from.x,to.x):
		for x in [-size.x*.5-.07,size.x*.5+.07]:beam(Vector3(from.x+x,(from.y+to.y)*.5,from.z+.03),Vector3(.07,size.y+absf(to.y-from.y)+.2,.12),metal,true)

func sync():
	for id in controls:
		var item=controls[id];var st=activity.state(item.entry.activity)
		var done=item.entry.action in st.mechanism.milestones
		item.lamp.material_override=green if done else amber
		item.label.visible=activity.control_visible(item.entry) and game.session.story.phase=="docked"
	for id in movers:
		if pending.get("id","")==id:continue
		var spec=movers[id]
		spec.body.position=spec.to if spec.action in activity.state(id).mechanism.milestones else spec.from
	if antennas.size()==3:
		var values=activity.state("array").values
		for i in 3:antennas[i].rotation.y=deg_to_rad((values[i]-50)*1.2)

func occupied(from: Vector3,to: Vector3,size: Vector3) -> bool:
	# Capsule expanded sweep in destination-local space; conservative on every axis.
	var player_at=to_local(game.player.global_position)+Vector3.UP*1.0
	var lower=from.min(to)-size*.5-Vector3(.38,1.03,.38)
	var upper=from.max(to)+size*.5+Vector3(.38,1.03,.38)
	return player_at.x>=lower.x and player_at.x<=upper.x and player_at.y>=lower.y and player_at.y<=upper.y and player_at.z>=lower.z and player_at.z<=upper.z

func begin_motion(id: String,action: String) -> bool:
	if not pending.is_empty() or not movers.has(id):return false
	var spec=movers[id]
	if spec.action!=action or occupied(spec.from,spec.to,spec.size):return false
	pending={"id":id,"action":action,"elapsed":0.0,"generation":activity.generation,"warned":false}
	return true

func _physics_process(dt: float):
	if has_meta("rotor") and "brake" not in activity.state("gyro").mechanism.milestones:
		get_meta("rotor").rotate_y(dt*1.8)
	if pending.is_empty():return
	if activity.generation!=pending.generation or game.session.story.phase!="docked":pending={};sync();return
	var spec=movers[pending.id]
	if occupied(spec.body.position,spec.to,spec.size):
		if not pending.warned:game.session.notify("Service interlock: step clear of the striped machinery sweep.");pending.warned=true
		return
	pending.warned=false;pending.elapsed+=dt
	var fraction=minf(1,pending.elapsed/1.4)
	spec.body.position=spec.from.lerp(spec.to,smoothstep(0,1,fraction))
	if fraction>=1:
		var finished=pending;pending={}
		activity.finish_step(finished.id,finished.action)

func _exit_tree():
	pending.clear()
