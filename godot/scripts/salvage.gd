class_name MMFSalvage
extends Node3D

var game
var crates: Array=[]
var next_distance=90.0
var reel_index=-1
var hook_visual: Node3D
var early=false

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

func _unhandled_input(event):
	if game==null or game.menu_open or game.cinematic!="": return
	if event.is_action_pressed("reel"):
		if reel_index>=0: return
		var best=-1
		var score=1e20
		var camera=game.player.camera
		for i in crates.size():
			var c=crates[i]
			if not c.active or c.claimed not in ["","parked"]: continue
			var delta=c.node.position-game.player.position
			if delta.length()>48: continue
			var dot=(-camera.global_basis.z).dot(delta.normalized())
			var cost=delta.length()*(2-dot)
			if dot>0.35 and cost<score:
				best=i
				score=cost
		if best>=0:
			reel_index=best
			crates[best].claimed="manual"
			hook_visual.visible=true
			game.audio.cue(230,0.1,-22)
		else: game.session.notify("Aim toward a cargo crate within 48 m.")

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
		elif c.claimed=="manual":
			var to=game.player.position+Vector3.UP*0.8
			c.node.position=c.node.position.move_toward(to,12*dt)
			hook_visual.position=c.node.position+Vector3.UP*0.4
			game.effects.tracer(game.player.position+Vector3.UP*1.1,hook_visual.position,Color(0.2,0.18,0.13))
			if c.node.position.distance_to(to)<0.2:
				if not c.opened:
					c.contents=game.session.salvage_reward()
					c.opened=true
				for id in c.contents.keys():
					c.contents[id]=game.session.add_resource(id,int(c.contents[id]))
					if c.contents[id]<=0: c.contents.erase(id)
				if c.contents.is_empty():
					c.active=false
					c.node.visible=false
					game.session.notify("Cargo secured. Supplies transferred.")
				else: game.session.notify("Storage full; remaining supplies stay in this crate.")
				c.claimed="parked" if c.active else ""
				if c.active: c.node.position=game.player.position+Vector3.UP*0.05+Vector3.RIGHT
				reel_index=-1
				hook_visual.visible=false
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
