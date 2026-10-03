extends SceneTree
## Geometry, compound collision and actual existing save schema regression.
var checks=0
var failures=[]

func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);push_error(label)

func _initialize():call_deferred("run")

func run():
	var data=MMFAssets.json("res://data/definitions.json")
	var runtime=MMFAssets.json("res://data/runtime-play.json")
	MMFNativeSurvivorData.apply(data,runtime)
	MMFNativeProgression.apply(data)
	MMFNativeNarrativeData.apply(data)
	MMFArt100Decor.apply(data)
	MMFArt100Decor.runtime_contract(runtime)
	var count=data.BUILD_PIECE_ORDER.size()
	MMFArt100Decor.apply(data)
	check(data.BUILD_PIECE_ORDER.size()==count,"Registering furnishings twice cannot duplicate catalog rows")
	check(MMFArt100Decor.PIECES.size()==25,"Collection contains exactly 25 complete furnishings")
	var s=MMFSession.new(data)
	var index=0
	var model_root=Node3D.new();root.add_child(model_root)
	for id in MMFArt100Decor.PIECES:
		var spec=data.BUILD_PIECES[id]
		check(spec.category=="decor" and spec.anchor=="cell","Existing decoration category and one-cell placement: "+id)
		check("Cosmetic" in spec.description,"Description honestly marks cosmetic behavior: "+id)
		var model=MMFArt100Decor.model(id)
		model_root.add_child(model)
		var bounds=MMFAssets.bounds(model)
		check(absf(bounds.position.y)<.007,"Grounded at deck surface: "+id)
		check(bounds.size.x<=2.001 and bounds.size.z<=2.001,"Metre-scale asset fits its deck tile: "+id)
		var meshes=MMFAssets.of_type(model,"MeshInstance3D")
		check(not meshes.is_empty() and meshes.size()<=8,"One to eight material batches: "+id)
		check(not runtime.pieceColliders[id].is_empty(),"Physical furnishing has collision: "+id)
		for shape in runtime.pieceColliders[id]:
			var extent=MMFAssets.v(shape.half)*2.0
			check(extent.x>0 and extent.y>0 and extent.z>0,"Positive compound collider size: "+id)
			check(MMFAssets.v(shape.offset).y-MMFAssets.v(shape.half).y>=-.007,"Collider does not protrude below floor: "+id)
			var body=MMFAssets.collider(model,{"position":shape.offset,"half":shape.half})
			body.set_meta("furnishing",id)
		await physics_frame
		await physics_frame
		var sample=runtime.pieceColliders[id][0]
		var center=MMFAssets.v(sample.offset)
		var height=float(sample.half.y)+.03
		var ray=PhysicsRayQueryParameters3D.create(center+Vector3.UP*height,center-Vector3.UP*height)
		var hit=model_root.get_world_3d().direct_space_state.intersect_ray(ray)
		check(not hit.is_empty() and hit.collider.get_meta("furnishing","")==id,"Live physics blocks contact with furnishing: "+id)
		model.position=Vector3(3,0,2);model.rotation.y=PI/2
		await physics_frame
		await physics_frame
		center=model.global_transform*MMFAssets.v(sample.offset)
		ray=PhysicsRayQueryParameters3D.create(center+Vector3.UP*height,center-Vector3.UP*height)
		hit=model_root.get_world_3d().direct_space_state.intersect_ray(ray)
		check(not hit.is_empty() and hit.collider.get_meta("furnishing","")==id,"Collision follows translation and quarter-turn movement: "+id)
		var payment_before={}
		for item in spec.cost:
			s.inventory.add(item,int(spec.cost[item]))
			payment_before[item]=s.count_resource(item)
		var placement_cell={"x":20+index%5,"y":0,"z":20+int(index/5)}
		check(MMFSaveValidation.cell(placement_cell),"Save fixture uses a legal construction cell: "+id)
		var made=s.create_piece(id,placement_cell,index%4)
		check(not made.is_empty() and made.definitionId==id,"Existing creation path accepts persistent ID: "+id)
		for item in spec.cost:check(s.count_resource(item)==payment_before[item]-spec.cost[item],"Purchase debits exact material cost: "+id+" / "+item)
		model.free();index+=1
	var saved=s.native_snapshot();var restored=MMFSession.new(data)
	check(restored.restore_native(saved),"All 25 placements round-trip through the real native save validator")
	for id in MMFArt100Decor.PIECES:
		check(restored.structures.any(func(p):return p.definitionId==id),"Save retains furnishing ID: "+id)
	# Furniture kneespace and cage openings must not become full bounding boxes.
	for id in ["nomad-repair-trestle","nomad-chart-desk","nomad-field-chair","nomad-coat-rack"]:
		var blocked=false
		var probe=Vector3(0,.20,0)
		for raw in runtime.pieceColliders[id]:
			var half=MMFAssets.v(raw.half);var center=MMFAssets.v(raw.offset)
			if AABB(center-half,half*2).has_point(probe):blocked=true
		check(not blocked,"Open lower center retains actual negative space: "+id)
	model_root.free()
	MMFArt100Decor.clear_cache()
	print("ART100_DECOR ",checks," checks; ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
