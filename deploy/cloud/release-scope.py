#!/usr/bin/env python3
import pathlib
import sys


def read_checksums(path: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in pathlib.Path(path).read_text().splitlines():
        digest, relative = line.split("  ", 1)
        values[relative] = digest
    return values


def release_scope(previous_manifest: str, next_manifest: str) -> list[str]:
    previous = read_checksums(previous_manifest)
    next_release = read_checksums(next_manifest)
    paths = {
        path
        for path in previous.keys() | next_release.keys()
        if previous.get(path) != next_release.get(path)
    }
    infrastructure = any(path == ".dockerignore" or path.startswith("deploy/cloud/") for path in paths)
    web = infrastructure or any(path.startswith("dist/") for path in paths)
    server = infrastructure or any(path.startswith("packages/server/") for path in paths)
    if not web and not server:
        web = True
    return [target for target, changed in (("web", web), ("server", server)) if changed]


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("用法：release-scope.py <上一版 SHA256SUMS> <新版 SHA256SUMS>")
    print(" ".join(release_scope(sys.argv[1], sys.argv[2])))
