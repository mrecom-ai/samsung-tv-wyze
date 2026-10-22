"""Build an unsigned widget or sign it using the owner's Samsung SDK profile."""
import argparse, json, shutil, subprocess, time, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sdk', type=Path, help='Your Tizen Studio installation directory')
parser.add_argument('--profile', help='Your Samsung TV certificate profile name')
parser.add_argument('--profiles', type=Path, help='Optional profiles.xml location')
parser.add_argument('--setup', action='store_true', help='Include the prepared, private one-time setup session')
parser.add_argument('--unsigned', action='store_true', help='Build without certificates; cannot install as-is')
args = parser.parse_args()
manifest = ET.parse(ROOT / 'app/config.xml')
ns = {'w':'http://www.w3.org/ns/widgets', 't':'http://tizen.org/ns/widgets'}
runtime = None
if args.setup:
    session = json.loads((ROOT / '.local/setup-session.json').read_text())
    if time.time() * 1000 >= session['expires']:
        raise SystemExit('Setup session expired. Run setup.cjs prepare again.')
    runtime = (ROOT / '.local/runtime-config.js').read_text()
    origin = 'http://{}:{}'.format(session['host'], session['port'])
    ET.SubElement(manifest.getroot(), '{http://www.w3.org/ns/widgets}access', {'origin':origin, 'subdomains':'false'})
    policy = manifest.find('t:content-security-policy', ns)
    policy.text = policy.text.replace('connect-src ', 'connect-src ' + origin + ' ')
ET.register_namespace('', ns['w']); ET.register_namespace('tizen', ns['t'])
dist = ROOT / 'dist'; dist.mkdir(exist_ok=True)
unsigned = dist / 'CameraView-unsigned.wgt'
with zipfile.ZipFile(unsigned, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted((ROOT / 'app').rglob('*')):
        if not p.is_file() or p.name.startswith('.') or p.suffix not in {'.html','.css','.js','.png','.LICENSE','.xml'}:
            continue
        name = p.relative_to(ROOT / 'app').as_posix()
        if name == 'config.xml': z.writestr(name, ET.tostring(manifest.getroot(), encoding='utf-8', xml_declaration=True))
        elif name == 'runtime-config.js' and runtime is not None: z.writestr(name, runtime)
        else: z.write(p, name)
    z.write(ROOT / 'LICENSE', 'LICENSE.txt'); z.write(ROOT / 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.txt')
if args.unsigned:
    print('Unsigned widget created:', unsigned)
    raise SystemExit(0)
if not args.sdk or not args.profile:
    raise SystemExit('Signing requires --sdk PATH --profile NAME. Use --unsigned for an offline build.')
cli = args.sdk.expanduser().resolve() / 'tools/ide/bin/tizen'
if not cli.is_file():
    cli = cli.with_suffix('.bat')
if not cli.is_file(): raise SystemExit('Tizen CLI not found under the supplied SDK directory.')
if args.profiles:
    subprocess.run([str(cli), 'cli-config', 'default.profiles.path=' + str(args.profiles.expanduser().resolve())], check=True)
signed = dist / 'signed'; signed.mkdir(exist_ok=True)
subprocess.run([str(cli), 'package', '-t', 'wgt', '-s', args.profile, '-o', str(signed), '--', str(unsigned)], check=True)
result = signed / unsigned.name
with zipfile.ZipFile(result) as z:
    if not {'author-signature.xml','signature1.xml'}.issubset(z.namelist()):
        raise SystemExit('Samsung author/distributor signatures missing.')
shutil.copy2(result, dist / 'CameraView.wgt')
print('Signed widget created:', dist / 'CameraView.wgt')
