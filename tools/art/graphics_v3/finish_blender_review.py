"""Remove the superseded owned preview scene, preserving the user's scene."""
import bpy
old=bpy.data.scenes.get('MMF_Cohesive_Walker_V3')
if old and old.get('reviewReady'):
    bpy.data.scenes.remove(old)
print({'originalFilepath':bpy.data.filepath,
       'originalSceneObjects':len(bpy.data.scenes['Scene'].objects),
       'reviews':[scene.name for scene in bpy.data.scenes if scene.get('reviewReady')]})
