class_name MMFCombatFeedback
extends RefCounted

const PERSONAL_SOURCES=["player_weapon","player_manual_turret"]

static func personal(result: Dictionary) -> bool:
	return result.get("source","") in PERSONAL_SOURCES and result.get("hostile",false) and float(result.get("applied_damage",0))>0

static func rank(result: Dictionary) -> int:
	if not personal(result):return 0
	return 4 if result.get("killed",false) else 3 if result.get("exposed",false) else 2 if float(result.get("armor",0))>0 else 1

# Aggregate pellets without retaining targets or consuming gameplay randomness.
static func summarize(current: Dictionary,result: Dictionary) -> Dictionary:
	return result if rank(result)>rank(current) else current

static func label(result: Dictionary) -> String:
	return "ELIMINATED" if result.get("killed",false) else "EXPOSED HIT" if result.get("exposed",false) else "ARMOUR HIT" if float(result.get("armor",0))>0 else "HIT"

static func confirm(game,result: Dictionary):
	if not personal(result) or not game.ui:return
	game.ui.combat_hit(label(result))
	game.ui.confirm_player_hit()

static func present(game,result: Dictionary):
	if not result.get("collision",false):return
	var kind="world"
	if result.get("hostile",false):
		kind="blocked" if float(result.get("applied_damage",0))<=0 else "exposed" if result.get("exposed",false) else "armor" if float(result.get("armor",0))>0 else "body"
	game.effects.combat_impact(result.point,result.normal,kind)
	if kind!="world":game.audio.combat_impact(result.point,kind)
