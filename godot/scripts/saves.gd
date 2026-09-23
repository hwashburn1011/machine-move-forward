class_name MMFSaves
extends RefCounted

static var DIRECTORY="user://campaigns/"

static func valid_name(id: String) -> bool:
	return id!="" and id.length()<80 and id.is_valid_filename() and not id.begins_with(".")

static func write(id: String,payload: Dictionary) -> bool:
	if not valid_name(id): return false
	DirAccess.make_dir_recursive_absolute(DIRECTORY)
	var text=JSON.stringify(payload,"\t")
	var envelope={"schema":"mmf-godot-campaign","version":1,"savedAt":Time.get_datetime_string_from_system(true),"checksum":text.sha256_text(),"payload":text}
	var path=DIRECTORY+id+".json"
	var pending=path+".tmp"
	var file=FileAccess.open(pending,FileAccess.WRITE)
	if not file: return false
	file.store_string(JSON.stringify(envelope))
	file.flush()
	file.close()
	if decode(pending).is_empty(): return false
	# Keep the previous verified save until its replacement has been verified.
	if FileAccess.file_exists(path):
		var backup=path+".bak"
		if FileAccess.file_exists(backup): DirAccess.remove_absolute(backup)
		if DirAccess.rename_absolute(path,backup)!=OK: return false
	return DirAccess.rename_absolute(pending,path)==OK

static func decode(path: String) -> Dictionary:
	if not FileAccess.file_exists(path) or FileAccess.get_file_as_bytes(path).size()>16000000: return {}
	var envelope=JSON.parse_string(FileAccess.get_file_as_string(path))
	if not envelope is Dictionary or envelope.get("schema")!="mmf-godot-campaign" or envelope.get("version")!=1: return {}
	if not envelope.get("payload") is String: return {}
	if envelope.payload.sha256_text()!=envelope.get("checksum",""): return {}
	var payload=JSON.parse_string(envelope.payload)
	return payload if payload is Dictionary else {}

static func read(id: String) -> Dictionary:
	if not valid_name(id): return {}
	var result=decode(DIRECTORY+id+".json")
	return decode(DIRECTORY+id+".json.bak") if result.is_empty() else result

static func list_saves() -> Array:
	var result=[]
	var directory=DirAccess.open(DIRECTORY)
	if not directory: return result
	for file in directory.get_files():
		if not file.ends_with(".json"): continue
		var envelope=JSON.parse_string(FileAccess.get_file_as_string(DIRECTORY+file))
		if not envelope is Dictionary: continue
		result.append({"id":file.trim_suffix(".json"),"date":envelope.get("savedAt","")})
	result.sort_custom(func(a,b):return a.date>b.date)
	return result
