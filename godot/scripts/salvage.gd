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
var hook_phase=""
var hook_distance=0.0
var hook_origin=Vector3.ZERO
var hook_direction=Vector3.FORWARD
var return_from=Vector3.ZERO
var return_distance=0.0
var cable: MeshInstance3D

func busy() -> bool:
	return hook_phase!=""

func hand_position() -> Vector3:
	return game.player.position+Vector3.UP*1.31

func cancel():
	if reel_index>=0 and crates[reel_index].claimed=="manual": crates[reel_index].claimed=""
	reel_index=-1
	hook_phase=""
	hook_visual.hide()
	cable.hide()

func snapshot() -> Array:
	var result=[]
	for c in crates:
		if c.active: result.append({"position":MMFAssets.dict_v(c.node.position),"contents":c.contents.duplicate(),"opened":c.opened,"claimed":"parked" if c.claimed in ["parked","manual"] else ""})
	return result

func restore(raw):
	if not raw is Array or raw.size()>crates.size(): return
	for i in raw.size():
		var entry=raw[i]
		if not entry is Dictionary or not entry.get("position") is Dictionary or not entry.get("contents") is Dictionary: continue
		var valid=true
		for axis in ["x","y","z"]: valid=valid and MMFSaveValidation.number(entry.position.get(axis),-2000,2000)
		for id in entry.contents: valid=valid and game.data.ITEMS.has(id) and MMFSaveValidation.number(entry.contents[id],0,10000) and entry.contents[id]==floor(entry.contents[id])
		if not valid: continue
		var c=crates[i];c.active=true;c.node.visible=true;c.node.position=MMFAssets.v(entry.position)
		c.contents=entry.contents.duplicate();c.opened=entry.get("opened",false)==true;c.claimed="parked" if entry.get("claimed","")=="parked" else ""

func setup(owner_game):
	game=owner_game
	for i in 6:
		var node=MMFAssets.scene("models/authored/salvage-chest.glb")
		add_child(node)
		node.visible=false
		crates.append({"node":node,"active":false,"contents":{},"claimed":"","opened":false})
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

func _unhandled_input(event):
	if event.is_action_pressed("reel") and not event.is_echo(): throw_hook()

func throw_hook():
	if game==null or game.menu_open or game.cinematic!="" or game.session.health<=0 or game.manual_turret!="" or game.building.selected!="" or busy(): return
	hook_origin=hand_position();hook_direction=-game.player.camera.global_basis.z.normalized()
	hook_distance=0;hook_phase="out";reel_index=-1
	hook_visual.position=hook_origin;hook_visual.show();cable.show()
	game.audio.play_sound("hook-throw")

func aimed_crate() -> int:
	var best=-1;var distance=REEL_RANGE+0.001
	for i in crates.size():
		var c=crates[i]
		if not c.active or c.claimed not in ["","parked"]: continue
		var delta=c.node.position-hand_position()
		if delta.length()>0.001 and delta.length()<distance and (-game.player.camera.global_basis.z).dot(delta.normalized())>=REEL_CONE_COS:
			best=i;distance=delta.length()
	return best

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
			if not c.active or c.claimed not in ["","parked"]: continue
			var point=Geometry3D.get_closest_point_to_segment(c.node.position,previous,hook_visual.position)
			if point.distance_to(c.node.position)<2.4 and point.distance_to(previous)<nearest:
				nearest=point.distance_to(previous);reel_index=i
		if reel_index>=0:
			crates[reel_index].claimed="manual"
			game.audio.play_sound("hook-catch")
		if reel_index>=0 or hook_distance>=REEL_RANGE:
			hook_phase="back";return_from=hook_visual.position;return_distance=hook_distance
	else:
		hook_distance=maxf(0,hook_distance-HOOK_SPEED*dt)
		hook_visual.position=hand_position().lerp(return_from,hook_distance/maxf(return_distance,0.001))
	if reel_index>=0: crates[reel_index].node.position=hook_visual.position
	var span=hook_visual.position-hand_position()
	cable.position=(hand_position()+hook_visual.position)*0.5
	cable.quaternion=Quaternion(Vector3.UP,span.normalized()) if span.length()>0.001 else Quaternion.IDENTITY
	cable.scale=Vector3(1,maxf(0.001,span.length()),1)
	hook_visual.look_at(hook_visual.position+hook_direction,Vector3.UP)
	if hook_phase=="out": hook_visual.rotate_object_local(Vector3.FORWARD,hook_distance*0.4)
	if hook_phase=="back" and hook_distance<=0:
		if reel_index>=0: receive(crates[reel_index])
		reel_index=-1;hook_phase="";hook_visual.hide();cable.hide()

func receive(c: Dictionary):
	if not c.opened:
		c.contents=game.session.salvage_reward();c.opened=true
	for id in c.contents.keys():
		c.contents[id]=game.session.add_resource(id,int(c.contents[id]))
		if c.contents[id]<=0: c.contents.erase(id)
	c.active=not c.contents.is_empty();c.node.visible=c.active
	c.claimed="parked" if c.active else ""
	if c.active: c.node.position=game.player.position+Vector3.UP*0.05+Vector3.RIGHT
	game.session.notify("Storage full; remaining supplies stay in this crate." if c.active else "Cargo secured. Supplies transferred.")

func update(dt: float):
	if not game.session.opening_done: return
	if game.session.distance>=next_distance:
		next_distance=game.session.distance+(180 if not game.session.facts.salvage else 90)
		spawn()
	for i in crates.size():
		var c=crates[i]
		if not c.active: continue
		if c.claimed=="":
			c.node.position.z+=game.session.speed*0.42*dt
			c.node.position.y=2.0+sin(game.session.clock*1.4+i)*0.13
			if c.node.position.z>30:
				c.active=false
				c.node.visible=false
	update_hook(dt)
	for p in game.session.structures:
		if p.definitionId!="collector-auto" or not game.session.powered.get(p.instanceId,false): continue
		var at=game.building.center(p.cell)
		for c in crates:
			if not c.active or c.claimed not in ["",p.instanceId] or c.node.position.distance_to(at)>24: continue
			c.claimed=p.instanceId
			c.node.position=c.node.position.move_toward(at+Vector3.UP*0.7,dt*7)
			if c.node.position.distance_to(at)<1:
				if not c.opened:
					c.contents=game.session.salvage_reward()
					c.opened=true
				var bag=game.session.stores[p.instanceId]
				for id in c.contents.keys():
					c.contents[id]=bag.add(id,int(c.contents[id]))
					if c.contents[id]==0: c.contents.erase(id)
				if c.contents.is_empty():
					c.active=false
					c.node.visible=false
			break
	for c in crates:
		if c.claimed not in ["","manual","parked"] and not game.session.powered.get(c.claimed,false): c.claimed=""

func spawn():
	for c in crates:
		if c.active: continue
		c.active=true
		c.claimed=""
		c.contents={}
		c.opened=false
		c.node.visible=true
		c.node.position=Vector3((1 if game.session.rng.randf()>0.5 else -1)*game.session.rng.randf_range(14.5,22),2,-42)
		return
