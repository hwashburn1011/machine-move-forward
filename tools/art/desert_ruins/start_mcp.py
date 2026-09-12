"""Start the installed local Blender MCP addon in a dedicated new Blender session."""
import bpy, importlib.util
path='C:/Users/hwash/AppData/Roaming/Blender Foundation/Blender/5.1/scripts/addons/addon.py'
spec=importlib.util.spec_from_file_location('mmf_blender_mcp',path)
addon=importlib.util.module_from_spec(spec);spec.loader.exec_module(addon)
addon.register()
bpy.types.Scene.blender_mcp_server=addon.BlenderMCPServer(host='127.0.0.1',port=9876)
bpy.types.Scene.blender_mcp_server.start()
