/**
 * 从 Git 历史读取文件首次出现日 / 最后改动日，并与 front matter 日期合并。
 *
 * - created：沿 rename 追溯的最老提交日（`git log --follow` 末条）
 * - updated：沿 rename 追溯的最近「内容」改动日（忽略纯 R100 路径移动）
 * - 未提交的 rename（已暂存或工作区同内容移动）会解析到源路径再查历史，避免误当新文件回退到今天
 * - 浅克隆（fetch-depth: 1）会导致首次提交偏晚，CI 跑 gen:data 时应 fetch-depth: 0
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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

const toGitPath = (filePath, cwd) => {
  const relativePath = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  if (!relativePath || relativePath.startsWith('..')) {
    return '';
  }
  return relativePath.split(path.sep).join('/');
};

/** 当前路径在 HEAD 中是否已有提交记录。 */
const hasCommittedHistory = (gitPath, cwd) => Boolean(runGit(['log', '-1', '--format=%H', '--', gitPath], cwd));

/**
 * 从 `git diff HEAD --name-status -z --find-renames` 的 NUL 分隔输出中，
 * 查找指向 targetPath 的 rename/copy 源路径。
 */
export const findRenameSourceInDiff = (diffZ, targetPath) => {
  if (!diffZ || !targetPath) {
    return undefined;
  }
  const tokens = diffZ.split('\0').filter((t) => t.length > 0);
  for (let i = 0; i < tokens.length;) {
    const status = tokens[i++];
    if (!status) {
      break;
    }
    if (status.startsWith('R') || status.startsWith('C')) {
      const from = tokens[i++];
      const to = tokens[i++];
      if (to === targetPath && from) {
        return from;
      }
      continue;
    }
    i += 1; // A/M/D/... 后跟单个路径
  }
  return undefined;
};

/**
 * 未 staged 的「删旧 + 未跟踪新文件」同内容移动：用 blob hash 对齐源路径。
 */
const findUnstagedSameContentSource = (gitPath, cwd) => {
  const absPath = path.join(cwd, gitPath);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    return undefined;
  }
  const newHash = runGit(['hash-object', absPath], cwd);
  if (!newHash) {
    return undefined;
  }

  const deletedZ = runGit(['diff', 'HEAD', '--diff-filter=D', '--name-only', '-z'], cwd);
  const deletedPaths = deletedZ.split('\0').filter(Boolean);
  for (const oldPath of deletedPaths) {
    const oldHash = runGit(['rev-parse', `HEAD:${oldPath}`], cwd);
    if (oldHash && oldHash === newHash) {
      return oldPath;
    }
  }
  return undefined;
};

/**
 * 解析用于查历史的路径：已提交用当前路径；未提交 rename 则回到源路径。
 */
export const resolveHistoryPath = (gitPath, cwd) => {
  if (!gitPath) {
    return '';
  }
  if (hasCommittedHistory(gitPath, cwd)) {
    return gitPath;
  }

  const diffZ = runGit(['diff', 'HEAD', '--name-status', '--find-renames', '-z'], cwd);
  const fromDiff = findRenameSourceInDiff(diffZ, gitPath);
  if (fromDiff) {
    return fromDiff;
  }

  const fromHash = findUnstagedSameContentSource(gitPath, cwd);
  if (fromHash) {
    return fromHash;
  }

  return gitPath;
};

/**
 * 最近一次非「纯路径移动（R100）」的提交作者日历日。
 * rename 且内容有改动（R099 等）仍计为更新。
 */
export const getLastContentChangeDate = (gitPath, cwd) => {
  const raw = runGit(['log', '--follow', '--name-status', '--pretty=format:COMMIT:%cs', '--', gitPath], cwd);
  if (!raw) {
    return undefined;
  }

  const lines = raw.split('\n');
  let currentDate;

  for (const line of lines) {
    if (line.startsWith('COMMIT:')) {
      const date = line.slice('COMMIT:'.length).trim();
      currentDate = isCalendarDate(date) ? date : undefined;
      continue;
    }
    if (!currentDate || !line.trim()) {
      continue;
    }
    // 纯 rename（内容 100% 相同）不视为内容更新；R099/M/A/C 等保留。
    if (/^R100\t/.test(line)) {
      continue;
    }
    if (/^[AMDCRTUXB]\d*\t/.test(line) || /^R\d{3}\t/.test(line)) {
      return currentDate;
    }
  }

  return undefined;
};

/**
 * 查询单个文件在 Git 中的首次出现日与最后内容改动日（作者日历日 %cs）。
 * @param {string} filePath 绝对或相对路径
 * @param {{ cwd?: string }} [options]
 * @returns {{ created?: string, updated?: string }}
 */
export const getGitFileDates = (filePath, { cwd = process.cwd() } = {}) => {
  const gitPath = toGitPath(filePath, cwd);
  if (!gitPath) {
    return {};
  }

  const historyPath = resolveHistoryPath(gitPath, cwd);
  // 用 follow 全历史的最老提交日作为 created（比 --diff-filter=A -1 更稳：后者在部分 rename 场景会误取较新的 A）。
  const followDatesRaw = runGit(['log', '--follow', '--format=%cs', '--', historyPath], cwd);
  const followDates = followDatesRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const createdRaw = followDates.length > 0 ? followDates[followDates.length - 1] : '';
  const updatedFromContent = getLastContentChangeDate(historyPath, cwd);
  // 若全部历史都是纯 rename（极端），回退到 follow 最近提交日（含 R100）。
  const updatedRaw = updatedFromContent || followDates[0] || '';

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
