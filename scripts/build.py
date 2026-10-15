"""Bundle a fully offline, standalone HTML file; no dependencies or npm build."""
from pathlib import Path
import base64,json,re,sys
root=Path(__file__).resolve().parents[1]
text=(root/'src/page.html').read_text()
version=json.loads((root/'package.json').read_text())['version']
gradle=(root/'android/app/build.gradle').read_text()
name=re.search(r"versionName\s+'([^']*)'",gradle);code=re.search(r"versionCode\s+(\d+)",gradle)
major,minor,patch=(int(n) for n in version.split('.')[:3])
want=major*10000+minor*100+patch
if not name or not code or name.group(1)!=version or int(code.group(1))!=want:
    sys.exit(f"android/app/build.gradle: versionName/versionCode must be '{version}'/{want} (package.json version); found {name and name.group(1)}/{code and code.group(1)}")
for token,file in [('STYLE','style.css'),('DATA','data.js'),('PRESENTATIONDATA','presentation-data.js'),('GENERATORS','generation.js'),('ENCOUNTERS','encounters.js'),('YARD','yard.js'),('CAMPAIGNS','campaigns.js'),('FINISHING','finishing.js'),('ENGINE','engine.js'),('UI','ui.js')]:
    text=text.replace('/*'+token+'*/',(root/'src'/file).read_text())
# WebP (quality 90, scripts/to_webp.cjs) is used where it is smaller than the original PNG.
assets={}
for png in sorted((root/'assets').glob('*.png')):
    webp=png.with_suffix('.webp')
    pick,mime=(webp,'image/webp') if webp.exists() else (png,'image/png')
    assets[png.stem]=f'data:{mime};base64,'+base64.b64encode(pick.read_bytes()).decode()
text=text.replace('/*ASSETS*/','const ASSETS='+json.dumps(assets)+';')
for weight in [400,500,700]:
    path=root/'assets/fonts'/f'Roboto-{weight}.woff2'
    text=text.replace(f'/*FONT{weight}*/','data:font/woff2;base64,'+base64.b64encode(path.read_bytes()).decode())
# Launcher icon as the favicon, so browsers do not request /favicon.ico.
text=text.replace('/*FAVICON*/','data:image/svg+xml;base64,'+base64.b64encode((root/'art/icon.svg').read_bytes()).decode())
text=text.replace('/*APPVERSION*/',version)
out=root/'index.html';out.write_text(text)
print(out, out.stat().st_size,'bytes')
