class_name MMFConstructionHistory
extends RefCounted

const MAX_RECEIPTS=10
const LIFETIME_SECONDS=120.0
# Functional equipment opts in only once all its use paths report mark_used().
const PASSIVE=["floor","wall","doorway","railing","roof","stairs","lamp","crate","table","rug","seed-garden","boarding-extension"]
var owner_reference: WeakRef
var builder:
	get:return owner_reference.get_ref() if owner_reference else null
var entries: Array=[]
var usage_revisions={}
var tracked_types: Array=[]
var session_id=0
var next_operation=1
var last_reason="No recent construction to undo."

func setup(owner_builder):
	owner_reference=weakref(owner_builder)
	session_id=builder.game.session.get_instance_id()

func clear(reason: String="No recent construction to undo."):
	entries.clear();usage_revisions.clear();last_reason=reason
	if builder:session_id=builder.game.session.get_instance_id()

func mark_used(id: String,reason: String="This equipment has been used."):
	if id=="":return
	usage_revisions[id]=int(usage_revisions.get(id,0))+1
	for entry in entries:
		if entry.instance_id==id:entry.invalid_reason=reason

func store_revision(id: String) -> int:
	var bag=builder.game.session.stores.get(id)
	if bag==null:return -1
	var revision=bag.get("mutation_revision")
	return int(revision) if revision!=null else 0

func capture_payment(cost: Dictionary) -> Array:
	var s=builder.game.session
	var result=[]
	for id in ["pack"]+s.stores.keys():
		var bag=s.inventory if id=="pack" else s.stores[id]
		var counts={}
		for item in cost:counts[item]=bag.count_item(item)
		result.append({"id":id,"counts":counts})
	return result

func paid_since(before: Array) -> Dictionary:
	var s=builder.game.session
	var paid={}
	var sources=[]
	for source in before:
		var bag=s.inventory if source.id=="pack" else s.stores.get(source.id)
		if bag==null:continue
		var quantities={}
		for item in source.counts:
			var amount=int(source.counts[item])-bag.count_item(item)
			if amount>0:quantities[item]=amount;paid[item]=int(paid.get(item,0))+amount
		if not quantities.is_empty():sources.append({"id":source.id,"paid":quantities})
	return {"paid":paid,"sources":sources}

func record(kind: String,piece: Dictionary,before: Dictionary={},payment: Dictionary={}):
	var s=builder.game.session
	if session_id!=s.get_instance_id():clear("Loading a game clears recent construction.")
	var entry={"operation_id":next_operation,"kind":kind,"instance_id":piece.instanceId,"definition_id":piece.definitionId,"at":s.clock,"before":before.duplicate(true),"after":piece.duplicate(true),"paid":payment.get("paid",{}).duplicate(true),"sources":payment.get("sources",[]).duplicate(true),"usage_revision":int(usage_revisions.get(piece.instanceId,0)),"store_revision":store_revision(piece.instanceId),"store":s.stores[piece.instanceId].slots.duplicate(true) if s.stores.has(piece.instanceId) else [],"invalid_reason":""}
	next_operation+=1
	entries.append(entry)
	while entries.size()>MAX_RECEIPTS:entries.pop_front()
	last_reason=""
	return entry.duplicate(true)

func observe():
	if builder==null:return
	var s=builder.game.session
	if session_id!=s.get_instance_id():clear("Loading a game clears recent construction.");return
	for entry in entries:
		if entry.invalid_reason!="":continue
		var piece=s.find_piece(entry.instance_id)
		if piece.is_empty():entry.invalid_reason="That part no longer exists.";continue
		# A later recorded move is intentional; its own receipt must be undone first.
		var latest=true
		for other in entries:
			if other.operation_id>entry.operation_id and other.instance_id==entry.instance_id:latest=false;break
		if not latest:continue
		if piece!=entry.after:entry.invalid_reason="That part changed or was used after construction."
		elif int(usage_revisions.get(piece.instanceId,0))!=entry.usage_revision:entry.invalid_reason="That equipment has been used."
		elif s.stores.has(piece.instanceId) and (store_revision(piece.instanceId)!=entry.store_revision or s.stores[piece.instanceId].slots!=entry.store):entry.invalid_reason="Storage contents changed after construction."

func refund_plan(entry: Dictionary) -> Dictionary:
	var s=builder.game.session
	var order=[]
	for source in entry.sources:
		if source.id not in order:order.append(source.id)
	for id in ["pack"]+s.stores.keys():
		if id not in order:order.append(id)
	var bags=[]
	for id in order:
		if id==entry.instance_id:continue
		var original=s.inventory if id=="pack" else s.stores.get(id)
		if original==null:continue
		var clone=MMFInventory.new(s.data.ITEMS,original.slots.size())
		clone.slots=original.slots.duplicate(true)
		bags.append({"id":id,"bag":clone})
	for item in entry.paid:
		var left=int(entry.paid[item])
		for value in bags:left=value.bag.add(item,left)
		if left>0:return {"allowed":false,"reason":"Free storage for the full construction refund."}
	return {"allowed":true,"bags":bags}

func status() -> Dictionary:
	observe()
	if entries.is_empty():return {"allowed":false,"reason":last_reason,"refund":{},"operation":""}
	var s=builder.game.session
	var entry=entries.back()
	var result={"allowed":false,"reason":"","operation":entry.kind,"definition_id":entry.definition_id,"instance_id":entry.instance_id,"refund":entry.paid.duplicate(true),"expired":false}
	if entry.invalid_reason!="":result.reason=entry.invalid_reason;result.expired=true;return result
	if s.clock-entry.at>LIFETIME_SECONDS:result.reason="That construction is older than two minutes.";result.expired=true;return result
	var connection_move=entry.kind=="move" and entry.definition_id in MMFNativeProgression.MODULES
	if not connection_move and entry.definition_id not in PASSIVE and not MMFBuildPreview.is_furnishing(entry.definition_id) and entry.definition_id not in tracked_types:
		result.reason="Use the salvage cutter for operating equipment.";result.expired=true;return result
	if entry.definition_id=="crate" and s.stores.has(entry.instance_id) and s.stores[entry.instance_id].get("mutation_revision")==null:
		result.reason="Storage use tracking is unavailable.";return result
	var piece=s.find_piece(entry.instance_id)
	var reason=builder.undo_safety(piece,entry)
	if reason!="":result.reason=reason;return result
	if entry.kind=="place":
		var plan=refund_plan(entry)
		if not plan.allowed:result.reason=plan.reason;return result
	result.allowed=true
	return result

func undo() -> bool:
	var state=status()
	if not state.allowed:
		if state.get("expired",false) and not entries.is_empty():entries.pop_back()
		builder.game.session.notify(state.reason)
		return false
	var entry=entries.back()
	var s=builder.game.session
	var piece=s.find_piece(entry.instance_id)
	if entry.kind=="place":
		var plan=refund_plan(entry)
		if not plan.allowed:return false
		# Clone from current bags and apply only after every refund item fits.
		for value in plan.bags:
			var bag=s.inventory if value.id=="pack" else s.stores[value.id]
			if bag.slots!=value.bag.slots:
				bag.slots=value.bag.slots.duplicate(true)
				if bag.get("mutation_revision")!=null:bag.mutation_revision+=1
		s.structures.erase(piece);s.stores.erase(entry.instance_id)
		MMFMachineOperations.clean(s)
		if builder.bodies.has(entry.instance_id):builder.bodies[entry.instance_id].queue_free();builder.bodies.erase(entry.instance_id)
		builder.generator_visuals.erase(entry.instance_id)
	else:
		var previous=piece.duplicate(true)
		piece.cell=entry.before.cell.duplicate(true);piece.rotation=entry.before.rotation
		piece.erase("edge")
		if entry.before.has("edge"):piece.edge=entry.before.edge.duplicate(true)
		builder.relocate_visual(piece,previous)
	entries.pop_back()
	builder.layout_revision+=1
	builder.finish_operation({"operation":"undo","reversed_operation":entry.operation_id,"instance_id":entry.instance_id,"definition_id":entry.definition_id,"paid":{},"refunded":entry.paid.duplicate(true)})
	s.notify("Construction undone; materials returned." if entry.kind=="place" else "Relocation undone.")
	return true
