class_name MMFBuilding
extends Node3D

var game
var selected = ""
var rotation_index = 0
var manual_level = 99
var moving = ""
var target = {}
var preview: Node3D
var preview_material = StandardMaterial3D.new()
var bodies = {}
var failure = ""
var demolish_time = 0.0

func setup(owner_game):
	game = owner_game
	preview_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	preview_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	preview_material.no_depth_test = false
	rebuild()

func center(cell: Dictionary) -> Vector3:
	return Vector3(cell.x*2,16.03+cell.y*3.6,cell.z*2)

func piece_transform(p: Dictionary) -> Transform3D:
	var at = center(p.cell)
	var angle = -int(p.get("rotation",0))*PI/2
	if p.has("edge"):
		var edge = p.edge
		at = center(edge)+ (Vector3.RIGHT if edge.axis=="x" else Vector3.BACK)
		angle = PI/2 if edge.axis=="x" else 0.0
	elif p.definitionId == "stairs": at += Vector3.FORWARD.rotated(Vector3.UP,angle)
	return Transform3D(Basis(Vector3.UP,angle),at)

func rebuild():
	for body in bodies.values(): body.queue_free()
	bodies.clear()
	for p in game.session.structures: add_visual(p)

func add_visual(p: Dictionary):
	var root = MMFAssets.scene("runtime/"+p.definitionId+".glb")
	root.name = p.instanceId
	root.transform = piece_transform(p)
	add_child(root)
	root.set_meta("piece_id",p.instanceId)
	bodies[p.instanceId] = root
	for spec in game.runtime.pieceColliders[p.definitionId]:
		var body = MMFAssets.collider(root,{"position":spec.offset,"half":spec.half})
		body.rotation.x = spec.get("rotX",0)
		body.set_meta("piece_id",p.instanceId)
		body.set_script(load("res://scripts/structure_body.gd"))
		body.set("game",game);body.set("piece_id",p.instanceId)

func choose(id: String):
	target = {}
	failure = "Aim at a deck"
	selected = id
	rotation_index = 0
	moving = ""
	if preview: preview.queue_free()
	preview = MMFAssets.scene("runtime/"+id+".glb")
	for mesh in MMFAssets.of_type(preview,"MeshInstance3D"):
		mesh.material_override = preview_material
		mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(preview)

func cancel():
	target = {}
	failure = "Aim at a deck"
	selected = ""
	moving = ""
	demolish_time = 0
	if preview:
		preview.queue_free()
		preview = null

func _unhandled_input(event):
	if game == null or game.menu_open or game.cinematic != "" or game.session.health<=0 or game.manual_turret!="": return
	if event.is_action_pressed("build"):
		if selected != "": cancel()
		else: game.open_menu("Build")
	if selected == "": return
	if event.is_action_pressed("catalog"): game.open_menu("Build")
	if event.is_action_pressed("rotate_left"): rotation_index = posmod(rotation_index-1,4)
	if event.is_action_pressed("use"): rotation_index = posmod(rotation_index+1,4)
	if event.is_action_pressed("deck_up"): manual_level = clampi(current_level()+1,-2,2)
	if event.is_action_pressed("deck_down"): manual_level = clampi(current_level()-1,-2,2)
	if event.is_action_pressed("deck_auto"): manual_level = 99
	if event.is_action_pressed("aim"): cancel()
	if event.is_action_pressed("shoulder"):
		var hit = game.crosshair_hit(12)
		if not hit.is_empty() and hit.collider.has_meta("piece_id"):
			var p = game.session.find_piece(hit.collider.get_meta("piece_id"))
			if game.data.BUILD_PIECES[p.definitionId].category != "structure":
				choose(p.definitionId)
				moving = p.instanceId
				rotation_index = int(p.rotation)
	if event.is_action_pressed("fire"): commit_placement()

func commit_placement() -> bool:
	if selected=="" or game.menu_open or game.cinematic!="" or game.session.health<=0 or game.manual_turret!="": return false
	# Input events can rotate/switch pieces before the next physics preview tick.
	# Recompute the aim, footprint, support, reach and cost at the actual click.
	update(0)
	if selected=="" or failure!="" or target.is_empty(): return false
	if moving != "":
		var p = game.session.find_piece(moving)
		if p.is_empty() or not bodies.has(moving): cancel();return false
		p.cell = target.cell.duplicate()
		p.rotation = rotation_index
		p.erase("edge")
		if target.has("edge"): p.edge = target.edge.duplicate()
		bodies[moving].transform = piece_transform(p)
		cancel()
	else:
		var p = game.session.create_piece(selected,target.cell,rotation_index,target.get("edge",{}))
		if p.is_empty(): return false
		add_visual(p)
	game.session.changed.emit()
	game.combat.layout_changed()
	return true

func current_level() -> int:
	return int(round((game.player.position.y-16.03)/3.6)) if manual_level==99 else manual_level

func update(dt: float):
	if selected == "" or game.menu_open: return
	if game.session.attack_recent > 0 or game.combat.active_threat():
		cancel()
		game.session.notify("Build mode closed: incoming attack.")
		return
	var level = clampi(current_level(),-2,2)
	var camera = game.player.camera
	var direction = -camera.global_basis.z
	var plane = Plane(Vector3.UP,16.03+level*3.6)
	var intersection = plane.intersects_ray(camera.global_position,direction)
	if intersection == null:
		target = {}
		preview.visible = false
		failure = "Aim at a deck"
		return
	preview.visible = true
	var cell = {"x":int(round(intersection.x/2)),"y":level,"z":int(round(intersection.z/2))}
	target = {"definitionId":selected,"cell":cell,"rotation":rotation_index}
	if game.data.BUILD_PIECES[selected].anchor == "edge":
		var axis = "x" if absf(intersection.x-cell.x*2)>absf(intersection.z-cell.z*2) else "z"
		var edge = cell.duplicate()
		edge.axis = axis
		if axis == "x" and intersection.x<cell.x*2: edge.x-=1
		if axis == "z" and intersection.z<cell.z*2: edge.z-=1
		target.edge = edge
	preview.transform = piece_transform(target)
	failure = validate(target,moving)
	if preview.position.distance_to(game.player.position)>12: failure = "Beyond 12 m reach"
	preview_material.albedo_color = Color(0.2,0.9,0.7,0.42) if failure=="" else Color(1,0.17,0.05,0.42)
	if Input.is_action_pressed("demolish"):
		demolish_time += dt
		if demolish_time >= 1:
			demolish_time = 0
			var hit = game.crosshair_hit(12)
			if not hit.is_empty() and hit.collider.has_meta("piece_id"): demolish(hit.collider.get_meta("piece_id"))
	else: demolish_time = 0

func floor_at(cell: Dictionary) -> bool:
	for p in game.session.structures:
		if p.definitionId == "floor" and p.cell==cell: return true
	return false

func hull_support(cell: Dictionary) -> bool:
	if cell.y < -2 or cell.y > 0: return false
	var width = 12 if cell.y==0 else 13
	var length = 14 if cell.y==0 else 15
	if absf(cell.x*2)>width-0.9 or absf(cell.z*2)>length-0.9: return false
	if cell.y>-2 and cell.x==-1 and absf(cell.z)<2: return false
	if cell.y>-2 and cell.x==-6 and absf(cell.z)<2: return false
	return true

func validate(p: Dictionary, ignore: String = "") -> String:
	var cell = p.cell
	var id = p.definitionId
	var def = game.data.BUILD_PIECES[id]
	if not in_envelope(cell): return "Outside build envelope"
	if not unlocked(id): return "Blueprint not unlocked"
	if cell.y==0 and cell.x>=6 and absf(cell.z)<=1 and (game.session.story.phase in ["approach","braking","docked"] or game.session.contacts.active.get("state","") in ["committed","docked","visited"]): return "Reserved for the active wreck and gangway"
	if not p.has("edge") and id!="stairs" and blocked(cell): return "Machine equipment is in the way"
	for other in game.session.structures:
		if other.instanceId==ignore: continue
		if p.has("edge"):
			if other.get("edge",{})==p.edge and ((id=="lamp")== (other.definitionId=="lamp")): return "Edge is occupied"
		elif other.cell==cell:
			var other_def = game.data.BUILD_PIECES[other.definitionId]
			if other.definitionId==id or (def.category in ["station","decor"] and def.category==other_def.category): return "Something is already there"
	if id=="floor":
		for other in game.session.structures:
			if other.definitionId=="stairs" and stair_cells(other).landing==cell: return "Keep the stairwell opening clear"
		var support = cell.y==0 or hull_support(cell)
		for other in game.session.structures:
			if other.definitionId in ["wall","doorway"] and other.has("edge"):
				for adjacent in edge_cells(other.edge):
					if adjacent.x==cell.x and adjacent.z==cell.z and adjacent.y==cell.y-1: support=true
		for delta in [Vector2i(1,0),Vector2i(-1,0),Vector2i(0,1),Vector2i(0,-1)]:
			if floor_at({"x":cell.x+delta.x,"y":cell.y,"z":cell.z+delta.y}): support=true
		if not support: return "Needs a floor beside it or wall below"
	elif p.has("edge"):
		var adjacent=edge_cells(p.edge)
		if id!="lamp" and not floor_at(adjacent[0]) and not floor_at(adjacent[1]): return "Needs a floor on either side"
	elif not floor_at(cell): return "Place a deck plate here first"
	if id=="stairs":
		var steps=stair_cells(p)
		if not in_envelope(steps.run) or not in_envelope(steps.landing): return "Outside build envelope"
		if blocked(steps.run) or blocked(steps.landing): return "Machine equipment is in the way"
		if floor_at(steps.landing): return "Keep the stairwell opening clear"
		for other in game.session.structures:
			if other.instanceId==ignore: continue
			if other.definitionId=="stairs" and stair_cells(other).run==steps.run: return "Stair run is occupied"
			if other.cell==steps.run and (other.definitionId=="roof" or game.data.BUILD_PIECES[other.definitionId].category=="station"): return "Not enough clear space above the stairs"
	if id=="lamp":
		var wall_found = false
		for other in game.session.structures:
			if other.get("edge",{})==p.get("edge",{}) and other.definitionId in ["wall","doorway"]: wall_found=true
		if not wall_found: return "Needs a wall or doorway"
	if def.category=="station" and center(cell).distance_to(game.player.position)<1.2: return "Move clear of the equipment"
	if ignore=="" and not game.session.can_pay(def.cost): return "Not enough materials"
	return ""

func in_envelope(cell: Dictionary) -> bool:
	return absf(cell.x)<=50 and absf(cell.z)<=50 and cell.y>=-2 and cell.y<=2

func blocked(cell: Dictionary) -> bool:
	for obstacle in game.data["iron-nomad-obstacles"]:
		if obstacle.level==cell.y and cell.x*2+0.65>obstacle.minX and cell.x*2-0.65<obstacle.maxX and cell.z*2+0.65>obstacle.minZ and cell.z*2-0.65<obstacle.maxZ: return true
	return false

func edge_cells(edge: Dictionary) -> Array:
	var a={"x":edge.x,"y":edge.y,"z":edge.z}
	var b=a.duplicate()
	b[edge.axis]+=1
	return [a,b]

func stair_cells(p: Dictionary) -> Dictionary:
	var direction=[Vector2i(0,-1),Vector2i(1,0),Vector2i(0,1),Vector2i(-1,0)][posmod(int(p.rotation),4)]
	var run={"x":p.cell.x+direction.x,"y":p.cell.y,"z":p.cell.z+direction.y}
	var landing=run.duplicate();landing.y+=1
	return {"base":p.cell,"run":run,"landing":landing}

func unlocked(id: String) -> bool:
	var need = {"collector-auto":"salvage-controller","turret-auto":"tracking-servo","seed-garden":"human-seed-bank"}
	if id=="caretaker-dock": return game.session.caretaker.recovered
	if id=="turret-manual": return "manual-turret" in game.session.unlocks
	return not need.has(id) or need[id] in game.session.story.uniques

func cascade(id: String) -> Array:
	var doomed=[id]
	var added=true
	while added:
		added=false
		var floors={};var walls={}
		for p in game.session.structures:
			if p.instanceId in doomed: continue
			if p.definitionId=="floor": floors[MMFHome.key(p.cell)]=true
			if p.definitionId in ["wall","doorway"] and p.has("edge"): walls[MMFHome.key(p.edge)+p.edge.axis]=true
		for p in game.session.structures:
			if p.instanceId in doomed or p.definitionId=="floor": continue
			var unsupported=false
			if p.definitionId=="lamp": unsupported=not walls.has(MMFHome.key(p.edge)+p.edge.axis)
			elif p.has("edge"):
				var adjacent=edge_cells(p.edge)
				unsupported=not floors.has(MMFHome.key(adjacent[0])) and not floors.has(MMFHome.key(adjacent[1]))
			else: unsupported=not floors.has(MMFHome.key(p.cell))
			if unsupported: doomed.append(p.instanceId);added=true
	return doomed

func demolish(id: String,destroyed: bool=false) -> bool:
	if game.session.find_piece(id).is_empty(): return false
	var doomed=cascade(id)
	var contents={};var refund={}
	var bags=[game.session.inventory]
	for store in game.session.stores:
		if store not in doomed: bags.append(game.session.stores[store])
	for p in game.session.structures:
		if p.instanceId not in doomed: continue
		if game.session.stores.has(p.instanceId):
			for slot in game.session.stores[p.instanceId].slots:
				if slot!=null: contents[slot.itemId]=contents.get(slot.itemId,0)+slot.count
		if p.definitionId in ["condenser","planter","seed-garden"]:
			var item="water" if p.definitionId=="condenser" else "greens"
			contents[item]=contents.get(item,0)+p.state.get("stored",0)
			if p.definitionId=="seed-garden": contents.water=contents.get("water",0)+p.state.get("water",0)
		if not destroyed:
			for item in game.data.BUILD_PIECES[p.definitionId].cost: refund[item]=refund.get(item,0)+floor(game.data.BUILD_PIECES[p.definitionId].cost[item]*0.6)
	var backups=[]
	for bag in bags: backups.append(bag.slots.duplicate(true))
	var overflow={}
	for item in contents:
		var left=int(contents[item])
		for bag in bags: left=bag.add(item,left)
		if left>0: overflow[item]=left
	if not destroyed and not overflow.is_empty():
		for i in bags.size(): bags[i].slots=backups[i]
		game.session.notify("Free storage for the contents before dismantling.")
		return false
	for piece in doomed:
		var p=game.session.find_piece(piece)
		if p.is_empty(): continue
		game.session.structures.erase(p);game.session.stores.erase(piece)
		if bodies.has(piece): bodies[piece].queue_free();bodies.erase(piece)
	for item in refund:
		var left=game.session.add_resource(item,int(refund[item]))
		if left>0: overflow[item]=overflow.get(item,0)+left
	for item in overflow: game.combat.drop_loot(game.player.position,item,int(overflow[item]))
	game.session.notify("Equipment destroyed." if destroyed else "Dismantled; contents and materials recovered.")
	game.combat.layout_changed()
	return true

func damage(id: String,amount: float,point: Vector3):
	var p=game.session.find_piece(id)
	if p.is_empty(): return
	p.health=maxf(0,p.health-maxf(0,amount-game.data.BUILD_PIECES[p.definitionId].get("armor",0)))
	game.session.attack_recent=5
	if p.health<=0:
		game.effects.explosion(point,0.4)
		demolish.call_deferred(id,true)
