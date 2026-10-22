"""Install, launch, list or uninstall this viewer through Samsung Developer Mode."""
import argparse, hashlib, ipaddress, subprocess, time, zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('action',choices=['info','install','launch'])
p.add_argument('--sdk',required=True,type=Path);p.add_argument('--host',required=True)
a=p.parse_args();ipaddress.ip_address(a.host)
sdb=a.sdk.expanduser().resolve()/'tools/sdb'
if not sdb.is_file():sdb=sdb.with_suffix('.exe')
if not sdb.is_file():raise SystemExit('SDB not found in your SDK.')
identity=ET.parse(ROOT/'app/config.xml').find('{http://tizen.org/ns/widgets}application')
app=identity.get('id');package=identity.get('package');serial=a.host+':26101'
def run(*args):
    r=subprocess.run([str(sdb),*args],text=True,capture_output=True,timeout=60)
    out=r.stdout+r.stderr;print(out,end='' if out.endswith('\n') else '\n')
    if r.returncode:raise SystemExit('Samsung developer command failed.')
    return out
run('connect',serial)
cap=run('-s',serial,'capability')
if a.action=='info':raise SystemExit(0)
if a.action=='launch':
    if 'successfully launched' not in run('-s',serial,'shell','0','execute',app):raise SystemExit('Launch not confirmed. Check the TV.')
else:
    widget=ROOT/'dist/CameraView.wgt'
    if not widget.is_file():raise SystemExit('Build and sign CameraView.wgt first.')
    with zipfile.ZipFile(widget) as z:
        if not {'author-signature.xml','signature1.xml'}.issubset(z.namelist()):raise SystemExit('Widget is unsigned.')
        got=ET.fromstring(z.read('config.xml')).find('{http://tizen.org/ns/widgets}application')
        if got.attrib!=identity.attrib:raise SystemExit('Widget identity differs from this checkout.')
    dirs=dict(line.split(':',1) for line in cap.splitlines() if ':' in line)
    remote_dir=PurePosixPath(dirs.get('sdk_toolpath',''))
    if not remote_dir.is_absolute() or '..' in remote_dir.parts:raise SystemExit('SDK upload path unavailable; use Tizen Studio Device Manager.')
    remote=str(remote_dir/('CameraView-'+hashlib.sha256(widget.read_bytes()).hexdigest()[:12]+'-'+str(time.time_ns())+'.wgt'))
    if '1 file(s) pushed' not in run('-s',serial,'push',str(widget),remote):raise SystemExit('Upload not confirmed.')
    out=run('-s',serial,'shell','0','vd_appinstall',app,remote)
    if 'install completed' not in out or 'install failed' in out:raise SystemExit('Installation not confirmed; see certificate troubleshooting.')
    if app not in run('-s',serial,'shell','0','applist'):raise SystemExit('Installed app missing from app list.')
    print('Camera View installed. Run the launch command next.')
