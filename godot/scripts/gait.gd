class_name MMFGait
extends RefCounted

var game
var rig: Node3D
var joints=[]
var previous_distance=-100.0
var previous_lateral=0.0
var plants=[0.0,0.0,0.0,0.0]
var swing_offsets=[0.0,0.0,0.0,0.0]
var planted=[false,false,false,false]
var contact_points=[Vector3.ZERO,Vector3.ZERO,Vector3.ZERO,Vector3.ZERO]

func setup(owner_game,machine: Node3D):
	game=owner_game
	rig=MMFAssets.find_named(machine,"IronNomad_FourLegWalker")
	for name in ["FrontRight","FrontLeft","RearRight","RearLeft"]:
		joints.append({"upper":MMFAssets.find_named(machine,"Leg_"+name+"_Upper"),"lower":MMFAssets.find_named(machine,"Leg_"+name+"_Lower"),"foot":MMFAssets.find_named(machine,"Leg_"+name+"_Foot")})

static func segment(a: Vector3,b: Vector3) -> Basis:
	var z=(b-a).normalized()
	var x=(Vector3.RIGHT-z*z.x).normalized()
	var y=z.cross(x)
	var convert=Basis(Vector3.RIGHT,-PI/2)
	return convert*Basis(x,y,z)*convert.inverse()

static func knee(hip: Vector3,rest: Vector3,foot: Vector3,target: Vector3) -> Vector3:
	var a=hip.distance_to(rest)
	var b=rest.distance_to(foot)
	var distance=clampf(hip.distance_to(target),0.01,a+b-0.001)
	var axis=(target-hip).normalized()
	var bend=rest-hip
	bend=(bend-axis*bend.dot(axis)).normalized()
	var along=(a*a-b*b+distance*distance)/(2*distance)
	return hip+axis*along+bend*sqrt(maxf(0,a*a-along*along))

static func gltf(v: Vector3) -> Vector3: return Vector3(v.x,v.z,-v.y)

func update(distance: float,lateral: float):
	if not rig: return
	var d=game.data
	for i in 4:
		var leg=d.LEGS[i]
		var joint=joints[i]
		if not joint.upper or not joint.lower or not joint.foot: continue
		var phase=fposmod(distance/d.STRIDE_LENGTH+leg.phase,1)
		var stance=phase<d.DUTY
		var u=clampf((phase-d.DUTY)/(1-d.DUTY),0,1)
		var ease=u*u*(3-2*u)
		var reach=d.STANCE_EXCURSION/2
		var anchors=d.NOMAD_LEG_GAME_ANCHORS.hipAbs
		var base_x=leg.side*(anchors.x+2.1375)
		var x=base_x
		if stance:
			if not planted[i] or absf(distance-previous_distance)>32: plants[i]=base_x+lateral
			x=plants[i]-lateral
		else:
			if planted[i]: swing_offsets[i]=plants[i]-lateral-base_x
			x=base_x+swing_offsets[i]*(1-ease)
		planted[i]=stance
		var z=leg.end*anchors.z+reach*(2*phase/d.DUTY-1 if stance else 1-2*ease)
		# Place the foot on the same sand surface used by scenery and recovery.
		# Subtracting the centre-course height left planted feet hovering at Y=0.
		var y=MMFDunes.height_at(x+lateral,z-distance)+(0 if stance else d.FOOT_LIFT*sin(PI*u))+0.04
		contact_points[i]=Vector3(x,y,z)
		var target=rig.to_local(Vector3(x,y+0.8166667,z))
		target=Vector3(target.x,-target.z,target.y)
		var source=d.NOMAD_LEG_SOURCE_RIG
		var signs=Vector3(-leg.side,leg.end,1)
		var h=MMFAssets.v(source.hipAbs)*signs
		var k=MMFAssets.v(source.kneeAbs)*signs
		var f=MMFAssets.v(source.footAbs)*signs
		var solved=knee(h,k,f,target)
		joint.upper.basis=segment(h,solved)
		joint.lower.position=gltf(solved)
		joint.lower.basis=segment(solved,target)
		joint.foot.position=gltf(target)
		joint.foot.basis=rig.global_basis.orthonormalized().inverse()*Basis(Vector3.UP,PI)
	previous_distance=distance
	previous_lateral=lateral
