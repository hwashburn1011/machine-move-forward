"""Unreal 5.8 native import and material setup in the included isolated project."""
import unreal, json, math, traceback
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/gunner-s07';DEST='/Game/S07_Ready'
tools=unreal.AssetToolsHelpers.get_asset_tools();edit=unreal.MaterialEditingLibrary
report={'engine':unreal.SystemLibrary.get_engine_version(),'imports':[]}
def task(file,name,options=None,folder=DEST):
    t=unreal.AssetImportTask();t.filename=str(file);t.destination_path=folder;t.destination_name=name;t.automated=True;t.replace_existing=True;t.replace_existing_settings=True;t.save=True
    if options:t.options=options
    tools.import_asset_tasks([t]);return [unreal.load_asset(p) for p in t.imported_object_paths]
def linear(c):return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
def constant(mat,prop,value,x=-200,y=0):
    if isinstance(value,tuple):
        n=edit.create_material_expression(mat,unreal.MaterialExpressionConstant3Vector,x,y);n.constant=unreal.LinearColor(*value,1)
    else:n=edit.create_material_expression(mat,unreal.MaterialExpressionConstant,x,y);n.r=value
    edit.connect_material_property(n,'',prop)
try:
    for file,skeletal in [('S07_Character_Rigged.fbx',True),('S07_Heavy_Weapon.fbx',False)]:
        options=unreal.FbxImportUI();options.import_mesh=True;options.import_as_skeletal=skeletal;options.import_materials=False;options.import_textures=False;options.import_animations=False;options.create_physics_asset=False;options.automated_import_should_detect_type=False;options.mesh_type_to_import=unreal.FBXImportType.FBXIT_SKELETAL_MESH if skeletal else unreal.FBXImportType.FBXIT_STATIC_MESH
        data=options.skeletal_mesh_import_data if skeletal else options.static_mesh_import_data
        data.normal_import_method=unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS_AND_TANGENTS;data.import_uniform_scale=100.0;data.convert_scene=True;data.convert_scene_unit=False
        if not skeletal:options.static_mesh_import_data.combine_meshes=True
        for a in task(OUT/'exports'/file,Path(file).stem,options):
            entry={'path':a.get_path_name(),'type':a.get_class().get_name()}
            if isinstance(a,(unreal.SkeletalMesh,unreal.StaticMesh)):
                b=a.get_bounds();entry['size_cm']=[b.box_extent.x*2,b.box_extent.y*2,b.box_extent.z*2]
                assert (190<entry['size_cm'][2]<250) if skeletal else (150<max(entry['size_cm'])<200),entry
            report['imports'].append(entry)
    textures={}
    for p in sorted((OUT/'textures').glob('*.png')):
        objs=task(p,p.stem,folder=DEST+'/Textures')
        for tex in objs:
            if not isinstance(tex,unreal.Texture2D):continue
            if p.stem.endswith('_Normal'):
                tex.set_editor_property('compression_settings',unreal.TextureCompressionSettings.TC_NORMALMAP);tex.set_editor_property('srgb',False);tex.set_editor_property('flip_green_channel',True)
            elif p.stem.endswith('_ORM'):
                tex.set_editor_property('compression_settings',unreal.TextureCompressionSettings.TC_MASKS);tex.set_editor_property('srgb',False)
            textures[p.stem]=tex
    mats={}
    for name in sorted({n.rsplit('_',1)[0] for n in textures}):
        mat=tools.create_asset(name,DEST+'/Materials',unreal.Material,unreal.MaterialFactoryNew())
        if not mat:mat=unreal.load_asset(DEST+'/Materials/'+name)
        edit.delete_all_material_expressions(mat)
        for suffix,kind,y in [('BaseColor',unreal.MaterialSamplerType.SAMPLERTYPE_COLOR,-200),('Normal',unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL,50),('ORM',unreal.MaterialSamplerType.SAMPLERTYPE_MASKS,300)]:
            n=edit.create_material_expression(mat,unreal.MaterialExpressionTextureSample,-450,y);n.texture=textures[name+'_'+suffix];n.sampler_type=kind
            if suffix=='BaseColor':edit.connect_material_property(n,'RGB',unreal.MaterialProperty.MP_BASE_COLOR)
            elif suffix=='Normal':edit.connect_material_property(n,'RGB',unreal.MaterialProperty.MP_NORMAL)
            else:
                edit.connect_material_property(n,'R',unreal.MaterialProperty.MP_AMBIENT_OCCLUSION);edit.connect_material_property(n,'G',unreal.MaterialProperty.MP_ROUGHNESS);edit.connect_material_property(n,'B',unreal.MaterialProperty.MP_METALLIC)
        mat.set_editor_property('two_sided','Scarf' in name);edit.recompile_material(mat);mats[name]=mat
    plain={
    'S07_ExposedBevelSteel':((.285,.277,.239),.86,.39,0),'S07_Matte_Rubber':((.055,.06,.05),.05,.79,0),'S07_DeepRecess':((.008,.012,.014),.2,.48,0),'S07_Smoked_Visor':((.009,.047,.084),.66,.115,0),'S07_Cyan_Emitters':((.01,.59,1),.1,.21,5),'S07_Violet_Plasma':((.49,.006,.94),.05,.24,5),'S07_Ammunition_Brass':((.53,.355,.15),.78,.31,0),'S07_Copper_Projectiles':((.46,.24,.115),.8,.33,0),'S07_Faded_Stencil':((.65,.575,.432),.15,.84,0),'S07_Exposed_ClothFibres':((.3,.23,.14),0,.93,0)}
    for name,(color,metal,rough,emission) in plain.items():
        mat=tools.create_asset(name,DEST+'/Materials',unreal.Material,unreal.MaterialFactoryNew()) or unreal.load_asset(DEST+'/Materials/'+name);edit.delete_all_material_expressions(mat)
        color=tuple(linear(c) for c in color);constant(mat,unreal.MaterialProperty.MP_BASE_COLOR,color,y=-150);constant(mat,unreal.MaterialProperty.MP_METALLIC,metal,y=0);constant(mat,unreal.MaterialProperty.MP_ROUGHNESS,rough,y=120)
        if emission:constant(mat,unreal.MaterialProperty.MP_EMISSIVE_COLOR,tuple(c*emission for c in color),y=250)
        edit.recompile_material(mat);mats[name]=mat
    for entry in report['imports']:
        mesh=unreal.load_asset(entry['path'])
        if isinstance(mesh,unreal.SkeletalMesh):
            slots=list(mesh.get_editor_property('materials'))
            for slot in slots:
                name=str(slot.get_editor_property('imported_material_slot_name'));slot.set_editor_property('material_interface',mats.get(name))
            mesh.set_editor_property('materials',slots)
            entry['material_slots']=len(slots)
            entry['assigned_materials']=sum(bool(s.get_editor_property('material_interface')) for s in slots)
        elif isinstance(mesh,unreal.StaticMesh):
            slots=mesh.get_editor_property('static_materials')
            for i,slot in enumerate(slots):mesh.set_material(i,mats.get(str(slot.get_editor_property('imported_material_slot_name'))))
            entry['material_slots']=len(slots)
    unreal.EditorAssetLibrary.save_directory(DEST,only_if_is_dirty=False,recursive=True)
    report['status']='success';report['materials']=len(mats);report['textures']=len(textures)
except Exception:
    report['status']='failed';report['error']=traceback.format_exc();unreal.log_error(report['error'])
(OUT/'source'/'unreal_validation.json').write_text(json.dumps(report,indent=2))
unreal.log('S07_NATIVE_IMPORT '+json.dumps(report))
