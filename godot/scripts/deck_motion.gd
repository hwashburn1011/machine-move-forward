class_name MMFDeckMotion
extends RefCounted

static func slide(body: CharacterBody3D,dt: float):
	var before=body.position
	var requested=Vector3(body.velocity.x,0,body.velocity.z)*dt
	body.move_and_slide()
	# Capsules can exhaust slide iterations on repeated zero-travel contacts
	# with a flat deck. Retry only unspent horizontal motion after floor-only
	# contacts. A second collision sweep still stops at actual walls/fixtures.
	if requested.length_squared()<=0.000001 or body.get_slide_collision_count()==0: return
	for i in body.get_slide_collision_count():
		if body.get_slide_collision(i).get_normal().y<0.65: return
	var travelled=(body.position-before)*Vector3(1,0,1)
	if travelled.length_squared()<requested.length_squared()*0.01:
		body.move_and_collide(requested-travelled)
