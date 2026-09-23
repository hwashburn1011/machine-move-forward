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
var animation_speed = 1.0
var burst_left=0
var burst_recovery=0.0
var pose_modifier: MMFPlayerPose
var recoil=0.0
var equipment: MMFEquipment

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
	meshes = MMFAssets.of_type(visual, "MeshInstance3D")
	if animator:
		for key in animator.get_animation_list():
			if "reload" not in key and "jump" not in key:
				animator.get_animation(key).loop_mode = Animation.LOOP_LINEAR
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
	rifle_mesh = MMFAssets.scene("models/authored/scrap-rifle.glb")
	shotgun_mesh = MMFAssets.scene("models/authored/scrap-shotgun.glb")
	for pair in [[rifle_mesh, 0.88], [shotgun_mesh, 0.95]]:
		var model: Node3D = pair[0]
		var b = MMFAssets.bounds(model)
		var long_axis=b.size.max_axis_index()
		var thin_axis=0 if long_axis!=0 else 1
		for axis in 3:
			if axis!=long_axis and b.size[axis]<b.size[thin_axis]: thin_axis=axis
		var barrel=Vector3.ZERO;barrel[long_axis]=1 if absf(b.end[long_axis])>=absf(b.position[long_axis]) else -1
		var lateral=Vector3.ZERO;lateral[thin_axis]=1
		model.basis=Basis(lateral,barrel.cross(lateral),barrel).transposed()
		model.scale *= float(pair[1]) / maxf(b.size[long_axis], 0.01) / fit
		model.position.x = -0.05 / fit
		weapon_socket.add_child(model)
	shotgun_mesh.visible = false
	var authored_socket=MMFAssets.find_named(visual,"WeaponSocket")
	if authored_socket:
		rifle_mesh.reparent(authored_socket,false)
		shotgun_mesh.reparent(authored_socket,false)
		weapon_socket=authored_socket
	equipment=MMFEquipment.new();add_child(equipment);equipment.setup(self)
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
	if game == null or game.menu_open or game.cinematic != "": return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * 0.0022 * game.settings.sensitivity
		pitch = clampf(pitch - event.relative.y * 0.0022 * game.settings.sensitivity, deg_to_rad(-70), deg_to_rad(75))
	if event.is_action_pressed("shoulder") and game.building.selected == "": shoulder *= -1
	if event.is_action_pressed("reload"): reload_weapon()
	if event.is_action_pressed("rifle"): switch_weapon("rifle")
	if event.is_action_pressed("shotgun"): switch_weapon("shotgun")

func switch_weapon(id: String):
	game.session.current_weapon = id
	reload_left = 0
	burst_left=0
	rifle_mesh.visible = id == "rifle"
	shotgun_mesh.visible = id == "shotgun"
	animation = ""

func play(wanted: String, one_shot: bool = false):
	if not animator: return
	var found = ""
	for key in animator.get_animation_list():
		if String(key).get_file() == wanted or String(key) == wanted:
			found = key
			break
	if found == "": return
	if animation == found and animator.is_playing() and not one_shot: return
	animation = found
	animator.play(found, 0.14)

func _physics_process(dt):
	if game == null or game.menu_open or game.cinematic != "" or forced_motion: return
	if game.manual_turret!="":
		game.update_manual_turret(dt)
		return
	var state = game.session
	hit_grace = maxf(0, hit_grace-dt)
	fire_left = maxf(0, fire_left-dt)
	burst_recovery=maxf(0,burst_recovery-dt)
	if state.health <= 0:
		death_left += dt
		if death_left >= 3:
			state.health = 100
			death_left = 0
			hit_grace = 2
			position = Vector3(0, 16.1, -1)
			velocity = Vector3.ZERO
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
	if position.y < 1.0:
		state.health -= 25*dt
		position.z += state.speed*dt
	if position.y < -20: state.health = 0
	if input.length() > 0.05 or aiming:
		visual.rotation.y = lerp_angle(visual.rotation.y, yaw+PI, 1-exp(-14*dt))
	var pose = "armed_"
	if not is_on_floor(): pose += "jump"
	elif input.length() < 0.05: pose += "crouch_idle" if crouched else "idle"
	else:
		pose += "crouch_walk" if crouched else ("run" if run else "walk")
		pose += "_left" if input.x < -0.5 else ("_right" if input.x > 0.5 else ("_back" if input.y > 0 else "_fwd"))
	play(pose)
	if (Input.is_action_pressed("fire") or burst_left>0) and game.building.selected == "" and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED: fire()
	update_camera(dt)
	if pose_modifier: pose_modifier.sample_feet()
	recoil=lerpf(recoil,0,1-exp(-12*dt))
	for model in [rifle_mesh,shotgun_mesh]: model.position.z=-recoil/maxf(visual.scale.x,0.01)

func update_camera(dt: float):
	var desired = position + Vector3(0, 1.5 if not crouched else 1.1, 0)
	pivot.position = desired
	pivot.rotation = Vector3(pitch, yaw, 0)
	arm.position.x = lerpf(arm.position.x, shoulder*(0.45 if aiming else 0.55), 1-exp(-12*dt))
	arm.spring_length = lerpf(arm.spring_length, 2.3 if aiming else 4.0, 1-exp(-10*dt))
	camera.fov = lerpf(camera.fov, game.settings.fov*38.0/55 if aiming else game.settings.fov, 1-exp(-12*dt))
	var close = camera.global_position.distance_to(position+Vector3.UP)
	for mesh in meshes: mesh.transparency = clampf((1.1-close)/0.55, 0, 0.95)

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
	var muzzle = position + Vector3.UP*1.35 + forward*0.6
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
	if hit_grace > 0 or game.invulnerable or game.cinematic != "": return
	game.session.health = maxf(0, game.session.health-amount)
	game.session.attack_recent = 5
	if game.menu_open: game.close_menu()
	game.building.cancel()
	game.effects.hit_flash()
