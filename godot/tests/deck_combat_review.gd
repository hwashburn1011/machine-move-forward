extends "res://tests/beta_combat_review.gd"

# Reuse the real encounter/state fixture while keeping the previous iteration's
# captures immutable. The retired ship banner must never be forced back on by
# the review camera: presentation follows the current in-game policy.
func _initialize():
	output="res://../test-results/deck-audio/combat-native/"
	super._initialize()
	MMFSaves.DIRECTORY="user://deck-audio-combat-review/"

func shot(id: String,eye: Vector3,at: Vector3,metadata: Dictionary={},hud=false):
	if not selected.is_empty() and id not in selected:return
	game.ui.root.visible=hud;camera.global_position=eye;camera.look_at(at);camera.make_current();camera.reset_physics_interpolation()
	if is_instance_valid(game.combat.ship_marker):game.combat.ship_marker.hide()
	await frames(10);await RenderingServer.frame_post_draw
	var path=output+id+".png";root.get_texture().get_image().save_png(path)
	captures.append({"id":id,"path":path,"eye":MMFAssets.dict_v(eye),"target":MMFAssets.dict_v(at),"state":metadata})
	print("DECK_COMBAT_CAPTURE ",id)
