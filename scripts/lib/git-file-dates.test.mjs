// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolvePostDates,
  isGitCalendarDate,
  getGitFileDates,
  findRenameSourceInDiff,
  getLastContentChangeDate,
  resolveHistoryPath,
} from './git-file-dates.mjs';

describe('isGitCalendarDate', () => {
  it('接受 YYYY-MM-DD', () => {
    expect(isGitCalendarDate('2026-08-05')).toBe(true);
  });

  it('拒绝非法格式', () => {
    expect(isGitCalendarDate('2026/08/05')).toBe(false);
    expect(isGitCalendarDate('')).toBe(false);
    expect(isGitCalendarDate(undefined)).toBe(false);
  });
});

describe('resolvePostDates', () => {
  it('优先使用合法的 front matter 日期', () => {
    const result = resolvePostDates({
      frontmatterDate: '2024-01-01',
      frontmatterUpdatedAt: '2024-06-01',
      gitCreated: '2025-01-01',
      gitUpdated: '2025-06-01',
      today: '2026-09-10',
    });
    expect(result).toEqual({
      date: '2024-01-01',
      updatedAt: '2024-06-01',
      dateSource: 'frontmatter',
      updatedAtSource: 'frontmatter',
    });
  });

  it('缺省时回退到 Git 日期', () => {
    const result = resolvePostDates({
      gitCreated: '2025-03-01',
      gitUpdated: '2025-08-20',
      today: '2026-09-10',
    });
    expect(result).toEqual({
      date: '2025-03-01',
      updatedAt: '2025-08-20',
      dateSource: 'git',
      updatedAtSource: 'git',
    });
  });

  it('无 Git 时回退到 today，updatedAt 跟随 date', () => {
    const result = resolvePostDates({
      today: '2026-09-10',
    });
    expect(result).toEqual({
      date: '2026-09-10',
      updatedAt: '2026-09-10',
      dateSource: 'fallback',
      updatedAtSource: 'fallback',
    });
  });

  it('仅有 date 手写、updatedAt 缺省时用 Git updated', () => {
    const result = resolvePostDates({
      frontmatterDate: '2024-01-01',
      gitCreated: '2020-01-01',
      gitUpdated: '2025-12-01',
      today: '2026-09-10',
    });
    expect(result.date).toBe('2024-01-01');
    expect(result.dateSource).toBe('frontmatter');
    expect(result.updatedAt).toBe('2025-12-01');
    expect(result.updatedAtSource).toBe('git');
  });

  it('保证 updatedAt >= date（异常颠倒时抬升）', () => {
    const result = resolvePostDates({
      frontmatterDate: '2026-08-01',
      frontmatterUpdatedAt: '2026-01-01',
      today: '2026-09-10',
    });
    expect(result.date).toBe('2026-08-01');
    expect(result.updatedAt).toBe('2026-08-01');
    expect(result.updatedAtSource).toBe('clamped');
  });

  it('非法手写日期视为缺省并走 Git', () => {
    const result = resolvePostDates({
      frontmatterDate: 'not-a-date',
      frontmatterUpdatedAt: 'also-bad',
      gitCreated: '2025-02-02',
      gitUpdated: '2025-03-03',
      today: '2026-09-10',
    });
    expect(result.date).toBe('2025-02-02');
    expect(result.updatedAt).toBe('2025-03-03');
    expect(result.dateSource).toBe('git');
    expect(result.updatedAtSource).toBe('git');
  });
});

describe('findRenameSourceInDiff', () => {
  it('从 NUL 分隔 name-status 中解析 rename 源', () => {
    const diffZ = ['R100', 'posts/old.md', 'posts/week1/new.md', 'M', 'other.md'].join('\0');
    expect(findRenameSourceInDiff(diffZ, 'posts/week1/new.md')).toBe('posts/old.md');
    expect(findRenameSourceInDiff(diffZ, 'missing.md')).toBeUndefined();
  });
});

describe('getGitFileDates with real git repo', () => {
  let tmp;

  const git = (args, cwd = tmp) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  const commitWithDate = (message, date) => {
    execFileSync('git', ['commit', '-m', message], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: `${date}T12:00:00`,
        GIT_COMMITTER_DATE: `${date}T12:00:00`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dblog-git-dates-'));
    git(['init']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    fs.mkdirSync(path.join(tmp, 'posts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'posts/day1.md'), '# day1\n');
    git(['add', 'posts/day1.md']);
    commitWithDate('add day1', '2026-09-25');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('已提交的纯 rename：保留 created，updated 不因 R100 跳到移动日', () => {
    fs.writeFileSync(path.join(tmp, 'posts/day1.md'), '# day1\nedited\n');
    git(['add', 'posts/day1.md']);
    commitWithDate('edit day1', '2026-09-28');

    fs.mkdirSync(path.join(tmp, 'posts/week1'), { recursive: true });
    git(['mv', 'posts/day1.md', 'posts/week1/day1.md']);
    commitWithDate('move day1', '2026-09-29');

    const dates = getGitFileDates('posts/week1/day1.md', { cwd: tmp });
    expect(dates.created).toBe('2026-09-25');
    expect(dates.updated).toBe('2026-09-28');
  });

  it('未提交的 staged rename：仍能读到源路径历史，不回退为空', () => {
    fs.mkdirSync(path.join(tmp, 'posts/week1'), { recursive: true });
    git(['mv', 'posts/day1.md', 'posts/week1/day1.md']);

    expect(resolveHistoryPath('posts/week1/day1.md', tmp)).toBe('posts/day1.md');
    const dates = getGitFileDates('posts/week1/day1.md', { cwd: tmp });
    expect(dates.created).toBe('2026-09-25');
    expect(dates.updated).toBe('2026-09-25');
  });

  it('未 staged 的同内容移动：通过 hash 对齐源路径', () => {
    fs.mkdirSync(path.join(tmp, 'posts/week1'), { recursive: true });
    fs.renameSync(path.join(tmp, 'posts/day1.md'), path.join(tmp, 'posts/week1/day1.md'));

    expect(resolveHistoryPath('posts/week1/day1.md', tmp)).toBe('posts/day1.md');
    const dates = getGitFileDates('posts/week1/day1.md', { cwd: tmp });
    expect(dates.created).toBe('2026-09-25');
  });

  it('rename 同时改内容（R<100）会更新 updated', () => {
    fs.mkdirSync(path.join(tmp, 'posts/week1'), { recursive: true });
    git(['mv', 'posts/day1.md', 'posts/week1/day1.md']);
    // 小改动以保持 Git rename 检测（过大改动会变成 D+A，--follow 会断）
    fs.appendFileSync(path.join(tmp, 'posts/week1/day1.md'), 'x');
    git(['add', 'posts/week1/day1.md']);
    commitWithDate('rename+edit', '2026-09-29');

    const status = git(['show', '--name-status', '--format=', 'HEAD']);
    expect(status).toMatch(/^R\d{3}\t/);

    const dates = getGitFileDates('posts/week1/day1.md', { cwd: tmp });
    expect(dates.created).toBe('2026-09-25');
    expect(dates.updated).toBe('2026-09-29');
  });

  it('getLastContentChangeDate 跳过 R100', () => {
    fs.mkdirSync(path.join(tmp, 'posts/week1'), { recursive: true });
    git(['mv', 'posts/day1.md', 'posts/week1/day1.md']);
    commitWithDate('move', '2026-09-29');

    expect(getLastContentChangeDate('posts/week1/day1.md', tmp)).toBe('2026-09-25');
  });
});
