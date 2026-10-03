extends SceneTree

func _initialize():call_deferred("run")

func run():
	var path="res://assets/runtime/stairs.glb"
	var joined="--joined" in OS.get_cmdline_user_args()
	var requested=ResourceLoader.load_threaded_request(path,"PackedScene")==OK
	var stairs
	if joined and requested:stairs=ResourceLoader.load_threaded_get(path)
	var refinery=load("res://assets/runtime/refinery.glb")
	var workbench=load("res://assets/runtime/workbench.glb")
	if not joined and requested:stairs=ResourceLoader.load_threaded_get(path)
	print("LOAD_OVERLAP joined=",joined," valid=",requested and stairs is PackedScene and refinery is PackedScene and workbench is PackedScene)
	stairs=null;refinery=null;workbench=null
	for i in 3:await process_frame
	quit()
