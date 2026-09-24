class_name MMFLootView
extends RefCounted

# Logical drops stay in MMFCombat. Three shared MultiMeshes draw their actual
# recovered assemblies; instance buffers change only when placement changes.
const MODELS={"scrap":"ScrapDropMesh","components":"ComponentDropMesh","fuel":"FuelDropMesh"}
const FOOTPRINT=AABB(Vector3(-.19,0,-.13),Vector3(.38,.20,.26))
var game
var batches={}
var dirty=true
var support_dirty=false
var previous_count=-1
var rebuilds=0
var restore_delay=0

func setup(owner_game):
	game=owner_game
	var kit=MMFAssets.scene("res://art/recovered-supplies.glb")
	for id in MODELS:
		var source=MMFAssets.find_named(kit,MODELS[id])
		var batch=MultiMeshInstance3D.new();batch.name="Recovered_"+id
		var instances=MultiMesh.new();instances.transform_format=MultiMesh.TRANSFORM_3D;instances.mesh=source.mesh
		instances.instance_count=8;instances.visible_instance_count=0;batch.multimesh=instances
		game.combat.add_child(batch);batches[id]=batch
	kit.free()

func kind(item: Dictionary) -> String:return item.id if MODELS.has(item.id) else "components"

func floor_pose(at: Vector3,yaw: float,scale_value: float=1.0) -> Dictionary:
	var hit=game.raycast(at+Vector3.UP*.28,at-Vector3.UP*16,[],1)
	if hit.is_empty() or hit.normal.y<.65 or hit.collider.name=="RadioactiveDesert":return {}
	var basis=Basis(Quaternion(Vector3.UP,hit.normal))*Basis(Vector3.UP,yaw)
	basis=basis.scaled(Vector3.ONE*scale_value)
	# A complete footprint prevents balancing on one step, rail or deck edge.
	for x in [-.15,.15]:
		for z in [-.10,.10]:
			var point=hit.position+basis*Vector3(x,0,z)
			var corner=game.raycast(point+Vector3.UP*.06,point-Vector3.UP*.08,[],1)
			if corner.is_empty() or corner.normal.dot(hit.normal)<.99 or absf(corner.position.y-point.y)>.015:return {}
	return {"transform":Transform3D(basis,hit.position+hit.normal*.001),"support":weakref(hit.collider)}

func place(item: Dictionary):
	var anchor: Vector3=item.node.global_position-Vector3.UP*.2
	var offsets=[Vector3.ZERO,Vector3(.44,0,0),Vector3(-.44,0,0),Vector3(0,0,.34),Vector3(0,0,-.34),Vector3(.44,0,.34),Vector3(-.44,0,.34),Vector3(.44,0,-.34),Vector3(-.44,0,-.34)]
	if item.has("view") and not item.view.is_empty():offsets.push_front(item.view.world.origin-anchor)
	var occupied=[];var merge={};var fallback={}
	for other in game.combat.loot:
		if other==item or not other.has("view") or other.view.is_empty():continue
		occupied.append(other.view.world*FOOTPRINT)
		if kind(other)==kind(item) and other.node.position.distance_to(item.node.position)<1.2:merge=other.view
	var chosen={}
	for scale_value in [1.0,.75]:
		for i in offsets.size():
			var proposed=floor_pose(anchor+offsets[i],0,scale_value)
			if proposed.is_empty():continue
			if fallback.is_empty():fallback=proposed
			var bounds=proposed.transform*FOOTPRINT
			if occupied.any(func(box):return box.intersects(bounds)):continue
			chosen=proposed;break
		if not chosen.is_empty():break
	# Dense identical supplies share a physical pile without merging or dropping
	# their logical resource records. Collection still processes every stack.
	if chosen.is_empty() and not merge.is_empty():chosen={"transform":merge.world,"support":merge.support}
	if chosen.is_empty():chosen=fallback
	item.view={}
	if not chosen.is_empty():
		var surface=chosen.support.get_ref()
		var location: Transform3D=chosen.transform
		# Resolve a removed support onto a lower real surface, never leave a model
		# floating where the old floor stood. Preserve the existing pickup radius.
		item.node.global_position.y=location.origin.y+.2
		item.view={"world":location,"support":chosen.support,"local":surface.global_transform.affine_inverse()*location,"anchor":surface.to_local(item.node.global_position),"last_support":surface.global_transform}
	dirty=true

func invalidate():support_dirty=true

func update():
	if restore_delay>0:restore_delay-=1;return
	var entries=game.combat.loot
	if entries.size()!=previous_count:dirty=true;previous_count=entries.size()
	for item in entries:
		if not item.has("view") or support_dirty:place(item)
		if item.view.is_empty():continue
		var surface=item.view.support.get_ref()
		if not is_instance_valid(surface):place(item);continue
		if surface.global_transform!=item.view.last_support:
			item.view.world=surface.global_transform*item.view.local
			item.node.global_position=surface.to_global(item.view.anchor)
			item.view.last_support=surface.global_transform;dirty=true
	support_dirty=false
	if not dirty:return
	dirty=false;rebuilds+=1
	var transforms={};var used={}
	for id in MODELS:transforms[id]=[];used[id]={}
	for item in entries:
		if item.view.is_empty():continue
		var id=kind(item);var placement: Transform3D=item.view.world
		if used[id].has(placement):continue
		used[id][placement]=true;transforms[id].append(game.combat.global_transform.affine_inverse()*placement)
	for id in MODELS:
		var mm: MultiMesh=batches[id].multimesh;var values=transforms[id]
		if values.size()>mm.instance_count:mm.instance_count=maxi(values.size(),mm.instance_count*2)
		mm.visible_instance_count=values.size()
		for i in values.size():mm.set_instance_transform(i,values[i])

func clear():
	for batch in batches.values():batch.multimesh.visible_instance_count=0
	dirty=true;previous_count=-1;restore_delay=0

func snapshot() -> Array:
	var result=[]
	for item in game.combat.loot:
		result.append({"id":item.id,"count":item.count,"position":MMFAssets.dict_v(item.node.position)})
	return result

static func valid_snapshot(raw,items: Dictionary) -> bool:
	if not raw is Array or raw.size()>10000:return false
	for item in raw:
		if not item is Dictionary or not item.get("id") is String or not items.has(item.id):return false
		if not MMFSaveValidation.number(item.get("count"),1,1e12,true):return false
		var at=item.get("position")
		if not at is Dictionary:return false
		for axis in ["x","y","z"]:
			if not MMFSaveValidation.number(at.get(axis),-1e9,1e9):return false
	return true

func restore(raw: Array):
	for item in raw:
		var node=Node3D.new();node.name="Recovered_"+item.id;game.combat.add_child(node);node.position=MMFAssets.v(item.position)
		game.combat.loot.append({"node":node,"id":item.id,"count":int(item.count)})
	# Rebuilt deck/site colliders need a physics synchronization before fitting.
	dirty=true;restore_delay=2
