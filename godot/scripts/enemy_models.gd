class_name MMFEnemyModels
extends RefCounted

const PLAYER="res://art/refined-s07-player.scn"
const REFINED={
	"bastion":"res://art/refined-bastion.scn","revenant":"res://art/refined-revenant.scn",
	"warden":"res://art/refined-warden.scn","sovereign":"res://art/refined-sovereign.scn",
	"raider":"res://art/refined-raider.scn","scavenger":"res://art/refined-scavenger.scn"}
static func path(kind: String) -> String:
	return REFINED.get(kind,"res://assets/models/authored/"+kind+".glb")
