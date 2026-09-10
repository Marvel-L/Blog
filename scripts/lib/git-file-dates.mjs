/**
 * 从 Git 历史读取文件首次出现日 / 最后改动日，并与 front matter 日期合并。
 *
 * - created：`git log --diff-filter=A --follow --format=%cs -1`
 * - updated：`git log --follow --format=%cs -1`
 * - 浅克隆（fetch-depth: 1）会导致首次提交偏晚，CI 跑 gen:data 时应 fetch-depth: 0。
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isCalendarDate = (value) => typeof value === 'string' && DATE_RE.test(value);

const runGit = (args, cwd) => {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    }).trim();
  } catch {
    return '';
  }
};

/**
 * 查询单个文件在 Git 中的首次出现日与最后改动日（作者日历日 %cs）。
 * @param {string} filePath 绝对或相对路径
 * @param {{ cwd?: string }} [options]
 * @returns {{ created?: string, updated?: string }}
 */
export const getGitFileDates = (filePath, { cwd = process.cwd() } = {}) => {
  const relativePath = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  if (!relativePath || relativePath.startsWith('..')) {
    return {};
  }

  // 统一为正斜杠，避免 Windows 路径在 git pathspec 下匹配失败。
  const gitPath = relativePath.split(path.sep).join('/');
  const createdRaw = runGit(['log', '--diff-filter=A', '--follow', '--format=%cs', '-1', '--', gitPath], cwd);
  const updatedRaw = runGit(['log', '--follow', '--format=%cs', '-1', '--', gitPath], cwd);

  return {
    created: isCalendarDate(createdRaw) ? createdRaw : undefined,
    updated: isCalendarDate(updatedRaw) ? updatedRaw : undefined,
  };
};

/**
 * 合并 front matter 手写日期与 Git 日期。
 * 优先级：合法手写 > Git > today 回退；并保证 updatedAt >= date。
 *
 * @param {{
 *   frontmatterDate?: string,
 *   frontmatterUpdatedAt?: string,
 *   gitCreated?: string,
 *   gitUpdated?: string,
 *   today: string,
 * }} input
 * @returns {{
 *   date: string,
 *   updatedAt: string,
 *   dateSource: 'frontmatter' | 'git' | 'fallback',
 *   updatedAtSource: 'frontmatter' | 'git' | 'fallback' | 'clamped',
 * }}
 */
export const resolvePostDates = ({ frontmatterDate, frontmatterUpdatedAt, gitCreated, gitUpdated, today }) => {
  const safeToday = isCalendarDate(today) ? today : '1970-01-01';

  let date;
  let dateSource;
  if (isCalendarDate(frontmatterDate)) {
    date = frontmatterDate;
    dateSource = 'frontmatter';
  } else if (isCalendarDate(gitCreated)) {
    date = gitCreated;
    dateSource = 'git';
  } else {
    date = safeToday;
    dateSource = 'fallback';
  }

  let updatedAt;
  let updatedAtSource;
  if (isCalendarDate(frontmatterUpdatedAt)) {
    updatedAt = frontmatterUpdatedAt;
    updatedAtSource = 'frontmatter';
  } else if (isCalendarDate(gitUpdated)) {
    updatedAt = gitUpdated;
    updatedAtSource = 'git';
  } else {
    updatedAt = date;
    updatedAtSource = 'fallback';
  }

  if (updatedAt < date) {
    updatedAt = date;
    updatedAtSource = 'clamped';
  }

  return { date, updatedAt, dateSource, updatedAtSource };
};

export const isGitCalendarDate = isCalendarDate;
