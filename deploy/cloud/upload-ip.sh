#!/usr/bin/env bash
# Runs on a build machine; authentication files are supplied outside the repository.
set -euo pipefail
commit=${1:-}
archive=${2:-}
if [[ ! $commit =~ ^[a-f0-9]{40}$ ]] || [[ ! -f $archive ]]; then
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
if command -v sha256sum >/dev/null 2>&1; then
  digest=$(sha256sum "$archive" | cut -d ' ' -f1)
else
  digest=$(shasum -a 256 "$archive" | cut -d ' ' -f1)
fi
ssh "${options[@]}" "$host" 'umask 077; mkdir -p /home/ubuntu/dblog-deploy'
scp "${options[@]}" "$archive" "$host:/home/ubuntu/dblog-deploy/$commit.tar.gz"
ssh "${options[@]}" "$host" "sudo -n bash -s -- '$commit' '$digest'" < "$root/deploy/cloud/publish-ip.sh"
