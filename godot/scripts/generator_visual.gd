class_name MMFGeneratorVisual
extends RefCounted

# Presentation only. Each generator reads the machine's shared reserve and its
# own real condition. No additional fuel, simulated output or saved state.
var piece: Dictionary
var maximum_health: float
var needle: Node3D
var running: Node3D
var reserve: Node3D
var service: Node3D
var last_fuel=-1.0
var last_health=-1.0

func _init(model: Node3D,entry: Dictionary,max_health: float):
	piece=entry;maximum_health=max_health
	needle=MMFAssets.find_named(model,"FuelNeedle")
	running=MMFAssets.find_named(model,"RunLamp")
	reserve=MMFAssets.find_named(model,"ReserveLamp")
	service=MMFAssets.find_named(model,"ServiceLamp")

func update(fuel: float):
	var amount=clampf(fuel,0,100)
	var condition=float(piece.health)
	if amount==last_fuel and condition==last_health:return
	last_fuel=amount;last_health=condition
	if needle:needle.rotation.z=deg_to_rad(lerpf(-110,110,amount/100))
	if running:running.visible=amount>0 and condition>0
	if reserve:reserve.visible=amount<=20
	if service:service.visible=condition<maximum_health
