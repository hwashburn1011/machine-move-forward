extends SceneTree

func _initialize():
	var source=TorusMesh.new();source.inner_radius=.6;source.outer_radius=.64
	var error=save_ring(source,"enemy-warning-ring","Original enemy tactical ring")
	var shell=TorusMesh.new();shell.inner_radius=.65;shell.outer_radius=.72;shell.rings=32;shell.ring_segments=6
	error=maxi(error,save_ring(shell,"shell-warning-ring","Original shell warning ring"))
	print("ENEMY_WARNING_BAKED ",error);call_deferred("quit",0 if error==OK else 1)

func save_ring(source: TorusMesh,path: String,label: String) -> Error:
	var mesh=ArrayMesh.new();mesh.resource_name=label
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,source.surface_get_arrays(0))
	var error=ResourceSaver.save(mesh,"res://art/"+path+".res")
	if error!=OK:push_error("Cannot save warning ring: "+path+" / "+str(error))
	return error
