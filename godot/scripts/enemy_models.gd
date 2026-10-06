class_name MMFEnemyModels
extends RefCounted

const PLAYER="res://art/refined-s07-player.scn"
static var player_plasma: StandardMaterial3D

static func prepare_player(model: Node3D):
	# One shared override for the existing backpack tubes. Keep their authored
	# maps and geometry, but make the pilot glow belong to the dusty palette.
	for mesh in MMFAssets.of_type(model,"MeshInstance3D"):
		for surface in mesh.mesh.get_surface_count():
			var material=mesh.get_active_material(surface)
			if not material is StandardMaterial3D or material.resource_name!="S07_Violet_Plasma":continue
			if not player_plasma:
				player_plasma=material.duplicate()
				player_plasma.albedo_color=Color(.29,.24,.35)
				player_plasma.emission=Color(.24,.19,.30)
				player_plasma.emission_energy_multiplier=.32
			mesh.set_surface_override_material(surface,player_plasma)
const REFINED={
	"bastion":"res://art/refined-bastion.scn","revenant":"res://art/refined-revenant.scn",
	"warden":"res://art/refined-warden.scn","sovereign":"res://art/refined-sovereign.scn",
	"raider":"res://art/refined-raider.scn","scavenger":"res://art/refined-scavenger.scn"}
static func path(kind: String) -> String:
	return REFINED.get(kind,"res://assets/models/authored/"+kind+".glb")
