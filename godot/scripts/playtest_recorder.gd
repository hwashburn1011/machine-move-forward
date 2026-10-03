class_name MMFPlaytestRecorder
extends RefCounted

# Local, opt-in, bounded observations. This owns no gameplay state or RNG and
# performs disk I/O only when write_report is explicitly requested.
const SCHEMA=1
const ACTIVITIES=["cinematic","menu","combat","expedition","construction","salvage","travel","other"]
const META_KEYS=["run_id","source_hash","seed","mode","checkpoint_id","tuning_revision"]
const MAX_BYTES=4194304
var enabled=false
var capacity=4096
var metadata={}
var events: Array=[]
var overflow=0
var payload_truncations=0
var stored_bytes=0
var sequence=0
var segment=0
var start_ticks=0
var current={}
var dwell={}
var last_simulation_s=0.0

static func source_files(directory: String,result: Array):
	for name in DirAccess.get_files_at(directory):
		if name.get_extension() in ["gd","json","tscn","gdshader"]:result.append(directory.path_join(name))
	for name in DirAccess.get_directories_at(directory):source_files(directory.path_join(name),result)

static func source_fingerprint() -> String:
	# Exports contain compiled/remapped resources and project.binary. Their build
	# identity is frozen before export, outside the source-hashed directories.
	if not FileAccess.file_exists("res://project.godot"):
		var path="res://release/build.json"
		var release=JSON.parse_string(FileAccess.get_file_as_string(path)) if FileAccess.file_exists(path) else null
		if release is Dictionary and release.get("source_hash") is String and release.source_hash.length()==64:
			return release.source_hash
		push_error("Exported build identity is missing or invalid")
		return ""
	# Called only on opt-in setup, never in a sampling/frame callback. Authored
	# binary assets use the separate build manifest; this identifies runtime code,
	# definitions, scenes, project configuration and shader source as one set.
	var paths=["res://project.godot"]
	for directory in ["res://scripts","res://data","res://scenes","res://shaders"]:source_files(directory,paths)
	paths.sort()
	var digest=HashingContext.new();digest.start(HashingContext.HASH_SHA256)
	for path in paths:
		digest.update((path+"\n"+FileAccess.get_sha256(path)+"\n").to_utf8_buffer())
	return digest.finish().hex_encode()

func configure(info: Dictionary,recording: bool=false,event_capacity: int=4096):
	enabled=recording;capacity=clampi(event_capacity,16,16384)
	metadata.clear()
	for key in META_KEYS:metadata[key]=String(info.get(key,"")).left(256)
	if metadata.run_id=="":metadata.run_id="local-"+str(Time.get_ticks_usec())
	if metadata.mode not in ["synthetic","checkpoint","campaign"]:metadata.mode="synthetic"
	events.clear();overflow=0;payload_truncations=0;stored_bytes=0;sequence=0;segment=0
	start_ticks=Time.get_ticks_usec();current.clear();dwell.clear();last_simulation_s=0.0
	for activity in ACTIVITIES:dwell[activity]={"wall_ms":0.0,"simulation_s":0.0}

func wall_ms() -> float:return (Time.get_ticks_usec()-start_ticks)/1000.0

func set_recording(value: bool,simulation_s: float=0.0):
	if value==enabled:return
	if not value:
		accrue(wall_ms(),simulation_s,dwell)
		record(simulation_s,current.get("phase",""),current.get("activity","other"),"recording_stopped")
		current.clear();last_simulation_s=simulation_s;enabled=false
		return
	# Source hashing is opt-in work, including a recorder first enabled in play.
	if metadata.get("source_hash","")=="":metadata.source_hash=source_fingerprint()
	enabled=true
	begin_segment({},simulation_s)

func safe_value(value,depth: int=0):
	if depth>=4:payload_truncations+=1;return "[depth limit]"
	match typeof(value):
		TYPE_NIL,TYPE_BOOL,TYPE_INT:return value
		TYPE_FLOAT:return value if is_finite(value) else null
		TYPE_STRING,TYPE_STRING_NAME:
			if String(value).length()>512:payload_truncations+=1
			return String(value).left(512)
		TYPE_ARRAY:
			var result=[]
			for i in mini(value.size(),32):result.append(safe_value(value[i],depth+1))
			if value.size()>32:payload_truncations+=1
			return result
		TYPE_DICTIONARY:
			var result={};var count=0
			for key in value:
				if count>=32:payload_truncations+=1;break
				result[String(key).left(64)]=safe_value(value[key],depth+1);count+=1
			return result
		_:payload_truncations+=1;return "[unsupported value]"

func record(simulation_s: float,phase: String,activity: String,event: String,payload: Dictionary={}) -> bool:
	if not enabled:return false
	sequence+=1
	if events.size()>=capacity or stored_bytes>=MAX_BYTES:overflow+=1;return false
	var entry=metadata.duplicate()
	entry.merge({"schema":SCHEMA,"id":sequence,"segment":segment,"wall_ms":wall_ms(),"simulation_s":simulation_s if is_finite(simulation_s) else 0.0,"phase":phase.left(64),"activity":activity if activity in ACTIVITIES else "other","event":event.left(80),"payload":safe_value(payload)})
	var bytes=JSON.stringify(entry).to_utf8_buffer().size()
	if bytes>16384 or stored_bytes+bytes>MAX_BYTES:overflow+=1;return false
	events.append(entry);stored_bytes+=bytes;return true

func accrue(until_wall: float,until_sim: float,target: Dictionary):
	if current.is_empty():return
	var bucket=target[current.activity]
	bucket.wall_ms+=maxf(0,until_wall-float(current.wall_ms))
	bucket.simulation_s+=maxf(0,until_sim-float(current.simulation_s))

func sample_state(simulation_s: float,phase: String,activity: String,flags: Dictionary={}):
	if not enabled:return
	last_simulation_s=simulation_s if is_finite(simulation_s) else last_simulation_s
	if activity not in ACTIVITIES:activity="other"
	var bounded=safe_value(flags)
	var now=wall_ms()
	if not current.is_empty() and current.phase==phase and current.activity==activity:
		# Changing fuel/distance is a low-frequency sample, not a new activity.
		if current.flags!=bounded and now-float(current.summary_wall)>=5000:
			record(simulation_s,phase,activity,"state_sample",{"flags":bounded})
			current.flags=bounded;current.summary_wall=now
		return
	accrue(now,simulation_s,dwell)
	current={"wall_ms":now,"summary_wall":now,"simulation_s":simulation_s,"phase":phase.left(64),"activity":activity,"flags":bounded}
	record(simulation_s,phase,activity,"state",{"flags":bounded})

func begin_segment(info: Dictionary,simulation_s: float=0.0):
	# Flush the preceding dwell before a checkpoint/load resets its sim clock.
	if enabled and not current.is_empty():accrue(wall_ms(),last_simulation_s,dwell)
	current.clear();last_simulation_s=simulation_s
	for key in ["seed","mode","checkpoint_id"]:
		if info.has(key):metadata[key]=String(info[key]).left(256)
	if metadata.mode not in ["synthetic","checkpoint","campaign"]:metadata.mode="synthetic"
	# Remember current provenance while off, without recording disabled time or
	# events. A checkbox enabled after loading a checkpoint must name that run.
	if not enabled:return
	segment+=1
	record(simulation_s,"","other","segment_begin",info)

func snapshot(simulation_s: float=0.0) -> Dictionary:
	var totals=dwell.duplicate(true)
	if enabled:accrue(wall_ms(),simulation_s,totals)
	return {"schema":SCHEMA,"metadata":metadata.duplicate(true),"enabled":enabled,"capacity":capacity,"stored_bytes":stored_bytes,"overflow":overflow,"payload_truncations":payload_truncations,"segments":segment+1,"dwell":totals,"events":events.duplicate(true)}

func write_report(path: String,simulation_s: float=0.0) -> bool:
	if not enabled:return false
	var file=FileAccess.open(path,FileAccess.WRITE)
	if file==null:return false
	file.store_string(JSON.stringify(snapshot(simulation_s),"\t"));file.flush()
	return file.get_error()==OK
