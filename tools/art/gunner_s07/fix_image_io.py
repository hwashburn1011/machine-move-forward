from pathlib import Path
p=Path('tools/art/gunner_s07/build.py');s=p.read_text();start=s.index('def save_image(');end=s.index('\ndef surface(',start)
s=s[:start]+'''def save_image(name,data,color=False):
    # Write explicit 8-bit PNG samples, then reload as a file image. This avoids
    # generated-image color interpretation differing from exported PNG textures.
    import struct,zlib
    h,w=data.shape[:2];pixels=(np.clip(data,0,1)*255+.5).astype(np.uint8)[::-1]
    raw=b''.join(b'\\x00'+row.tobytes() for row in pixels)
    def chunk(kind,value):return struct.pack('>I',len(value))+kind+value+struct.pack('>I',zlib.crc32(kind+value)&0xffffffff)
    path=OUT/'textures'/f'{name}.png'
    path.write_bytes(b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('>2I5B',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))
    im=bpy.data.images.load(str(path),check_existing=False);im.name=name;im.colorspace_settings.name='sRGB' if color else 'Non-Color';im.pack();return im
''' +s[end:];p.write_text(s)
