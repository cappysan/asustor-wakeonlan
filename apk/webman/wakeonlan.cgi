#!/usr/local/bin/python3
import os, sys, json, time, socket, re
from urllib.parse import parse_qs, unquote_plus

REQUEST_METHOD = os.environ.get('REQUEST_METHOD', '')
QUERY_STRING   = os.environ.get('QUERY_STRING', '')
CONTENT_LENGTH = os.environ.get('CONTENT_LENGTH', '0')

body = ''
if REQUEST_METHOD == 'POST':
    try:
        length = int(CONTENT_LENGTH)
    except (ValueError, TypeError):
        length = 0
    if length > 0:
        body = sys.stdin.read(length)

def get_params(qs, body):
    p = {}
    for k, v in parse_qs(qs, keep_blank_values=True).items():
        p[k] = v[0]
    for k, v in parse_qs(body, keep_blank_values=True).items():
        p[k] = v[0]
    return p

params = get_params(QUERY_STRING, body)

def param(name, default=''):
    return params.get(name, default)

def respond(data):
    print('Content-Type: application/json\r\n\r\n' + json.dumps(data), end='', flush=True)

CFG_DIR    = '/share/Configuration/wakeonlan'
SAVED_FILE = os.path.join(CFG_DIR, 'saved.json')

def load_entries():
    try:
        with open(SAVED_FILE) as f:
            return json.load(f)
    except Exception:
        return []

def save_entries(entries):
    with open(SAVED_FILE, 'w') as f:
        json.dump(entries, f)

act       = param('act')
mac       = param('mac')
broadcast = param('broadcast') or '255.255.255.255'
port_str  = param('port') or '9'

try:
    port = int(port_str)
except ValueError:
    port = 9

if act == 'send':
    clean_mac = mac.upper().replace('-', ':')
    if not re.match(r'^([0-9A-F]{2}:){5}[0-9A-F]{2}$', clean_mac):
        respond({'success': False, 'error_code': 5302, 'error_msg': 'Invalid MAC address'})
        sys.exit(0)
    try:
        mac_bytes = bytes.fromhex(clean_mac.replace(':', ''))
        packet = b'\xff' * 6 + mac_bytes * 16
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.sendto(packet, (broadcast, port))
        s.close()
        respond({'success': True})
    except Exception as e:
        respond({'success': False, 'error_code': 500, 'error_msg': str(e)})

elif act == 'save':
    name = param('name')
    if not name or not mac:
        respond({'success': False, 'error_code': 5302, 'error_msg': 'name and mac are required'})
        sys.exit(0)
    entries = load_entries()
    for e in entries:
        eb = e.get('broadcast') or '255.255.255.255'
        ep = e.get('port') or '9'
        if e.get('mac') == mac and eb == broadcast and ep == port_str:
            respond({'success': False, 'error_code': 5302, 'error_msg': 'Duplicate entry'})
            sys.exit(0)
    entries.append({
        'id':        int(time.time() * 1000),
        'name':      name,
        'mac':       mac,
        'broadcast': broadcast,
        'port':      port_str,
    })
    try:
        save_entries(entries)
        respond({'success': True})
    except Exception as e:
        respond({'success': False, 'error_code': 500, 'error_msg': str(e)})

elif act == 'list':
    entries = load_entries()
    respond({'success': True, 'data': entries})

elif act == 'rename':
    entry_id = param('id')
    name     = param('name')
    if not entry_id or not name:
        respond({'success': False, 'error_code': 5302, 'error_msg': 'id and name are required'})
        sys.exit(0)
    try:
        target_id = int(entry_id)
    except ValueError:
        respond({'success': False, 'error_code': 5302, 'error_msg': 'id must be numeric'})
        sys.exit(0)
    entries = load_entries()
    for e in entries:
        if e.get('id') == target_id:
            e['name'] = name
            break
    try:
        save_entries(entries)
        respond({'success': True})
    except Exception as e:
        respond({'success': False, 'error_code': 500, 'error_msg': str(e)})

elif act == 'remove':
    entry_id = param('id')
    if not entry_id:
        respond({'success': False, 'error_code': 5302, 'error_msg': 'id is required'})
        sys.exit(0)
    try:
        target_id = int(entry_id)
    except ValueError:
        respond({'success': False, 'error_code': 5302, 'error_msg': 'id must be numeric'})
        sys.exit(0)
    entries = load_entries()
    entries = [e for e in entries if e.get('id') != target_id]
    try:
        save_entries(entries)
        respond({'success': True})
    except Exception as e:
        respond({'success': False, 'error_code': 500, 'error_msg': str(e)})

else:
    respond({'success': False, 'error_code': 400, 'error_msg': 'Unknown action: {}'.format(act)})
