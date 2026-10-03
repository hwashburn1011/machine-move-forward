extends SceneTree

var checks=0
var failures=[]
var report={"models":[]}

func _initialize():set_meta("test_mode",true);call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func run():
	var runtime=MMFAssets.json("res://data/runtime-play.json");MMFNativeProgression.runtime_contract(runtime)
	var manifest=MMFAssets.json("res://art/nomad-recovered-modules.json")
	check(FileAccess.get_sha256("res://art/nomad-recovered-modules.glb")==manifest.sha256,"Refined module GLB matches the recorded authoring hash")
	for id in ["quiet-drive","battery-bank","salvage-crane"]:
		var node=MMFNativeProgression.model(id);root.add_child(node)
		var twin=MMFNativeProgression.model(id);root.add_child(twin)
		check(node.name==id and node.transform.is_equal_approx(Transform3D.IDENTITY),"Recovered module keeps its existing root ID, origin and pivot: "+id)
		var bounds=MMFAssets.bounds(node)
		check(absf(bounds.position.y)<.001,"Refined skid sits on the existing deck level: "+id)
		check(MMFAssets.of_type(node,"CollisionObject3D").is_empty() and MMFAssets.of_type(node,"Light3D").is_empty(),"Model introduces no new collision, script or dynamic light: "+id)
		var boxes=runtime.pieceColliders[id]
		var expected=[{"offset":{"x":0,"y":.65,"z":0},"half":{"x":.68,"y":.65,"z":.65}}]
		if id=="salvage-crane":expected.append({"offset":{"x":0,"y":1.65,"z":0},"half":{"x":.2,"y":.35,"z":.55}})
		check(boxes==expected,"Legacy physical boxes remain byte-for-value equivalent: "+id)
		var deployed_boxes=MMFMachineSpaces.piece_colliders(MMFMachineSpaces.bay_candidate(id),runtime)
		var outside=0;var degenerate=0;var finite=true;var tris=0;var guides=0;var material_count={};var shared=true;var visible_meshes=0
		for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
			var peer=MMFAssets.find_named(twin,str(mesh.name));shared=shared and peer!=null and peer.mesh==mesh.mesh
			var local=node.global_transform.affine_inverse()*mesh.global_transform
			var guide_name=str(mesh.get_parent().name)
			var folded_guide=guide_name=="FoldedGuide";var extended_guide=guide_name=="ExtendedGuide"
			if folded_guide:guides+=1
			if mesh.is_visible_in_tree():visible_meshes+=1
			for s in mesh.mesh.get_surface_count():
				var mat=mesh.get_active_material(s);material_count[mat]=true
				check(mat is StandardMaterial3D and mat.albedo_texture!=null and not mat.emission_enabled,"Portable muted PBR surface without invented status glow: "+id+" / "+str(mesh.name))
				var a=mesh.mesh.surface_get_arrays(s);var vertices=a[Mesh.ARRAY_VERTEX];var indices=a[Mesh.ARRAY_INDEX]
				for v in vertices:
					var p=local*v;finite=finite and p.is_finite()
					var contained=false
					for box in deployed_boxes:
						var center=MMFAssets.v(box.offset);var half=MMFAssets.v(box.half)
						contained=contained or AABB(center-half,half*2).grow(.001).has_point(p)
					if folded_guide:contained=AABB(Vector3(-.06,1.89,-.686),Vector3(.12,.395,.261)).grow(.001).has_point(p)
					if extended_guide:contained=AABB(Vector3(-.06,2.20,-3.325),Vector3(.12,.18,.245)).grow(.001).has_point(p)
					if not contained:outside+=1
				tris+=indices.size()/3
				for i in range(0,indices.size(),3):
					if (vertices[indices[i+1]]-vertices[indices[i]]).cross(vertices[indices[i+2]]-vertices[indices[i]]).length_squared()<1e-18:degenerate+=1
		check(finite and outside==0,"Every solid vertex fits its per-instance boxes; only the two named slender cable guides use their bounded envelopes: "+id)
		check(degenerate==0 and tris==int(manifest.models[id].triangles),"Imported detailed geometry has exact expected triangles and no collapsed faces: "+id)
		check(shared and material_count.size()<=6 and visible_meshes<=12,"Repeated pieces share bounded mesh/material resources: "+id)
		if id=="salvage-crane":
			var tip=MMFAssets.find_named(node,"CableTip")
			var deployed=MMFMachineSpaces.bay_candidate(id)
			check(tip!=null and tip.position.distance_to(MMFMachineSpaces.crane_tip_local(deployed))<.0001,"Deployed fairlead ends exactly at the actual outboard live cable origin")
			check(guides==3,"Only three slender meshes form the documented non-solid guide exception")
			check(MMFAssets.find_named(node,"BoomPivot")!=null and MMFAssets.find_named(node,"JibPivot")!=null and MMFAssets.find_named(node,"GrappleStow")!=null,"Articulated boom and stowed grapple retain explicit editable assembly pivots")
			var folded=MMFAssets.find_named(node,"FoldedGuide");var extended=MMFAssets.find_named(node,"ExtendedJib")
			check(extended.visible and not folded.visible,"New build preview defaults to the only legal D3 deployed configuration")
			var old=deployed.duplicate(true);old.cell.x=0
			MMFNativeProgression.configure_model(node,old)
			var old_tip=MMFAssets.find_named(node,"FoldedCableTip")
			check(folded.visible and not extended.visible and old_tip.position.distance_to(MMFMachineSpaces.crane_tip_local(old))<.0001,"Off-bay saved cranes keep the folded visual and their original cable attachment")
			var escaped=0
			for mesh in MMFAssets.of_type(node,"MeshInstance3D"):
				if not mesh.is_visible_in_tree():continue
				var transform=node.global_transform.affine_inverse()*mesh.global_transform
				for surface in mesh.mesh.get_surface_count():
					for vertex in mesh.mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]:
						var point=transform*vertex;var contained=false
						for box in boxes:
							var center=MMFAssets.v(box.offset);var half=MMFAssets.v(box.half)
							contained=contained or AABB(center-half,half*2).grow(.001).has_point(point)
						if mesh.get_parent()==folded:contained=AABB(Vector3(-.06,1.89,-.686),Vector3(.12,.395,.261)).grow(.001).has_point(point)
						if not contained:escaped+=1
			check(escaped==0,"Folded off-bay save geometry cannot silently extend into neighboring player structures")
			MMFNativeProgression.configure_model(node,deployed)
			check(extended.visible and not folded.visible,"Moving a legacy piece to D3 safely restores the matching deployed visual")
		report.models.append({"id":id,"triangles":tris,"outside":outside,"degenerate":degenerate,"shared":shared,"bounds":str(bounds)})
		node.free();twin.free()
	check(MMFNativeProgression.MODULES["quiet-drive"].cost=={"scrap":40,"components":8} and MMFNativeProgression.MODULES["battery-bank"].cost=={"scrap":35,"components":6} and MMFNativeProgression.MODULES["salvage-crane"].cost=={"scrap":45,"components":5},"Refining all three models does not change their earned purchase costs")
	var original=MMFAssets.scene("res://art/expedition-equipment.glb")
	for id in ["heavy-cargo","recovery-platform"]:
		var retained=MMFNativeProgression.model(id);var authored=MMFAssets.find_named(original,id)
		check(authored!=null and not MMFAssets.of_type(retained,"MeshInstance3D").is_empty() and MMFAssets.of_type(retained,"MeshInstance3D").size()==MMFAssets.of_type(authored,"MeshInstance3D").size(),"Original expedition caller retains its complete visible model: "+id)
		check(MMFAssets.bounds(retained).is_equal_approx(MMFAssets.bounds(authored)),"Original expedition asset preserves its exact bounds: "+id)
		retained.free()
	original.free()
	MMFAssets.cache.clear()
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/deck-audio/recovered-module-models.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("RECOVERED_MODULE_MODEL_RESULT ",checks," checks, ",failures.size()," failures")
	call_deferred("quit",0 if failures.is_empty() else 1)
