class_name MMFMachineSwitchgear
extends RefCounted

var root: Node3D
var indicators: ShaderMaterial
var remaining=0.0
var displayed=-1

func install(machine: Node3D):
	var manifest=MMFAssets.json("res://art/nomad-switchgear.json")
	var retained=MMFAssets.scene("res://art/nomad-switchgear-retained.glb")
	var cabinet=MMFAssets.scene("res://art/nomad-switchgear.glb")
	if MMFAssets.of_type(cabinet,"MeshInstance3D").size()!=5 or not MMFAssets.find_named(cabinet,"SwitchgearIndicators") is MeshInstance3D:
		push_error("Native switchgear is missing its authored mesh or indicators.")
		retained.free();cabinet.free();return
	for entry in manifest.trim:
		if not MMFAssets.find_named(machine,entry.original) is MeshInstance3D or (entry.replacement!="" and not MMFAssets.find_named(retained,entry.replacement) is MeshInstance3D):
			push_error("Native switchgear is missing a shared workshop batch.")
			retained.free();cabinet.free();return
	for entry in manifest.trim:
		var previous=MMFAssets.find_named(machine,entry.original)
		var replacement: MeshInstance3D
		if entry.replacement!="":
			replacement=MMFAssets.find_named(retained,entry.replacement)
			replacement.set_surface_override_material(0,previous.get_active_material(0))
			replacement.owner=null;replacement.get_parent().remove_child(replacement)
		previous.get_parent().remove_child(previous);previous.free()
		# These retain the same stable batch names. Remove the previous node first
		# so Godot does not silently rename the replacement on name collision.
		if replacement:machine.add_child(replacement)
	retained.free()
	indicators=ShaderMaterial.new();indicators.shader=load("res://shaders/switchgear_indicators.gdshader")
	root=Node3D.new();root.name="NativeSwitchgear";machine.add_child(root)
	for site in manifest.sites:
		var instance=cabinet.duplicate();instance.name=site.name;root.add_child(instance)
		instance.position=MMFAssets.v(site.position);instance.rotation.y=site.yaw
		MMFAssets.find_named(instance,"SwitchgearIndicators").material_override=indicators
	cabinet.free()

func bind(machine: Node3D):
	root=MMFAssets.find_named(machine,"NativeSwitchgear")
	indicators=MMFAssets.find_named(root,"SwitchgearIndicators").material_override
	remaining=0.0;displayed=-1

func update(dt: float,session):
	if indicators==null:return
	remaining-=dt
	if remaining>0:return
	remaining=.25
	# Read existing simulation results. No new consumer, battery, fault threshold
	# or repair rule: unpowered cabinets are dark, matching their physical supply.
	var state=0
	if session.capacity>.001:
		state=1
		if session.demand>session.capacity+.001:state|=2
		if session.subsystems.engine<session.data.SUBSYSTEMS.engine.maxHealth-.01:state|=4
	if state==displayed:return
	displayed=state
	indicators.set_shader_parameter("status_bits",Vector3(1 if state&1 else 0,1 if state&2 else 0,1 if state&4 else 0))
