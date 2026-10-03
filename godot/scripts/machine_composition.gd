class_name MMFMachineComposition
extends RefCounted

# Fixed dressing only. Player-owned structures are never filtered here.
const PATH="res://data/machine-spaces.json"

static func retains(name: String) -> bool:
	for site in MMFAssets.json(PATH).staticRetained:
		if site.name==name:return true
	return false

static func sites(manifest: Dictionary) -> Array:
	var selected=[]
	var names={}
	for site in MMFAssets.json(PATH).staticRetained:names[site.name]=true
	for site in manifest.sites:
		if names.has(site.name):selected.append(site)
	return selected

static func prune_children(root: Node) -> void:
	for child in root.get_children():
		if not retains(str(child.name)):
			root.remove_child(child)
			child.free()

static func install_connections(machine: Node3D) -> Node3D:
	var kit=MMFAssets.scene("res://art/nomad-service-connections.glb")
	MMFArt100Materials.prepare(kit)
	var root=Node3D.new();root.name="NativeServiceConnections";machine.add_child(root)
	var bays=MMFAssets.json(PATH).bays
	for id in ["quiet-drive","battery-bank","salvage-crane"]:
		var model=MMFAssets.find_named(kit,id)
		assert(model!=null,"Missing authored machine service connection: "+id)
		model.owner=null
		model.reparent(root,false)
		var bay=bays[id]
		model.position=Vector3(bay.cell.x*2,16.03+bay.cell.y*3.6,bay.cell.z*2)
		model.rotation.y=int(bay.rotation)*PI/2
	kit.free()
	return root
