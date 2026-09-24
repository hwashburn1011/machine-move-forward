class_name MMFRaiderCraft
extends RefCounted

const KIT=preload("res://art/raider-craft.glb")
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

static func model(kind: String) -> Node3D:
	var kit=KIT.instantiate();var node=MMFAssets.find_named(kit,"RaiderGunboat" if kind=="gunboat" else "RaiderSkiff")
	node.get_parent().remove_child(node);kit.free();return node

func setup(owner_combat):
	combat=owner_combat;ship=combat.ship;state=-1;recoil_left=0
	var prefix="Gunboat" if combat.ship_kind=="gunboat" else "Skiff"
	yaw=MMFAssets.find_named(ship,prefix+"GunYaw");pitch=MMFAssets.find_named(ship,prefix+"GunPitch")
	recoil=MMFAssets.find_named(ship,prefix+"Recoil");muzzle=MMFAssets.find_named(ship,prefix+"Muzzle")
	weapon_lenses=local_lenses(recoil);engine_lenses=local_lenses(MMFAssets.find_named(ship,"EngineStateLamp"));refresh_state()

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
	var now=int(combat.weapon_health>0)|int(combat.engine_health>0)<<1|int(combat.ship_state!="retreat")<<2|int(recoil_left>0)<<3
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
	if combat.ship_state in ["attack","grapple"] and combat.weapon_health>0:
		var target=ship.to_local(combat.game.player.global_position+Vector3.UP)
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
