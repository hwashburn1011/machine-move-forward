class_name MMFWristLog
extends RefCounted

# Local action receipts are separate from recovered transmissions: frequent
# crafting/building must never push a story message out of the radio archive.
const LIMIT=32
const TEXT_LIMIT=2048

static func append(s,message: String):
	if message.strip_edges().is_empty():return
	var entries: Array=s.polish.get("receipts",[])
	var text=message.left(TEXT_LIMIT)
	if not entries.is_empty() and entries.back().text==text:return
	entries.append({"text":text,"at":floorf(s.clock)})
	while entries.size()>LIMIT:entries.pop_front()
	s.polish.receipts=entries

static func valid(entries) -> bool:
	if not entries is Array or entries.size()>LIMIT:return false
	for entry in entries:
		if not entry is Dictionary or not entry.get("text") is String:return false
		if entry.text.is_empty() or entry.text.length()>TEXT_LIMIT:return false
		if not MMFSaveValidation.number(entry.get("at"),0,1e12):return false
	return true
