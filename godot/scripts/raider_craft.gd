class_name MMFRaiderCraft
extends RefCounted

const KIT=preload("res://art/interception-craft.glb")
var combat
var ship: Node3D
var yaw: Node3D
var pitch: Node3D
var recoil: Node3D
var muzzle: Node3D
var recoil_left=0.0
var weapon_lenses=[]
var engine_lenses=[]
var state=-1
var debris=[]
var destruction_burst=0.0
var engine_voice: AudioStreamPlayer3D

static func model(kind: String) -> Node3D:
	var kit=KIT.instantiate();var node=MMFAssets.find_named(kit,"RaiderGunboat" if kind=="gunboat" else "RaiderSkiff")
	node.get_parent().remove_child(node);kit.free();return node

func setup(owner_combat):
	combat=owner_combat;ship=combat.ship;state=-1;recoil_left=0
	var prefix="Gunboat" if combat.ship_kind=="gunboat" else "Skiff"
	yaw=MMFAssets.find_named(ship,prefix+"GunYaw");pitch=MMFAssets.find_named(ship,prefix+"GunPitch")
	recoil=MMFAssets.find_named(ship,prefix+"Recoil");muzzle=MMFAssets.find_named(ship,prefix+"Muzzle")
	weapon_lenses=local_lenses(recoil);engine_lenses=local_lenses(MMFAssets.find_named(ship,"EngineStateLamp"));refresh_state()
	engine_voice=AudioStreamPlayer3D.new();engine_voice.name="CarrierEngine";ship.add_child(engine_voice)
	var stream=load("res://assets/audio/machine-loop.wav").duplicate()
	stream.loop_mode=AudioStreamWAV.LOOP_FORWARD;stream.loop_begin=0;stream.loop_end=stream.data.size()/2
	engine_voice.stream=stream;engine_voice.max_distance=140;engine_voice.unit_size=12;engine_voice.max_db=-12;engine_voice.pitch_scale=1.45 if combat.ship_kind=="skiff" else .78
	engine_voice.volume_linear=0 if combat.game.audio.muted else combat.game.audio.volume*.3;engine_voice.play()

func local_lenses(parent: Node) -> Array:
	var materials=[]
	if not parent:return materials
	for mesh in MMFAssets.of_type(parent,"MeshInstance3D"):
		for i in mesh.mesh.get_surface_count():
			var source=mesh.mesh.surface_get_material(i)
			if source.resource_name=="Raider targeting lens":
				var mat=source.duplicate();mat.set_meta("lit_color",mat.albedo_color);mesh.set_surface_override_material(i,mat);materials.append(mat)
	return materials

func refresh_state():
	if not combat or not is_instance_valid(ship):return
	var now=int(combat.weapon_health>0)|int(combat.engine_health>0)<<1|int(combat.ship_state not in ["retreat","destroying"])<<2|int(recoil_left>0)<<3
	if state==now:return
	state=now
	for mat in weapon_lenses:
		mat.emission_energy_multiplier=(2.5 if now&8 else .65) if now&1 and now&4 else 0
		mat.albedo_color=mat.get_meta("lit_color") if now&1 and now&4 else Color(.038,.012,.008)
	for mat in engine_lenses:
		mat.emission_energy_multiplier=.65 if now&2 and now&4 else 0
		mat.albedo_color=mat.get_meta("lit_color") if now&2 and now&4 else Color(.038,.012,.008)

func update(dt: float):
	if not is_instance_valid(ship) or not yaw:return
	if is_instance_valid(engine_voice):
		engine_voice.volume_linear=0 if combat.game.audio.muted or combat.engine_health<=0 else combat.game.audio.volume*.3
		engine_voice.stream_paused=combat.game.audio.paused_for_sound()
	if combat.ship_state in ["attack","grapple"] and combat.weapon_health>0:
		var aim=combat.guardian.committed_target if combat.guardian.enabled and combat.guardian.phase=="salvo" else combat.game.player.global_position+Vector3.UP
		var target=ship.to_local(aim)
		var pivot=ship.to_local(pitch.global_position);var delta=target-pivot
		var turn=atan2(-delta.x,-delta.z);var elevation=clampf(atan2(delta.y,Vector2(delta.x,delta.z).length()),deg_to_rad(-12),deg_to_rad(72))
		yaw.rotation.y=rotate_toward(yaw.rotation.y,turn,dt*3.2)
		pitch.rotation.x=rotate_toward(pitch.rotation.x,elevation,dt*2.4)
	if recoil_left>0:
		recoil_left=maxf(0,recoil_left-dt);recoil.position.z=.07*pow(recoil_left/.16,2)
	refresh_state()

func shot_origin() -> Vector3:
	return muzzle.global_position if is_instance_valid(muzzle) else combat.ship.position+Vector3(0,3.6,-3.5)

func fire():
	if not is_instance_valid(ship) or combat.weapon_health<=0:return
	recoil_left=.16;recoil.position.z=.07;refresh_state()
	combat.game.effects.particle(shot_origin(),Vector3.ZERO,Color(1,.55,.16),.085,.055)

func begin_destruction():
	clear_debris();destruction_burst=0
	if is_instance_valid(engine_voice):engine_voice.stop();engine_voice.stream=null
	combat.game.effects.burning(ship,Vector3(0,1.4,1))
	var material=MMFAssets.material(Color(.11,.13,.13));material.metallic=.8;material.roughness=.65
	for i in 8:
		var fragment=MeshInstance3D.new();var mesh=BoxMesh.new();mesh.size=Vector3(.3+(i%3)*.13,.09,.4+(i%2)*.3);mesh.material=material
		fragment.mesh=mesh;combat.add_child(fragment);fragment.position=ship.position+Vector3((i%2)*2-1,1.3,(i/2.0)-1.5)
		debris.append({"node":fragment,"velocity":Vector3((i%2)*7-3.5,4+i*.25,(i%3)*3-3),"spin":Vector3(i*.2+.5,.8,.6)})

func update_destruction(dt: float,elapsed: float):
	ship.position.y-=dt*(1+elapsed*1.6);ship.rotation.z+=combat.ship_side*dt*.35;ship.rotation.x+=dt*.15
	destruction_burst-=dt
	if destruction_burst<=0 and elapsed<2.5:
		destruction_burst=.55;combat.game.effects.explosion(ship.position+Vector3(sin(elapsed*6),1,cos(elapsed*5)*2),.7)
	if elapsed>2.6:ship.hide()
	for part in debris:
		part.velocity.y-=dt*12;part.node.position+=part.velocity*dt;part.node.rotation+=part.spin*dt

func clear_debris():
	for part in debris:
		if is_instance_valid(part.node):part.node.queue_free()
	debris.clear()
