extends RefCounted
## Explicit stocked fixture, not campaign/economy evidence. Shared by authority
## regression and the separately scheduled native visual review.

static func prepare(game) -> Dictionary:
	game.load_payload(game.playtests.payload("scanner"))
	game.set_physics_process(false);game.player.set_physics_process(false);game.caretaker.set_physics_process(false)
	game.session.inventory.add(MMFNomadPersonalization.PART,6)
	var pieces={}
	for row in [["trolley","nomad2-paint-trolley",-3,2],["radio","nomad-radio-cabinet",-2,2],["board","nomad-memory-board",-1,2],["chair","nomad-field-chair",0,2]]:
		var cell={"x":row[2],"y":0,"z":row[3]}
		if not game.session.structures.any(func(p):return p.definitionId=="floor" and p.cell==cell):add(game,"floor",cell)
		pieces[row[0]]=add(game,row[1],cell)
	pieces.generator=game.session.structures.filter(func(p):return p.definitionId=="generator")[0]
	pieces.workbench=game.session.structures.filter(func(p):return p.definitionId=="workbench")[0]
	game.session.update_power()
	return pieces

static func add(game,id: String,cell: Dictionary) -> Dictionary:
	var p=game.session.create_piece(id,cell,0,{},true);game.building.add_visual(p);return p

static func enter(game,piece: Dictionary):
	game.player.position=game.building.piece_transform(piece).origin+Vector3(.9,.95,0)
	game.player.reset_physics_interpolation()
	game.session.attack_recent=0
	game.open_station("Workshop" if piece.definitionId=="workbench" else "Painter",piece.definitionId,piece.instanceId)
