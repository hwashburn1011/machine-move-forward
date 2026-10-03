class_name MMFGatekeeperPresentation
extends RefCounted

const PATH="res://art/gatekeeper-service-kit.glb"
var combat
var hull_kit: Node3D
var gun_kit: Node3D
var shutters=[]
var needle: Node3D
var last_phase=""
var opening=0.0
var transition_cues=0

func setup(owner_combat):
	clear();combat=owner_combat
	var source=MMFAssets.scene(PATH)
	MMFArt100Materials.prepare(source)
	hull_kit=MMFAssets.find_named(source,"GatekeeperHullDetails")
	gun_kit=MMFAssets.find_named(source,"GatekeeperGunDetails")
	for pair in [[hull_kit,combat.ship],[gun_kit,combat.craft.recoil]]:
		if pair[0]:
			clear_ownership(pair[0])
			pair[0].get_parent().remove_child(pair[0]);pair[1].add_child(pair[0])
	source.free()
	for side in ["Port","Starboard"]:
		var hinge=MMFAssets.find_named(gun_kit,"FireControlShutter"+side)
		if hinge:shutters.append(hinge)
	needle=MMFAssets.find_named(gun_kit,"PressureNeedle")

func clear_ownership(node: Node):
	node.owner=null
	for child in node.get_children():clear_ownership(child)

func sync(dt: float,phase: String,remaining: float,pattern: String,exposed: bool):
	if not is_instance_valid(gun_kit):return
	var live=combat.ship_state not in ["destroying","retreat"] and combat.weapon_health>0 and not combat.tracking_disrupted
	var next_phase=phase if live else "offline"
	if next_phase!=last_phase:
		last_phase=next_phase
		var point=combat.craft.recoil.global_position
		if next_phase=="lock":combat.game.audio.play_at("servo-load",point,.18,.78);transition_cues+=1
		elif next_phase=="cooling":combat.game.audio.play_at("pressure-release",point,.18,.82);transition_cues+=1
	# Opening follows the actual vulnerability flag; no decorative open window
	# suggests bonus damage while the gameplay subsystem is still armored.
	opening=move_toward(opening,1.0 if exposed else 0.0,maxf(0,dt)*5)
	for i in shutters.size():shutters[i].rotation.y=(-1 if i==0 else 1)*opening*deg_to_rad(105)
	if is_instance_valid(needle):
		var pressure=clampf(1.0-remaining/(4.0 if pattern=="cross" else 3.0),0,1) if phase=="lock" else 1.0 if phase=="salvo" else 0.0
		needle.rotation.z=lerp_angle(needle.rotation.z,lerpf(-.9,.9,pressure if live else 0.0),minf(1,dt*5))

func warning(at: Vector3) -> MeshInstance3D:
	var marker=combat.game.effects.warning_ring(at)
	# The visual boundary matches the actual two-metre shell damage radius.
	var radius=marker.mesh.get_aabb().size.x*.5
	if radius>0:marker.scale=Vector3.ONE*(2.0/radius)
	return marker

func clear():
	for root in [hull_kit,gun_kit]:
		if is_instance_valid(root):root.queue_free()
	hull_kit=null;gun_kit=null;needle=null;shutters.clear();last_phase="";opening=0;transition_cues=0
