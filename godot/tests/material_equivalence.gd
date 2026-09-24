extends RefCounted

static func same(a: Material,b: Material) -> bool:
	if a==b:return true
	if not a or not b or a.get_class()!=b.get_class():return false
	# A compiled material has a different container path. Its saved properties
	# and external texture/shader objects must still match the authoring source.
	for property in a.get_property_list():
		if not property.usage&PROPERTY_USAGE_STORAGE or property.name in ["resource_path","resource_scene_unique_id","resource_local_to_scene"]:continue
		if a.get(property.name)!=b.get(property.name):return false
	return true
