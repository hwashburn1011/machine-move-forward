"""Local client for the installed Blender MCP addon's JSON socket protocol.

Only the supervising art agent uses the interactive connection. Asset workers
run their own isolated Blender files. Examples:
  python tools/art/graphics_v2/mcp_client.py scene
  python tools/art/graphics_v2/mcp_client.py code --file path/to/scoped_script.py
"""
import argparse
import json
from pathlib import Path
import socket


def request(command, params=None, timeout=45):
    with socket.create_connection(('127.0.0.1', 9876), timeout=10) as connection:
        connection.settimeout(timeout)
        connection.sendall(json.dumps({'type': command, 'params': params or {}}).encode())
        data = bytearray()
        while True:
            part = connection.recv(65536)
            if not part:
                raise RuntimeError('Blender closed before completing its response')
            data.extend(part)
            try:
                response = json.loads(data.decode())
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            if response.get('status') != 'success':
                raise RuntimeError(response.get('message', str(response)))
            return response


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['scene', 'code', 'screenshot'])
    parser.add_argument('--file')
    parser.add_argument('--timeout', type=int, default=45)
    args = parser.parse_args()
    if args.command == 'scene':
        response = request('get_scene_info')
    elif args.command == 'code':
        if not args.file:
            parser.error('code requires --file')
        response = request('execute_code', {'code': Path(args.file).read_text(encoding='utf8')}, args.timeout)
    else:
        if not args.file:
            parser.error('screenshot requires --file')
        response = request('get_viewport_screenshot', {'filepath': str(Path(args.file).resolve()), 'max_size': 1400})
    print(json.dumps(response, indent=2))
