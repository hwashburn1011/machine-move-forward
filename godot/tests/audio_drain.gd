extends RefCounted

static func capture(audio) -> Array:
	# Return weak references only. In a suspended test function, the temporary
	# bank.values() array can itself retain every stream until that function ends.
	var refs=[]
	for stream in audio.bank.values():refs.append(weakref(stream))
	for voice in [audio.drone_player,audio.pad_player]:
		if voice.stream:refs.append(weakref(voice.stream))
	if audio.music:
		for stream in audio.music.streams:refs.append(weakref(stream))
	if audio.game and audio.game.cinematics:
		var prelude=audio.game.cinematics.prelude
		for stream in [prelude.bed_stream,prelude.voice_stream,prelude.score_stream,prelude.fire_stream]:
			if stream:refs.append(weakref(stream))
	return refs

static func finish(tree: SceneTree,refs: Array) -> bool:
	var start=Time.get_ticks_msec()
	while Time.get_ticks_msec()-start<500:
		if refs.all(func(w):return w.get_ref()==null):return true
		# AudioServer's retirement queue needs real mixer time and main-thread
		# updates. Fixed-FPS or catch-up physics ticks alone cannot prove release.
		await tree.process_frame
		OS.delay_msec(1)
	return refs.all(func(w):return w.get_ref()==null)
