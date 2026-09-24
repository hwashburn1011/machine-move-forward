class_name MMFEquipment
extends Node

var player
var wrist: Node3D
var canister: Node3D
var attachment: Node3D
var attachment_id=""
var refuel_left=0.0

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
	var terminal=part("res://art/story-instruments.glb","WristHousing")
	var b=MMFAssets.bounds(terminal)
	terminal.scale*=minf(0.15/maxf(b.size.x,b.size.z),0.22/b.size.y)
	wrist=mount(skeletons[0],"lowerarm_l",terminal,Vector3(0,-0.015,0.035))
	var fuel=MMFAssets.scene("models/authored/fuel-canister.glb")
	b=MMFAssets.bounds(fuel);fuel.scale*=0.28/maxf(b.size.x,maxf(b.size.y,b.size.z))
	canister=mount(skeletons[0],"hand_l",fuel,Vector3(0,-0.02,0.03));canister.hide();wrist.hide()

func refuel(): refuel_left=1.8

func _process(dt: float):
	if not player or not player.game.ui: return
	var game=player.game
	if game.session.health<=0 or (not game.menu_open and (Input.is_action_pressed("aim") or Input.is_action_pressed("fire"))): refuel_left=0
	var terminal_open=game.menu_open and game.ui.page not in ["Title","Pause","Settings","Library"]
	if wrist: wrist.visible=terminal_open
	refuel_left=maxf(0,refuel_left-dt)
	if canister:
		canister.visible=refuel_left>0
		var gesture=sin((1-refuel_left/1.8)*PI)
		canister.rotation.z=-0.85*gesture;canister.position.y=-0.02+0.025*gesture
	player.rifle_mesh.visible=not terminal_open and refuel_left<=0 and game.session.current_weapon=="rifle"
	player.shotgun_mesh.visible=not terminal_open and refuel_left<=0 and game.session.current_weapon=="shotgun"
	var id=game.session.weapons[game.session.current_weapon].get("attachment","")
	if id==attachment_id: return
	attachment_id=id
	if attachment:
		player.unregister_camera_visual(attachment)
		attachment.queue_free();attachment=null
	if id=="": return
	var names={"rifle-stabilizer":"RifleStabilizer","rifle-burst-cam":"RifleBurstCam","shotgun-choke":"ShotgunChoke","shotgun-scatter-brake":"ShotgunScatterBrake"}
	if not names.has(id): return
	attachment=part("models/authored/fieldwork-kit.glb",names[id])
	player.weapon_socket.add_child(attachment)
	attachment.position=Vector3(0.125,0,0.12) if id=="rifle-burst-cam" else Vector3(0,0,0.735)
	attachment.rotation.y=PI
	attachment.scale/=maxf(player.visual.scale.x,0.01)
	player.register_camera_visual(attachment)
