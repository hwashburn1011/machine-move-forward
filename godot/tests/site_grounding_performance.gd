extends "res://tests/deck_audio_performance.gd"

func _initialize():
	super._initialize()
	output="res://../test-results/site-grounding/performance/"
	MMFSaves.DIRECTORY="user://site-grounding-performance/"

func camera_update(elapsed: float):
	if not render_camera:
		super.camera_update(elapsed)
		return
	# Include the new lower stories and ground contact in the rendered workload.
	# The earlier roof pass viewed these sites from above their upper decks.
	var angle=elapsed*.1
	var center=target-Vector3.UP*6.5
	render_camera.global_position=center+Vector3(sin(angle)*31,4,cos(angle)*31)
	render_camera.look_at(center);render_camera.reset_physics_interpolation();render_camera.make_current()
