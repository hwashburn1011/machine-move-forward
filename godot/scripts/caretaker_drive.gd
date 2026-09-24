class_name MMFCaretakerDrive
extends RefCounted

const HALF_SPAN=.29
const RADIUS=.17
const CENTER_Y=.23
const TRACK_X=.44
const LINKS=48
const LENGTH=4*HALF_SPAN+TAU*RADIUS
var belts: Array=[]
var wheel_sets: Array=[[],[]]
var phases=[0.0,0.0]
var travel=[0.0,0.0]
var contact_y=0.0
var previous=Transform3D.IDENTITY
var positioned=false

func setup(visual: Node3D,wheels: Array):
	var original=[];var materials={}
	for node in MMFAssets.of_type(visual,"MeshInstance3D"):
		if not String(node.get_parent().name).begins_with("L12Drive"):continue
		if "Field_Rubber" in node.name or "Field_MachinedMetal" in node.name:
			original.append(node)
			for surface in node.mesh.get_surface_count():
				var mat=node.mesh.surface_get_material(surface)
				materials["rubber" if "Field_Rubber" in node.name else "steel"]=mat
	if original.size()!=4 or materials.size()!=2:return
	var kit=MMFAssets.scene("res://art/l12-track-shoe.glb")
	var shoe=MMFAssets.find_named(kit,"L12TrackShoe")
	if not shoe is MeshInstance3D:kit.free();return
	var mesh=shoe.mesh.duplicate()
	for surface in mesh.get_surface_count():
		var mat=mesh.surface_get_material(surface)
		mesh.surface_set_material(surface,materials.rubber if "Rubber" in mat.resource_name else materials.steel)
	contact_y=CENTER_Y-RADIUS-mesh.get_aabb().end.y
	kit.free()
	for node in original:node.free()
	for index in 2:
		var belt=MultiMeshInstance3D.new();belt.name="ArticulatedTrackLeft" if index==0 else "ArticulatedTrackRight"
		var batch=MultiMesh.new();batch.transform_format=MultiMesh.TRANSFORM_3D;batch.mesh=mesh;batch.instance_count=LINKS
		# A stable swept bound avoids per-update AABB readbacks from the renderer.
		batch.custom_aabb=AABB(Vector3((-TRACK_X if index==0 else TRACK_X)-.19,contact_y-.005,-.51),Vector3(.38,.5,1.02))
		belt.multimesh=batch;visual.add_child(belt);belts.append(belt)
		pose_belt(index)
	for wheel in wheels:wheel_sets[0 if String(wheel.name).begins_with("L12WheelL") else 1].append(wheel)

static func shoe_frame(distance: float,x: float) -> Transform3D:
	var s=fposmod(distance,LENGTH);var y: float;var z: float;var angle: float
	if s<2*HALF_SPAN:
		z=-HALF_SPAN+s;y=CENTER_Y+RADIUS;angle=0
	elif s<2*HALF_SPAN+PI*RADIUS:
		angle=(s-2*HALF_SPAN)/RADIUS;z=HALF_SPAN+RADIUS*sin(angle);y=CENTER_Y+RADIUS*cos(angle)
	elif s<4*HALF_SPAN+PI*RADIUS:
		z=HALF_SPAN-(s-2*HALF_SPAN-PI*RADIUS);y=CENTER_Y-RADIUS;angle=PI
	else:
		var u=(s-4*HALF_SPAN-PI*RADIUS)/RADIUS
		angle=PI+u;z=-HALF_SPAN-RADIUS*sin(u);y=CENTER_Y-RADIUS*cos(u)
	return Transform3D(Basis(Vector3.RIGHT,angle),Vector3(x,y,z))

func pose_belt(index: int):
	var batch: MultiMesh=belts[index].multimesh
	var x=-TRACK_X if index==0 else TRACK_X
	for link in LINKS:batch.set_instance_transform(link,shoe_frame(link*LENGTH/LINKS+phases[index],x))

func update(current: Transform3D,grounded: bool):
	if belts.is_empty():return
	# Spawn, falling and recovery relocations should not race the drive animation.
	if not positioned or not grounded or current.origin.distance_to(previous.origin)>1:
		previous=current;positioned=true;return
	var forward=-(previous.basis.z+current.basis.z)*Vector3(1,0,1)
	if forward.length_squared()<.001:previous=current;return
	forward=forward.normalized()
	for index in 2:
		var center=Vector3(-TRACK_X if index==0 else TRACK_X,0,0)
		var amount=((current*center)-(previous*center)).dot(forward)
		if absf(amount)<.000001:continue
		travel[index]+=amount
		phases[index]=fposmod(phases[index]-amount,LENGTH)
		pose_belt(index)
		for wheel in wheel_sets[index]:wheel.rotation.x-=amount/.143
	previous=current
