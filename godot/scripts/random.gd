class_name MMFRandom
extends RefCounted

var state: int=0x9e3779b9
var seed: int:
	set(value): state=(value & 0xffffffff) if value!=0 else 0x9e3779b9
	get: return state

static func hash_seed(parts: Array) -> int:
	var h: int=0x811c9dc5
	for part in parts:
		var bytes=str(part).to_utf16_buffer()
		for i in range(0,bytes.size(),2): h=((h ^ bytes.decode_u16(i))*0x01000193) & 0xffffffff
		h=((h ^ 0x2f)*0x01000193) & 0xffffffff
	return h

func randf() -> float:
	state=(state+0x6d2b79f5) & 0xffffffff
	var t=state
	t=((t ^ (t>>15))*(t | 1)) & 0xffffffff
	t=(t ^ (t+((t ^ (t>>7))*(t | 61)))) & 0xffffffff
	return float((t ^ (t>>14)) & 0xffffffff)/4294967296.0

func randf_range(minimum: float,maximum: float) -> float: return minimum+self.randf()*(maximum-minimum)
func randi_range(minimum: int,maximum: int) -> int: return minimum+int(floor(self.randf()*(maximum-minimum+1)))
