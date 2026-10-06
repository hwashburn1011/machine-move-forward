class_name MMFOpeningPresentation
extends RefCounted

# Presentation of the existing 10.2-second chase. The exported timeline still
# owns every actor position, jump, shot and kill; the camera stays above its set.
static func view(at: float,hero: Vector3) -> Dictionary:
	var establish=smoothstep(1.05,2.85,at)
	var reveal=smoothstep(5.8,9.4,at)
	# The landing and elevated pursuers share the 2.35:1 picture, not merely
	# the full viewport behind its bars. Pull back before the jump resolves.
	var eye=(hero+Vector3(-5.8,3.4,.2)).lerp(Vector3(4.5,23.8,4.0),establish)
	var target=hero.lerp(Vector3(12.4,18.6,0),establish)
	eye=eye.lerp(Vector3(3,27,22),reveal)
	target=target.lerp(Vector3(0,18,0),reveal)
	var vertical=lerpf(lerpf(56,64,establish),60,reveal)
	# Preserve the authored horizontal composition on taller windows too; the
	# letterbox otherwise hides the high pursuers even when the landing fits.
	var viewport=Engine.get_main_loop().root.get_visible_rect().size
	var aspect=viewport.x/maxf(1,viewport.y)
	vertical=rad_to_deg(2*atan(tan(deg_to_rad(vertical*.5))*(16.0/9.0)/aspect))
	return {"eye":eye,"target":target,"fov":vertical}

static func handoff_fade(at: float) -> float:
	if at<9.98:return smoothstep(9.78,9.94,at)
	return 1-smoothstep(10.02,10.2,at)

static func aim(at: float,sample: Dictionary) -> Vector3:
	var target=MMFAssets.v(sample.pursuers[0].position).lerp(MMFAssets.v(sample.pursuers[1].position),smoothstep(4.35,4.78,at))
	var lowered=MMFAssets.v(sample.player.position)+Vector3(10,-.2,-3)
	return target.lerp(lowered,smoothstep(5.6,6.35,at))
