extends RefCounted

var hashes={}
var links={}
var reverse_links={}
var differences=[]
var node_count=0
var resource_count=0

func representation(value):
	if value is Resource:return fingerprint(value)
	if value is Array:
		var result=[]
		for item in value:result.append(representation(item))
		return result
	if value is Dictionary:
		var result={};var keys=value.keys();keys.sort()
		for key in keys:result[key]=representation(value[key])
		return result
	return value

func fingerprint(resource: Resource) -> String:
	if resource.resource_path!="" and not resource.resource_path.contains("::"):return resource.get_class()+":"+resource.resource_path
	if hashes.has(resource):return hashes[resource]
	var props={"class":resource.get_class()};hashes[resource]="visiting"
	for property in resource.get_property_list():
		if property.usage&PROPERTY_USAGE_STORAGE and property.name not in ["resource_path","resource_scene_unique_id","resource_local_to_scene"]:props[property.name]=representation(resource.get(property.name))
	var context=HashingContext.new();context.start(HashingContext.HASH_SHA256);context.update(var_to_bytes(props));hashes[resource]=context.finish().hex_encode();return hashes[resource]

func equal_value(a,b) -> bool:
	# Node metadata may retain original materials inside surface-index maps.
	# Compare those values by the same property fingerprint and bijective
	# resource-sharing contract used for direct material properties.
	if a is Dictionary or b is Dictionary:
		if not a is Dictionary or not b is Dictionary or a.size()!=b.size():return false
		for key in a:
			if not b.has(key) or not equal_value(a[key],b[key]):return false
		return true
	if a is Array or b is Array:
		if not a is Array or not b is Array or a.size()!=b.size():return false
		for index in a.size():
			if not equal_value(a[index],b[index]):return false
		return true
	if a is Resource and b is Resource:
		if fingerprint(a)!=fingerprint(b):return false
		if links.has(a) and links[a]!=b:return false
		if reverse_links.has(b) and reverse_links[b]!=a:return false
		links[a]=b;reverse_links[b]=a;resource_count+=1;return true
	if a is float and b is float:return is_equal_approx(a,b)
	if a is Vector3 and b is Vector3:return a.is_equal_approx(b)
	if a is Transform3D and b is Transform3D:return a.is_equal_approx(b)
	if a is Basis and b is Basis:return a.is_equal_approx(b)
	if a is Color and b is Color:return a.is_equal_approx(b)
	return a==b

func compare(a: Node,b: Node,path=""):
	node_count+=1;path+="/"+str(a.name)
	if a.get_class()!=b.get_class():differences.append(path+": class");return
	if not str(a.name).begins_with("@") and a.name!=b.name:differences.append(path+": name differs: "+str(b.name))
	for property in a.get_property_list():
		if not property.usage&PROPERTY_USAGE_STORAGE or property.name in ["name","owner","scene_file_path","unique_name_in_owner"]:continue
		if not equal_value(a.get(property.name),b.get(property.name)):differences.append(path+": "+property.name)
	if a.get_child_count()!=b.get_child_count():differences.append(path+": child count "+str(a.get_child_count())+" vs "+str(b.get_child_count()));return
	for i in a.get_child_count():compare(a.get_child(i),b.get_child(i),path)

func clear():hashes.clear();links.clear();reverse_links.clear()
