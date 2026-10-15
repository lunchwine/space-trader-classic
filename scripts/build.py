"""Bundle a fully offline, standalone HTML file; no dependencies or npm build."""
from pathlib import Path
import base64,json
root=Path(__file__).resolve().parents[1]
text=(root/'src/page.html').read_text()
version=json.loads((root/'package.json').read_text())['version']
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
text=text.replace('/*APPVERSION*/',version)
out=root/'index.html';out.write_text(text)
print(out, out.stat().st_size,'bytes')
