extends SceneTree

# Minimal engine-only reproduction: no game scripts, assets cache or callbacks.
var streams=[]

func _initialize():call_deferred("run")

func create_voices() -> Node:
	var parent=Node.new();root.add_child(parent)
	for i in 3:
		var voice=AudioStreamPlayer.new();parent.add_child(voice)
		var stream=AudioStreamWAV.new();stream.format=AudioStreamWAV.FORMAT_16_BITS;stream.mix_rate=22050
		var bytes=PackedByteArray();bytes.resize(22050);stream.data=bytes
		voice.stream=stream;voice.play();streams.append(weakref(stream))
	return parent

func detach(parent: Node):
	for voice in parent.get_children():voice.stop();voice.stream=null
	parent.queue_free()

func run():
	var parent=create_voices();detach(parent);parent=null
	var start=Time.get_ticks_msec()
	for i in 4:await physics_frame
	print("MIXER_PROBE after four physics ticks: ",Time.get_ticks_msec()-start," ms, live streams=",streams.filter(func(w):return w.get_ref()!=null).size())
	if "--drain" in OS.get_cmdline_user_args():
		# Audio mixing uses real time even when a fixed-FPS diagnostic fast-forwards.
		OS.delay_msec(120)
		for i in 4:await process_frame
		print("MIXER_PROBE after real mixer time: ",Time.get_ticks_msec()-start," ms, live streams=",streams.filter(func(w):return w.get_ref()!=null).size())
	call_deferred("quit")
