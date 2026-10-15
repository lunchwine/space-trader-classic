"""Build the PWA deploy copy in pwa/dist from root index.html (run scripts/build.py first)."""
from pathlib import Path
import hashlib,shutil
root=Path(__file__).resolve().parents[1]
src=root/'index.html'
if not src.exists(): raise SystemExit('index.html missing: run "npm run build" first')
text=src.read_text()
for tag in ['</head>','</body>']: assert text.count(tag)==1,f'expected exactly one {tag} in index.html'
# The page already carries <meta name="theme-color">; do not add a second one.
assert text.count('<meta name="theme-color"')==1,'expected existing theme-color meta in index.html'
text=text.replace('</head>','<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icons/icon-192.png"></head>')
text=text.replace('</body>',"<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js')</script></body>")
icons=sorted((root/'pwa/icons').glob('*.png'))
# Version covers everything the service worker precaches, not just the page.
h=hashlib.sha256(text.encode())
for f in [root/'pwa/manifest.webmanifest',*icons]: h.update(f.read_bytes())
version=h.hexdigest()[:10]
sw=(root/'pwa/sw.js').read_text()
assert sw.count('/*VERSION*/')==1,'sw.js version token missing'
dist=root/'pwa/dist'
shutil.rmtree(dist,ignore_errors=True);(dist/'icons').mkdir(parents=True)
(dist/'index.html').write_text(text)
(dist/'sw.js').write_text(sw.replace('/*VERSION*/',version))
for name in ['manifest.webmanifest','_headers']: shutil.copy(root/'pwa'/name,dist/name)
for icon in icons: shutil.copy(icon,dist/'icons'/icon.name)
print(dist)
for f in sorted(dist.rglob('*')):
    if f.is_file(): print(' ',f.relative_to(dist),f.stat().st_size,'bytes')
print('version',version)
