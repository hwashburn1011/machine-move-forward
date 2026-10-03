extends SceneTree
## External packaging helper: run against an exported PCK, never a source project.
## No game classes, editor imports, GPU work, save writes or scene instantiation.

var failures: Array=[]
var checks=0

func check(value: bool,label: String):
	checks+=1
	if not value:failures.append(label)

func argument(key: String) -> String:
	for item in OS.get_cmdline_user_args():
		if item.begins_with(key+"="):return item.substr(key.length()+1)
	return ""

func read_json(path: String):
	var parser=JSON.new()
	var code=parser.parse(FileAccess.get_file_as_string(path))
	check(code==OK,"Valid JSON: "+path)
	return parser.data if code==OK else null

func _initialize():call_deferred("run")

func run():
	var inventory_path=argument("--inventory")
	var output=argument("--output")
	var pck_path=argument("--pck")
	if inventory_path=="" or output=="" or pck_path=="":
		push_error("Required: --inventory=<absolute JSON> --output=<absolute JSON> --pck=<absolute PCK>")
		quit(2);return
	var inventory=read_json(inventory_path)
	if not inventory is Dictionary:quit(2);return
	var version=Engine.get_version_info()
	check(version.major==4 and version.minor==7 and version.patch==2,"Matching Godot 4.7.2 runtime")
	check(ProjectSettings.get_setting("application/run/main_scene","")=="res://scenes/main.tscn","Production entry scene")
	check(not DirAccess.dir_exists_absolute("res://tests"),"No development tests in package")
	check(not DirAccess.dir_exists_absolute("res://tools"),"No authoring tools in package")
	check(not ResourceLoader.exists("res://assets/models/player.glb"),"Unused legacy Mixamo model excluded")
	var raw_checked=0
	for item in inventory.raw_json:
		var path=String(item.path)
		check(FileAccess.file_exists(path),"Raw JSON retained: "+path)
		if not FileAccess.file_exists(path):continue
		check(FileAccess.get_sha256(path)==item.sha256,"Raw JSON bytes unchanged: "+path)
		read_json(path);raw_checked+=1
	var resources_checked=0
	var scripts_checked=0
	for path in inventory.resources:
		# ResourceLoader resolves .gd -> .gdc and other export remaps. Never
		# require raw .gd, .tscn or project.godot bytes in the player package.
		check(ResourceLoader.exists(path),"Exported resource resolves: "+path)
		resources_checked+=1
		if String(path).ends_with(".gd"):scripts_checked+=1
	var shape_count=0
	for path in inventory.collision_shapes:
		var shape=ResourceLoader.load(path,"ConcavePolygonShape3D",ResourceLoader.CACHE_MODE_IGNORE)
		check(shape is ConcavePolygonShape3D,"Baked collision loads: "+path)
		if shape is ConcavePolygonShape3D:
			check(shape.get_faces().size()>0,"Baked collision contains triangles: "+path)
		shape=null;shape_count+=1
	var identity=read_json("res://release/build.json")
	check(identity==inventory.identity,"Exported release identity matches frozen inputs")
	var report={"schema":1,"passed":failures.is_empty(),"checks":checks,"failures":failures,
		"engine":version,"pck_sha256":FileAccess.get_sha256(pck_path),
		"inventory_sha256":FileAccess.get_sha256(inventory_path),"identity":identity,
		"raw_json_checked":raw_checked,"resources_checked":resources_checked,
		"scripts_checked_via_resource_loader":scripts_checked,"collision_shapes_loaded":shape_count,
		"main_scene":ProjectSettings.get_setting("application/run/main_scene",""),
		"user_data_dir":OS.get_user_data_dir(),"compiled_script_aware":true,
		"scope":"PCK resource coverage and collision decoding; not a rendered or interactive game smoke test",
		"licenses":{"godot":Engine.get_license_text(),"third_party":Engine.get_license_info(),
			"copyright":Engine.get_copyright_info()}}
	var file=FileAccess.open(output,FileAccess.WRITE)
	if file==null:push_error("Cannot write audit report: "+output);quit(2);return
	file.store_string(JSON.stringify(report,"\t")+"\n");file.close()
	print("MMF_RELEASE_RESOURCE_AUDIT ",checks," checks; ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
