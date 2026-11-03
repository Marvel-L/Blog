#!/usr/bin/env python3
"""Produce a salted password hash on stdout. Interactive password is never echoed."""
import base64
import getpass
import hashlib
import json
import secrets
import sys


def prompt(text):
    print(text, file=sys.stderr, end='', flush=True)
    return sys.stdin.readline().strip()


def main():
    username = prompt('系统账号: ')
    github_id = prompt('已核验 GitHub 数字 ID: ')
    password = getpass.getpass('密码（不回显）: ')
    confirmation = getpass.getpass('再次输入密码: ')
    if password != confirmation or not 8 <= len(password) <= 128:
        raise SystemExit('密码不一致或长度无效')
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 600000, dklen=32)
    encode = lambda value: base64.b64encode(value).decode('ascii').rstrip('=')
    encoded = 'pbkdf2-sha256$600000$' + encode(salt) + '$' + encode(key)
    print(json.dumps({'username': username, 'githubId': github_id, 'passwordHash': encoded}))


if __name__ == '__main__':
    main()
