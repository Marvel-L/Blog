/** Read author-owned Book packages. Importing this module never writes files. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { extractMarkdownHeadings } from '@d-blog/blog/headings-core';

export const BOOKS_ROOT = path.resolve(fileURLToPath(new URL('../../books/', import.meta.url)));
export const BOOKS_DATA_FILE = fileURLToPath(new URL('../../generated/books.json', import.meta.url));
const CONFIG_NAMES = ['config.json', 'config.yaml', 'config.yml'];
const BOOK_FIELDS = new Set(['id', 'name', 'subtitle', 'edition', 'accent', 'order', 'draft', 'chapters']);
const CHAPTER_FIELDS = new Set(['id', 'title', 'group', 'order', 'draft', 'relatedPostIds']);
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const fail = (filename, reason) => {
  throw new Error(`Invalid Book content in ${filename}: ${reason}`);
};

const object = (value, filename, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(filename, 'expected an object');
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) fail(filename, `unknown field "${key}"`);
  }
  return value;
};
const text = (value, fallback, filename, field, allowEmpty = false) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) fail(filename, `${field} must be a string`);
  return value.trim();
};
const id = (value, fallback, filename) => {
  const result = text(value, fallback, filename, 'id');
  if (/[\s\\/?#%"'<>:]/.test(result) || result === '.' || result === '..') fail(filename, 'id is unsafe in a URL');
  return result;
};
const order = (value, filename) => {
  if (value === undefined) return 0;
  if (!Number.isFinite(value)) fail(filename, 'order must be a finite number');
  return value;
};
const draft = (value, filename) => {
  if (value !== undefined && typeof value !== 'boolean') fail(filename, 'draft must be a boolean');
  return value === true;
};
const relatedPosts = (value, filename) => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(filename, 'relatedPostIds must be an array of strings');
  return [...new Set(value.map((value) => text(value, '', filename, 'relatedPostIds item')))];
};

const readText = (filename) => {
  try {
    if (!fs.lstatSync(filename).isFile()) fail(filename, 'expected a regular file');
    if (fs.statSync(filename).size > 5 * 1024 * 1024) fail(filename, 'file exceeds 5 MiB');
    return fs.readFileSync(filename, 'utf8');
  } catch (error) {
    fail(filename, error.message);
  }
};

const entries = (directory) => {
  try {
    return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
  } catch (error) {
    fail(directory, error.message);
  }
};

const markdownFiles = (directory, relative = '') => {
  const files = [];
  for (const entry of entries(path.join(directory, relative))) {
    if (entry.name.startsWith('.')) continue;
    const filename = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) fail(path.join(directory, filename), 'symbolic links are not supported');
    if (entry.isDirectory()) files.push(...markdownFiles(directory, filename));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(filename);
  }
  return files.sort(compareText);
};

const readConfig = (directory) => {
  const names = CONFIG_NAMES.filter((name) => fs.existsSync(path.join(directory, name)));
  if (names.length > 1) fail(directory, 'keep only one config.json, config.yaml or config.yml');
  if (!names.length) return { config: {}, filename: directory, configured: false };
  const filename = path.join(directory, names[0]);
  let config;
  try {
    const source = readText(filename);
    config = names[0].endsWith('.json') ? JSON.parse(source) : yaml.load(source, { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    fail(filename, error.message);
  }
  return { config: object(config, filename, BOOK_FIELDS), filename, configured: true };
};

const chapterOverrides = (config, files, filename) => {
  const overrides = new Map();
  if (config.chapters === undefined) return overrides;
  if (!Array.isArray(config.chapters)) fail(filename, 'chapters must be an array');
  config.chapters.forEach((entry, index) => {
    const definition =
      typeof entry === 'string' ? { file: entry } : object(entry, filename, new Set(['file', ...CHAPTER_FIELDS]));
    const file = text(definition.file, '', filename, 'chapters.file');
    if (!files.includes(file)) fail(filename, `chapter file "${file}" is missing or outside this package`);
    if (overrides.has(file)) fail(filename, `chapter file "${file}" is listed twice`);
    const { file: _file, ...metadata } = definition;
    overrides.set(file, { metadata, index });
  });
  return overrides;
};

/**
 * Each immediate subdirectory is a package. Unlisted Markdown chapters are
 * appended automatically; config.chapters may pin an initial reading order.
 * @returns {import('../../packages/blog/src/books/books-core.mjs').BookPackageDefinition[]}
 */
export const loadBookPackages = (root = BOOKS_ROOT) => {
  if (!fs.existsSync(root)) return [];
  const books = [];
  const bookIds = new Set();
  for (const entry of entries(root)) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) fail(path.join(root, entry.name), 'symbolic links are not supported');
    if (!entry.isDirectory()) continue;
    const directory = path.join(root, entry.name);
    const { config, filename, configured } = readConfig(directory);
    if (draft(config.draft, filename)) continue;
    const files = markdownFiles(directory);
    if (!configured && !files.length) continue;
    const bookId = id(config.id, entry.name, filename);
    if (bookIds.has(bookId)) fail(filename, `duplicate book id "${bookId}"`);
    bookIds.add(bookId);
    const accent = text(config.accent, '#365348', filename, 'accent');
    if (!/^#[\da-f]{6}$/i.test(accent)) fail(filename, 'accent must use #RRGGBB');
    const overrides = chapterOverrides(config, files, filename);
    const chapterIds = new Set();
    const chapters = files.flatMap((file) => {
      const sourcePath = path.join(directory, file);
      let parsed;
      try {
        parsed = matter(readText(sourcePath));
      } catch (error) {
        fail(sourcePath, error.message);
      }
      const metadata = { ...parsed.data, ...overrides.get(file)?.metadata };
      if (draft(metadata.draft, sourcePath)) return [];
      object(metadata, sourcePath, CHAPTER_FIELDS);
      const chapterId = id(metadata.id, file.slice(0, -3).replaceAll('/', '--'), sourcePath);
      if (chapterIds.has(chapterId)) fail(sourcePath, `duplicate chapter id "${chapterId}"`);
      chapterIds.add(chapterId);
      const content = parsed.content.trim();
      if (!content) fail(sourcePath, 'chapter body must not be empty');
      const heading = extractMarkdownHeadings(content).find((heading) => heading.level === 1)?.rawText;
      const folder = path.posix.dirname(file);
      return [
        {
          id: chapterId,
          title: text(metadata.title, heading || path.posix.basename(file, '.md'), sourcePath, 'title'),
          group: text(metadata.group, folder === '.' ? '' : folder, sourcePath, 'group', true),
          content,
          relatedPostIds: relatedPosts(metadata.relatedPostIds, sourcePath),
          filePath: `/books/${entry.name}/${file}`,
          sortOrder: order(metadata.order, sourcePath),
          pinnedIndex: overrides.get(file)?.index ?? Infinity,
        },
      ];
    });
    chapters.sort(
      (a, b) => a.pinnedIndex - b.pinnedIndex || a.sortOrder - b.sortOrder || compareText(a.filePath, b.filePath),
    );
    books.push({
      id: bookId,
      name: text(config.name, entry.name, filename, 'name'),
      subtitle: text(config.subtitle, '', filename, 'subtitle', true),
      edition: text(config.edition, 'KNOWLEDGE PACKAGE', filename, 'edition'),
      accent,
      sortOrder: order(config.order, filename),
      chapters: chapters.map(({ sortOrder: _order, pinnedIndex: _index, ...chapter }) => chapter),
    });
  }
  return books
    .sort((a, b) => a.sortOrder - b.sortOrder || compareText(a.id, b.id))
    .map(({ sortOrder: _order, ...book }) => book);
};

/** Share one generated snapshot between the browser, SSR and SSG routes. */
export const writeBookData = (books, filename = BOOKS_DATA_FILE) => {
  const source = `${JSON.stringify(books, null, 2)}\n`;
  try {
    if (fs.existsSync(filename) && fs.readFileSync(filename, 'utf8') === source) return;
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, source);
  } catch (error) {
    fail(filename, `failed to write data: ${error.message}`);
  }
};
