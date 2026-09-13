"""Use the installed Blender MCP endpoint for review; accepts a Python code file."""
import json
import socket
import sys
from pathlib import Path

code = Path(sys.argv[1]).read_text(encoding='utf-8') if len(sys.argv) > 1 else None
request = {'type': 'execute_code', 'params': {'code': code}} if code else {'type': 'get_scene_info', 'params': {}}
with socket.create_connection(('127.0.0.1', 9876), timeout=10) as connection:
    connection.settimeout(120)
    connection.sendall(json.dumps(request).encode())
    data = bytearray()
    while True:
        part = connection.recv(65536)
        if not part:
            break
        data.extend(part)
        try:
            reply = json.loads(data)
            print(json.dumps(reply))
            break
        except json.JSONDecodeError:
            pass
