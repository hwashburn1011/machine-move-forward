extends SceneTree

# Offline color-only refinement. Serialized surface buffers preserve imported
# LODs, packed normals, UVs, shadow mesh and collision triangles byte for byte.
# Re-run after changing either the imported source or this authored wear recipe.
const SOURCE="res://art/art200-wasteland.glb"
const KINDS=["art200-cinder-auto-lift","art200-rail-water-crane","art200-crosswind-compressor-house"]

static func finish_at(kind: String,p: Vector3) -> Color:
	var dust=(1.0-smoothstep(.15,.80,p.y))*.65
	var color=Color.WHITE.lerp(Color(.55,.47,.38),dust)
	if kind=="art200-rail-water-crane":
		# Water and oxide track below the valve, not across the entire column.
		var streak=(1.0-smoothstep(.08,.19,absf(p.x+.9)))*(1.0-smoothstep(.78,.95,p.y))*smoothstep(.30,.52,p.y)*smoothstep(.27,.47,absf(p.z))
		color=color.lerp(Color(.45,.36,.28),streak*.58)
		# Oxide gathers at the lower flange seam; the upper flange and the
		# exposed fastener heads retain the cleaner scoured-alloy response.
		var collar=(1.0-smoothstep(.035,.085,absf(p.y-.46)))*(1.0-smoothstep(.40,.60,absf(p.x+.9)))*(1.0-smoothstep(.42,.65,absf(p.z)))
		color=color.lerp(Color(.52,.30,.17),collar*.70)
	elif kind=="art200-crosswind-compressor-house":
		# Receiver drain / pipe unions collect lubricant immediately above feet.
		var seam=(1.0-smoothstep(.09,.25,absf(p.x-1.65)))*(1.0-smoothstep(.65,1.1,p.y))*smoothstep(.24,.42,p.y)
		color=color.lerp(Color(.42,.39,.34),seam*.46)
		var union=(1.0-smoothstep(.08,.19,absf(p.x-1.65)))*(1.0-smoothstep(.045,.13,absf(p.y-2.44)))
		color=color.lerp(Color(.42,.35,.27),union*.65)
	elif kind=="art200-cinder-auto-lift":
		# Paired working columns: sheltered guide strips remain rubbed clean,
		# with darker residue only beside the sliding bearing track.
		var guide=(1.0-smoothstep(.065,.14,absf(absf(p.x)-1.45)))*smoothstep(1.1,1.3,p.y)*(1.0-smoothstep(3.1,3.3,p.y))
		var edge=smoothstep(.215,.24,absf(p.z))*(1.0-smoothstep(.30,.35,absf(p.z)))
		color=color.lerp(Color(.30,.27,.22),guide*edge*.75)
	return color

func _initialize():
	var kit=load(SOURCE).instantiate()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://art/roadside-wear"))
	var report={"source_sha256":FileAccess.get_sha256(SOURCE),"models":{}}
	for kind in KINDS:
		var node=MMFAssets.find_named(kit,kind);var original: ArrayMesh=node.mesh
		var refined=original.duplicate();var surfaces=original.get("_surfaces").duplicate(true)
		var changed=0;var vertices=0;var added_bytes=0
		for i in surfaces.size():
			var s: Dictionary=surfaces[i];var mat=original.surface_get_material(i)
			# Preserve lettering, rubber, masonry and their established finish.
			var name=String(mat.resource_name).to_lower()
			if not ("paint" in name or "secondary" in name or name.ends_with("/ steel") or "aluminium" in name):continue
			var points: PackedVector3Array=original.surface_get_arrays(i)[Mesh.ARRAY_VERTEX]
			var old: PackedByteArray=s.attribute_data;var had_color=(int(s.format)&Mesh.ARRAY_FORMAT_COLOR)!=0
			var stride=int(old.size()/points.size());var target_stride=stride if had_color else stride+4
			var updated=PackedByteArray();updated.resize(points.size()*target_stride)
			for v in points.size():
				var color=finish_at(kind,points[v]);vertices+=1
				if color!=Color.WHITE:changed+=1
				for channel in 4:
					updated[v*target_stride+channel]=int(round(clampf(color[channel]*(old[v*stride+channel]/255.0 if had_color else 1.0),0,1)*255))
				for byte in range(4 if had_color else 0,stride):updated[v*target_stride+4+byte-(4 if had_color else 0)]=old[v*stride+byte]
			added_bytes+=updated.size()-old.size();s.attribute_data=updated;s.format=int(s.format)|Mesh.ARRAY_FORMAT_COLOR
		# ArrayMesh's serialization API preserves all compressed buffers and LODs.
		# Runtime reconnects the source's shared materials and shadow mesh. Saving
		# embedded copies would duplicate those resources across the three props.
		for surface in surfaces:surface.erase("material")
		refined.clear_surfaces();refined.set("_surfaces",surfaces)
		refined.shadow_mesh=null
		refined.set_meta("wear_source_sha256",report.source_sha256)
		refined.set_meta("wear_recipe_sha256",FileAccess.get_sha256("res://tools/bake_roadside_wear.gd"))
		var path="res://art/roadside-wear/"+kind+".res"
		assert(refined.get_faces().to_byte_array()==original.get_faces().to_byte_array())
		assert(ResourceSaver.save(refined,path,ResourceSaver.FLAG_COMPRESS)==OK)
		report.models[kind]={"vertices_sampled":vertices,"vertices_worn":changed,"added_vertex_bytes":added_bytes,"resource":path,"bytes":FileAccess.get_file_as_bytes(path).size()}
		print(kind," ",report.models[kind])
	var file=FileAccess.open("res://art/roadside-wear/manifest.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t")+"\n")
	kit.free();quit()
