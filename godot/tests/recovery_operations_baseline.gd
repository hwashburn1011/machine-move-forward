extends SceneTree

func _initialize():
	var data=MMFAssets.json("res://data/definitions.json")
	var s=MMFSession.new(data)
	s.opening_done=true;s.story.phase="route-selection"
	var observations={"source_hash":MMFPlaytestRecorder.source_fingerprint()}
	var fuel=s.fuel;s.tick(1);observations.one_second_fuel=fuel-s.fuel
	s.fuel=0;s.speed=0;s.tick(1);observations.empty_fuel_speed=s.speed
	s.subsystems.engine=0;s.speed=0;s.tick(1);observations.destroyed_engine_speed=s.speed
	s.subsystems.engine=data.SUBSYSTEMS.engine.maxHealth;s.fuel=20
	s.structures=s.structures.filter(func(p):return p.definitionId!="generator")
	s.speed=0;s.tick(1);observations.missing_generator_speed=s.speed
	var file=FileAccess.open("res://../test-results/recovery-operations-current-observations.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(observations,"  "))
	print(JSON.stringify(observations));quit()
