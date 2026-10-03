extends StaticBody3D

var game
var piece_id=""

func take_weapon_damage(amount: float,point: Vector3,distance: float,range_m: float,falloff_start: float):
	var piece=game.session.find_piece(piece_id)
	if piece.is_empty(): return
	var armor=game.data.BUILD_PIECES[piece.definitionId].get("armor",0)
	take_damage(MMFDamage.compute(amount,distance,range_m,falloff_start,armor)+armor,point)

func take_damage(amount: float,point: Vector3):
	if game: game.building.damage(piece_id,amount,point)
