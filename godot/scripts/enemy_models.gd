class_name MMFEnemyModels
extends RefCounted

const REFINED={"raider":"res://art/legacy-raider.scn","scavenger":"res://art/legacy-scavenger.scn"}
static func path(kind: String) -> String:
	return REFINED.get(kind,"res://assets/models/authored/"+kind+".glb")
