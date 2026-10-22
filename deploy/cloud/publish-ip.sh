#!/usr/bin/env bash
# Runs as root on the existing IP deployment. Never removes volumes or old releases.
set -Eeuo pipefail
commit=${1:-}
transfer_digest=${2:-}
release_digest=${3:-}
if [[ $EUID != 0 ]] || [[ ! $commit =~ ^[a-f0-9]{40}$ ]] || [[ ! $transfer_digest =~ ^[a-f0-9]{64}$ ]] || [[ ! $release_digest =~ ^[a-f0-9]{64}$ ]]; then
  echo '需要 root、完整提交 SHA、传输包 SHA256 和完整发布 SHA256。' >&2
  exit 1
fi
archive=/home/ubuntu/dblog-deploy/$commit.tar.gz
release_tag=$commit-${release_digest:0:12}
release=/opt/dblog/releases/$release_tag
env_file=/opt/dblog/shared/cloud.env
exec 9>/opt/dblog/shared/deploy.lock
flock -n 9 || { echo '已有云端发布正在执行。' >&2; exit 1; }
printf '%s  %s\n' "$transfer_digest" "$archive" | sha256sum --check --status
started=$SECONDS
stage() {
  printf '[deploy-timing] %-28s %4ss\n' "$1" "$((SECONDS - started))"
  started=$SECONDS
}
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
  [[ $(cat "$release/archive.sha256") == "$release_digest" ]] || {
    echo '同一提交已有不同发布包，拒绝覆盖历史版本。' >&2
    exit 1
  }
else
  staging=$(mktemp -d "/opt/dblog/releases/.$commit.XXXXXX")
  delta=$(mktemp -d "/opt/dblog/releases/.delta-$commit.XXXXXX")
  trap 'rm -rf "$staging" "$delta"' EXIT
  # Validate all members before root extraction, including symlinks and traversal.
  python3 - "$archive" "$delta" <<'PY'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as source:
    for member in source.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('发布包包含不安全的路径或文件类型。')
    source.extractall(sys.argv[2], filter='data')
PY
  python3 - "$delta/DELTA.json" "$previous" <<'PY'
import json, pathlib, sys
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
if manifest.get('version') != 1 or manifest.get('base') not in ('empty', sys.argv[2]):
    raise SystemExit('差异包基线与当前线上版本不一致。')
for field in ('changed', 'removed'):
    values = manifest.get(field)
    if not isinstance(values, list) or len(values) != len(set(values)):
        raise SystemExit('差异包文件列表无效。')
    for value in values:
        path = pathlib.PurePosixPath(value)
        if not value or path.is_absolute() or '..' in path.parts or value in ('SHA256SUMS', 'DELTA.json'):
            raise SystemExit('差异包包含不安全路径。')
PY
  base=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["base"])' "$delta/DELTA.json")
  if [[ $base == empty ]]; then
    mkdir -p "$staging"
  else
    cp -al "$previous/." "$staging/"
    rm -f "$staging/archive.sha256"
  fi
  # Break hard links before replacing changed files so historical releases stay immutable.
  while IFS= read -r relative; do
    [[ -n $relative ]] || continue
    target="$staging/$relative"
    mkdir -p "$(dirname "$target")"
    rm -f "$target"
    cp "$delta/$relative" "$target"
  done < <(python3 -c 'import json,sys; print("\n".join(json.load(open(sys.argv[1]))["changed"]))' "$delta/DELTA.json")
  while IFS= read -r relative; do
    [[ -n $relative ]] || continue
    rm -f "$staging/$relative"
  done < <(python3 -c 'import json,sys; print("\n".join(json.load(open(sys.argv[1]))["removed"]))' "$delta/DELTA.json")
  # The manifest is also hard-linked to the baseline; unlink it before copying.
  rm -f "$staging/SHA256SUMS"
  cp "$delta/SHA256SUMS" "$staging/SHA256SUMS"
  (cd "$staging" && sha256sum --check --status SHA256SUMS)
  python3 - "$staging" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
expected = {'SHA256SUMS'}
for line in (root / 'SHA256SUMS').read_text().splitlines():
    _, relative = line.split('  ', 1)
    expected.add(relative)
actual = {str(path.relative_to(root)) for path in root.rglob('*') if path.is_file() and path.name != 'archive.sha256'}
if actual != expected:
    raise SystemExit('差异发布后的文件集合与校验清单不一致。')
PY
  python3 - "$staging/dist/cloud-release.json" "$commit" <<'PY'
import json, sys
with open(sys.argv[1]) as source:
    data = json.load(source)
if data != {'commit': sys.argv[2], 'target': 'cloud'}:
    raise SystemExit('发布产物与提交不一致。')
PY
  printf '%s\n' "$release_digest" > "$staging/archive.sha256"
  mv "$staging" "$release"
  rm -rf "$delta"
  trap - EXIT
fi
(cd "$release" && sha256sum --check --status SHA256SUMS)
stage 'materialize verified release'

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

# Build only what changed. Deployment/infrastructure changes intentionally fall back to both images.
change_scope=$(python3 "$release/deploy/cloud/release-scope.py" "$previous/SHA256SUMS" "$release/SHA256SUMS")
site_tag=$old_site
api_tag=$old_api
build_targets=()
[[ $change_scope == *web* ]] && { site_tag=$release_tag; build_targets+=(web); }
[[ $change_scope == *server* ]] && { api_tag=$release_tag; build_targets+=(migrate); }
SITE_IMAGE_TAG=$site_tag API_IMAGE_TAG=$api_tag compose_at "$release" build "${build_targets[@]}"
stage "build images: $change_scope"
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
if [[ $change_scope == 'web' ]]; then
  SITE_IMAGE_TAG=$site_tag API_IMAGE_TAG=$api_tag compose_at "$release" \
    up -d --no-deps --no-build --wait --wait-timeout 180 web
else
  SITE_IMAGE_TAG=$site_tag API_IMAGE_TAG=$api_tag compose_at "$release" \
    up -d --no-build --wait --wait-timeout 180 api web
fi
stage 'restart and health checks'
verify_public
stage 'public verification'
write_tags "$site_tag" "$api_tag"
point_current "$release"
trap - ERR
rm -f "$archive"
echo "云端已发布并通过公网验收：$commit"
