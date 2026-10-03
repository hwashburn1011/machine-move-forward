class_name MMFBuildPreview
extends RefCounted

const CELL_RELEASE=1.12
const EDGE_RELEASE=.16
const FLOOR_CONTACT_TOLERANCE=.10
var previous={}
var owner_reference: WeakRef
var builder:
	get:return owner_reference.get_ref() if owner_reference else null
var power_key=""
var power_cache={}
var bounds_cache={}
var solid_excludes_key=""
var solid_excludes: Array[RID]=[]
var solid_shapes={}
var outline: MeshInstance3D
var outline_material=StandardMaterial3D.new()

func setup(owner_builder):
	owner_reference=weakref(owner_builder)
	outline=MeshInstance3D.new();outline.name="ConstructionClearance"
	outline.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	outline_material.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	outline_material.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	outline.material_override=outline_material
	builder.add_child(outline);outline.hide()

func reset():
	previous={};power_key="";solid_excludes_key=""
	if is_instance_valid(outline):outline.hide()

func invalidate():power_key=""

func candidate(at: Vector3,level: int,id: String,rotation: int,edge_anchor: bool) -> Dictionary:
	var cell={"x":int(round(at.x/2)),"y":level,"z":int(round(at.z/2))}
	var same=previous.get("definitionId","")==id and previous.get("cell",{}).get("y",99)==level
	if same:
		for axis in ["x","z"]:
			if absf(at[axis]-previous.cell[axis]*2)<=CELL_RELEASE:cell[axis]=previous.cell[axis]
	var result={"definitionId":id,"cell":cell,"rotation":rotation}
	if edge_anchor:
		var dx=absf(at.x-cell.x*2)
		var dz=absf(at.z-cell.z*2)
		var axis="x" if dx>dz else "z"
		if same and previous.has("edge") and absf(dx-dz)<EDGE_RELEASE:axis=previous.edge.axis
		var edge=cell.duplicate()
		edge.axis=axis
		if at[axis]<cell[axis]*2:edge[axis]-=1
		result.edge=edge
	previous=result.duplicate(true)
	return result

func aimed_candidate() -> Dictionary:
	var game=builder.game
	var bay=MMFMachineSpaces.bay_candidate(builder.selected)
	if not bay.is_empty():
		builder.rotation_index=int(bay.rotation)
		return bay
	var camera=game.player.camera
	var direction=-camera.global_basis.z
	var level=clampi(builder.current_level(),-2,2)
	var intersection=Plane(Vector3.UP,16.03+level*3.6).intersects_ray(camera.global_position,direction)
	if builder.manual_level==99:
		var hit=game.raycast(camera.global_position,camera.global_position+direction*60)
		if not hit.is_empty() and hit.normal.y>.7:
			var piece=game.session.find_piece(hit.collider.get_meta("piece_id",""))
			var height_level=int(round((hit.position.y-16.03)/3.6))
			var surface=not piece.is_empty() and piece.definitionId=="floor"
			var permanent=game.world.is_ancestor_of(hit.collider) and absf(hit.position.y-(16.03+height_level*3.6))<.22
			if (surface or permanent) and height_level>=-2 and height_level<=2:
				level=height_level
				intersection=Plane(Vector3.UP,16.03+level*3.6).intersects_ray(camera.global_position,direction)
	if intersection==null:return {}
	# The workshop ghost only prepares the intended deck/rotation. Aim still
	# determines the target, and all ordinary reach/cost/clearance rules apply.
	return candidate(intersection,level,builder.selected,builder.rotation_index,game.data.BUILD_PIECES[builder.selected].anchor=="edge")

func materials(id: String,moving_id: String="") -> Dictionary:
	var s=builder.game.session
	var cost={} if moving_id!="" else s.data.BUILD_PIECES[id].cost.duplicate(true)
	var owned={};var missing={}
	for item in cost:
		owned[item]=s.count_resource(item)
		if owned[item]<cost[item]:missing[item]=int(cost[item])-int(owned[item])
	return {"cost":cost,"owned":owned,"missing":missing,"affordable":missing.is_empty()}

func projected_power(id: String,ignore_id: String="") -> Dictionary:
	var s=builder.game.session
	var key=id+":"+ignore_id+":"+str(builder.layout_revision)+":"+str(int(s.clock*5))+":"+str(hash(s.operations))+":"+str(s.capacity)+":"+str(s.demand)
	if key==power_key:return power_cache.duplicate(true)
	var before=MMFPowerBudget.calculate(s,s.structures)
	var pieces=s.structures.duplicate()
	if ignore_id=="":pieces.append({"instanceId":"preview-part","definitionId":id,"health":s.data.BUILD_PIECES[id].maxHealth,"state":{}})
	var after=MMFPowerBudget.calculate(s,pieces)
	var shed=[]
	for piece_id in after.powered:
		if not after.powered[piece_id]:shed.append(piece_id)
	var lost=[]
	for piece_id in before.powered:
		if before.powered[piece_id] and not after.powered.get(piece_id,false):lost.append(piece_id)
	power_cache={"capacity":after.capacity,"generation":after.generation,"demand":after.demand,"spare":after.spare,"added_draw":after.demand-before.demand,"added_generation":after.generation-before.generation,"battery_backup":after.battery_draw,"shed":shed,"newly_unpowered":lost,"selected_powered":after.powered.get(ignore_id if ignore_id!="" else "preview-part",true)}
	power_key=key
	return power_cache.duplicate(true)

func catalog_report(id: String,ignore_id: String="") -> Dictionary:
	if not builder.game.data.BUILD_PIECES.has(id):return {}
	var report=materials(id,ignore_id)
	report.merge({"definition_id":id,"moving_id":ignore_id,"unlocked":builder.unlocked(id),"power":projected_power(id,ignore_id),"warnings":[]})
	report.installation=MMFMachineSpaces.bay(id)
	if not report.power.newly_unpowered.is_empty():report.warnings.append("This load will switch off lower-priority equipment.")
	elif not report.power.selected_powered:report.warnings.append("This unit will be unpowered until generation increases.")
	if report.power.battery_backup>0:report.warnings.append("Battery reserve is serving navigation; it cannot power machines or weapons.")
	return report

func local_bounds(id: String,spec: Dictionary={}) -> AABB:
	if spec.is_empty():spec={"definitionId":id}
	var key=id+":"+str(MMFMachineSpaces.deployed_crane(spec))+":"+(MMFFloorSurfaces.mode(spec) if id=="floor" else "")
	if bounds_cache.has(key):return bounds_cache[key]
	var bounds=AABB()
	var first=true
	for collider in MMFMachineSpaces.piece_colliders(spec,builder.game.runtime):
		var box=Transform3D(Basis(Vector3.RIGHT,float(collider.get("rotX",0))),MMFAssets.v(collider.offset))*AABB(-MMFAssets.v(collider.half),MMFAssets.v(collider.half)*2)
		bounds=box if first else bounds.merge(box);first=false
	bounds_cache[key]=bounds
	return bounds

func actor_overlap(spec: Dictionary,walking_support: bool=false) -> bool:
	var transform_value=builder.piece_transform(spec)
	if not walking_support:
		# Use the real oriented collider, not a combined axis-aligned bounding
		# box: a sloping stair's empty space is a valid standing/aiming position.
		for collider in MMFMachineSpaces.piece_colliders(spec,builder.game.runtime):
			var shape=BoxShape3D.new();shape.size=MMFAssets.v(collider.half)*2
			var query=PhysicsShapeQueryParameters3D.new()
			query.shape=shape;query.transform=transform_value*Transform3D(Basis(Vector3.RIGHT,float(collider.get("rotX",0))),MMFAssets.v(collider.offset));query.collision_mask=2|8
			if not builder.get_world_3d().direct_space_state.intersect_shape(query,8).is_empty():return true
		return false
	var bounds=local_bounds(spec.definitionId,spec)
	if walking_support:
		bounds=AABB(Vector3(bounds.position.x,.04,bounds.position.z),Vector3(maxf(bounds.size.x,1.6),2.1,maxf(bounds.size.z,1.6)))
	var shape=BoxShape3D.new();shape.size=Vector3(maxf(bounds.size.x,.04),maxf(bounds.size.y,.04),maxf(bounds.size.z,.04))
	var query=PhysicsShapeQueryParameters3D.new()
	query.shape=shape;query.transform=transform_value*Transform3D(Basis.IDENTITY,bounds.get_center());query.collision_mask=2|8
	return not builder.get_world_3d().direct_space_state.intersect_shape(query,8).is_empty()

func solid_exclusions(spec: Dictionary,ignore_id: String) -> Array[RID]:
	var edge_join=spec.has("edge") and spec.definitionId in ["wall","doorway","railing"]
	var key=str(builder.layout_revision)+":"+str(spec.cell.y)+":"+ignore_id+":"+str(edge_join)
	if key==solid_excludes_key:return solid_excludes
	solid_excludes.clear()
	for piece in builder.game.session.structures:
		# A moving assembly excludes only itself. Deck plates at this level
		# provide support; upper floors and every fixed machine body remain solid.
		var support=piece.definitionId=="floor" and piece.cell.y==spec.cell.y
		# Grid-aligned wall panels intentionally overlap by their wall thickness
		# at a shared corner/T joint. Same-edge occupancy was already rejected.
		var joined=edge_join and piece.has("edge") and piece.definitionId in ["wall","doorway","railing"] and piece.cell.y==spec.cell.y
		if piece.instanceId!=ignore_id and not support and not joined:continue
		var model=builder.bodies.get(piece.instanceId)
		if not is_instance_valid(model):continue
		for body in MMFAssets.of_type(model,"CollisionObject3D"):
			solid_excludes.append(body.get_rid())
	solid_excludes_key=key
	return solid_excludes

static func is_furnishing(id: String) -> bool:
	return MMFArt100Decor.PIECES.has(id) or MMFArt200Decor.PIECES.has(id)

func clearance_shapes(id: String) -> Array:
	return clearance_for({"definitionId":id})

func clearance_for(spec: Dictionary) -> Array:
	var key=spec.definitionId+(":deployed" if MMFMachineSpaces.deployed_crane(spec) else "")
	if solid_shapes.has(key):return solid_shapes[key]
	var shapes=[]
	for collider in MMFMachineSpaces.piece_colliders(spec,builder.game.runtime):
		var half=MMFAssets.v(collider.half)
		var center=MMFAssets.v(collider.offset)
		var angle=float(collider.get("rotX",0))
		if is_zero_approx(angle):
			var bottom=maxf(center.y-half.y,FLOOR_CONTACT_TOLERANCE)
			var top=center.y+half.y
			if top<=bottom:continue
			center.y=(bottom+top)*.5
			# Adjacent walls/doors deliberately meet at corners. Trim only a small
			# contact skin; this accepts touching joints, not intersecting bodies.
			var shape=BoxShape3D.new();shape.margin=0;shape.size=Vector3(maxf(.005,half.x*2-.025),maxf(.005,top-bottom-.012),maxf(.005,half.z*2-.025))
			shapes.append({"shape":shape,"transform":Transform3D(Basis.IDENTITY,center)})
		else:
			# Clip the already rotated box against the deck-contact plane. Trimming
			# its local Y extents first moves an inclined lounge's collision away
			# from the visible seat and can create false obstructions below it.
			var basis=Basis(Vector3.RIGHT,angle);var corners=[];var points=PackedVector3Array()
			for i in 8:
				var point=center+basis*Vector3(half.x*(1 if i&1 else -1),half.y*(1 if i&2 else -1),half.z*(1 if i&4 else -1))
				corners.append(point)
				if point.y>=FLOOR_CONTACT_TOLERANCE:points.append(point)
			for i in 8:
				for bit in [1,2,4]:
					var j=i^bit
					if j<=i:continue
					var a: Vector3=corners[i];var b: Vector3=corners[j]
					if (a.y-FLOOR_CONTACT_TOLERANCE)*(b.y-FLOOR_CONTACT_TOLERANCE)<0:
						points.append(a.lerp(b,(FLOOR_CONTACT_TOLERANCE-a.y)/(b.y-a.y)))
			if points.size()<4:continue
			var shape=ConvexPolygonShape3D.new();shape.points=points
			shapes.append({"shape":shape,"transform":Transform3D.IDENTITY})
	# Compound parts stay separate: no hull across chair legs or rack openings.
	solid_shapes[key]=shapes
	return shapes

func solid_overlap(spec: Dictionary,ignore_id: String="") -> bool:
	var transform_value=builder.piece_transform(spec)
	var excluded=solid_exclusions(spec,ignore_id)
	var space=builder.get_world_3d().direct_space_state
	for part in clearance_for(spec):
		var query=PhysicsShapeQueryParameters3D.new()
		query.shape=part.shape;query.transform=transform_value*part.transform
		query.collision_mask=1;query.exclude=excluded.duplicate()
		if not space.intersect_shape(query,1).is_empty():return true
	return false

func placement_report(spec: Dictionary,ignore_id: String="",legacy_return: bool=false) -> Dictionary:
	if spec.is_empty():return {"valid":false,"reason":"Aim at a deck","reason_code":"no_target","warnings":[]}
	var report=catalog_report(spec.definitionId,ignore_id)
	report.candidate=spec.duplicate(true)
	report.deck=int(spec.cell.y)
	report.rotation=int(spec.get("rotation",0))
	report.reason=builder.validate(spec,ignore_id,legacy_return)
	if report.installation.is_empty() and builder.piece_transform(spec).origin.distance_to(builder.game.player.position)>12:report.reason="Beyond 12 m reach"
	if report.reason=="" and actor_overlap(spec):report.reason="Move clear of the player or companion before placing."
	report.valid=report.reason==""
	report.pending=report.reason=="Checking walking access…"
	report.reason_code="access_pending" if report.pending else "valid" if report.valid else "placement_blocked"
	report.walking_bounds=local_bounds(spec.definitionId,spec)
	if builder.game.data.BUILD_PIECES[spec.definitionId].category in ["station","decor"]:
		for other in builder.game.session.structures:
			if other.instanceId==ignore_id or other.cell.y!=spec.cell.y or builder.game.data.BUILD_PIECES[other.definitionId].category not in ["station","decor"]:continue
			if builder.center(other.cell).distance_to(builder.center(spec.cell))<2.2:
				report.warnings.append("Nearby equipment narrows the service aisle; check walking access.");break
	return report

func show_outline(spec: Dictionary,report: Dictionary):
	if not is_instance_valid(outline):return
	if spec.is_empty():outline.hide();return
	var bounds=local_bounds(spec.definitionId,spec)
	var low=Vector3(bounds.position.x,.05,bounds.position.z)
	var high=Vector3(bounds.end.x,maxf(bounds.end.y,1.8),bounds.end.z)
	var corners=[Vector3(low.x,low.y,low.z),Vector3(high.x,low.y,low.z),Vector3(high.x,low.y,high.z),Vector3(low.x,low.y,high.z),Vector3(low.x,high.y,low.z),Vector3(high.x,high.y,low.z),Vector3(high.x,high.y,high.z),Vector3(low.x,high.y,high.z)]
	# Reuse the mesh when its dimensions have not changed.
	var key=str(bounds)
	if outline.get_meta("bounds_key","")!=key:
		var mesh=ImmediateMesh.new();mesh.surface_begin(Mesh.PRIMITIVE_LINES)
		for edge in [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]:
			mesh.surface_add_vertex(corners[edge[0]]);mesh.surface_add_vertex(corners[edge[1]])
		mesh.surface_end();outline.mesh=mesh;outline.set_meta("bounds_key",key)
	outline.transform=builder.piece_transform(spec)
	outline_material.albedo_color=Color(.2,.9,.7,.8) if report.valid else Color(1,.2,.1,.85)
	if report.valid and not report.warnings.is_empty():outline_material.albedo_color=Color(1,.74,.18,.85)
	outline.show()
