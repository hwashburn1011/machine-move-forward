class_name MMFHome
extends Node

var game
var rooms: Array=[]
var by_cell={}
var layout_snapshot: Array=[]
var layout_valid=false
var chair_id=""

func setup(owner_game): game=owner_game

func set_keepsake(shelf: Dictionary,id: String,announce: bool=false):
	shelf.state.keepsakeId=id
	var model=game.building.bodies.get(shelf.instanceId)
	if not model: return
	var existing=MMFAssets.find_named(model,"NativeKeepsake")
	if existing: existing.queue_free()
	var lit=MMFAssets.find_named(model,"KeepsakeLit")
	if lit: lit.visible=id!=""
	if id=="": return
	if announce:
		var title=game.data.KEEPSAKE_DETAILS.get(id,{}).get("title",id.replace("-"," "))
		game.journey.enqueue("keepsake/"+id,"PRESERVATION",title+" is on display aboard the Nomad. A record carried forward, not left in the sand.")
	var exhibit=Node3D.new();exhibit.name="NativeKeepsake";model.add_child(exhibit)
	var part_name="PreservationSeeds" if id=="human-seed-bank" else "PreservationCore" if id in ["annika-archive-shard","orchard-memory-core"] else "PreservationRecord"
	var kit=MMFAssets.scene("models/authored/nomad-progress.glb");var source=MMFAssets.find_named(kit,part_name)
	if source:
		var part=source.duplicate();part.position=Vector3(0,1.526,0);exhibit.add_child(part)
	kit.free()
	var label=Label3D.new();label.text=game.data.KEEPSAKE_DETAILS.get(id,{}).get("title",id)
	label.position=Vector3(0,1.32,-0.1);label.pixel_size=0.003;label.font_size=24;label.modulate=Color(0.4,0.9,0.9)
	exhibit.add_child(label)

static func key(cell: Dictionary) -> String: return "%d,%d,%d" %[cell.x,cell.y,cell.z]

static func neighbor(cell: Dictionary,side: int) -> Dictionary:
	var delta=[Vector2i(1,0),Vector2i(-1,0),Vector2i(0,1),Vector2i(0,-1)][side]
	return {"x":cell.x+delta.x,"y":cell.y,"z":cell.z+delta.y}

static func edge_key(cell: Dictionary,side: int) -> String:
	var e=cell.duplicate()
	if side==1: e.x-=1
	if side==3: e.z-=1
	return key(e)+(",x" if side<2 else ",z")

func rebuild():
	rooms.clear()
	by_cell.clear()
	var floors={}
	var roofs={}
	var edges={}
	for p in game.session.structures:
		if p.definitionId=="floor": floors[key(p.cell)]=p.cell
		if p.definitionId=="roof": roofs[key(p.cell)]=true
		if p.has("edge") and game.data.BUILD_PIECES[p.definitionId].get("boundsRoom",false): edges[key(p.edge)+","+p.edge.axis]=true
	var keys=floors.keys()
	keys.sort()
	for start in keys:
		if by_cell.has(start): continue
		var room={"id":rooms.size(),"cells":[],"enclosed":true,"comfort":false}
		var queue=[floors[start]]
		by_cell[start]=room.id
		while not queue.is_empty():
			var cell=queue.pop_back()
			room.cells.append(key(cell))
			var above={"x":cell.x,"y":cell.y+1,"z":cell.z}
			if not roofs.has(key(cell)) and not floors.has(key(above)): room.enclosed=false
			for side in 4:
				var next=neighbor(cell,side)
				if edges.has(edge_key(cell,side)): continue
				if not floors.has(key(next)):
					room.enclosed=false
					continue
				if not by_cell.has(key(next)):
					by_cell[key(next)]=room.id
					queue.append(next)
		rooms.append(room)
	for p in game.session.structures:
		if p.definitionId in ["table","rug"] and by_cell.has(key(p.cell)): rooms[by_cell[key(p.cell)]].comfort=true

func room_at(at: Vector3) -> Dictionary:
	var cell={"x":int(round(at.x/2)),"y":int(round((at.y-16.03)/3.6)),"z":int(round(at.z/2))}
	return rooms[by_cell[key(cell)]] if by_cell.has(key(cell)) else {}

func rest(p: Dictionary):
	var room=room_at(game.building.center(p.cell))
	if not room.get("enclosed",false): game.session.notify("Enclose this room with walls and a roof first.");return
	if not room.comfort: game.session.notify("A table or rug makes this room comfortable enough to rest.");return
	if game.combat.active_threat(): game.session.notify("Secure the deck before resting.");return
	chair_id=p.instanceId
	game.session.notify("Resting. Movement or combat ends rest.")

func invalidate_layout(): layout_valid=false

func layout_matches() -> bool:
	var structures=game.session.structures
	if not layout_valid or structures.size()!=layout_snapshot.size(): return false
	for i in structures.size():
		var p=structures[i];var previous=layout_snapshot[i]
		if p.instanceId!=previous[0] or p.definitionId!=previous[1] or p.cell!=previous[2] or p.get("edge")!=previous[3]: return false
	return true

func remember_layout():
	layout_snapshot.clear()
	for p in game.session.structures:
		var edge=p.get("edge")
		layout_snapshot.append([p.instanceId,p.definitionId,p.cell.duplicate(),edge.duplicate() if edge is Dictionary else null])
	layout_valid=true

func update(dt: float):
	# Compare a compact snapshot instead of formatting/concatenating the entire
	# machine each tick. Deep copies also detect in-place edits and same-size loads.
	if not layout_matches():
		remember_layout()
		rebuild()
		for p in game.session.structures:
			if p.definitionId=="shelf": set_keepsake(p,p.state.get("keepsakeId",""))
	var room=room_at(game.player.position)
	game.session.sheltered=room.get("enclosed",false) or (game.player.position.y<15.7 and game.aboard())
	if chair_id!="":
		var chair=game.session.find_piece(chair_id)
		if chair.is_empty() or not room.get("enclosed",false) or not room.get("comfort",false) or game.combat.active_threat() or game.player.velocity.length()>0.2 or Input.is_action_pressed("fire") or game.session.health<=0 or game.session.health>=100 or game.building.center(chair.cell).distance_to(game.player.position)>2.8:
			chair_id=""
		else: game.session.health=minf(100,game.session.health+dt*2*(0.5 if game.session.nourishment<=0 else 1))
	update_weather(dt)

func update_weather(dt: float):
	var s=game.session
	var w=s.weather
	if not s.opening_done or s.scanner.phase in ["awaiting-receiver","awaiting-module"] or game.combat.active_threat() or s.story.phase in ["docked","crossfire"]: return
	if w.phase=="clear":
		if s.distance<w.next: return
		w.phase="forecast"
		w.elapsed=0.0
		s.notify("Dust front approaching. Shelter prevents extra water use.")
	w.elapsed+=dt
	var duration={"forecast":35.0,"front":70.0,"clearing":20.0}.get(w.phase,0)
	if w.elapsed>=duration:
		w.elapsed-=duration
		if w.phase=="forecast": w.phase="front"
		elif w.phase=="front": w.phase="clearing"
		else:
			w.phase="clear"
			w.elapsed=0
			w.sequence=w.get("sequence",0)+1
			var rng=MMFRandom.new()
			rng.seed=MMFRandom.hash_seed([s.seed_name,"dust-front",w.sequence])
			w.next=s.distance+rng.randf_range(1800,2400)
	w.intensity=smoothstep(0,10,w.elapsed) if w.phase=="front" else (maxf(0,1-w.elapsed/20) if w.phase=="clearing" else 0)
	var sky_material=game.world.world_environment.environment.sky.sky_material
	sky_material.set_shader_parameter("uDustAmount",0.72+w.intensity*0.25)
	sky_material.set_shader_parameter("uSunIntensity",1-w.intensity*0.6)
	sky_material.set_shader_parameter("uTurbidity",3.5+w.intensity*7)
