class_name MMFControls
extends RefCounted

const DEFAULTS={"forward":KEY_W,"back":KEY_S,"left":KEY_A,"right":KEY_D,"jump":KEY_SPACE,"sprint":KEY_SHIFT,"crouch":KEY_CTRL,"use":KEY_E,"reload":KEY_R,"rifle":KEY_1,"shotgun":KEY_2,"salvage_tool":KEY_3,"reel":KEY_F,"build":KEY_B,"build_undo":KEY_Z,"build_copy":KEY_Y,"catalog":KEY_G,"rotate_left":KEY_Q,"shoulder":KEY_V,"deck_up":KEY_PAGEUP,"deck_down":KEY_PAGEDOWN,"deck_auto":KEY_HOME,"demolish":KEY_X,"terminal":KEY_TAB,"pause":KEY_ESCAPE}
const NAMES={"forward":"Move forward","back":"Move backward","left":"Strafe left","right":"Strafe right","jump":"Jump","sprint":"Sprint","crouch":"Crouch","use":"Interact / rotate right","reload":"Reload","rifle":"Equip rifle","shotgun":"Equip shotgun","salvage_tool":"Equip salvage cutter","reel":"Throw salvage hook","build":"Build / exit placement","build_undo":"Undo last construction","build_copy":"Copy aimed blueprint","catalog":"Build catalogue","rotate_left":"Rotate left","shoulder":"Swap shoulder / relocate","deck_up":"Build deck up","deck_down":"Build deck down","deck_auto":"Automatic build deck","demolish":"Hold to dismantle","terminal":"Terminal","pause":"Pause / cancel"}

static func valid_key(value) -> bool:
	if typeof(value) not in [TYPE_INT,TYPE_FLOAT]: return false
	return is_finite(float(value)) and float(value)==int(value) and int(value)>0 and int(value)<KEY_UNKNOWN and OS.get_keycode_string(int(value))!=""

static func swap_key(mapping: Dictionary,action: String,code: int):
	var previous=int(mapping.get(action,DEFAULTS[action]))
	for other in DEFAULTS:
		if other!=action and int(mapping.get(other,DEFAULTS[other]))==code: mapping[other]=previous
	mapping[action]=code

static func normalize(raw) -> Dictionary:
	var mapping={}
	if raw is Dictionary:
		# Rebuild from defaults through swaps so duplicate/stale bindings cannot
		# leave two actions on one key or make a menu permanently inaccessible.
		for action in DEFAULTS:
			if raw.has(action) and valid_key(raw[action]): swap_key(mapping,action,int(raw[action]))
	for action in mapping.keys():
		if mapping[action]==DEFAULTS[action]: mapping.erase(action)
	return mapping

static func rebind(raw,action: String,code: int) -> Dictionary:
	var mapping=normalize(raw)
	if DEFAULTS.has(action) and valid_key(code): swap_key(mapping,action,code)
	return normalize(mapping)

static func label(mapping: Dictionary,action: String) -> String:
	if action=="fire": return "LMB"
	if action=="aim": return "RMB"
	if not DEFAULTS.has(action): return action
	var physical=int(mapping.get(action,DEFAULTS[action]))
	var display=physical if DisplayServer.get_name()=="headless" else DisplayServer.keyboard_get_keycode_from_physical(physical)
	return OS.get_keycode_string(display if display!=KEY_NONE else physical)
