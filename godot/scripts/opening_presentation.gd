class_name MMFOpeningPresentation
extends RefCounted

# Presentation of the existing 10.2-second chase. The exported timeline still
# owns every actor position, jump, shot and kill; the camera stays above its set.
static func view(at: float,hero: Vector3) -> Dictionary:
	var establish=smoothstep(1.05,2.85,at)
	var reveal=smoothstep(5.8,9.4,at)
	var eye=(hero+Vector3(-5.8,3.4,.2)).lerp(Vector3(6.5,22.4,3.0),establish)
	var target=hero.lerp(Vector3(12.4,18.6,0),establish)
	eye=eye.lerp(Vector3(3,27,22),reveal)
	target=target.lerp(Vector3(0,18,0),reveal)
	return {"eye":eye,"target":target,"fov":lerpf(56,60,reveal)}

static func handoff_fade(at: float) -> float:
	if at<9.98:return smoothstep(9.78,9.94,at)
	return 1-smoothstep(10.02,10.2,at)

static func aim(at: float,sample: Dictionary) -> Vector3:
	var target=MMFAssets.v(sample.pursuers[0].position).lerp(MMFAssets.v(sample.pursuers[1].position),smoothstep(4.35,4.78,at))
	var lowered=MMFAssets.v(sample.player.position)+Vector3(10,-.2,-3)
	return target.lerp(lowered,smoothstep(5.6,6.35,at))
