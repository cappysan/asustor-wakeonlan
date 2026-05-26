#!/bin/sh
# Wakeonlan CGI - POSIX shell, no bashisms

LOG=/tmp/wakeonlan.log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] === invoked === method=$REQUEST_METHOD qs=$QUERY_STRING len=$CONTENT_LENGTH" >> "$LOG"

BODY=""
if [ "$REQUEST_METHOD" = "POST" ] && [ -n "$CONTENT_LENGTH" ] && [ "$CONTENT_LENGTH" -gt 0 ]; then
    BODY=$(dd bs=1 count="$CONTENT_LENGTH" 2>/dev/null)
fi
echo "[$(date '+%Y-%m-%d %H:%M:%S')] body=$BODY" >> "$LOG"

ALL_PARAMS="${QUERY_STRING}&${BODY}"

urldecode() {
    echo "$1" | awk 'BEGIN{
        for (i=0; i<256; i++) chr[sprintf("%02X", i)] = sprintf("%c", i)
    }
    {
        gsub(/\+/, " ")
        out = ""
        while (match($0, /%[0-9A-Fa-f][0-9A-Fa-f]/)) {
            out = out substr($0, 1, RSTART-1) chr[toupper(substr($0, RSTART+1, 2))]
            $0 = substr($0, RSTART+RLENGTH)
        }
        print out $0
    }'
}

get_param() {
    raw=$(echo "$ALL_PARAMS" | tr '&' '\n' | grep "^${1}=" | head -1 | cut -d= -f2-)
    urldecode "$raw"
}

ACT=$(get_param act)
MAC=$(get_param mac)
BCAST=$(get_param broadcast)
PORT=$(get_param port)

[ -z "$BCAST" ] && BCAST="255.255.255.255"
[ -z "$PORT"  ] && PORT="9"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] act=$ACT mac=$MAC bcast=$BCAST port=$PORT" >> "$LOG"

respond() {
    printf 'Content-Type: application/json\r\n\r\n'
    printf '%s' "$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] response: $1" >> "$LOG"
}

find_python() {
    for P in python3 python /usr/local/bin/python3 /usr/bin/python3 /usr/bin/python; do
        if command -v "$P" >/dev/null 2>&1; then echo "$P"; return; fi
    done
}

CFG_DIR="/share/Configuration/wakeonlan"
SAVED_FILE="$CFG_DIR/saved.json"

case "$ACT" in

    send)
        CLEAN_MAC=$(echo "$MAC" | tr 'a-z' 'A-Z' | tr '-' ':')
        if ! echo "$CLEAN_MAC" | grep -qE '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'; then
            respond '{"success":false,"error_code":5302,"error_msg":"Invalid MAC address"}'
            exit 0
        fi
        PYTHON=$(find_python)
        if [ -z "$PYTHON" ]; then
            respond '{"success":false,"error_code":500,"error_msg":"No python interpreter found"}'
            exit 0
        fi
        ERR=$("$PYTHON" -c "
import socket
mac = '${CLEAN_MAC}'.replace(':', '')
packet = b'\xff' * 6 + bytes.fromhex(mac) * 16
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
s.sendto(packet, ('${BCAST}', ${PORT}))
s.close()
" 2>&1)
        if [ -n "$ERR" ]; then
            ESCAPED=$(echo "$ERR" | sed 's/"/\\"/g' | tr '\n' ' ')
            respond "{\"success\":false,\"error_code\":500,\"error_msg\":\"$ESCAPED\"}"
        else
            respond '{"success":true}'
        fi
        ;;

    save)
        NAME=$(get_param name)
        if [ -z "$NAME" ] || [ -z "$MAC" ]; then
            respond '{"success":false,"error_code":5302,"error_msg":"name and mac are required"}'
            exit 0
        fi
        mkdir -p "$CFG_DIR"
        PYTHON=$(find_python)
        if [ -z "$PYTHON" ]; then
            respond '{"success":false,"error_code":500,"error_msg":"No python interpreter found"}'
            exit 0
        fi
        ERR=$("$PYTHON" - << PYEOF 2>&1
import json, os, time

saved_file = '${SAVED_FILE}'
name       = '${NAME}'
mac        = '${MAC}'
broadcast  = '${BCAST}'
port       = '${PORT}'

entries = []
if os.path.exists(saved_file):
    try:
        with open(saved_file) as f:
            entries = json.load(f)
    except Exception:
        entries = []

# Reject duplicate {mac, broadcast, port}
for e in entries:
    eb = e.get('broadcast') or '255.255.255.255'
    ep = e.get('port')      or '9'
    if e.get('mac') == mac and eb == broadcast and ep == port:
        import sys
        print('DUPLICATE', file=sys.stderr)
        sys.exit(1)

entries.append({
    'id':        int(time.time() * 1000),
    'name':      name,
    'mac':       mac,
    'broadcast': broadcast,
    'port':      port
})

with open(saved_file, 'w') as f:
    json.dump(entries, f)
PYEOF
)
        RC=$?
        if [ $RC -ne 0 ]; then
            if echo "$ERR" | grep -q "DUPLICATE"; then
                respond '{"success":false,"error_code":5302,"error_msg":"Duplicate entry"}'
            else
                ESCAPED=$(echo "$ERR" | sed 's/"/\\"/g' | tr '\n' ' ')
                respond "{\"success\":false,\"error_code\":500,\"error_msg\":\"$ESCAPED\"}"
            fi
        else
            respond '{"success":true}'
        fi
        ;;

    list)
        PYTHON=$(find_python)
        if [ -z "$PYTHON" ]; then
            respond '{"success":true,"data":[]}'
            exit 0
        fi
        RESULT=$("$PYTHON" - << PYEOF 2>&1
import json, os
saved_file = '${SAVED_FILE}'
entries = []
if os.path.exists(saved_file):
    try:
        with open(saved_file) as f:
            entries = json.load(f)
    except Exception:
        entries = []
print(json.dumps({'success': True, 'data': entries}))
PYEOF
)
        printf 'Content-Type: application/json\r\n\r\n'
        printf '%s' "$RESULT"
        ;;

    rename)
        ID=$(get_param id)
        NAME=$(get_param name)
        if [ -z "$ID" ] || [ -z "$NAME" ]; then
            respond '{"success":false,"error_code":5302,"error_msg":"id and name are required"}'
            exit 0
        fi
        PYTHON=$(find_python)
        if [ -z "$PYTHON" ]; then
            respond '{"success":false,"error_code":500,"error_msg":"No python interpreter found"}'
            exit 0
        fi
        ERR=$("$PYTHON" - << PYEOF 2>&1
import json, os

saved_file = '${SAVED_FILE}'
target_id  = int('${ID}')
new_name   = '${NAME}'

entries = []
if os.path.exists(saved_file):
    try:
        with open(saved_file) as f:
            entries = json.load(f)
    except Exception:
        entries = []

for e in entries:
    if e.get('id') == target_id:
        e['name'] = new_name
        break

with open(saved_file, 'w') as f:
    json.dump(entries, f)
PYEOF
)
        if [ -n "$ERR" ]; then
            ESCAPED=$(echo "$ERR" | sed 's/"/\\"/g' | tr '\n' ' ')
            respond "{\"success\":false,\"error_code\":500,\"error_msg\":\"$ESCAPED\"}"
        else
            respond '{"success":true}'
        fi
        ;;

    remove)
        ID=$(get_param id)
        if [ -z "$ID" ]; then
            respond '{"success":false,"error_code":5302,"error_msg":"id is required"}'
            exit 0
        fi
        PYTHON=$(find_python)
        if [ -z "$PYTHON" ]; then
            respond '{"success":false,"error_code":500,"error_msg":"No python interpreter found"}'
            exit 0
        fi
        ERR=$("$PYTHON" - << PYEOF 2>&1
import json, os

saved_file = '${SAVED_FILE}'
target_id  = int('${ID}')

entries = []
if os.path.exists(saved_file):
    try:
        with open(saved_file) as f:
            entries = json.load(f)
    except Exception:
        entries = []

entries = [e for e in entries if e.get('id') != target_id]

with open(saved_file, 'w') as f:
    json.dump(entries, f)
PYEOF
)
        if [ -n "$ERR" ]; then
            ESCAPED=$(echo "$ERR" | sed 's/"/\\"/g' | tr '\n' ' ')
            respond "{\"success\":false,\"error_code\":500,\"error_msg\":\"$ESCAPED\"}"
        else
            respond '{"success":true}'
        fi
        ;;

    *)
        respond "{\"success\":false,\"error_code\":400,\"error_msg\":\"Unknown action: $ACT\"}"
        ;;
esac
exit 0
