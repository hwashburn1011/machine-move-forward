class_name MMFInventory
extends RefCounted

var slots: Array = []
var definitions: Dictionary
var mutation_revision: int = 0

func _init(items: Dictionary = {}, capacity: int = 20):
	definitions = items
	slots.resize(capacity)

func count_item(id: String) -> int:
	var total = 0
	for slot in slots:
		if slot != null and slot.itemId == id: total += int(slot.count)
	return total

func room_for(id: String) -> int:
	if not definitions.has(id): return 0
	var total = 0
	var cap = int(definitions[id].stackSize)
	for slot in slots:
		if slot == null: total += cap
		elif slot.itemId == id: total += cap - int(slot.count)
	return total

func add(id: String, quantity: int) -> int:
	if not definitions.has(id) or quantity <= 0: return maxi(0, quantity)
	var remaining = quantity
	var cap = int(definitions[id].stackSize)
	for slot in slots:
		if slot == null or slot.itemId != id: continue
		var moved = mini(cap - int(slot.count), remaining)
		slot.count += moved
		remaining -= moved
	for i in slots.size():
		if remaining <= 0: break
		if slots[i] != null: continue
		var moved = mini(cap, remaining)
		slots[i] = {"itemId": id, "count": moved}
		remaining -= moved
	if remaining < quantity: mutation_revision += 1
	return remaining

func remove(id: String, quantity: int) -> int:
	var remaining = maxi(0, quantity)
	for i in slots.size():
		var slot = slots[i]
		if slot == null or slot.itemId != id: continue
		var moved = mini(int(slot.count), remaining)
		slot.count -= moved
		remaining -= moved
		if slot.count == 0: slots[i] = null
	if remaining < maxi(0, quantity): mutation_revision += 1
	return quantity - remaining

func can_pay(cost: Dictionary) -> bool:
	for id in cost:
		if count_item(id) < cost[id]: return false
	return true

func pay(cost: Dictionary) -> bool:
	if not can_pay(cost): return false
	for id in cost: remove(id, int(cost[id]))
	return true

func transfer_to(other: MMFInventory, matching: bool = false) -> int:
	var moved = 0
	for i in slots.size():
		var slot = slots[i]
		if slot == null or (matching and other.count_item(slot.itemId) == 0): continue
		var left = other.add(slot.itemId, int(slot.count))
		moved += int(slot.count) - left
		if left == 0: slots[i] = null
		else: slot.count = left
	if moved > 0: mutation_revision += 1
	return moved

func sort_slots():
	var amounts = {}
	for slot in slots:
		if slot != null: amounts[slot.itemId] = amounts.get(slot.itemId, 0) + slot.count
	slots.fill(null)
	var keys = amounts.keys()
	keys.sort()
	for id in keys: add(id, int(amounts[id]))

func restore(raw: Array) -> bool:
	if raw.size() > slots.size(): return false
	for slot in raw:
		if slot == null: continue
		if not slot is Dictionary or not definitions.has(slot.get("itemId", "")): return false
		if not slot.get("count", 0) is float and not slot.get("count", 0) is int: return false
		if slot.count <= 0 or slot.count > definitions[slot.itemId].stackSize: return false
		if not is_finite(float(slot.count)) or floor(slot.count)!=slot.count: return false
	slots.fill(null)
	for i in raw.size():
		if raw[i]==null:continue
		slots[i]=raw[i].duplicate()
		slots[i].itemId=MMFNativeProgression.RETIRED_ITEMS.get(slots[i].itemId,slots[i].itemId)
	mutation_revision += 1
	return true
