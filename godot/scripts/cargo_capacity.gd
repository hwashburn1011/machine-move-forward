class_name MMFCargoCapacity
extends RefCounted

# Simulate the actual ordered transfer on disposable bags: one empty slot cannot
# simultaneously accept three different item types. Never roll sealed cargo here.
static func preview(cargo: Dictionary,bags: Array) -> Dictionary:
	if not cargo.get("opened",false):
		var room=false
		for bag in bags:
			for id in ["scrap","components","fuel",MMFNomadPersonalization.PART]:
				if bag.room_for(id)>0:room=true;break
		return {"state":"unknown" if room else "full","accepted":{},"remaining":{}}
	var trials=[]
	for bag in bags:
		var trial=MMFInventory.new(bag.definitions,bag.slots.size());trial.slots=bag.slots.duplicate(true);trials.append(trial)
	var accepted={};var remaining={}
	for id in cargo.contents:
		var count=int(cargo.contents[id]);var left=count
		for trial in trials:left=trial.add(id,left)
		if left>0:remaining[id]=left
		if left<count:accepted[id]=count-left
	return {"state":"fits" if remaining.is_empty() else "full" if accepted.is_empty() else "partial","accepted":accepted,"remaining":remaining}

static func remaining_text(contents: Dictionary,items: Dictionary) -> String:
	var parts=[]
	for id in contents:
		if int(contents[id])>0:parts.append("%d %s"%[int(contents[id]),items[id].name])
	return " · ".join(parts)
