class_name MMFBuilding
extends Node3D

signal construction_committed(event: Dictionary)

var game
var selected = ""
var rotation_index = 0
var manual_level = 99
var moving = ""
var target = {}
var preview: Node3D
var preview_material = StandardMaterial3D.new()
var bodies = {}
var generator_visuals = {}
var failure = ""
var demolish_time = 0.0
var salvage_tool
var layout_revision=0
var history=MMFConstructionHistory.new()
var build_preview=MMFBuildPreview.new()
var access=preload("res://scripts/construction_access.gd").new()
var report: Dictionary={}

func _process(_dt: float):
	if game and access.owner_reference:access.advance_budget()

func setup(owner_game):
	game = owner_game
	preview_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	preview_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	preview_material.no_depth_test = false
	history.setup(self)
	build_preview.setup(self)
	access.setup(self)
	rebuild()
	salvage_tool=load("res://scripts/salvage_tool.gd").new()
	add_child(salvage_tool);salvage_tool.setup(self)

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
	game.personalization.reset_preview()
	clear_history("Loading or rebuilding clears recent construction.")
	build_preview.reset()
	if not game.session.changed.is_connected(build_preview.invalidate):game.session.changed.connect(build_preview.invalidate)
	layout_revision+=1
	access.invalidate()
	for body in bodies.values(): body.queue_free()
	bodies.clear()
	generator_visuals.clear()
	for p in game.session.structures: add_visual(p)

func model_for(id: String) -> Node3D:
	if id=="floor":return MMFFloorSurfaces.model()
	if MMFArt100Decor.PIECES.has(id):return MMFArt100Decor.model(id)
	if MMFArt200Decor.PIECES.has(id):return MMFArt200Decor.model(id)
	if id=="collector-auto" and ResourceLoader.exists("res://art/beta-salvage-dock.glb"):return MMFAssets.scene("res://art/beta-salvage-dock.glb")
	if id in MMFNativeProgression.MODULES:return MMFNativeProgression.model(id)
	if id=="boarding-extension": return MMFAssets.scene("res://art/native-boarding-extension.glb")
	return MMFAssets.scene("res://art/native-generator.glb" if id=="generator" else "runtime/"+id+".glb")

func add_visual(p: Dictionary):
	layout_revision+=1
	var root = model_for(p.definitionId)
	if p.definitionId=="floor":MMFFloorSurfaces.configure_model(root,p)
	if p.definitionId in MMFNativeProgression.MODULES:MMFNativeProgression.configure_model(root,p)
	root.name = p.instanceId
	root.transform = piece_transform(p)
	add_child(root)
	root.set_meta("piece_id",p.instanceId)
	bodies[p.instanceId] = root
	game.personalization.bind_piece(root,p)
	if p.definitionId=="generator":
		var visual=MMFGeneratorVisual.new(root,p,game.data.BUILD_PIECES.generator.maxHealth)
		generator_visuals[p.instanceId]=visual
		visual.update(game.session.fuel)
	var colliders=MMFMachineSpaces.piece_colliders(p,game.runtime)
	if p.definitionId=="boarding-extension":
		colliders=colliders.duplicate(true)
		for x in [-.8,.8]:
			colliders.append({"offset":{"x":x,"y":1,"z":0},"half":{"x":.03,"y":.03,"z":1.9}})
			for z in [-1.8,0,1.8]: colliders.append({"offset":{"x":x,"y":.5,"z":z},"half":{"x":.03,"y":.5,"z":.03}})
	for spec in colliders:
		var body = MMFAssets.collider(root,{"position":spec.offset,"half":spec.half})
		body.rotation.x = spec.get("rotX",0)
		body.set_meta("piece_id",p.instanceId)
		body.set_meta("art100_decor",MMFBuildPreview.is_furnishing(p.definitionId))
		if p.definitionId=="railing":body.set_meta("open_railing",true)
		body.set_script(load("res://scripts/structure_body.gd"))
		body.set("game",game);body.set("piece_id",p.instanceId)

func relocate_visual(p: Dictionary,before: Dictionary):
	if MMFMachineSpaces.deployed_crane(p)!=MMFMachineSpaces.deployed_crane(before):
		bodies[p.instanceId].queue_free();bodies.erase(p.instanceId);add_visual(p)
	else:bodies[p.instanceId].transform=piece_transform(p)

func choose(id: String):
	if not game.data.BUILD_PIECES.has(id) or not unlocked(id):return false
	access.release_context(moving)
	if salvage_tool and salvage_tool.equipped(): salvage_tool.set_equipped(false)
	build_preview.reset()
	report={}
	target = {}
	failure = "Aim at a deck"
	selected = id
	rotation_index = 0
	moving = ""
	if preview: preview.queue_free()
	preview = model_for(id)
	for mesh in MMFAssets.of_type(preview,"MeshInstance3D"):
		mesh.material_override = preview_material
		mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(preview)
	if game.opportunities and game.opportunities.survivor_site and game.session.contacts.active.get("kind","")=="rooftop-workshop":
		var guide=game.opportunities.survivor_site.workshop_guide
		if guide: guide.prepare_choice(self,id)
	return true

func cancel():
	access.release_context(moving)
	build_preview.reset()
	report={}
	target = {}
	failure = "Aim at a deck"
	selected = ""
	moving = ""
	demolish_time = 0
	if preview:
		preview.queue_free()
		preview = null

func start_move(id: String) -> bool:
	var p=game.session.find_piece(id)
	if p.is_empty() or game.data.BUILD_PIECES[p.definitionId].category=="structure":return false
	if not game.started or not game.aboard() or game.cinematic!="" or game.session.health<=0 or game.session.attack_recent>0 or game.manual_turret!="" or game.combat.active_threat():return false
	if piece_transform(p).origin.distance_to(game.player.position)>12 or not unlocked(p.definitionId):return false
	if game.menu_open:
		if game.ui.page!="Equipment" or game.ui.storage_id!=id:return false
		game.close_menu()
	if not choose(p.definitionId):return false
	moving=p.instanceId;rotation_index=int(p.rotation);manual_level=int(p.cell.y)
	return true

func _unhandled_input(event):
	if game == null or game.menu_open or game.cinematic != "" or game.session.health<=0 or game.manual_turret!="": return
	if event is InputEventKey and event.echo:return
	if event.is_action_pressed("build"):
		if selected != "": cancel()
		else: game.open_menu("Build")
	if selected == "": return
	if InputMap.has_action("build_undo") and event.is_action_pressed("build_undo"):
		undo_last();get_viewport().set_input_as_handled();return
	if InputMap.has_action("build_copy") and event.is_action_pressed("build_copy"):
		copy_aimed();get_viewport().set_input_as_handled();return
	if event.is_action_pressed("catalog"): game.open_menu("Build")
	if event.is_action_pressed("rotate_left"): rotation_index = posmod(rotation_index-1,4)
	if event.is_action_pressed("use"): rotation_index = posmod(rotation_index+1,4)
	if event.is_action_pressed("deck_up"): manual_level = clampi(current_level()+1,-2,2);build_preview.reset()
	if event.is_action_pressed("deck_down"): manual_level = clampi(current_level()-1,-2,2);build_preview.reset()
	if event.is_action_pressed("deck_auto"): manual_level = 99;build_preview.reset()
	if event.is_action_pressed("aim"): cancel()
	if event.is_action_pressed("shoulder"):
		var hit = game.crosshair_hit(12)
		if not hit.is_empty() and hit.collider.has_meta("piece_id"):
			start_move(str(hit.collider.get_meta("piece_id")))
	if event.is_action_pressed("fire"): commit_placement()

func commit_placement() -> bool:
	if selected=="" or game.menu_open or game.cinematic!="" or game.session.health<=0 or game.manual_turret!="": return false
	if moving!="" and game.session.find_piece(moving).get("definitionId","")=="boarding-extension" and game.session.contacts.active.get("kind","")=="rooftop-workshop" and game.session.contacts.active.get("state","") in ["docked","visited"] and not game.aboard():
		failure="Return aboard before moving your boarding extension."
		game.session.notify(failure);return false
	# Input events can rotate/switch pieces before the next physics preview tick.
	# Recompute the aim, footprint, support, reach and cost at the actual click.
	update(0)
	if selected=="" or failure!="" or target.is_empty(): return false
	history.observe()
	var receipt={}
	if moving != "":
		var p = game.session.find_piece(moving)
		if p.is_empty() or not bodies.has(moving): cancel();return false
		var before=p.duplicate(true)
		if p.cell==target.cell and int(p.rotation)==rotation_index and p.get("edge",{})==target.get("edge",{}):cancel();return false
		p.cell = target.cell.duplicate()
		p.rotation = rotation_index
		p.erase("edge")
		if target.has("edge"): p.edge = target.edge.duplicate()
		relocate_visual(p,before)
		layout_revision+=1
		receipt=history.record("move",p,before)
		cancel()
	else:
		var payment_before=history.capture_payment(game.data.BUILD_PIECES[selected].cost)
		var p = game.session.create_piece(selected,target.cell,rotation_index,target.get("edge",{}))
		if p.is_empty(): return false
		add_visual(p)
		receipt=history.record("place",p,{},history.paid_since(payment_before))
	finish_operation({"operation":receipt.kind,"operation_id":receipt.operation_id,"instance_id":receipt.instance_id,"definition_id":receipt.definition_id,"paid":receipt.paid.duplicate(true),"refunded":{}})
	return true

func current_level() -> int:
	return int(round((game.player.position.y-16.03)/3.6)) if manual_level==99 else manual_level

func update(dt: float):
	if not history.entries.is_empty():
		if game.session.health<=0 or game.session.attack_recent>0 or game.combat.active_threat():clear_history("Combat clears recent construction.")
		else:history.observe()
	if salvage_tool: salvage_tool.update(dt)
	# References are cached at placement/load and removed on demolition. This
	# does not search the scene tree or scan every built tile during gameplay.
	for id in generator_visuals:generator_visuals[id].update(game.session.fuel)
	if selected == "" or game.menu_open: return
	if game.session.attack_recent > 0 or game.combat.active_threat():
		cancel()
		game.session.notify("Build mode closed: incoming attack.")
		return
	target=build_preview.aimed_candidate()
	if target.is_empty():
		target = {}
		preview.visible = false
		failure = "Aim at a deck"
		build_preview.show_outline({},{});report={}
		return
	preview.visible = true
	preview.transform = piece_transform(target)
	if selected=="floor":MMFFloorSurfaces.configure_model(preview,target)
	report=placement_report(target,moving)
	failure=report.reason
	preview_material.albedo_color = Color(0.2,0.9,0.7,0.42) if failure=="" else Color(1,0.17,0.05,0.42)
	if failure=="" and not report.warnings.is_empty():preview_material.albedo_color=Color(1,.74,.18,.42)
	build_preview.show_outline(target,report)

func placement_report(spec: Dictionary={},ignore_id: String="",legacy_return: bool=false) -> Dictionary:
	return build_preview.placement_report(target if spec.is_empty() else spec,moving if spec.is_empty() else ignore_id,legacy_return)

func catalog_report(id: String) -> Dictionary:return build_preview.catalog_report(id)

func clear_history(reason: String="No recent construction to undo."):history.clear(reason)

func mark_used(id: String,reason: String="This equipment has been used."):history.mark_used(id,reason)

func enable_usage_tracking(id: String):
	if id not in history.tracked_types:history.tracked_types.append(id)

func undo_status() -> Dictionary:return history.status()

func undo_last() -> bool:return history.undo()

func copy_aimed() -> bool:
	if selected=="" or game.menu_open or game.cinematic!="" or game.session.health<=0 or game.manual_turret!="" or game.combat.active_threat():return false
	var hit=game.crosshair_hit(12)
	if hit.is_empty() or not hit.collider.has_meta("piece_id"):
		game.session.notify("Aim at an installed part to copy its blueprint.");return false
	return copy_piece(str(hit.collider.get_meta("piece_id")))

func copy_piece(id: String) -> bool:
	if selected=="" or game.menu_open or game.cinematic!="" or game.session.health<=0 or game.manual_turret!="" or game.combat.active_threat():return false
	var p=game.session.find_piece(id)
	if p.is_empty() or not unlocked(p.definitionId) or piece_transform(p).origin.distance_to(game.player.position)>12:
		game.session.notify("That blueprint is unavailable or out of reach.");return false
	if not choose(p.definitionId):return false
	rotation_index=int(p.rotation);manual_level=int(p.cell.y)
	game.session.notify("Blueprint copied. Place a new part using ordinary materials.")
	return true

func finish_operation(event: Dictionary):
	build_preview.invalidate()
	game.player.suppress_fire=true
	game.session.update_power()
	if game.home:game.home.invalidate_layout()
	game.combat.layout_changed()
	game.session.changed.emit()
	construction_committed.emit(event.duplicate(true))

func supported_cells(pieces: Array) -> Dictionary:
	# Iterative support propagation cannot recurse through a cyclic old layout.
	var floors={};var supported={}
	for p in pieces:
		if p.definitionId=="floor":
			var key=MMFHome.key(p.cell);floors[key]=p.cell
			if hull_support(p.cell):supported[key]=true
	var changed=true
	while changed:
		changed=false
		for key in floors:
			if supported.has(key):continue
			var cell=floors[key]
			for delta in [Vector2i(1,0),Vector2i(-1,0),Vector2i(0,1),Vector2i(0,-1)]:
				if supported.has(MMFHome.key({"x":cell.x+delta.x,"y":cell.y,"z":cell.z+delta.y})):supported[key]=true;changed=true;break
			if supported.has(key):continue
			for p in pieces:
				if p.definitionId not in ["wall","doorway"] or not p.has("edge"):continue
				var adjacent=edge_cells(p.edge)
				var grounded=supported.has(MMFHome.key(adjacent[0])) or supported.has(MMFHome.key(adjacent[1])) or access.permanent_support(adjacent[0]) or access.permanent_support(adjacent[1])
				if not grounded:continue
				for base in adjacent:
					if cell.x==base.x and cell.z==base.z and cell.y==base.y+1:supported[key]=true;changed=true;break
	return supported

func undo_safety(piece: Dictionary,entry: Dictionary) -> String:
	if piece.is_empty():return "That part no longer exists."
	if not game.started or game.cinematic!="" or game.session.health<=0 or game.manual_turret!="":return "Construction undo is unavailable right now."
	if game.menu_open and game.ui.page!="Build":return "Open construction to undo a build."
	if not game.menu_open and selected=="":return "Open construction to undo a build."
	if game.session.attack_recent>0 or game.combat.active_threat():return "Construction undo is unavailable during combat."
	if piece_transform(piece).origin.distance_to(game.player.position)>12:return "Move within 12 m of that part to undo."
	if not game.aboard():return "Return aboard before undoing construction."
	if entry.kind=="move":
		if piece.definitionId=="salvage-crane" and game.salvage.crates.any(func(c):return c.active and c.claimed==piece.instanceId):return "Finish the crane's held load before undoing its move."
		if piece_transform(entry.before).origin.distance_to(game.player.position)>12:return "Move within 12 m of the original location."
		var check=placement_report(entry.before,piece.instanceId,true)
		return "Original location: "+check.reason if not check.valid else ""
	var route_reason=access.removal([piece.instanceId])
	if route_reason!="":return route_reason
	if build_preview.actor_overlap(piece,true):return "Step clear of that part and its walking space before undoing."
	if piece.definitionId in ["floor","stairs","wall","doorway","boarding-extension"] and game.player.position.y>19.0 and piece.cell.y<int(round((game.player.position.y-16.03)/3.6)):
		return "Return to the lower deck before undoing its route supports."
	if piece.definitionId=="floor" and piece.cell.y==0 and piece.cell.x==6 and absf(piece.cell.z)<=1 and (game.session.story.phase in ["approach","braking","docked"] or game.session.contacts.active.get("state","") in ["committed","docked","visited"]):return "The active return gangway must remain supported."
	if game.session.stores.has(piece.instanceId):
		for slot in game.session.stores[piece.instanceId].slots:
			if slot!=null:return "Empty storage before undoing; used storage must be dismantled."
	var remaining=[];var before_floors={};var after_floors={}
	for p in game.session.structures:
		if p.definitionId=="floor":before_floors[MMFHome.key(p.cell)]=true
		if p.instanceId==piece.instanceId:continue
		remaining.append(p)
		if p.definitionId=="floor":after_floors[MMFHome.key(p.cell)]=true
	for p in remaining:
		if p.definitionId=="floor":continue
		if p.definitionId=="lamp":
			if piece.definitionId in ["wall","doorway"] and p.get("edge",{})==piece.get("edge",{}):return "Undo attached parts first."
		elif p.has("edge"):
			var adjacent=edge_cells(p.edge)
			if (before_floors.has(MMFHome.key(adjacent[0])) or before_floors.has(MMFHome.key(adjacent[1]))) and not (after_floors.has(MMFHome.key(adjacent[0])) or after_floors.has(MMFHome.key(adjacent[1])) or access.permanent_support(adjacent[0]) or access.permanent_support(adjacent[1])):return "Undo dependent parts first."
		elif before_floors.has(MMFHome.key(p.cell)) and not after_floors.has(MMFHome.key(p.cell)) and not access.permanent_support(p.cell):return "Undo dependent parts first."
	var before_support=supported_cells(game.session.structures)
	var after_support=supported_cells(remaining)
	for key in before_support:
		if after_floors.has(key) and not after_support.has(key):return "Other deck plates depend on that support."
	return ""

func floor_at(cell: Dictionary) -> bool:
	for p in game.session.structures:
		if p.definitionId == "floor" and p.cell==cell: return true
	return false

func deck_support(cell: Dictionary) -> bool:
	return floor_at(cell) or access.permanent_support(cell)

func supported_floor(cell: Dictionary) -> bool:
	# Follow the horizontal platform back to a legitimate hull/wall support.
	# This also catches older saves with a disconnected floating floor chain.
	if access.permanent_support(cell):return true
	if not floor_at(cell): return false
	var pending=[cell];var seen={}
	while not pending.is_empty():
		var at=pending.pop_back();var key=MMFHome.key(at)
		if seen.has(key): continue
		seen[key]=true
		if hull_support(at): return true
		for piece in game.session.structures:
			if piece.definitionId not in ["wall","doorway"] or not piece.has("edge"): continue
			var supporting=edge_cells(piece.edge)
			for adjacent in supporting:
				if adjacent.x==at.x and adjacent.z==at.z and adjacent.y==at.y-1:
					for base in supporting:
						if supported_floor(base): return true
		for delta in [Vector2i(1,0),Vector2i(-1,0),Vector2i(0,1),Vector2i(0,-1)]:
			var adjacent={"x":at.x+delta.x,"y":at.y,"z":at.z+delta.y}
			if floor_at(adjacent) and not seen.has(MMFHome.key(adjacent)): pending.append(adjacent)
	return false

func hull_support(cell: Dictionary) -> bool:
	if cell.y < -2 or cell.y > 0: return false
	var width = 12 if cell.y==0 else 13
	var length = 14 if cell.y==0 else 15
	if absf(cell.x*2)>width-0.9 or absf(cell.z*2)>length-0.9: return false
	if cell.y>-2 and cell.x==-1 and absf(cell.z)<2: return false
	if cell.y>-2 and cell.x==-6 and absf(cell.z)<2: return false
	return true

func validate(p: Dictionary, ignore: String = "",legacy_return: bool=false) -> String:
	var cell = p.cell
	var id = p.definitionId
	var def = game.data.BUILD_PIECES[id]
	if cell.y==-1 and id not in ["floor","lamp","rug"]:
		for at in game.engineering.anchors:
			if absf(cell.x*2-at.x)<2.1 and absf(cell.z*2-at.z)<2.1:return "Keep engineering service access clear"
	if not in_envelope(cell): return "Outside build envelope"
	if not unlocked(id): return "Blueprint not unlocked"
	if not legacy_return:
		var bay_reason=MMFMachineSpaces.bay_refusal(p)
		if bay_reason!="":return bay_reason
	if cell.y==0 and cell.x>=6 and absf(cell.z)<=1 and (game.session.story.phase in ["approach","braking","docked"] or game.session.contacts.active.get("state","") in ["committed","docked","visited"]): return "Reserved for the active wreck and gangway"
	# Exact compound overlap below owns ordinary placement clearance. A broad
	# standing box would wrongly fill open table kneespace and deck contact areas.
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
		var support = access.permanent_support(cell)
		for other in game.session.structures:
			if other.definitionId in ["wall","doorway"] and other.has("edge"):
				for adjacent in edge_cells(other.edge):
					if adjacent.x==cell.x and adjacent.z==cell.z and adjacent.y==cell.y-1: support=true
		for delta in [Vector2i(1,0),Vector2i(-1,0),Vector2i(0,1),Vector2i(0,-1)]:
			if supported_floor({"x":cell.x+delta.x,"y":cell.y,"z":cell.z+delta.y}): support=true
		if not support: return "Needs a floor beside it or wall below"
	elif p.has("edge"):
		var adjacent=edge_cells(p.edge)
		if id!="lamp" and not deck_support(adjacent[0]) and not deck_support(adjacent[1]): return "Needs a supported deck on either side"
	elif not deck_support(cell): return "Place a supported deck plate here first"
	if id=="stairs":
		var steps=stair_cells(p)
		if not in_envelope(steps.run) or not in_envelope(steps.landing): return "Outside build envelope"
		if blocked(steps.run) or blocked(steps.landing): return "Machine equipment is in the way"
		if floor_at(steps.landing): return "Keep the stairwell opening clear"
		for other in game.session.structures:
			if other.instanceId==ignore: continue
			if other.definitionId=="stairs" and stair_cells(other).run==steps.run: return "Stair run is occupied"
			if other.cell==steps.run and (other.definitionId=="roof" or game.data.BUILD_PIECES[other.definitionId].category=="station"): return "Not enough clear space above the stairs"
	if id=="boarding-extension":
		# Full walking volume, including the overhanging half, must stay clear.
		var transform_value=piece_transform(p)
		var query=PhysicsShapeQueryParameters3D.new()
		var shape=BoxShape3D.new();shape.size=Vector3(1.55,1.8,3.9)
		query.shape=shape;query.transform=transform_value*Transform3D(Basis.IDENTITY,Vector3(0,1.02,0));query.collision_mask=1
		for hit in get_world_3d().direct_space_state.intersect_shape(query,32):
			if hit.collider.get_meta("piece_id","")==ignore and ignore!="": continue
			# The authored workshop interlock retracts only after its bridge exists.
			if hit.collider.get_meta("workshop_bridge_interlock",false): continue
			return "Boarding extension needs a clear walking route"
	if id=="lamp":
		var wall_found = false
		for other in game.session.structures:
			if other.get("edge",{})==p.get("edge",{}) and other.definitionId in ["wall","doorway"]: wall_found=true
		if not wall_found: return "Needs a wall or doorway"
	if def.category=="station" and center(cell).distance_to(game.player.position)<1.2: return "Move clear of the equipment"
	if build_preview.solid_overlap(p,ignore):return "Something solid is in the way"
	var access_reason=access.reservations(p,ignore,legacy_return)
	if access_reason!="":return access_reason
	access_reason=access.connectivity(p,ignore)
	if access_reason!="":return access_reason
	if ignore=="" and not game.session.can_pay(def.cost): return "Not enough materials"
	return ""

func in_envelope(cell: Dictionary) -> bool:
	return absf(cell.x)<=50 and absf(cell.z)<=50 and cell.y>=-2 and cell.y<=2

func blocked(cell: Dictionary) -> bool:
	# Authored dressing can be removed without leaving its obsolete rectangular
	# exclusion behind. The current permanent body's actual collision is truth.
	return access.fixed_obstacle(cell)

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
	if id in MMFNativeProgression.RETIRED_PIECES:return false
	if id in MMFNativeProgression.MODULES:return id in game.session.expedition_gear.recovered
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
				unsupported=not floors.has(MMFHome.key(adjacent[0])) and not floors.has(MMFHome.key(adjacent[1])) and not access.permanent_support(adjacent[0]) and not access.permanent_support(adjacent[1])
			else: unsupported=not floors.has(MMFHome.key(p.cell)) and not access.permanent_support(p.cell)
			if unsupported: doomed.append(p.instanceId);added=true
	return doomed

func dismantle_preview(id: String) -> Dictionary:
	var p=game.session.find_piece(id)
	if p.is_empty(): return {"pieces":[],"refund":{},"refusal":"The permanent chassis cannot be dismantled."}
	var doomed=cascade(id)
	var refund={}
	var refusal=""
	var contents={}
	var bags=[game.session.inventory]
	for store in game.session.stores:
		if store not in doomed: bags.append(game.session.stores[store])
	for piece_id in doomed:
		var piece=game.session.find_piece(piece_id)
		# The fixed chassis/staircases are not user pieces. Keep the active dock
		# and the deck directly underneath an off-machine operator connected.
		if piece.definitionId=="floor" and piece.cell.y==0 and piece.cell.x==6 and absf(piece.cell.z)<=1 and game.session.contacts.active.get("state","") in ["docked","visited"]:
			refusal="The active return gangway must remain supported."
		if piece.definitionId=="floor" and center(piece.cell).distance_to(game.player.position)<1.5:
			refusal="Step clear of the deck plate before dismantling it."
		if piece.definitionId=="boarding-extension" and game.session.contacts.active.get("kind","")=="rooftop-workshop" and game.session.contacts.active.get("state","") in ["docked","visited"] and not game.aboard():
			refusal="Return aboard before dismantling your boarding extension."
		for item in game.data.BUILD_PIECES[piece.definitionId].cost:
			refund[item]=refund.get(item,0)+floor(game.data.BUILD_PIECES[piece.definitionId].cost[item]*.6)
		if game.session.stores.has(piece_id):
			for slot in game.session.stores[piece_id].slots:
				if slot!=null: contents[slot.itemId]=contents.get(slot.itemId,0)+slot.count
		for item in piece.state.get("legacyStock",{}):contents[item]=contents.get(item,0)+piece.state.legacyStock[item]
	var backups=[]
	for bag in bags: backups.append(bag.slots.duplicate(true))
	for item in contents:
		var remaining=int(contents[item])
		for bag in bags: remaining=bag.add(item,remaining)
		if remaining>0: refusal="Free storage for the contents before dismantling."
	for i in bags.size(): bags[i].slots=backups[i]
	if refusal=="":refusal=access.removal(doomed)
	return {"pieces":doomed,"refund":refund,"refusal":refusal,"contents":contents}

func demolish(id: String,destroyed: bool=false) -> bool:
	if game.session.find_piece(id).is_empty(): return false
	if not destroyed:
		var safety=dismantle_preview(id)
		if safety.refusal!="":game.session.notify(safety.refusal);return false
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
		for item in p.state.get("legacyStock",{}):contents[item]=contents.get(item,0)+p.state.legacyStock[item]
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
	clear_history("Dismantling or destruction clears recent construction.")
	for piece in doomed:
		var p=game.session.find_piece(piece)
		if p.is_empty(): continue
		game.session.structures.erase(p);game.session.stores.erase(piece)
		if bodies.has(piece): bodies[piece].queue_free();bodies.erase(piece)
		generator_visuals.erase(piece)
	layout_revision+=1
	for item in refund:
		var left=game.session.add_resource(item,int(refund[item]))
		if left>0: overflow[item]=overflow.get(item,0)+left
	for item in overflow: game.combat.drop_loot(game.player.position,item,int(overflow[item]))
	MMFMachineOperations.clean(game.session);game.session.update_power()
	game.session.notify("Equipment destroyed." if destroyed else "Dismantled; contents and materials recovered.")
	game.combat.layout_changed()
	return true

func damage(id: String,amount: float,point: Vector3):
	var p=game.session.find_piece(id)
	if p.is_empty(): return
	clear_history("Damage clears recent construction.")
	p.health=maxf(0,p.health-maxf(0,amount-game.data.BUILD_PIECES[p.definitionId].get("armor",0)))
	game.session.attack_recent=5
	if p.health<=0:
		game.effects.explosion(point,0.4)
		demolish.call_deferred(id,true)
