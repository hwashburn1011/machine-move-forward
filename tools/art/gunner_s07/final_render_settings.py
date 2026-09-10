from pathlib import Path
p=Path('tools/art/gunner_s07/deliver.py');s=p.read_text().replace("if 'renders' in args:\n", "if 'renders' in args:\n    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()\n    for device in prefs.devices:device.use=device.type=='OPTIX'\n    scene.cycles.device='GPU'\n")
s=s.replace("    png('03_S07_back_equipment.png'", "    bpy.data.objects['Neutral studio cyclorama'].rotation_euler.z=math.pi\n    cam=bpy.data.objects['03 • Back equipment'];cam.location=(3,6,3);cam.rotation_euler=(Vector((.25,.07,1.10))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=65\n    png('03_S07_back_equipment.png'")
p.write_text(s)
