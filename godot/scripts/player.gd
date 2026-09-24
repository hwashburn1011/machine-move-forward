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
	visual = MMFAssets.scene("models/authored/s07-player.glb")
	var bounds = MMFAssets.bounds(visual)
	var fit = 1.92 / maxf(bounds.size.y, 0.01)
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
	arm.collision_mask = 1
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
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * 0.0022 * game.settings.sensitivity
		pitch = clampf(pitch - event.relative.y * 0.0022 * game.settings.sensitivity, deg_to_rad(-70), deg_to_rad(75))
	if event.is_action_pressed("shoulder") and game.building.selected == "": shoulder *= -1
	if event.is_action_pressed("reload"): reload_weapon()
	if event.is_action_pressed("rifle"): switch_weapon("rifle")
	if event.is_action_pressed("shotgun"): switch_weapon("shotgun")

func switch_weapon(id: String):
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
		# An unpaused panel away from the machine must not suspend gravity.
		velocity.x=0;velocity.z=0;velocity.y-=22*dt
		move_and_slide();boundary.observe();update_camera(dt)
		return
	if game.manual_turret!="":
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
	var run = Input.is_action_pressed("sprint") and not crouched and input.y<0 and state.hydration>0
	var move_speed = 2.2 if crouched else (7.5 if run else 4.5)
	var direction = Basis(Vector3.UP, yaw) * Vector3(input.x, 0, input.y)
	var before_motion=position
	velocity.x = direction.x * move_speed
	velocity.z = direction.z * move_speed
	if not is_on_floor(): velocity.y -= 22*dt
	else:
		velocity.y = -0.1
		if Input.is_action_just_pressed("jump"): velocity.y = sqrt(2*22*1.1)
	# Step-up is bounded to the same 45 cm curb used by the reference controller.
	if is_on_floor() and direction.length_squared() > 0.01:
		var motion = direction * move_speed * dt
		if test_move(global_transform, motion):
			var raised = global_transform
			raised.origin.y += 0.44
			if not test_move(raised, motion):
				var ray = game.raycast(raised.origin + motion, raised.origin + motion - Vector3.UP*0.52, [get_rid()])
				if not ray.is_empty() and ray.normal.y > 0.65: position.y = ray.position.y + 0.025
	move_and_slide()
	boundary.observe()
	if input.length() > 0.05 or aiming:
		visual.rotation.y = lerp_angle(visual.rotation.y, yaw+PI, 1-exp(-14*dt))
	if not is_on_floor():play("armed_jump")
	else:
		var actual_motion=(position-before_motion)/maxf(dt,.001)
		actual_motion.y=0
		# Recovery/relocation cannot be mistaken for a giant footstep.
		if actual_motion.length()>move_speed*2:actual_motion=Vector3.ZERO
		locomotion.update(dt,actual_motion)
	if not Input.is_action_pressed("fire"): suppress_fire=false
	if not suppress_fire and (Input.is_action_pressed("fire") or burst_left>0) and game.building.selected == "" and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED: fire()
	update_camera(dt)
	if pose_modifier: pose_modifier.sample_feet()
	recoil=lerpf(recoil,0,1-exp(-12*dt))
	# The hold solver moves both arms with presentation recoil, preserving grip.

func update_camera(dt: float):
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
	if fire_left > 0 or reload_left > 0 or burst_recovery>0 or game.session.health <= 0: return
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
	var muzzle = weapon_pose.muzzle_position()
	for i in int(def.pellets):
		var spread = deg_to_rad(def.aimSpread if aiming else def.spread)
		var angle = game.session.rng.randf()*TAU
		var radius = sqrt(game.session.rng.randf())*spread
		var dir = (forward + camera.global_basis.x*(cos(angle)*radius) + camera.global_basis.y*(sin(angle)*radius)).normalized()
		var hit = game.raycast(camera.global_position, camera.global_position + dir*def.range, [get_rid()], 5)
		var end = camera.global_position+dir*def.range if hit.is_empty() else hit.position
		if not hit.is_empty():
			var distance_hit = camera.global_position.distance_to(hit.position)
			if hit.collider.has_method("take_weapon_damage"): hit.collider.take_weapon_damage(def.damage,hit.position,distance_hit,def.range,def.falloffStart)
			elif hit.collider.has_method("take_damage"): hit.collider.take_damage(MMFDamage.compute(def.damage,distance_hit,def.range,def.falloffStart),hit.position)
			game.effects.impact(hit.position, hit.normal)
		game.effects.tracer(muzzle, end, Color(1,0.65,0.18))
	pitch = minf(deg_to_rad(75), pitch+deg_to_rad(def.recoil))
	game.audio.shot(game.session.current_weapon == "shotgun")

func reload_weapon():
	if reload_left > 0 or game.building.selected != "": return
	var gun = game.session.weapons[game.session.current_weapon]
	var def = game.weapon_definition()
	if gun.ammoInMag >= def.magazineSize+gun.magazineBonus: return
	reload_left = def.reloadTime
	burst_left=0
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
	dead=true;death_left=0;velocity=Vector3.ZERO
	if locomotion and locomotion.active:play("armed_idle")
	reload_left=0;burst_left=0;fire_left=0
	game.building.cancel();game.salvage.cancel();game.dismount_turret()
	game.home.chair_id=""
	if game.menu_open: game.close_menu()
	game.session.notify("S-07 down. Recovering aboard in 3 seconds…")

func teleport(at: Vector3):
	position=at;velocity=Vector3.ZERO
	if locomotion:locomotion.reset_interpolation()
	reset_physics_interpolation()
	update_camera(1)
	pivot.reset_physics_interpolation()
	arm.reset_physics_interpolation()
	camera.reset_physics_interpolation()
