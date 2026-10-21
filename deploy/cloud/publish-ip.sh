#!/usr/bin/env bash
# Runs as root on the existing IP deployment. Never removes volumes or old releases.
set -Eeuo pipefail
commit=${1:-}
digest=${2:-}
if [[ $EUID != 0 ]] || [[ ! $commit =~ ^[a-f0-9]{40}$ ]] || [[ ! $digest =~ ^[a-f0-9]{64}$ ]]; then
  echo '需要 root、完整提交 SHA 和发布包 SHA256。' >&2
  exit 1
fi
archive=/home/ubuntu/dblog-deploy/$commit.tar.gz
release_tag=$commit-${digest:0:12}
release=/opt/dblog/releases/$release_tag
env_file=/opt/dblog/shared/cloud.env
exec 9>/opt/dblog/shared/deploy.lock
flock -n 9 || { echo '已有云端发布正在执行。' >&2; exit 1; }
printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status
previous=$(readlink -f /opt/dblog/current)
[[ -d $previous && -f $env_file ]] || { echo '缺少已有发布或生产配置。' >&2; exit 1; }

compose_at() {
  local directory=$1
  shift
  docker compose --env-file "$env_file" \
    -f "$directory/deploy/cloud/compose.yml" -f "$directory/deploy/cloud/compose.ip.yml" "$@"
}
old_site_image=$(docker inspect --format '{{.Config.Image}}' "$(compose_at "$previous" ps -q web)")
old_api_image=$(docker inspect --format '{{.Config.Image}}' "$(compose_at "$previous" ps -q api)")
[[ $old_site_image == dblog-site:* && $old_api_image == dblog-api:* ]] || exit 1
old_site=${old_site_image#dblog-site:}
old_api=${old_api_image#dblog-api:}

if [[ -e $release ]]; then
  [[ $(cat "$release/archive.sha256") == "$digest" ]] || {
    echo '同一提交已有不同发布包，拒绝覆盖历史版本。' >&2
    exit 1
  }
else
  staging=$(mktemp -d "/opt/dblog/releases/.$commit.XXXXXX")
  trap 'rm -rf "$staging"' EXIT
  # Validate all members before root extraction, including symlinks and traversal.
  python3 - "$archive" "$staging" <<'PY'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as source:
    for member in source.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('发布包包含不安全的路径或文件类型。')
    source.extractall(sys.argv[2], filter='data')
PY
  (cd "$staging" && sha256sum --check --status SHA256SUMS)
  python3 - "$staging/dist/cloud-release.json" "$commit" <<'PY'
import json, sys
with open(sys.argv[1]) as source:
    data = json.load(source)
if data != {'commit': sys.argv[2], 'target': 'cloud'}:
    raise SystemExit('发布产物与提交不一致。')
PY
  printf '%s\n' "$digest" > "$staging/archive.sha256"
  mv "$staging" "$release"
  trap - EXIT
fi
(cd "$release" && sha256sum --check --status SHA256SUMS)

write_tags() {
  python3 - "$env_file" "$1" "$2" <<'PY'
import os, pathlib, sys, tempfile
path = pathlib.Path(sys.argv[1])
lines = [line for line in path.read_text().splitlines()
         if not line.startswith(('SITE_IMAGE_TAG=', 'API_IMAGE_TAG='))]
lines += ['SITE_IMAGE_TAG=' + sys.argv[2], 'API_IMAGE_TAG=' + sys.argv[3]]
fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.cloud.env.')
try:
    with os.fdopen(fd, 'w') as target:
        target.write('\n'.join(lines) + '\n')
        target.flush()
        os.fsync(target.fileno())
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
}
point_current() {
  ln -sfn "$1" "/opt/dblog/.current-$$"
  mv -Tf "/opt/dblog/.current-$$" /opt/dblog/current
}
verify_public() {
  curl --fail --silent --show-error --connect-timeout 5 --max-time 20 \
    https://43.138.216.53/api/v1/health |
    python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("status") == "ok" else 1)'
  curl --fail --silent --show-error --connect-timeout 5 --max-time 20 \
    "https://43.138.216.53/Blog/cloud-release.json?commit=$commit" |
    python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin) == {"commit":sys.argv[1],"target":"cloud"} else 1)' "$commit"
}

# Build first so a network/build failure leaves the running services untouched.
SITE_IMAGE_TAG=$release_tag API_IMAGE_TAG=$release_tag compose_at "$release" build web migrate
rollback() {
  trap - ERR
  echo '发布或公网验收失败，正在恢复上一版镜像。' >&2
  if SITE_IMAGE_TAG=$old_site API_IMAGE_TAG=$old_api compose_at "$previous" \
    up -d --no-build --wait --wait-timeout 180 api web; then
    write_tags "$old_site" "$old_api"
    point_current "$previous"
    echo '已恢复上一版镜像；数据库迁移不会自动回退。' >&2
  else
    echo '恢复上一版失败，需要检查服务器容器状态。' >&2
  fi
  exit 1
}
trap rollback ERR
SITE_IMAGE_TAG=$release_tag API_IMAGE_TAG=$release_tag compose_at "$release" \
  up -d --no-build --wait --wait-timeout 180 api web
verify_public
write_tags "$release_tag" "$release_tag"
point_current "$release"
trap - ERR
rm -f "$archive"
echo "云端已发布并通过公网验收：$commit"
