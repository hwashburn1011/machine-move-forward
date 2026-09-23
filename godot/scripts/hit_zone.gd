class_name MMFHitZone
extends StaticBody3D

var receiver: Callable
var label = ""
var armor=0.0

func take_weapon_damage(amount: float,point: Vector3,distance: float,range_m: float,falloff_start: float):
	take_damage(MMFDamage.compute(amount,distance,range_m,falloff_start,armor)+armor,point)

func setup(parent: Node3D, at: Vector3, size: Vector3, callback: Callable):
	collision_layer = 4
	collision_mask = 0
	position = at
	receiver = callback
	var collider = CollisionShape3D.new()
	var shape = BoxShape3D.new()
	shape.size = size
	collider.shape = shape
	add_child(collider)
	parent.add_child(self)

func take_damage(amount: float,point: Vector3):
	if receiver.is_valid(): receiver.call(amount,point)
