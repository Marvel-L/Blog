#!/bin/sh
# Complete an existing IP deployment after credentials have been filled on the server.
set -eu
cd /opt/dblog/current
python3 - <<'PY'
from pathlib import Path
values = dict(line.split('=', 1) for line in Path('/opt/dblog/shared/cloud.env').read_text().splitlines() if line and not line.startswith('#') and '=' in line)
if not all(values.get(name, '').strip() for name in ('GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET')):
    raise SystemExit('请先通过 sudoedit 填写 /opt/dblog/shared/cloud.env 的 GitHub 凭据；未启动未配置的 API。')
PY
docker compose --env-file /opt/dblog/shared/cloud.env -f deploy/cloud/compose.yml -f deploy/cloud/compose.ip.yml up -d --wait --wait-timeout 120
