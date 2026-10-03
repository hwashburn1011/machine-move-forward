class_name MMFHitZone
extends StaticBody3D

var receiver: Callable
var label = ""
var armor=0.0
var health_reader: Callable

func impact_profile(_point: Vector3) -> Dictionary:
	return {"category":"component","armor":armor,"exposed":false,"health":float(health_reader.call()) if health_reader.is_valid() else INF}

func take_weapon_damage(amount: float,point: Vector3,distance: float,range_m: float,falloff_start: float) -> float:
	return take_damage(MMFDamage.compute(amount,distance,range_m,falloff_start,armor)+armor,point)

func setup(parent: Node3D, at: Vector3, size: Vector3, callback: Callable):
	collision_layer = 4
	collision_mask = 0
	set_meta("hostile_target",true)
	position = at
	receiver = callback
	var collider = CollisionShape3D.new()
	var shape = BoxShape3D.new()
	shape.size = size
	collider.shape = shape
	add_child(collider)
	parent.add_child(self)

func take_damage(amount: float,point: Vector3) -> float:
	if collision_layer==0 or not receiver.is_valid():return 0.0
	var before=float(health_reader.call()) if health_reader.is_valid() else 0.0
	var applied=receiver.call(amount,point)
	if health_reader.is_valid():return maxf(0,before-float(health_reader.call()))
	return maxf(0,float(applied)) if applied is float or applied is int else 0.0
