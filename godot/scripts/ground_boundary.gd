class_name MMFGroundBoundary
extends RefCounted

# Match RadioactiveGroundBoundary.ts: recover before terrain contact, retaining
# positions relative to supported platforms rather than a stale world position.
var player
var anchors: Array=[]
var recoveries=0

func _init(owner_player):
	player=owner_player

func clear():
	anchors.clear()

func terrain_edge(at: Vector3) -> float:
	var s=player.game.session
	return maxf(-0.35,MMFDunes.height_at(at.x+s.lateral,at.z-s.distance)-0.4)+0.25

func support_root(body: Node) -> Node3D:
	var game=player.game
	if body==null or body.name=="RadioactiveDesert": return null
	if game.world.is_ancestor_of(body) or game.building.is_ancestor_of(body): return game
	var destination=game.campaign.destination
	if is_instance_valid(destination) and game.session.story.phase=="docked" and destination.is_ancestor_of(body): return destination
	var site=game.opportunities.site
	if is_instance_valid(site) and game.session.contacts.active.get("state","") in ["docked","visited"] and site.is_ancestor_of(body): return site
	return null

func support_at(at: Vector3) -> Dictionary:
	var hit=player.game.raycast(at+Vector3.UP*0.2,at-Vector3.UP*0.35,[player.get_rid()])
	if hit.is_empty() or hit.normal.y<0.65 or support_root(hit.collider)==null: return {}
	return hit

func fits(at: Vector3) -> bool:
	if at.y<=terrain_edge(at) or support_at(at).is_empty(): return false
	var query=PhysicsShapeQueryParameters3D.new()
	query.shape=player.capsule_shape
	query.transform=Transform3D(Basis.IDENTITY,at+Vector3.UP*1.0)
	query.collision_mask=1;query.exclude=[player.get_rid()];query.margin=0.001
	return player.get_world_3d().direct_space_state.intersect_shape(query,1).is_empty()

func observe():
	if player.game.session.health<=0: return
	var at=player.position
	if not at.is_finite() or at.y<=terrain_edge(at):
		recover()
		return
	if not player.is_on_floor(): return
	var hit=support_at(at)
	if hit.is_empty(): return
	var root=support_root(hit.collider)
	# Keep a few older supports as well: the most recent tile may be demolished.
	if not anchors.is_empty() and anchors.back().root.get_ref()==root and anchors.back().local.distance_to(root.to_local(at))<0.75: return
	anchors.append({"root":weakref(root),"body":weakref(hit.collider),"local":root.to_local(at)})
	if anchors.size()>24: anchors.pop_front()

func safe_position() -> Vector3:
	for i in range(anchors.size()-1,-1,-1):
		var anchor=anchors[i];var root=anchor.root.get_ref();var body=anchor.body.get_ref()
		if not is_instance_valid(root) or not is_instance_valid(body) or body.is_queued_for_deletion() or support_root(body)!=root: continue
		var at=root.to_global(anchor.local)
		if fits(at): return at+Vector3.UP*0.04
	# Search actual supported, unoccupied deck positions if no recorded point is usable.
	for level in [16.09,12.49,8.89]:
		for z in range(-10,11,2):
			for x in range(-10,11,2):
				var at=Vector3(x,level,z)
				if fits(at): return at
	return Vector3(0,16.1,-1)

func recover():
	player.game.building.cancel()
	player.game.salvage.cancel()
	player.game.dismount_turret()
	player.game.home.chair_id=""
	player.teleport(safe_position())
	recoveries+=1
	player.game.session.notify("Radioactive ground — returned to the last safe platform.")
