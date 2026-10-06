class_name MMFPlayer
extends CharacterBody3D

var game
var visual: Node3D
var animator: AnimationPlayer
var camera: Camera3D
var pivot: Node3D
var arm: SpringArm3D
var yaw = 0.0
var pitch = -0.08
var shoulder = 1.0
var aiming = false
var crouched = false
var reload_left = 0.0
var fire_left = 0.0
var hit_grace = 0.0
var death_left = 0.0
var weapon_socket: Node3D
var held: Node3D
var animation = ""
var rifle_mesh: Node3D
var shotgun_mesh: Node3D
var forced_motion = false
var meshes: Array = []
var camera_shoulder = 0.0
var camera_distance = 4.0
var camera_fade = 0.0
var animation_speed = 1.0
var burst_left=0
var burst_recovery=0.0
var pose_modifier: MMFPlayerPose
var weapon_pose: MMFWeaponPose
var locomotion: MMFPlayerLocomotion
var recoil=0.0
var equipment: MMFEquipment
var capsule_shape: CapsuleShape3D
var boundary: MMFGroundBoundary
var dead=false
var suppress_fire=false
var restore_placement_frames=0
var aim_yaw=0.0
var pending_shot=false
var queued_click=false
var combat_hold=0.0

func setup(owner_game):
	game = owner_game
	name = "S07"
	collision_layer = 2
	collision_mask = 1
	floor_snap_length = 0.4
	floor_max_angle = deg_to_rad(50)
	safe_margin = 0.02
	var capsule = CollisionShape3D.new()
	var shape = CapsuleShape3D.new()
	shape.radius = 0.34
	shape.height = 1.92
	capsule_shape=shape
	boundary=MMFGroundBoundary.new(self)
	capsule.shape = shape
	capsule.position.y = 0.96
	add_child(capsule)
	visual = MMFAssets.scene(MMFEnemyModels.PLAYER)
	var bounds = MMFAssets.bounds(visual)
	var fit = 1.92 / maxf(visual.get_meta("original_fit_height",bounds.size.y), 0.01)
	visual.scale *= fit
	visual.position.y = -bounds.position.y * fit
	add_child(visual)
	visual.process_mode=Node.PROCESS_MODE_ALWAYS
	visual.rotation.y=PI
	var animations = MMFAssets.of_type(visual, "AnimationPlayer")
	if not animations.is_empty(): animator = animations[0]
	if animator:
		for key in animator.get_animation_list():
			if "reload" not in key and "jump" not in key:
				animator.get_animation(key).loop_mode = Animation.LOOP_LINEAR
	locomotion=MMFPlayerLocomotion.new();locomotion.setup(self)
	play("armed_idle")
	var skeletons = MMFAssets.of_type(visual, "Skeleton3D")
	if not skeletons.is_empty():
		var skeleton: Skeleton3D = skeletons[0]
		pose_modifier=MMFPlayerPose.new();pose_modifier.player=self;skeleton.add_child(pose_modifier)
		var attachment = BoneAttachment3D.new()
		attachment.bone_name = "hand_r"
		for candidate in ["WeaponSocket", "hand_r", "Hand.R"]:
			if skeleton.find_bone(candidate) >= 0:
				attachment.bone_name = candidate
				break
		skeleton.add_child(attachment)
		weapon_socket = attachment
	else:
		weapon_socket = Node3D.new()
		visual.add_child(weapon_socket)
		weapon_socket.position = Vector3(0.32, 1.2, 0.4) / fit
	rifle_mesh = MMFAssets.scene("res://art/native-rifle.glb")
	shotgun_mesh = MMFAssets.scene("res://art/native-shotgun.glb")
	for model in [rifle_mesh,shotgun_mesh]:
		# Native Blender exports are already metres, +Z bore, with a grip origin.
		model.scale /= fit
		model.position.x = -0.05 / fit
		weapon_socket.add_child(model)
	shotgun_mesh.visible = false
	var authored_socket=MMFAssets.find_named(visual,"WeaponSocket")
	if authored_socket:
		rifle_mesh.reparent(authored_socket,false)
		shotgun_mesh.reparent(authored_socket,false)
		weapon_socket=authored_socket
	equipment=MMFEquipment.new();add_child(equipment);equipment.setup(self)
	weapon_pose=MMFWeaponPose.new();weapon_pose.setup(self)
	register_camera_visual(visual)
	pivot = Node3D.new()
	game.add_child(pivot)
	arm = SpringArm3D.new()
	arm.spring_length = 4.0
	arm.margin = 0.18
	arm.collision_mask = 1 | MMFMachineCanopy.CAMERA_LAYER
	var sphere = SphereShape3D.new()
	sphere.radius = 0.22
	arm.shape = sphere
	arm.add_excluded_object(get_rid())
	pivot.add_child(arm)
	camera = Camera3D.new()
	camera.fov = 55
	camera.near = 0.08
	camera.far = 1800
	camera.current = true
	arm.add_child(camera)
	position = Vector3(0, 16.1, -1)

func _unhandled_input(event):
	if game == null or game.menu_open or game.cinematic != "" or game.session.health<=0: return
	if equipment and equipment.has_method("terminal_presenting") and equipment.terminal_presenting():return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * 0.0022 * game.settings.sensitivity
		pitch = clampf(pitch - event.relative.y * 0.0022 * game.settings.sensitivity, deg_to_rad(-70), deg_to_rad(75))
	if event.is_action_pressed("shoulder") and game.building.selected == "": shoulder *= -1
	if event.is_action_pressed("reload"): reload_weapon()
	if event.is_action_pressed("rifle"): switch_weapon("rifle")
	if event.is_action_pressed("shotgun"): switch_weapon("shotgun")
	if event.is_action_pressed("fire") and game.building.selected=="" and game.manual_turret=="" and not suppress_fire:
		queued_click=true;pending_shot=true;combat_hold=.35

func switch_weapon(id: String,preserve_tool: bool=false):
	if game.building.salvage_tool and not preserve_tool:game.building.salvage_tool.set_equipped(false)
	game.session.current_weapon = id
	cancel_reload()
	rifle_mesh.visible = id == "rifle"
	shotgun_mesh.visible = id == "shotgun"
	if equipment:equipment.refresh_attachment()
	animation = ""

func cancel_reload():
	reload_left = 0
	burst_left=0
	burst_recovery=0
	pending_shot=false;queued_click=false
	animation = ""

func play(wanted: String, one_shot: bool = false):
	if not animator: return
	if locomotion:locomotion.release()
	var found = ""
	for key in animator.get_animation_list():
		if String(key).get_file() == wanted or String(key) == wanted:
			found = key
			break
	if found == "": return
	if animation == found and animator.is_playing() and not one_shot: return
	animation = found
	animator.play(found, 0.14)

func _process(dt):
	if locomotion:
		locomotion.render(Engine.get_physics_interpolation_fraction() if is_physics_interpolated_and_enabled() else 1.0,dt)

func _physics_process(dt):
	if game == null:return
	if game.cinematic != "" or forced_motion:
		pending_shot=false;queued_click=false;combat_hold=0;aim_yaw=0
		if locomotion and locomotion.active:play("armed_idle")
		return
	# Wait for rebuilt colliders and queued old bodies to reach the physics world.
	if restore_placement_frames>0:
		restore_placement_frames-=1
		if restore_placement_frames==0 and not boundary.fits(position):
			teleport(boundary.safe_position())
		return
	var state = game.session
	hit_grace = maxf(0, hit_grace-dt)
	fire_left = maxf(0, fire_left-dt)
	burst_recovery=maxf(0,burst_recovery-dt)
	combat_hold=maxf(0,combat_hold-dt)
	if state.health <= 0:
		if not dead: die()
		death_left += dt
		if death_left >= 3:
			state.health = 100
			death_left = 0
			dead=false
			hit_grace = 2
			teleport(boundary.safe_position())
			game.session.notify("Back aboard. Keep the Nomad moving.")
		return
	if game.menu_open:
		pending_shot=false;queued_click=false;aim_yaw=0
		# An unpaused panel away from the machine must not suspend gravity.
		velocity.x=0;velocity.z=0;velocity.y-=22*dt
		move_and_slide();boundary.observe();update_camera(dt)
		return
	if game.manual_turret!="":
		pending_shot=false;queued_click=false;aim_yaw=0
		if locomotion and locomotion.active:play("armed_idle")
		game.update_manual_turret(dt)
		return
	if reload_left > 0:
		reload_left = maxf(0, reload_left-dt)
		if reload_left == 0:
			var gun = state.weapons[state.current_weapon]
			gun.ammoInMag = game.weapon_definition().magazineSize + gun.magazineBonus
			animation = ""
			game.audio.play_sound("reload-done")
	var input = Input.get_vector("left", "right", "forward", "back")
	crouched = Input.is_action_pressed("crouch")
	aiming = Input.is_action_pressed("aim") and game.building.selected == ""
	var terminal_busy=equipment and equipment.has_method("terminal_presenting") and equipment.terminal_presenting()
	var tool_busy=game.building.salvage_tool and game.building.salvage_tool.equipped()
	var trigger=not terminal_busy and not tool_busy and not suppress_fire and game.building.selected=="" and Input.mouse_mode==Input.MOUSE_MODE_CAPTURED and (Input.is_action_pressed("fire") or burst_left>0)
	pending_shot=queued_click or trigger
	if trigger:combat_hold=.35
	if terminal_busy or tool_busy or game.building.selected!="":pending_shot=false;queued_click=false;combat_hold=0
	var run = Input.is_action_pressed("sprint") and not crouched and input.y<0
	var move_speed = 2.2 if crouched else (7.5 if run else 4.5)
	var direction = Basis(Vector3.UP, yaw) * Vector3(input.x, 0, input.y)
	var before_motion=position
	var was_grounded=is_on_floor()
	velocity.x = direction.x * move_speed
	velocity.z = direction.z * move_speed
	if not is_on_floor(): velocity.y -= 22*dt
	else:
		velocity.y = -0.1
		if Input.is_action_just_pressed("jump"): velocity.y = sqrt(2*22*1.1)
	# Step-up is bounded to the same 45 cm curb used by the reference controller.
	if is_on_floor() and velocity.y<=0 and direction.length_squared() > 0.01:
		try_step_up(direction * move_speed * dt)
	var impact_speed=maxf(0,-velocity.y)
	move_and_slide()
	boundary.observe()
	var tool_working=tool_busy and game.building.salvage_tool.working()
	var hook_working=equipment and equipment.salvage_gesture()
	if input.length() > 0.05 or aiming or pending_shot or combat_hold>0 or tool_working or hook_working:
		visual.rotation.y = lerp_angle(visual.rotation.y, yaw+PI, 1-exp(-14*dt))
	aim_yaw=clampf(wrapf(yaw+PI-visual.rotation.y,-PI,PI),-deg_to_rad(35),deg_to_rad(35)) if aiming or pending_shot or combat_hold>0 else 0.0
	if not is_on_floor():play("armed_jump")
	else:
		var actual_motion=(position-before_motion)/maxf(dt,.001)
		actual_motion.y=0
		# Recovery/relocation cannot be mistaken for a giant footstep.
		if actual_motion.length()>move_speed*2:actual_motion=Vector3.ZERO;impact_speed=0
		locomotion.land(impact_speed if not was_grounded else 0.0)
		locomotion.update(dt,actual_motion)
	if not Input.is_action_pressed("fire"): suppress_fire=false
	update_camera(dt)
	if pending_shot and not terminal_busy and not suppress_fire and game.building.selected=="" and Input.mouse_mode==Input.MOUSE_MODE_CAPTURED:fire()
	if pose_modifier: pose_modifier.sample_feet()
	recoil=lerpf(recoil,0,1-exp(-12*dt))
	# The hold solver moves both arms with presentation recoil, preserving grip.

func try_step_up(motion: Vector3):
	if not test_move(global_transform,motion):return
	# The capsule touches a stair landing before its centre reaches the edge.
	# Probe its leading footprint, then sweep the entire capsule through the lift
	# and the actual frame's motion; a clear ray alone cannot establish headroom.
	var ahead=global_position+motion+motion.normalized()*capsule_shape.radius
	var support=game.raycast(ahead+Vector3.UP*.44,ahead-Vector3.UP*.08,[get_rid()])
	if support.is_empty() or support.normal.y<cos(floor_max_angle):return
	var rise=support.position.y+.025-global_position.y
	if rise<=.001 or rise>.44:return
	var lift=Vector3.UP*rise
	if test_move(global_transform,lift):return
	var raised=global_transform;raised.origin+=lift
	if test_move(raised,motion):return
	global_position+=lift

func update_camera(dt: float):
	if equipment and equipment.has_method("terminal_presenting") and equipment.terminal_presenting():return
	var desired = position + Vector3(0, 1.5 if not crouched else 1.1, 0)
	pivot.position = desired
	pivot.rotation = Vector3(pitch, yaw, 0)
	camera_shoulder = lerpf(camera_shoulder, shoulder*(0.45 if aiming else 0.55), 1-exp(-12*dt))
	camera_distance = lerpf(camera_distance, 2.3 if aiming else 4.0, 1-exp(-10*dt))
	# Sweep from the player's eye, not from an offset that may be inside a wall.
	# A shortened diagonal boom retracts its shoulder offset too. Counter-rotate
	# the camera so aiming and the unobstructed view retain their original basis.
	arm.rotation.y = atan2(camera_shoulder, camera_distance)
	arm.spring_length = Vector2(camera_shoulder, camera_distance).length()
	camera.rotation.y = -arm.rotation.y
	camera.fov = lerpf(camera.fov, game.settings.fov*38.0/55 if aiming else game.settings.fov, 1-exp(-12*dt))
	var close = camera.global_position.distance_to(pivot.global_position)
	set_camera_fade(clampf((1.35-close)/0.75, 0, 1))

func register_camera_visual(model: Node):
	for mesh in MMFAssets.of_type(model, "MeshInstance3D"):
		if mesh not in meshes:
			meshes.append(mesh)
			mesh.transparency = camera_fade

func unregister_camera_visual(model: Node):
	for mesh in MMFAssets.of_type(model, "MeshInstance3D"): meshes.erase(mesh)

func set_camera_fade(value: float):
	# Most frames are fully opaque: avoid redundant render-server property writes.
	if is_equal_approx(camera_fade, value): return
	camera_fade = value
	for mesh in meshes: mesh.transparency = value

func fire():
	if game.menu_open or game.cinematic!="" or forced_motion or game.manual_turret!="" or game.session.health<=0:return
	if equipment and equipment.has_method("terminal_presenting") and equipment.terminal_presenting():return
	if game.building.salvage_tool and game.building.salvage_tool.equipped():return
	if fire_left > 0 or reload_left > 0 or burst_recovery>0:return
	combat_hold=.35
	if not weapon_pose.can_fire():pending_shot=true;return
	pending_shot=false;queued_click=false
	var gun = game.session.weapons[game.session.current_weapon]
	if gun.ammoInMag <= 0:
		reload_weapon()
		return
	var def = game.weapon_definition()
	gun.ammoInMag -= 1
	recoil=minf(0.08,recoil+0.035)
	if gun.get("attachment","")=="rifle-burst-cam":
		if burst_left<=0: burst_left=3
		burst_left-=1
		if burst_left==0: burst_recovery=0.5
	fire_left = 1.0 / def.fireRate
	var forward = -camera.global_basis.z
	equipment.refresh_attachment()
	var muzzle = weapon_pose.resolved_muzzle
	var impact_summary={}
	for i in int(def.pellets):
		var spread = deg_to_rad(def.aimSpread if aiming else def.spread)
		var angle = game.session.rng.randf()*TAU
		var radius = sqrt(game.session.rng.randf())*spread
		var dir = (forward + camera.global_basis.x*(cos(angle)*radius) + camera.global_basis.y*(sin(angle)*radius)).normalized()
		var path=MMFOwnedShot.trace(game,muzzle,camera.global_position,dir,def.range,[get_rid()],weapon_pose.resolved_origin)
		var hit=path.hit
		if not hit.is_empty():
			var impact=MMFOwnedShot.resolve(hit,def.damage,path.distance,def.range,def.falloffStart,"player_weapon")
			MMFCombatFeedback.present(game,impact)
			impact_summary=MMFCombatFeedback.summarize(impact_summary,impact)
		game.effects.tracer(path.origin,path.end,Color(1,0.65,0.18))
	MMFCombatFeedback.confirm(game,impact_summary)
	game.record_event("combat","player_shot",{"weapon":game.session.current_weapon,"damaging_hit":not impact_summary.is_empty()})
	pitch = minf(deg_to_rad(75), pitch+deg_to_rad(def.recoil))
	game.audio.shot(game.session.current_weapon == "shotgun")

func reload_weapon():
	if game.building.salvage_tool and game.building.salvage_tool.equipped():return
	if reload_left > 0 or game.building.selected != "": return
	var gun = game.session.weapons[game.session.current_weapon]
	var def = game.weapon_definition()
	if gun.ammoInMag >= def.magazineSize+gun.magazineBonus: return
	reload_left = def.reloadTime
	burst_left=0;pending_shot=false;queued_click=false
	if pose_modifier and animator:
		for key in animator.get_animation_list():
			if String(key).get_file()=="reload_"+game.session.current_weapon: pose_modifier.begin_reload(animator.get_animation(key))
	game.audio.play_sound("reload-start")

func take_damage(amount: float, _point: Vector3 = Vector3.ZERO):
	if hit_grace > 0 or game.invulnerable or game.cinematic != "" or game.session.health<=0: return
	game.session.health = maxf(0, game.session.health-amount)
	game.session.attack_recent = 5
	if game.menu_open: game.close_menu()
	game.building.cancel()
	game.effects.hit_flash()
	if game.session.health<=0: die()

func die():
	game.building.clear_history("Recovery")
	dead=true;death_left=0;velocity=Vector3.ZERO
	if locomotion and locomotion.active:play("armed_idle")
	reload_left=0;burst_left=0;fire_left=0;pending_shot=false;queued_click=false;combat_hold=0;aim_yaw=0
	game.building.cancel();game.salvage.cancel();game.dismount_turret()
	game.home.chair_id=""
	if game.menu_open: game.close_menu()
	game.session.notify("S-07 down. Recovering aboard in 3 seconds…")

func teleport(at: Vector3):
	position=at;velocity=Vector3.ZERO
	if locomotion:locomotion.reset_interpolation();locomotion.reset_weight()
	reset_physics_interpolation()
	update_camera(1)
	pivot.reset_physics_interpolation()
	arm.reset_physics_interpolation()
	camera.reset_physics_interpolation()
