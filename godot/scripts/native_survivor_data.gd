class_name MMFNativeSurvivorData
extends RefCounted

# Native additions remain separate from the frozen browser export. Both fresh
# games and save restoration receive the same definitions before validation.
static func apply(data: Dictionary,runtime: Dictionary):
	data.ITEMS["signal-decoy"]={"id":"signal-decoy","name":"Signal decoy","category":"consumable","stackSize":5,"weight":.5,"glyph":"◇","description":"A short-lived false transmission that diverts a searching scout or breaks pursuit tracking."}
	if not data.RECIPES.any(func(r):return r.id=="craft-signal-decoy"):
		data.RECIPES.append({"id":"craft-signal-decoy","name":"Signal decoy","station":"workbench","inputs":{"scrap":4,"components":2},"output":{"itemId":"signal-decoy","count":1}})
	data.OPPORTUNITIES["friendly-refuge"]={"title":"A light still on"}
	data.OPPORTUNITIES["rooftop-workshop"]={"title":"Shared workshop"}
	var extension=data.BUILD_PIECES.floor.duplicate(true)
	extension.merge({"id":"boarding-extension","name":"Boarding extension","cost":{"scrap":12,"components":2},"weight":150,"maxHealth":180,"armor":1,"rotatable":true},true)
	data.BUILD_PIECES["boarding-extension"]=extension
	if "boarding-extension" not in data.BUILD_PIECE_ORDER:data.BUILD_PIECE_ORDER.append("boarding-extension")
	runtime.pieceColliders["boarding-extension"]=[{"offset":{"x":0,"y":-.09,"z":0},"half":{"x":.85,"y":.09,"z":2}}]
