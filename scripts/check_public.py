"""Check source candidates for private files, personal details and generated keys.

This is a release guard, not a guarantee that all possible secrets are detected.
Review the source manifest before publishing. Never export the working directory.
"""
from pathlib import Path
import hashlib, re
from xml.etree import ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
TOP = {'README.md','LICENSE','THIRD_PARTY_NOTICES.md','.gitignore','package.json'}
def public_files():
    paths=[ROOT/name for name in sorted(TOP)]
    for directory in ['app','scripts','tests','docs','.github']:
        paths.extend(p for p in (ROOT/directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc')
    return sorted(paths)
def check():
    failures=[]
    for p in public_files():
        name=p.relative_to(ROOT).as_posix()
        if p.suffix.lower() in {'.p12','.pfx','.pem','.key','.wgt','.tpk'} or p.name in {'profiles.xml','provisioning-config.js','diagnostics-config.js'}:
            failures.append(name+': private/generated file')
        if p.suffix=='.png':
            if name!='app/icon.png':failures.append(name+': unexpected binary asset')
            continue
        try:s=p.read_text()
        except UnicodeError:failures.append(name+': unexpected binary');continue
        rules={
            'personal home path':r'/(?:Users|home)/[A-Za-z][A-Za-z0-9_-]+',
            'private LAN address':r'\b(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)\b',
            'private signing block':r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
            'GitHub credential':r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b',
        }
        for label,pattern in rules.items():
            # Pattern literals in this scanner describe forbidden strings.
            if p==Path(__file__).resolve():continue
            if re.search(pattern,s):failures.append(name+': '+label)
        for email in re.findall(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',s):
            if p==Path(__file__).resolve():continue
            if name=='app/vendor/crypto-js.js' and hashlib.sha256(p.read_bytes()).hexdigest()=='ee02257ffbaf0a9b481c7039b0f3bb20c360c9674fe4be8b38ae709b2ea59bbe' and email=='jhruby.web@gmail.com':continue
            if not email.endswith(('@example.com','@example.invalid')):failures.append(name+': non-example email')
        if name=='app/runtime-config.js' and ('secretKey' in s or 'http:' in s or 'expires' in s):failures.append(name+': personalized runtime config')
    manifest=ET.parse(ROOT/'app/config.xml')
    identity=manifest.find('{http://tizen.org/ns/widgets}application')
    if identity.get('id')!='WyzeTVView.Camera' or identity.get('package')!='WyzeTVView':failures.append('Unexpected public application identity')
    if failures:raise SystemExit('\n'.join(failures))
    print('Public source checks passed: {} files. No private paths, LAN addresses, certificates, owner app identities or generated configuration found.'.format(len(public_files())))
if __name__=='__main__':check()
