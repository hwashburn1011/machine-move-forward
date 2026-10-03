class_name MMFMachineHelm
extends RefCounted

var root: Node3D
var gyro: Node3D
var cover: Node3D
var bearing_cover: Node3D
var lamp: StandardMaterial3D
var remaining=0.0
var displayed=-1

static func install(machine: Node3D):
	var host=MMFAssets.find_named(machine,"HelmRoot")
	# This dedicated subtree also contains frozen earned hardware from the
	# browser bake. Runtime progression supplies those parts exactly once.
	for child in host.get_children():child.free()
	var kit=MMFAssets.scene("res://art/nomad-helm.glb");host.add_child(kit)
	MMFAssets.find_named(kit,"GyroInstalled").visible=false

func bind(machine: Node3D):
	root=MMFAssets.find_named(machine,"NativeHelm")
	gyro=MMFAssets.find_named(root,"GyroInstalled")
	cover=MMFAssets.find_named(root,"GyroBlank")
	bearing_cover=MMFAssets.find_named(root,"BearingBlank")
	var lens=MMFAssets.find_named(root,"HelmStatusLens")
	lamp=lens.get_active_material(0).duplicate();lamp.resource_local_to_scene=true
	lens.material_override=lamp;displayed=-1;remaining=0

func refresh(session):
	var fitted="course-gyro" in session.story.uniques
	gyro.visible=fitted;cover.visible=not fitted;bearing_cover.visible=not fitted
	var status=2 if fitted and session.powered.get("fixed-helm",false) else 1 if fitted else 0
	if status==displayed:return
	displayed=status
	lamp.albedo_color=[Color(.035,.075,.058),Color(.32,.13,.025),Color(.045,.30,.27)][status]
	lamp.emission_enabled=status>0
	lamp.emission=Color(.82,.28,.035) if status==1 else Color(.08,.72,.63)
	lamp.emission_energy_multiplier=.65

func update(dt: float,session):
	remaining-=dt
	if remaining>0:return
	remaining=.25;refresh(session)
