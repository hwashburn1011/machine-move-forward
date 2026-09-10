from pathlib import Path
p=Path('assets/gunner-s07/viewer/index.html');s=p.read_text();s=s.replace("scene.background=new THREE.Color('#222b2e');", "scene.background=new THREE.Color('#222b2e');scene.fog=new THREE.Fog('#222b2e',7,19);")
s=s.replace("multiplyScalar(r*1.3)","multiplyScalar(r*1.1)");s=s.replace("scene.background.set(warm?'#43392e':'#222b2e');", "scene.background.set(warm?'#43392e':'#222b2e');scene.fog.color.copy(scene.background);")
s=s.replace('<label>LIGHTING</label>', '<label for="lighting">LIGHTING</label>');p.write_text(s)
