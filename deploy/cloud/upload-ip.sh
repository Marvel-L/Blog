#!/usr/bin/env bash
# Runs on a build machine; authentication files are supplied outside the repository.
set -euo pipefail
commit=${1:-}
full_archive=${2:-}
if [[ ! $commit =~ ^[a-f0-9]{40}$ ]] || [[ ! -f $full_archive ]]; then
  echo '用法：upload-ip.sh <完整提交 SHA> <cloud-release.tar.gz>' >&2
  exit 1
fi
: "${CLOUD_SSH_KEY_FILE:?请指定部署 SSH 私钥文件}"
: "${CLOUD_SSH_KNOWN_HOSTS_FILE:?请指定已核验的服务器 known_hosts 文件}"
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
host=ubuntu@43.138.216.53
options=(
  -i "$CLOUD_SSH_KEY_FILE"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$CLOUD_SSH_KNOWN_HOSTS_FILE"
  -o ConnectTimeout=10
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
)
checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f1
  else
    shasum -a 256 "$1" | cut -d ' ' -f1
  fi
}
# Hash the complete file manifest rather than gzip metadata, so identical content is idempotent.
if command -v sha256sum >/dev/null 2>&1; then
  release_digest=$(tar -xOzf "$full_archive" ./SHA256SUMS | sha256sum | cut -d ' ' -f1)
else
  release_digest=$(tar -xOzf "$full_archive" ./SHA256SUMS | shasum -a 256 | cut -d ' ' -f1)
fi
started=$SECONDS
stage() {
  printf '[deploy-timing] %-28s %4ss\n' "$1" "$((SECONDS - started))"
  started=$SECONDS
}
work=$(mktemp -d "${TMPDIR:-/tmp}/dblog-delta.XXXXXXXX")
parts=$(mktemp -d "${TMPDIR:-/tmp}/dblog-upload.XXXXXXXX")
archive="$work/cloud-delta.tar.gz"
manifest="$work/current.SHA256SUMS"
remote="/home/ubuntu/dblog-deploy/.$commit-$(basename "$parts")"
pids=''
count=0
cleanup() {
  for pid in $pids; do kill "$pid" 2>/dev/null || true; done
  for pid in $pids; do wait "$pid" 2>/dev/null || true; done
  ssh "${options[@]}" "$host" "rm -rf -- '$remote'" || true
  rm -rf "$parts" "$work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# A trusted immutable release path plus its checksum manifest form the delta baseline.
current_release=$(ssh "${options[@]}" "$host" "readlink -f /opt/dblog/current 2>/dev/null || true")
if [[ $current_release =~ ^/opt/dblog/releases/[a-f0-9]{40}-[a-f0-9]{12}$ ]] &&
  ssh "${options[@]}" "$host" "cat '$current_release/SHA256SUMS'" > "$manifest"; then
  :
else
  current_release=''
  : > "$manifest"
fi
node "$root/scripts/create-cloud-delta.mjs" "$manifest" "$current_release" "$full_archive" "$archive"
stage 'prepare verified delta'

digest=$(checksum "$archive")
ssh "${options[@]}" "$host" "umask 077; mkdir -p '$remote'"
# Balance small deltas across connections instead of leaving one 2 MiB part
# on the critical path. Keep tiny transfers and full-release batches bounded.
max_parallel=8
archive_bytes=$(wc -c < "$archive")
part_bytes=$(((archive_bytes + max_parallel - 1) / max_parallel))
((part_bytes >= 262144)) || part_bytes=262144
((part_bytes <= 2097152)) || part_bytes=2097152
part_count=$(((archive_bytes + part_bytes - 1) / part_bytes))
printf '[deploy-upload] bytes=%d part-bytes=%d parts=%d connections<=%d\n' \
  "$archive_bytes" "$part_bytes" "$part_count" "$max_parallel"
split -b "$part_bytes" "$archive" "$parts/part-"
wait_batch() {
  local failed=0 pid
  for pid in $pids; do wait "$pid" || failed=1; done
  pids=''
  count=0
  [[ $failed == 0 ]] || return 1
}
# Bound connections to eight; tiny archives still use only one connection.
for part in "$parts"/part-*; do
  scp "${options[@]}" "$part" "$host:$remote/$(basename "$part")" &
  pids="$pids $!"
  count=$((count + 1))
  if [[ $count == "$max_parallel" ]]; then wait_batch; fi
done
wait_batch
stage 'upload delta parts'

# Reassemble privately and verify before replacing the publishable archive.
ssh "${options[@]}" "$host" \
  "set -eu; cat '$remote'/part-* > '$remote/archive.tar.gz'; printf '%s  %s\n' '$digest' '$remote/archive.tar.gz' | sha256sum --check --status; mv '$remote/archive.tar.gz' '/home/ubuntu/dblog-deploy/$commit.tar.gz'"
stage 'reassemble and verify upload'
echo '云端差异发布包上传完成，SHA256 校验通过。'
ssh "${options[@]}" "$host" "sudo -n bash -s -- '$commit' '$digest' '$release_digest'" < "$root/deploy/cloud/publish-ip.sh"
stage 'server publish and verify'
