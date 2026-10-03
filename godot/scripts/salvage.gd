class_name MMFSalvage
extends Node3D

var game
var crates: Array=[]
var next_distance=90.0
var reel_index=-1
var hook_visual: Node3D
var early=false
const REEL_RANGE=34.0
const HOOK_SPEED=42.0
const REEL_CONE_COS=0.927
const CATCH_RADIUS=2.4
var hook_phase=""
var hook_distance=0.0
var hook_origin=Vector3.ZERO
var hook_direction=Vector3.FORWARD
var return_from=Vector3.ZERO
var return_distance=0.0
var cable: MeshInstance3D
var crate_bounds: AABB
var heavy_bounds: AABB
var last_lateral=0.0
var crane_cables={}
var mission_hook=false
var automation=MMFSalvageAutomation.new()

func busy() -> bool:
	return hook_phase!=""

func machinery_moving() -> bool:
	return automation.moving()

func hand_position() -> Vector3:
	return game.player.position+Vector3.UP*1.31

func cancel():
	if mission_hook:game.missions.hook_cancel()
	mission_hook=false
	if reel_index>=0 and crates[reel_index].claimed=="manual": crates[reel_index].claimed=""
	reel_index=-1
	hook_phase=""
	hook_visual.hide()
	cable.hide()

func snapshot() -> Array:
	var result=[]
	for c in crates:
		if c.active: result.append({"position":MMFAssets.dict_v(c.node.position),"contents":c.contents.duplicate(),"opened":c.opened,"claimed":c.claimed if c.get("heavy",false) or automation.valid_claim(c.claimed) else ("parked" if c.claimed in ["parked","manual"] else ""),"heavy":c.get("heavy",false),"elevated":c.get("elevated",false)})
	return result

func restore(raw):
	automation.reset()
	last_lateral=game.session.lateral
	if not raw is Array or raw.size()>crates.size(): return
	for i in raw.size():
		var entry=raw[i]
		if not entry is Dictionary or not entry.get("position") is Dictionary or not entry.get("contents") is Dictionary: continue
		var valid=true
		for axis in ["x","y","z"]: valid=valid and MMFSaveValidation.number(entry.position.get(axis),-2000,2000)
		for id in entry.contents: valid=valid and game.data.ITEMS.has(id) and MMFSaveValidation.number(entry.contents[id],0,10000) and entry.contents[id]==floor(entry.contents[id])
		if not valid: continue
		var c=crates[i];c.active=true;c.node.visible=true;c.node.position=MMFAssets.v(entry.position)
		c.contents=MMFNativeProgression.supplies(entry.contents);set_heavy(c,entry.get("heavy",false)==true);c.elevated=entry.get("elevated",false)==true;c.opened=entry.get("opened",false)==true;c.claimed="parked" if entry.get("claimed","")=="parked" else ""
		if c.heavy and entry.get("claimed","") is String:
			var crane=game.session.find_piece(entry.get("claimed",""))
			if not crane.is_empty() and crane.definitionId=="salvage-crane" and crane.health>0:c.claimed=crane.instanceId
		elif not c.heavy and entry.get("claimed","") is String and automation.valid_claim(entry.get("claimed","")):
			c.claimed=entry.claimed
		c.node.basis=Basis.IDENTITY;c.slope=Vector2.ZERO;c.ground.clear()
		if c.claimed=="":ground_crate(c,i)
		c.node.reset_physics_interpolation()

func setup(owner_game):
	game=owner_game
	last_lateral=game.session.lateral
	for i in 6:
		var node=Node3D.new()
		var regular=MMFAssets.scene("models/authored/salvage-chest.glb");node.add_child(regular)
		var heavy=MMFNativeProgression.model("heavy-cargo");node.add_child(heavy);heavy.hide()
		add_child(node)
		node.visible=false
		crates.append({"node":node,"active":false,"contents":{},"claimed":"","opened":false,"slope":Vector2.ZERO,"ground":{},"normalModel":regular,"heavyModel":heavy,"heavy":false,"elevated":false})
	crate_bounds=MMFAssets.bounds(crates[0].normalModel)
	heavy_bounds=MMFAssets.bounds(crates[0].heavyModel)
	hook_visual=MMFAssets.scene("models/authored/forged-hook.glb")
	add_child(hook_visual)
	hook_visual.visible=false
	cable=MeshInstance3D.new()
	var cylinder=CylinderMesh.new()
	cylinder.top_radius=0.012;cylinder.bottom_radius=0.012;cylinder.height=1;cylinder.radial_segments=6
	cable.mesh=cylinder
	var line_material=MMFAssets.material(Color.html("ffc27a"))
	line_material.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	cable.material_override=line_material
	cable.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(cable);cable.hide()
	automation.setup(self)

func _unhandled_input(event):
	if event.is_action_pressed("reel") and not event.is_echo(): throw_hook()

func throw_hook():
	if game==null or game.menu_open or game.cinematic!="" or game.session.health<=0 or game.manual_turret!="" or game.building.selected!="" or busy(): return
	if game.building.salvage_tool and game.building.salvage_tool.equipped():return
	if game.player.equipment and game.player.equipment.terminal_presenting():return
	hook_origin=hand_position();hook_direction=-game.player.camera.global_basis.z.normalized()
	hook_distance=0;hook_phase="out";reel_index=-1
	hook_visual.position=hook_origin;hook_visual.show();cable.show()
	game.audio.play_sound("hook-throw")

func aimed_crate() -> int:
	# Predict the first physical intercept, including the cargo's drift. The old
	# 22-degree cone advertised catches that the straight hook could never make.
	var origin=hand_position();var velocity=-game.player.camera.global_basis.z*HOOK_SPEED
	var best=-1;var earliest=INF
	for i in crates.size():
		var c=crates[i]
		if not c.active or c.get("heavy",false) or c.claimed not in ["","parked"]: continue
		var drift=cargo_velocity(c)
		var relative=velocity-drift;var delta=c.node.position-origin
		var a=relative.length_squared();var b=-2*relative.dot(delta);var d=delta.length_squared()-CATCH_RADIUS*CATCH_RADIUS
		var discriminant=b*b-4*a*d
		if discriminant<0 or a<.001:continue
		var time=maxf(0,(-b-sqrt(discriminant))/(2*a))
		if (-b+sqrt(discriminant))/(2*a)<0 or time>REEL_RANGE/HOOK_SPEED:continue
		if time<earliest:best=i;earliest=time
	return best

func cargo_velocity(c: Dictionary) -> Vector3:
	if c.claimed!="":return Vector3.ZERO
	return Vector3(-sin(deg_to_rad(game.session.course))*game.session.speed,c.slope.y*(-.58*game.session.speed),game.session.speed*.42)

func suggested_direction(index: int) -> Vector3:
	var c=crates[index];var origin=hand_position();var future=c.node.position
	var velocity=cargo_velocity(c)
	for iteration in 3:future=c.node.position+velocity*(future.distance_to(origin)/HOOK_SPEED)
	return (future-origin).normalized()

func nearby_crate() -> int:
	var best=-1;var distance=48.0;var origin=hand_position();var aim=-game.player.camera.global_basis.z
	for i in crates.size():
		var c=crates[i]
		if not c.active or c.get("heavy",false) or c.claimed not in ["","parked"]:continue
		var delta=c.node.position-origin;var length=delta.length()
		if length>.001 and length<distance and aim.dot(delta/length)>=REEL_CONE_COS:best=i;distance=length
	return best

func ground_crate(c: Dictionary,index: int):
	# Fit the existing mesh to the actual dune plane, then lift only enough to
	# clear its four bottom corners. No new collision or gameplay RNG is used.
	if c.get("elevated",false):return
	var cargo_bounds=heavy_bounds if c.get("heavy",false) else crate_bounds
	var at=c.node.position;var x=at.x+game.session.lateral;var z=at.z-game.session.distance
	var point=Vector2(x,z);var bob=.012 if c.get("heavy",false) else .05+sin(game.session.clock*.7+index)*.015
	# Within 20 cm, reuse the fitted plane and extrapolate its height. The
	# cached footprint is bounded in space, so teleports/load refresh immediately.
	if not c.ground.is_empty() and point.distance_squared_to(c.ground.at)<.04:
		c.node.basis=c.ground.basis
		c.node.position.y=c.ground.height+c.slope.dot(point-c.ground.at)+bob
		return
	var h=MMFDunes.height_at(x,z)
	var yaw_basis=Basis(Vector3.UP,index*1.37+sin(game.session.clock*.19+index)*.06)
	var heights=[]
	for xx in [cargo_bounds.position.x,cargo_bounds.end.x]:
		for zz in [cargo_bounds.position.z,cargo_bounds.end.z]:
			var corner=yaw_basis*Vector3(xx,0,zz)
			heights.append(MMFDunes.height_at(x+corner.x,z+corner.z))
	# Average both sides of the whole footprint instead of a forward sample,
	# which over-tilted wide crates across the crest of a dune.
	var gradient=yaw_basis*Vector3((heights[2]+heights[3]-heights[0]-heights[1])/(2*cargo_bounds.size.x),0,(heights[1]+heights[3]-heights[0]-heights[2])/(2*cargo_bounds.size.z))
	c.slope=Vector2(gradient.x,gradient.z)
	var up=Vector3(-gradient.x,1,-gradient.z).normalized()
	c.node.basis=Basis(Quaternion(Vector3.UP,up))*yaw_basis
	var base=cargo_bounds.position.y
	var height=h-base/up.y
	for xx in [cargo_bounds.position.x,cargo_bounds.end.x]:
		for zz in [cargo_bounds.position.z,cargo_bounds.end.z]:
			var corner=c.node.basis*Vector3(xx,base,zz)
			height=maxf(height,MMFDunes.height_at(x+corner.x,z+corner.z)-corner.y)
	c.ground={"at":point,"height":height,"basis":c.node.basis}
	c.node.position.y=height+bob

func park_crate(c: Dictionary):
	c.node.basis=Basis.IDENTITY
	var cargo_bounds=heavy_bounds if c.get("heavy",false) else crate_bounds
	var at=game.player.position;var candidates=[Vector3.RIGHT,Vector3.LEFT,Vector3.FORWARD,Vector3.BACK,Vector3.ZERO]
	for offset in candidates:
		var center=at+offset*1.4;var supported=true;var floor_y=-INF
		for xx in [cargo_bounds.position.x,cargo_bounds.end.x]:
			for zz in [cargo_bounds.position.z,cargo_bounds.end.z]:
				var point=center+Vector3(xx,0,zz)
				var hit=game.raycast(point+Vector3.UP*.35,point-Vector3.UP*.5,[game.player.get_rid()])
				if hit.is_empty() or hit.normal.y<.95 or absf(hit.position.y-at.y)>.25:supported=false
				else:floor_y=maxf(floor_y,hit.position.y)
		if supported:
			c.node.position=Vector3(center.x,floor_y-cargo_bounds.position.y+.02,center.z);return
	# Retain overflow even if every neighboring footprint is occupied.
	c.node.position=at+Vector3.UP*(-cargo_bounds.position.y+.02)

func update_hook(dt: float):
	if not busy(): return
	if game.session.health<=0: cancel();return
	if hook_phase=="out":
		var previous=hook_visual.position
		hook_distance=minf(REEL_RANGE,hook_distance+HOOK_SPEED*dt)
		hook_visual.position=hook_origin+hook_direction*hook_distance
		var nearest=INF
		for i in crates.size():
			var c=crates[i]
			if not c.active or c.get("heavy",false) or c.claimed not in ["","parked"]: continue
			var point=Geometry3D.get_closest_point_to_segment(c.node.position,previous,hook_visual.position)
			if point.distance_to(c.node.position)<CATCH_RADIUS and point.distance_to(previous)<nearest:
				nearest=point.distance_to(previous);reel_index=i
		var special=game.missions.hook_target()
		if reel_index<0 and not special.is_empty():
			var point=Geometry3D.get_closest_point_to_segment(special.at,previous,hook_visual.position)
			if point.distance_to(special.at)<.6 and game.raycast(previous,special.at,[game.player.get_rid()]).is_empty():mission_hook=true
		if reel_index>=0:
			crates[reel_index].claimed="manual"
			game.audio.play_sound("hook-catch")
		if reel_index>=0 or mission_hook or hook_distance>=REEL_RANGE:
			hook_phase="back";return_from=hook_visual.position;return_distance=hook_distance
	else:
		hook_distance=maxf(0,hook_distance-HOOK_SPEED*dt)
		hook_visual.position=hand_position().lerp(return_from,hook_distance/maxf(return_distance,0.001))
	if mission_hook:game.missions.hook_motion(hook_visual.position)
	if reel_index>=0: crates[reel_index].node.position=hook_visual.position
	var span=hook_visual.position-hand_position()
	cable.position=(hand_position()+hook_visual.position)*0.5
	cable.quaternion=Quaternion(Vector3.UP,span.normalized()) if span.length()>0.001 else Quaternion.IDENTITY
	cable.scale=Vector3(1,maxf(0.001,span.length()),1)
	hook_visual.look_at(hook_visual.position+hook_direction,Vector3.UP)
	if hook_phase=="out": hook_visual.rotate_object_local(Vector3.FORWARD,hook_distance*0.4)
	if hook_phase=="back" and hook_distance<=0:
		if mission_hook:game.missions.hook_finish();mission_hook=false
		if reel_index>=0: receive(crates[reel_index])
		reel_index=-1;hook_phase="";hook_visual.hide();cable.hide()

func receive(c: Dictionary):
	var first=not c.opened and not game.session.facts.salvage
	if not c.opened:
		c.contents=game.session.salvage_reward();c.opened=true
	var received=[]
	var amounts={}
	for id in c.contents.keys():
		var count=int(c.contents[id])
		c.contents[id]=game.session.add_resource(id,int(c.contents[id]))
		if count>c.contents[id]:
			received.append("+%d %s"%[count-c.contents[id],game.data.ITEMS[id].name]);amounts[id]=count-int(c.contents[id])
		if c.contents[id]<=0: c.contents.erase(id)
	c.active=not c.contents.is_empty();c.node.visible=c.active
	c.claimed="parked" if c.active else ""
	if c.active:park_crate(c)
	var receipt="Cargo secured: "+" · ".join(received) if not received.is_empty() else "No free storage space."
	if first:receipt="Receiver recovered — build a refinery and workbench to repair it.\n"+receipt
	if c.active:receipt+="\nStorage full — remaining supplies are in the crate aboard."
	game.session.notify(receipt)
	if not amounts.is_empty():game.record_event("salvage","cargo_collected",{"supplies":amounts,"pending":c.contents.duplicate()})

func update(dt: float):
	if not game.session.opening_done: return
	var lateral_delta=game.session.lateral-last_lateral;last_lateral=game.session.lateral
	for c in crates:
		if c.active and (c.claimed=="" or automation.drifting(c)):c.node.position.x-=lateral_delta
	if game.session.distance>=next_distance:
		next_distance=game.session.distance+(180 if not game.session.facts.salvage else 90)
		spawn()
	for i in crates.size():
		var c=crates[i]
		if not c.active: continue
		if c.claimed=="" or automation.drifting(c):
			c.node.position.z+=game.session.speed*(1.0 if c.get("elevated",false) else .42)*dt
			ground_crate(c,i)
			if c.node.position.z>30:
				c.active=false
				c.node.visible=false
	update_hook(dt)
	update_cranes(dt)
	automation.update(dt)
	for c in crates:
		if c.claimed not in ["","manual","parked"] and not automation.valid_claim(c.claimed) and not game.session.powered.get(c.claimed,false): c.claimed=""

func spawn():
	# Keep ordinary hookable supplies available until the recovered crane can
	# actually hoist a load. Explicit site-trial and restored cargo stay intact.
	var crane_ready="salvage-crane" in game.session.expedition_gear.recovered and game.session.structures.any(func(p):return p.definitionId=="salvage-crane" and p.health>0 and game.session.powered.get(p.instanceId,false))
	if crane_ready and int(game.session.distance/90)%4==0:
		if spawn_heavy(Vector3(20,2,-42)):return
	for c in crates:
		if c.active: continue
		c.active=true
		c.claimed=""
		c.contents={}
		c.opened=false
		set_heavy(c,false);c.elevated=false
		c.ground.clear()
		c.node.visible=true
		c.node.position=Vector3((1 if game.session.rng.randf()>0.5 else -1)*game.session.rng.randf_range(14.5,22),2,-42)
		ground_crate(c,crates.find(c));c.node.reset_physics_interpolation()
		return

func set_heavy(c: Dictionary,enabled: bool):
	c.heavy=enabled;c.normalModel.visible=not enabled;c.heavyModel.visible=enabled

func spawn_heavy(at: Vector3,elevated: bool=false) -> bool:
	for c in crates:
		if c.active:continue
		c.active=true;c.claimed="";c.opened=true;c.contents={"scrap":48,"components":8,"fuel":4}
		set_heavy(c,true);c.elevated=elevated;c.ground.clear()
		c.node.position=at;c.node.basis=Basis.IDENTITY;c.node.show()
		ground_crate(c,crates.find(c));c.node.reset_physics_interpolation()
		return true
	return false

func crane_tip(p: Dictionary) -> Vector3:
	return game.building.piece_transform(p)*MMFMachineSpaces.crane_tip_local(p)

func crane_cable_clear(from: Vector3,to: Vector3) -> bool:
	# The flat radioactive recovery proxy is deliberately excluded by all cargo
	# rays: it is not the dune surface and can lie above visible trough cargo.
	# Preserve solid-world occlusion and check the actual shader-matched dunes.
	if not game.raycast(from,to,automation.safety_exclude).is_empty():return false
	var steps=maxi(1,ceili(from.distance_to(to)*2))
	for i in range(1,steps+1):
		var at=from.lerp(to,float(i)/steps)
		# The height function is bounded by 6.5m; high cable segments need no noise.
		if at.y>6.52:continue
		if at.y<MMFDunes.height_at(at.x+game.session.lateral,at.z-game.session.distance)+.01:return false
	return true

func operate_crane(p: Dictionary) -> bool:
	if p.is_empty() or p.definitionId!="salvage-crane" or p.health<=0 or not MMFNativeProgression.available(game.session,"salvage-crane"):return false
	if game.session.health<=0 or not game.aboard() or game.building.center(p.cell).distance_to(game.player.position)>2.6:return false
	if not game.session.powered.get(p.instanceId,false):game.session.notify("Crane needs 4 power.");return false
	if crates.any(func(c):return c.active and c.claimed==p.instanceId):game.session.notify("Hoist occupied. Free storage if the load is waiting.");return false
	var nearest={};var distance=34.0;var tip=crane_tip(p)
	for c in crates:
		if not c.active or not c.get("heavy",false) or c.claimed!="":continue
		var length=tip.distance_to(c.node.position+Vector3.UP*.45)
		if length>=distance or not crane_cable_clear(tip,c.node.position+Vector3.UP*.45):continue
		nearest=c;distance=length
	if nearest.is_empty():game.session.notify("No heavy cargo within 34 m with a clear cable path.");return false
	nearest.claimed=p.instanceId;nearest.elevated=false
	game.audio.play_sound("hook-catch");game.session.notify("Heavy cargo secured — hoisting.")
	return true

func update_cranes(dt: float):
	var active={}
	for c in crates:
		if not c.active or not c.get("heavy",false) or c.claimed=="":continue
		var p=game.session.find_piece(c.claimed)
		if p.is_empty() or p.definitionId!="salvage-crane" or p.health<=0 or not game.session.powered.get(p.instanceId,false):
			c.claimed="";continue
		var tip=crane_tip(p);var destination=tip-Vector3.UP*.7
		if not crane_cable_clear(tip,c.node.position+Vector3.UP*.45):c.claimed="";continue
		c.node.position=c.node.position.move_toward(destination,dt*3)
		c.node.basis=Basis.IDENTITY
		active[p.instanceId]=true
		if not crane_cables.has(p.instanceId):
			var line=MeshInstance3D.new();var mesh=CylinderMesh.new();mesh.height=1;mesh.top_radius=.025;mesh.bottom_radius=.025;mesh.radial_segments=8
			line.mesh=mesh;line.material_override=MMFAssets.material(Color(.18,.19,.16));add_child(line);crane_cables[p.instanceId]=line
		var line=crane_cables[p.instanceId];var end=c.node.position+Vector3.UP*.45;var span=end-tip
		line.position=(tip+end)*.5;line.quaternion=Quaternion(Vector3.UP,span.normalized()) if span.length()>.001 else Quaternion.IDENTITY;line.scale=Vector3(1,maxf(.001,span.length()),1)
		if c.node.position.distance_to(destination)<.05:
			for id in c.contents.keys():
				var before=int(c.contents[id])
				c.contents[id]=game.session.add_resource(id,int(c.contents[id]))
				if before>int(c.contents[id]):game.record_event("salvage","crane_received",{"item":id,"count":before-int(c.contents[id]),"instance":p.instanceId})
				if c.contents[id]==0:c.contents.erase(id)
			if c.contents.is_empty():
				c.active=false;c.node.hide();game.session.notify("Heavy cargo recovered.")
	for id in crane_cables.keys():
		if not active.has(id):crane_cables[id].queue_free();crane_cables.erase(id)
