extends RefCounted

static func same_campaign(a: Dictionary,b: Dictionary) -> bool:
	# A failed UI action now records its explanation. Compare every other saved
	# field exactly; an activity receipt cannot disguise a partial transaction.
	var left=a.duplicate(true);var right=b.duplicate(true)
	left.polish.erase("receipts");right.polish.erase("receipts")
	return left==right
