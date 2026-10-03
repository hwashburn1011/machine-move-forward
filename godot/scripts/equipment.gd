class_name MMFEquipment
extends Node

var player
var wrist: Node3D
var canister: Node3D
var attachment: Node3D
var muzzle: Marker3D
var attachment_id=""
var refuel_left=0.0
var salvage_cutter: Node3D

func part(path: String,node_name: String) -> Node3D:
	var kit=MMFAssets.scene(path);var source=MMFAssets.find_named(kit,node_name)
	var node=source.duplicate() if source else Node3D.new()
	kit.free();return node

func mount(skeleton: Skeleton3D,bone: String,model: Node3D,at: Vector3) -> Node3D:
	var anchor=BoneAttachment3D.new();anchor.bone_name=bone;skeleton.add_child(anchor)
	anchor.add_child(model);model.position=at;return model

func setup(owner_player):
	player=owner_player;process_mode=Node.PROCESS_MODE_ALWAYS
	var skeletons=MMFAssets.of_type(player.visual,"Skeleton3D")
	if skeletons.is_empty(): return
	var terminal=MMFAssets.scene("res://art/wrist-terminal.glb")
	# Close reading retains worn alloy instead of a sharp sun reflection
	# blooming across the first line of the display.
	for mesh in MMFAssets.of_type(terminal,"MeshInstance3D"):
		for surface in mesh.mesh.get_surface_count():
			var material=mesh.mesh.surface_get_material(surface)
			if material is StandardMaterial3D:
				material=material.duplicate();material.roughness=maxf(material.roughness,.72);material.metallic_specular=.15
				mesh.material_override=material
	var fit=maxf(player.visual.scale.x,.01)
	terminal.scale*=.85/fit
	# Keep the glass at the original forearm clearance as the housing shrinks.
	wrist=mount(skeletons[0],"lowerarm_l",terminal,Vector3(.120,.145,0)/fit)
	wrist.rotation=Vector3(0,PI/2,PI/2)
	var fuel=MMFAssets.scene("models/authored/fuel-canister.glb")
	var b=MMFAssets.bounds(fuel);fuel.scale*=0.28/maxf(b.size.x,maxf(b.size.y,b.size.z))
	canister=mount(skeletons[0],"hand_l",fuel,Vector3(0,-0.02,0.03));canister.hide();wrist.hide()

func refuel(): refuel_left=1.8

func terminal_presenting() -> bool:
	return player and player.game.ui and player.game.ui.terminal and player.game.ui.terminal.presenting()

func salvage_selected() -> bool:
	var tool=player.game.building.get("salvage_tool")
	return tool!=null and tool.equipped()

func _process(dt: float):
	if not player or not player.game.ui: return
	var game=player.game
	if game.session.health<=0 or (not game.menu_open and (Input.is_action_pressed("aim") or Input.is_action_pressed("fire"))): refuel_left=0
	var terminal_open=terminal_presenting()
	if wrist: wrist.visible=game.started and game.cinematic==""
	refuel_left=maxf(0,refuel_left-dt)
	if canister:
		canister.visible=refuel_left>0
		var gesture=sin((1-refuel_left/1.8)*PI)
		canister.rotation.z=-0.85*gesture;canister.position.y=-0.02+0.025*gesture
	var tool_selected=salvage_selected()
	if tool_selected and not salvage_cutter and ResourceLoader.exists("res://art/native-salvage-tool.glb"):
		salvage_cutter=MMFAssets.scene("res://art/native-salvage-tool.glb")
		salvage_cutter.scale/=maxf(player.visual.scale.x,.01)
		player.weapon_socket.add_child(salvage_cutter)
		salvage_cutter.rotation.x=PI/2
		player.register_camera_visual(salvage_cutter)
	if salvage_cutter:salvage_cutter.visible=tool_selected and not terminal_open and refuel_left<=0
	player.rifle_mesh.visible=not terminal_open and not tool_selected and refuel_left<=0 and game.session.current_weapon=="rifle"
	player.shotgun_mesh.visible=not terminal_open and not tool_selected and refuel_left<=0 and game.session.current_weapon=="shotgun"
	refresh_attachment()
	if attachment:attachment.visible=not terminal_open and not tool_selected

func refresh_attachment():
	var id=player.game.session.weapons[player.game.session.current_weapon].get("attachment","")
	if id==attachment_id: return
	attachment_id=id
	if attachment:
		player.unregister_camera_visual(attachment)
		attachment.queue_free();attachment=null;muzzle=null
	if id=="": return
	var names={"rifle-stabilizer":"RifleStabilizer","rifle-burst-cam":"RifleBurstCam","shotgun-choke":"ShotgunChoke","shotgun-scatter-brake":"ShotgunScatterBrake"}
	if not names.has(id): return
	attachment=part("models/authored/fieldwork-kit.glb",names[id])
	var anchor=player.weapon_pose.attachment_mount(id=="rifle-burst-cam")
	anchor.add_child(attachment)
	attachment.position=Vector3.ZERO
	if id=="rifle-burst-cam":
		# The selector face sits outboard on the receiver cheek.
		attachment.rotation.z=-PI/2
	else:
		attachment.rotation.y=PI
		# The original fieldwork model's recessed outlet is at local -0.118 m.
		muzzle=Marker3D.new();attachment.add_child(muzzle);muzzle.position=Vector3(0,0,-.119)
	player.register_camera_visual(attachment)
