extends SceneTree

func _initialize():
	for id in ["stairs","workbench","refinery","turret-manual"]:
		var path="res://assets/runtime/"+id+".glb"
		print("RESOURCE_DEPENDENCIES ",id," ",ResourceLoader.get_dependencies(path))
	quit()
