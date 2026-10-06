extends SceneTree

var checks=0
var failures=[]
func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);push_error(label)

func _initialize():call_deferred("run")
func run():
	var sources={};var kits=[]
	for path in ["res://assets/models/props/ruins/desert-ruins.glb","res://art/art100-legacy.glb","res://art/art100-wasteland.glb","res://art/art200-wasteland.glb","res://art/art200-signs.glb"]:
		var kit=load(path).instantiate();kits.append(kit)
		for node in MMFAssets.of_type(kit,"MeshInstance3D"):sources[String(node.name)]=node
	var layout=MMFDesertLayout.new();var groups={};var quiet_rows=0;var max_count=0;var min_count=99;var samples={};var count=0
	for seed_name in ["presentation-roadside","art200-all-scenery-route","wasteland-asset-route"]:
		var seen={}
		for row in range(-240,0):
			var placements=layout.generate(seed_name,row).duplicate(true);count+=placements.size()
			check(placements==layout.generate(seed_name,row),"deterministic "+seed_name+str(row))
			check(placements.size()<=11 and not placements.is_empty(),"bounded "+seed_name+str(row))
			max_count=maxi(max_count,placements.size());min_count=mini(min_count,placements.size())
			if MMFRoadsideComposition.quiet(seed_name,row):quiet_rows+=1;check(placements.size()==1,"quiet interval "+str(row))
			var signs=0
			for p in placements:
				check(sources.has(p.kind),"existing asset "+p.kind);seen[p.kind]=true
				if not sources.has(p.kind):continue
				var b: AABB=sources[p.kind].get_aabb();var scale_value=p.width/maxf(b.size.x,b.size.z)
				var basis=Basis.from_euler(Vector3(0,p.yaw,p.tilt),EULER_ORDER_XYZ).scaled(Vector3.ONE*scale_value)
				var t=Transform3D(basis,Vector3(p.x,0,p.z)-basis*Vector3(b.get_center().x,b.position.y,b.get_center().z))
				var actual=t*b
				check(actual.end.x<=-14 or actual.position.x>=48,"actual travel/dock corridor "+p.kind)
				check(actual.position.x>=-128 and actual.end.x<=128 and actual.position.z>=-32 and actual.end.z<=32,"actual seam bounds "+p.kind)
				if MMFArt200Scenery.is_billboard(p.kind):signs+=1
				if p.has("composition"):
					groups[p.composition]=int(groups.get(p.composition,0))+1
					if not samples.has(p.composition):samples[p.composition]={"seed":seed_name,"row":row}
			for i in placements.size():
				for j in range(i+1,placements.size()):
					var a=placements[i];var b=placements[j]
					check(Vector2(a.x-b.x,a.z-b.z).length()>=.75*(a.width+b.width)+1.99,"reserved footprints do not overlap")
			check(signs<=1,"at most one sign")
		for spec in MMFDesertLayout.WASTELAND+MMFDesertLayout.ART100+MMFArt200Scenery.SPECS:check(seen.has(spec[0]),"complete foreground bag "+spec[0])
	check(groups.size()==MMFRoadsideComposition.GROUPS.size(),"all six uses appear")
	var manifest=MMFAssets.json("res://art/roadside-wear/manifest.json");var byte_total=0;var load_times={};var buffers=0
	for kind in manifest.models:
		var original: ArrayMesh=sources[kind].mesh;var start=Time.get_ticks_usec()
		var refined: ArrayMesh=MMFArt100Materials.wear_mesh(original,kind)
		load_times[kind]=(Time.get_ticks_usec()-start)/1000.0
		var part=sources[kind].duplicate();MMFArt100Materials.prepare(part)
		check(part.mesh==refined,kind+": instances share the cached refined mesh")
		for surface in refined.get_surface_count():
			if refined.surface_get_format(surface)&Mesh.ARRAY_FORMAT_COLOR:check(part.get_active_material(surface).vertex_color_use_as_albedo,kind+": baked wear is active in native material")
		part.free()
		check(refined.get_faces().to_byte_array()==original.get_faces().to_byte_array(),kind+": collision faces unchanged")
		check(refined.get_aabb()==original.get_aabb(),kind+": bounds unchanged")
		check(refined.shadow_mesh==original.shadow_mesh,kind+": original shadow mesh retained")
		check(refined.get_meta("wear_source_sha256")==FileAccess.get_sha256("res://art/art200-wasteland.glb"),kind+": provenance current")
		check(refined.get_meta("wear_recipe_sha256")==FileAccess.get_sha256("res://tools/bake_roadside_wear.gd"),kind+": wear recipe current")
		var old=original.get("_surfaces");var current=refined.get("_surfaces")
		check(old.size()==current.size(),kind+": surface budget retained")
		for i in old.size():
			for field in ["vertex_data","attribute_data","index_data"]:buffers+=current[i].get(field,PackedByteArray()).size()
			for field in ["vertex_data","index_data","lods","aabb","uv_scale"]:check(old[i].get(field)==current[i].get(field),kind+": "+field+" retained")
			var before=original.surface_get_arrays(i);var after=refined.surface_get_arrays(i)
			for field in [Mesh.ARRAY_VERTEX,Mesh.ARRAY_NORMAL,Mesh.ARRAY_TANGENT,Mesh.ARRAY_TEX_UV,Mesh.ARRAY_INDEX]:check(before[field]==after[field],kind+": array "+str(field)+" retained")
			check(original.surface_get_material(i)==refined.surface_get_material(i),kind+": materials stay shared")
		byte_total+=int(manifest.models[kind].bytes)
	check(byte_total<600000,"three baked wear resources below 600kB")
	for kit in kits:kit.free()
	var report={"passed":failures.is_empty(),"checks":checks,"failures":failures,"rows":720,"landmarks":count,"quiet_rows":quiet_rows,"minimum_landmarks":min_count,"maximum_landmarks":max_count,"groups":groups,"review_samples":samples,"wear_resource_bytes":byte_total,"wear_mesh_buffer_bytes":buffers,"wear_resource_load_ms":load_times,"load_scope":"Headless load/bind only, original GLB loaded first, warm OS cache. Not gameplay frame timing."}
	var file=FileAccess.open("res://../test-results/v1-environment-polish-20261005/checks.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"))
	print("ROADSIDE_COMPOSITION ",checks," checks; failures=",failures)
	quit(0 if failures.is_empty() else 1)
