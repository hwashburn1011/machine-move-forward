extends SceneTree
## Geometry, compound collision and actual existing save schema regression.
var checks=0
var failures=[]

class ClearanceHarness:
	extends Node3D
	var game={}
	var layout_revision=0
	var bodies={}
	func piece_transform(spec: Dictionary) -> Transform3D:
		return Transform3D(Basis(Vector3.UP,-int(spec.get("rotation",0))*PI/2),Vector3(30,0,0))

func lounge_clearance(data: Dictionary,runtime: Dictionary):
	var harness=ClearanceHarness.new();root.add_child(harness)
	harness.game={"runtime":runtime,"data":data,"session":MMFSession.new(data)}
	var preview=MMFBuildPreview.new();preview.setup(harness)
	var spec={"definitionId":"nomad2-folding-lounge","cell":{"x":0,"y":0,"z":0},"rotation":0}
	var convex_count=0
	for part in preview.clearance_shapes(spec.definitionId):
		if part.shape is ConvexPolygonShape3D:
			convex_count+=1
			for point in part.shape.points:check(point.y>=.09999,"Rotated lounge clearance is clipped in deck coordinates")
	check(convex_count==5,"Back canvas and four sloping legs retain separate oriented clearance hulls")
	var origin=Vector3(30,0,0)
	var probe=MMFAssets.box(harness,Vector3.ONE*.045,origin+Vector3(0,.79,-.53))
	await physics_frame;await physics_frame
	check(preview.solid_overlap(spec),"Real solid crossing reclined canvas refuses lounge placement")
	probe.position=origin+Vector3(0,.21,0)
	await physics_frame;await physics_frame
	check(not preview.solid_overlap(spec),"Real solid in lounge under-seat opening does not block placement")
	probe.position=origin+Vector3(0,1.03,-.30)
	await physics_frame;await physics_frame
	check(not preview.solid_overlap(spec),"Space in front of reclined back remains clear instead of using a broad enclosing box")
	probe.position=origin+Vector3(.35,.15,-.58)
	await physics_frame;await physics_frame
	check(preview.solid_overlap(spec),"Sloping support leg above contact band still blocks real solid overlap")
	probe.position=origin+Vector3(.35,.055,-.61)
	await physics_frame;await physics_frame
	check(not preview.solid_overlap(spec),"Only bottom contact tolerance is removed from rotated leg clearance")
	spec.rotation=1;probe.position=harness.piece_transform(spec)*Vector3(0,.79,-.53)
	await physics_frame;await physics_frame
	check(preview.solid_overlap(spec),"Quarter-turned lounge queries the actual rotated canvas location")
	harness.game.session.structures.append({"instanceId":"moving-lounge","definitionId":spec.definitionId,"cell":spec.cell})
	harness.bodies["moving-lounge"]=probe;harness.layout_revision+=1
	check(not preview.solid_overlap(spec,"moving-lounge"),"Move preview excludes its own collision bodies")
	harness.free()

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
	MMFArt200Decor.apply(data)
	MMFArt200Decor.runtime_contract(runtime)
	var count=data.BUILD_PIECE_ORDER.size()
	MMFArt200Decor.apply(data)
	check(data.BUILD_PIECE_ORDER.size()==count,"Registering furnishings twice cannot duplicate catalog rows")
	check(MMFArt200Decor.PIECES.size()==25,"Collection contains exactly 25 complete furnishings")
	var s=MMFSession.new(data)
	var index=0
	var model_root=Node3D.new();root.add_child(model_root)
	for id in MMFArt200Decor.PIECES:
		var spec=data.BUILD_PIECES[id]
		check(spec.category=="decor" and spec.anchor=="cell","Existing decoration category and one-cell placement: "+id)
		if id=="nomad2-paint-trolley":
			# Patchcoat gives this existing furnishing a real station interaction.
			# Its catalog must describe the finish service and restoration gate,
			# rather than retaining the former "no gameplay effect" promise.
			var description=spec.description.to_lower()
			check("finish console" in description and "workbench" in description and "cosmetic finishes" in description and "no gameplay effect" not in description,"Trolley honestly describes its functional cosmetic console and workbench restoration requirement")
		else:check("Cosmetic" in spec.description,"Description honestly marks cosmetic behavior: "+id)
		var model=MMFArt200Decor.model(id)
		model_root.add_child(model)
		var bounds=MMFAssets.bounds(model)
		check(absf(bounds.position.y)<.007,"Grounded at deck surface: "+id)
		check(bounds.size.x<=2.001 and bounds.size.z<=2.001,"Metre-scale asset fits its deck tile: "+id)
		var meshes=MMFAssets.of_type(model,"MeshInstance3D")
		check(not meshes.is_empty() and meshes.size()<=8,"One to eight material batches: "+id)
		check(not runtime.pieceColliders[id].is_empty(),"Physical furnishing has collision: "+id)
		var has_ground_support=false
		for shape in runtime.pieceColliders[id]:
			var extent=MMFAssets.v(shape.half)*2.0
			check(extent.x>0 and extent.y>0 and extent.z>0,"Positive compound collider size: "+id)
			check(MMFAssets.v(shape.offset).y-MMFAssets.v(shape.half).y>=-.007,"Collider does not protrude below floor: "+id)
			var body=MMFAssets.collider(model,{"position":shape.offset,"half":shape.half})
			body.rotation.x=float(shape.get("rotX",0.0))
			body.set_meta("furnishing",id)
			if absf(float(shape.offset.y)-float(shape.half.y))<.007 and absf(float(shape.get("rotX",0)))<.001:has_ground_support=true
		check(has_ground_support,"Assembly has a physical support touching deck height: "+id)
		await physics_frame
		await physics_frame
		var sample=runtime.pieceColliders[id][0]
		var center=MMFAssets.v(sample.offset)
		var height=float(sample.half.y)+.03
		var ray=PhysicsRayQueryParameters3D.create(center+Vector3.UP*height,center-Vector3.UP*height)
		var hit=model_root.get_world_3d().direct_space_state.intersect_ray(ray)
		check(not hit.is_empty() and hit.collider.get_meta("furnishing","")==id,"Live physics blocks contact with furnishing: "+id)
		if id=="nomad2-folding-lounge":
			var cloth_center=Vector3(0,.79,-.53)
			var cloth_normal=Vector3.UP.rotated(Vector3.RIGHT,.879)
			var back_ray=PhysicsRayQueryParameters3D.create(cloth_center+cloth_normal*.18,cloth_center-cloth_normal*.18)
			var back_hit=model_root.get_world_3d().direct_space_state.intersect_ray(back_ray)
			check(not back_hit.is_empty(),"Lounge ray meets its actually inclined canvas back")
			if not back_hit.is_empty():check(back_hit.normal.dot(cloth_normal)>.995,"Lounge surface collision normal follows the authored recline")
			var open_ray=PhysicsRayQueryParameters3D.create(Vector3(0,.21,.20),Vector3(0,.21,-.20))
			check(model_root.get_world_3d().direct_space_state.intersect_ray(open_ray).is_empty(),"Lounge under-seat center remains open")
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
	for id in MMFArt200Decor.PIECES:
		check(restored.structures.any(func(p):return p.definitionId==id),"Save retains furnishing ID: "+id)
	# Furniture kneespace and cage openings must not become full bounding boxes.
	for id in ["nomad2-card-table","nomad2-instrument-bench","nomad2-microscope-bench","nomad2-typewriter-desk"]:
		var blocked=false
		var probe=Vector3(0,.20,0)
		for raw in runtime.pieceColliders[id]:
			var half=MMFAssets.v(raw.half);var center=MMFAssets.v(raw.offset)
			if AABB(center-half,half*2).has_point(probe):blocked=true
		check(not blocked,"Open lower center retains actual negative space: "+id)
	model_root.free()
	await lounge_clearance(data,runtime)
	MMFArt200Decor.clear_cache()
	print("ART200_DECOR ",checks," checks; ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
