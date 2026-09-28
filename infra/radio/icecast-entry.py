import os
import xml.etree.ElementTree as ET

source = os.environ.get('ICECAST_SOURCE_PASSWORD', '')
admin = os.environ.get('ICECAST_ADMIN_PASSWORD', '')
if len(source) < 24 or len(admin) < 24:
    raise RuntimeError('Configure strong Icecast secrets')
root = ET.Element('icecast')
def add(parent, name, value):
    ET.SubElement(parent, name).text = str(value)
add(root, 'location', 'TUSOVA'); add(root, 'admin', 'no-reply@tusova.su')
limits = ET.SubElement(root, 'limits')
for key, value in {'clients':200,'sources':1,'queue-size':262144,'burst-size':16384,'source-timeout':10}.items(): add(limits,key,value)
auth = ET.SubElement(root, 'authentication')
for key, value in {'source-password':source,'relay-password':admin,'admin-user':'admin','admin-password':admin}.items(): add(auth,key,value)
add(root, 'hostname', 'localhost')
listen = ET.SubElement(root, 'listen-socket'); add(listen, 'port', 8000)
paths = ET.SubElement(root, 'paths')
for key, value in {'basedir':'/usr/share/icecast2','logdir':'/tmp','webroot':'/usr/share/icecast2/web','adminroot':'/usr/share/icecast2/admin'}.items(): add(paths,key,value)
logging = ET.SubElement(root, 'logging'); add(logging, 'accesslog', '-'); add(logging, 'errorlog', '-'); add(logging, 'loglevel', 2)
mount = ET.SubElement(root, 'mount', {'type':'normal'}); add(mount, 'mount-name', '/live.mp3'); add(mount, 'public', 0)
ET.ElementTree(root).write('/tmp/icecast.xml', encoding='utf-8')
os.execvp('icecast2', ['icecast2', '-c', '/tmp/icecast.xml'])
