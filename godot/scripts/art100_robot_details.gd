class_name MMFArt100RobotDetails
extends RefCounted

# Existing complete combat rigs plus fitted, authored service equipment. Each
# refined enemy still uses its exact existing capsule, animations and weapons.
const MODELS={"warden":"WardenRangefinder","revenant":"RevenantPulseRack","bastion":"BastionSiegeRadiator","sovereign":"SovereignComms","raider":"RaiderRecoveryPack","scavenger":"ScavengerSurveyPack"}
static var finishes={}
static var faction_finishes={}

static func clear_cache():
	finishes.clear();faction_finishes.clear()

static func finish_body(enemy):
	if faction_finishes.is_empty():faction_finishes=MMFAssets.json("res://art/art200-robot-finishes.json")
	for mesh in MMFAssets.of_type(enemy.visual,"MeshInstance3D"):
		if not mesh.mesh:continue
		var originals=[]
		for i in mesh.mesh.get_surface_count():
			var original=mesh.get_active_material(i)
			originals.append(original)
			if not original is StandardMaterial3D:continue
			var key=enemy.kind+":"+str(original.get_instance_id())
			if not finishes.has(key):
				var material=original.duplicate()
				var label=original.resource_name.to_lower()
				# Muted faction coatings multiply the retained source texture. No
				# geometry, texture, rig, weapon or AI resource is duplicated here.
				for rule in faction_finishes.get(enemy.kind,{}).get("rules",[]):
					if rule.contains in label:
						var factor=Color(rule.linear_factor[0],rule.linear_factor[1],rule.linear_factor[2])
						material.albedo_color=(original.albedo_color.srgb_to_linear()*factor).linear_to_srgb()
						break
				# Preserve texture detail and color identity; reduce the harsh
				# cast-metal micro-normal shimmer seen at gameplay distance.
				if material.normal_enabled:material.normal_scale*=.80
				if "glass" in label or "visor" in label:material.roughness=.19
				elif "steel" in label or "alloy" in label or "metal" in label:material.roughness=clampf(material.roughness,.35,.65)
				elif "cloth" in label or "canvas" in label or "fabric" in label:material.roughness=maxf(.85,material.roughness)
				material.texture_filter=BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
				finishes[key]=material
			mesh.set_surface_override_material(i,finishes[key])
		mesh.set_meta("art100_original_materials",originals)

static func apply(enemy):
	if not MODELS.has(enemy.kind) or enemy.visual.has_meta("art100_refined"):return
	var rigs=MMFAssets.of_type(enemy.visual,"Skeleton3D")
	if rigs.is_empty():return
	var skeleton: Skeleton3D=rigs[0]
	var bone="Spine" if enemy.kind in ["raider","scavenger"] else "spine_02"
	var index=skeleton.find_bone(bone)
	if index<0:push_error("Art100 missing original torso binding: "+enemy.kind);return
	finish_body(enemy)
	var mount=BoneAttachment3D.new();mount.name="Art100TorsoMount";mount.bone_name=bone;skeleton.add_child(mount)
	var model=MMFArt100Story.part(MODELS[enemy.kind]);mount.add_child(model)
	# Mesh vertices were authored in the original full-character metre frame.
	# Cancel the exact rest transform, rather than estimating limb offsets.
	model.transform=skeleton.get_bone_global_rest(index).affine_inverse()
	enemy.visual.set_meta("art100_refined",true)
	enemy.visual.set_meta("art100_assembly",MODELS[enemy.kind])
	enemy.meshes=MMFAssets.of_type(enemy.visual,"MeshInstance3D")
