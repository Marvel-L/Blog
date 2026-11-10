// ==UserScript==
// @name         力扣刷题记录 · Markdown 导出
// @namespace    leetcode-records-local
// @version      1.0.0
// @description  输入力扣用户主页，按今天、昨天、前天或自选日期导出题目链接；支持本人提交历史分页。
// @match        https://leetcode.cn/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// ==/UserScript==

/* global window, document, location, MutationObserver, GM_getValue, GM_setValue, GM_setClipboard */

(() => {
  'use strict';

  if (document.getElementById('lc-records-host')) return;

  const ORIGIN = 'https://leetcode.cn';
  const DAY_MS = 86400000;
  const CHINA_OFFSET = 8 * 3600000;
  const MAX_PAGES = 80;
  const PAGE_SIZE = 20;
  const IDENTITY_QUERY = 'query RecordsIdentity { userStatus { isSignedIn userSlug } }';
  const PUBLIC_QUERY = `query RecordsRecentAC($userSlug: String!) {
    recentACSubmissions(userSlug: $userSlug) {
      submissionId submitTime
      question { title translatedTitle titleSlug }
    }
  }`;
  const EVENTS = new AbortController();
  let activeRequest = null;
  let output = null;
  let previousFocus = null;
  let disposed = false;
  let storageWarning = '';

  function chinaDate(time = Date.now()) {
    return new Date(time + CHINA_OFFSET).toISOString().slice(0, 10);
  }

  function dateRange(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请选择有效日期。');
    const start = Date.parse(`${value}T00:00:00+08:00`);
    if (!Number.isFinite(start) || chinaDate(start) !== value) {
      throw new Error('请选择有效日期。');
    }
    if (value > chinaDate()) throw new Error('不能查询未来日期。');
    return { start: start / 1000, end: (start + DAY_MS) / 1000 };
  }

  function parseUser(value) {
    const input = value.trim();
    if (!input) throw new Error('请输入用户主页链接或用户名。');
    if (/^[a-zA-Z0-9_-]+$/.test(input)) return input;
    let url;
    try {
      url = new URL(input);
    } catch {
      throw new Error('链接格式不正确，例如 https://leetcode.cn/u/marvel-l-1317/。');
    }
    const match = url.pathname.match(/^\/u\/([a-zA-Z0-9_-]+)\/?$/);
    if (url.origin !== ORIGIN || url.username || url.password || !match) {
      throw new Error('请输入 https://leetcode.cn/u/用户名/ 格式的主页链接。');
    }
    return match[1];
  }

  function getPreference(key, fallback) {
    try {
      return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
    } catch {
      storageWarning = '浏览器未允许保存设置，当前操作仍可使用。';
      return fallback;
    }
  }

  function setPreference(key, value) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(key, value);
    } catch {
      storageWarning = '浏览器未允许保存设置，当前操作仍可使用。';
    }
  }

  function checkSignal(signal) {
    if (signal.aborted || disposed) throw new DOMException('已取消', 'AbortError');
  }

  function waitBetweenPages(signal) {
    return new Promise((resolve, reject) => {
      checkSignal(signal);
      const abort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        reject(new DOMException('已取消', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, 300);
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  async function requestJSON(path, signal, body) {
    checkSignal(signal);
    // 请求只发送到固定的力扣域名；不请求用户输入的 URL，也不跟随重定向。
    const controller = new AbortController();
    let timedOut = false;
    const forwardAbort = () => controller.abort();
    signal.addEventListener('abort', forwardAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    try {
      const headers = { Accept: 'application/json' };
      if (body) {
        headers['Content-Type'] = 'application/json';
        const csrf = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/)?.[1];
        if (csrf) headers['X-CSRFToken'] = decodeURIComponent(csrf);
      }
      const response = await fetch(`${ORIGIN}${path}`, {
        method: body ? 'POST' : 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (response.status === 401) throw new Error('请先登录力扣，或登录状态已过期。');
      if (response.status === 403) throw new Error('力扣拒绝了请求，请在网站完成验证后再试。');
      if (response.status === 429) throw new Error('请求过于频繁，请稍后再试。');
      if (!response.ok) throw new Error(`力扣接口请求失败（HTTP ${response.status}）。`);
      let json;
      try {
        json = await response.json();
      } catch {
        throw new Error('力扣返回了非 JSON 内容，请检查登录状态或网站验证。');
      }
      checkSignal(signal);
      if (json.errors?.length) {
        throw new Error('力扣接口返回错误，可能是权限不足或接口字段发生变化。');
      }
      return json;
    } catch (error) {
      if (signal.aborted || disposed) throw new DOMException('已取消', 'AbortError');
      if (timedOut) throw new Error('请求超时，请检查网络后重试。');
      if (error instanceof TypeError) {
        throw new Error('无法连接力扣接口，请检查网络、登录状态或网站验证。');
      }
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', forwardAbort);
    }
  }

  function timestamp(value) {
    const result = Number(value);
    if (!Number.isFinite(result) || result <= 0) throw new Error('提交记录缺少有效时间。');
    return result;
  }

  function normalizeRecord(row, source) {
    const id = source === 'public' ? row.submissionId : row.id;
    if (id == null || String(id).trim() === '') throw new Error('提交记录缺少有效编号。');
    const question = row.question;
    const title = source === 'public' ? question?.translatedTitle || question?.title : row.title;
    const slug = source === 'public' ? question?.titleSlug : row.title_slug;
    if (typeof title !== 'string' || !title.trim() || typeof slug !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
      throw new Error('提交记录缺少题名或题目链接，力扣接口可能已变更。');
    }
    const statusText = row.status_display || row.statusDisplay;
    let accepted = true;
    if (source !== 'public') {
      if (row.status != null && String(row.status) !== '') {
        accepted = Number(row.status) === 10 || row.status === 'AC';
      } else if (typeof statusText === 'string' && statusText) {
        accepted = /^(accepted|ac|通过|已通过|正确)$/i.test(statusText.trim());
      } else {
        throw new Error('提交记录缺少判题状态，不能判断是否通过。');
      }
    }
    return {
      id: String(id),
      title: title.trim(),
      slug,
      time: timestamp(source === 'public' ? row.submitTime : row.timestamp),
      accepted,
    };
  }

  function markdownFor(records, range, onlyAccepted) {
    const filtered = records
      .filter((row) => row.time >= range.start && row.time < range.end && (!onlyAccepted || row.accepted))
      .sort((a, b) => a.time - b.time || a.slug.localeCompare(b.slug));
    const unique = new Map();
    for (const row of filtered) {
      if (!unique.has(row.slug)) unique.set(row.slug, row);
    }
    const lines = [...unique.values()].map((row) => {
      const title = row.title.replace(/[\r\n]+/g, ' ').replace(/[\\[\]`*_<>]/g, '\\$&');
      return `[${title}](${ORIGIN}/problems/${encodeURIComponent(row.slug)}/)`;
    });
    return { text: lines.join('\n'), count: lines.length, submissions: filtered.length };
  }

  async function collectPublic(userSlug, signal) {
    const json = await requestJSON('/graphql/noj-go/', signal, {
      query: PUBLIC_QUERY,
      variables: { userSlug },
    });
    const rows = json.data?.recentACSubmissions;
    if (!Array.isArray(rows)) throw new Error('未能读取公开记录，请确认用户主页可访问。');
    return {
      records: rows.map((row) => normalizeRecord(row, 'public')),
      source: '公开最近通过记录',
      warning: '公开接口只提供最近通过记录，所选日期可能不完整。查询本人完整记录请先登录。',
    };
  }

  async function collectHistory(range, signal) {
    const records = [];
    const seenIds = new Set();
    let lastKey = '';
    let offset = 0;
    let previousTime = Infinity;
    let chronological = true;
    for (let page = 1; page <= MAX_PAGES; page++) {
      checkSignal(signal);
      setStatus(`正在读取本人历史记录 · 第 ${page} 页，已读取 ${records.length} 次提交…`);
      const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
      if (lastKey) params.set('lastkey', lastKey);
      const json = await requestJSON(`/api/submissions/?${params}`, signal);
      const rows = json.submissions_dump;
      if (!Array.isArray(rows) || typeof json.has_next !== 'boolean') {
        throw new Error('历史记录接口格式已变化，未能确认数据完整性。');
      }
      const normalized = rows.map((row) => normalizeRecord(row, 'history'));
      let added = 0;
      for (const row of normalized) {
        if (row.time > previousTime) chronological = false;
        previousTime = row.time;
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          records.push(row);
          added++;
        }
      }
      if (!json.has_next || (chronological && normalized.length > 0 && previousTime < range.start)) {
        return { records, source: '本人提交历史', warning: '' };
      }
      if (!added) throw new Error('历史分页没有返回新记录，已停止抓取，请重试。');
      if (page === MAX_PAGES) {
        return {
          records,
          source: '本人提交历史',
          warning: `已达到 ${MAX_PAGES} 页上限，结果可能不完整；请选择较近日期。`,
        };
      }
      offset += rows.length;
      lastKey = json.last_key == null ? '' : String(json.last_key);
      await waitBetweenPages(signal);
    }
    throw new Error('历史记录抓取未完成。');
  }

  const host = document.createElement('div');
  host.id = 'lc-records-host';
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all:initial; font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; }
      * { box-sizing:border-box; }
      [hidden] { display:none !important; }
      .shell { --bg:rgba(255,255,255,.97); --fg:#1b2d28; --muted:#677d74; --line:#dfe9e4;
        --soft:#f2f7f4; --accent:#23795b; --warning:#956317; --error:#b43a3a; color:var(--fg); }
      .shell.dark { --bg:rgba(26,33,30,.98); --fg:#e6f0ea; --muted:#a1b6ab; --line:#3b4a41;
        --soft:#26362d; --accent:#80d7b4; --warning:#f0c477; --error:#ff9999; color-scheme:dark; }
      button,input,select,textarea { font:inherit; }
      button { cursor:pointer; border:1px solid var(--line); border-radius:10px; background:var(--soft);
        color:var(--fg); padding:8px 12px; }
      button:hover { border-color:var(--accent); }
      button:disabled { opacity:.5; cursor:default; }
      :focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
      #launcher { pointer-events:auto; position:fixed; right:24px; bottom:24px; border-radius:24px;
        background:var(--bg); box-shadow:0 6px 28px #0002; padding:12px 18px; font-weight:600; }
      #panel { pointer-events:auto; position:fixed; right:24px; bottom:82px; width:min(410px,calc(100vw - 32px));
        max-height:calc(100dvh - 106px); overflow:auto; padding:22px; background:var(--bg);
        backdrop-filter:blur(18px); border:1px solid var(--line); border-radius:20px; box-shadow:0 16px 64px #0003; }
      header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; }
      h2 { margin:0; font-size:18px; letter-spacing:.02em; }
      #close { padding:2px 9px; font-size:22px; background:transparent; border:0; }
      label { display:block; margin:14px 0 6px; font-weight:500; }
      input[type="text"],input[type="date"],select,textarea { width:100%; min-width:0; border:1px solid var(--line);
        border-radius:10px; background:var(--soft); color:var(--fg); padding:10px; }
      .dates { display:flex; gap:7px; margin:14px 0 8px; }
      .dates button { flex:1; padding:7px 4px; }
      .dates button[aria-pressed="true"] { color:var(--accent); border-color:var(--accent); font-weight:600; }
      .check { display:flex; align-items:center; gap:8px; font-weight:400; }
      .check input { accent-color:var(--accent); }
      .hint { margin:6px 0 0; color:var(--muted); font-size:12px; }
      .actions { display:flex; gap:8px; margin-top:16px; }
      #fetch { flex:1; background:#23795b; color:#fff; border-color:#23795b; font-weight:600; }
      #status { margin:14px 0 0; overflow-wrap:anywhere; color:var(--muted); font-size:13px; white-space:pre-line; }
      #status[data-tone="error"] { color:var(--error); }
      #status[data-tone="warning"] { color:var(--warning); }
      textarea { height:164px; resize:vertical; margin-top:12px; font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace; }
      .export { display:flex; gap:8px; margin-top:9px; }
      .export button { flex:1; }
      @media(max-width:480px) { #panel { right:16px; bottom:76px; padding:18px; max-height:calc(100dvh - 92px); }
        #launcher { right:16px; bottom:16px; } }
    </style>
    <div class="shell">
      <button id="launcher" type="button" aria-expanded="false" aria-controls="panel">刷题记录</button>
      <section id="panel" role="dialog" aria-labelledby="heading" hidden>
        <header><h2 id="heading">刷题记录</h2><button id="close" type="button" aria-label="收起悬浮窗">×</button></header>
        <form id="form">
          <label for="profile">用户主页</label>
          <input id="profile" type="text" placeholder="https://leetcode.cn/u/用户名/" autocomplete="off" spellcheck="false">
          <div class="dates" role="group" aria-label="日期快捷选择">
            <button type="button" data-days="0" aria-pressed="true">今天</button>
            <button type="button" data-days="1" aria-pressed="false">昨天</button>
            <button type="button" data-days="2" aria-pressed="false">前天</button>
          </div>
          <label for="date">日期 · 中国时间 UTC+8</label>
          <input id="date" type="date" required>
          <label for="source">记录来源</label>
          <select id="source">
            <option value="auto">自动：本人历史 / 他人公开记录</option>
            <option value="public">公开最近通过记录</option>
            <option value="history">本人完整历史（需登录）</option>
          </select>
          <label class="check"><input id="accepted" type="checkbox" checked>只看通过的题目</label>
          <p class="hint" id="source-hint">本人历史支持分页；他人主页只开放最近通过记录。</p>
          <p class="hint">同一天重复提交的题目合并，按提交时间从早到晚排列。</p>
          <div class="actions">
            <button id="fetch" type="submit">抓取记录</button>
            <button id="cancel" type="button" hidden>取消</button>
          </div>
        </form>
        <p id="status" role="status" aria-live="polite">选择日期后抓取，即可复制 Markdown 链接。</p>
        <textarea id="result" aria-label="Markdown 题目链接" readonly placeholder="[题目标题](https://leetcode.cn/problems/题目/)"></textarea>
        <div class="export">
          <button id="copy" type="button" disabled>复制 Markdown</button>
          <button id="download" type="button" disabled>下载 .md</button>
        </div>
      </section>
    </div>`;
  document.documentElement.appendChild(host);
  const $ = (selector) => root.querySelector(selector);
  const profile = $('#profile');
  const date = $('#date');
  const source = $('#source');
  const accepted = $('#accepted');
  const controls = [...root.querySelectorAll('#form input, #form select, #form button[data-days]')];
  const pageUser = location.pathname.match(/^\/u\/([a-zA-Z0-9_-]+)\/?$/)?.[1];
  const savedProfile = getPreference('lc-records-profile', `${ORIGIN}/u/marvel-l-1317/`);
  profile.value = pageUser ? `${ORIGIN}/u/${pageUser}/` : String(savedProfile);
  date.value = chinaDate();
  date.max = chinaDate();
  source.value = getPreference('lc-records-source', 'auto');
  if (!source.value) source.value = 'auto';
  accepted.checked = Boolean(getPreference('lc-records-accepted', true));

  function on(element, type, listener) {
    element.addEventListener(type, listener, { signal: EVENTS.signal });
  }

  function setStatus(message, tone = '') {
    if (disposed) return;
    $('#status').textContent = message;
    $('#status').dataset.tone = tone;
  }

  function clearOutput() {
    output = null;
    $('#result').value = '';
    $('#copy').disabled = true;
    $('#copy').textContent = '复制 Markdown';
    $('#download').disabled = true;
  }

  function syncDateButtons() {
    date.max = chinaDate();
    root.querySelectorAll('[data-days]').forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(date.value === chinaDate(Date.now() - Number(button.dataset.days) * DAY_MS)),
      );
    });
  }

  function syncSource() {
    if (source.value === 'public') accepted.checked = true;
    accepted.disabled = Boolean(activeRequest) || source.value === 'public';
    $('#source-hint').textContent =
      source.value === 'public'
        ? '公开模式仅能获取最近通过记录，较早日期可能不完整。'
        : '本人历史支持分页；他人主页只开放最近通过记录。';
  }

  function setBusy(busy) {
    controls.forEach((control) => {
      control.disabled = busy;
    });
    $('#fetch').disabled = busy;
    $('#fetch').textContent = busy ? '正在抓取…' : '抓取记录';
    $('#cancel').hidden = !busy;
    $('#form').setAttribute('aria-busy', String(busy));
    syncSource();
  }

  function togglePanel(open) {
    if (open) {
      previousFocus = document.activeElement;
      syncDateButtons();
    } else {
      activeRequest?.abort();
    }
    $('#panel').hidden = !open;
    $('#launcher').setAttribute('aria-expanded', String(open));
    if (open) profile.focus();
    else if (previousFocus?.isConnected && previousFocus !== host) previousFocus.focus();
    else $('#launcher').focus();
  }

  on($('#launcher'), 'click', () => togglePanel($('#panel').hidden));
  on($('#close'), 'click', () => togglePanel(false));
  on(document, 'keydown', (event) => {
    if (event.key === 'Escape' && !$('#panel').hidden) {
      event.preventDefault();
      togglePanel(false);
    }
  });
  root.querySelectorAll('[data-days]').forEach((button) => {
    on(button, 'click', () => {
      date.value = chinaDate(Date.now() - Number(button.dataset.days) * DAY_MS);
      syncDateButtons();
      clearOutput();
      setStatus('日期已切换，点击抓取记录。');
    });
  });
  for (const control of [profile, date, source, accepted]) {
    on(control, control === profile ? 'input' : 'change', () => {
      clearOutput();
      syncDateButtons();
      syncSource();
      setStatus('条件已更新，点击抓取记录。');
    });
  }
  on($('#cancel'), 'click', () => activeRequest?.abort());
  on($('#form'), 'submit', async (event) => {
    event.preventDefault();
    if (activeRequest) return;
    clearOutput();
    const controller = new AbortController();
    const signal = controller.signal;
    activeRequest = controller;
    setBusy(true);
    try {
      const userSlug = parseUser(profile.value);
      const selectedDate = date.value;
      const range = dateRange(selectedDate);
      const selectedSource = source.value;
      const onlyAccepted = accepted.checked;
      setStatus('正在获取刷题记录…');
      let identity;
      if (selectedSource !== 'public') {
        const json = await requestJSON('/graphql/noj-go/', signal, { query: IDENTITY_QUERY });
        identity = json.data?.userStatus;
        if (typeof identity?.isSignedIn !== 'boolean') throw new Error('无法确认力扣登录状态。');
      }
      const isSelf = identity?.isSignedIn && identity.userSlug === userSlug;
      if (selectedSource === 'history' && !isSelf) {
        throw new Error(
          identity?.isSignedIn
            ? '本人历史只能查询当前登录账号，请输入该账号的用户主页。'
            : '请先登录对应的力扣账号，再抓取本人历史。',
        );
      }
      const useHistory = selectedSource !== 'public' && isSelf;
      const collected = useHistory ? await collectHistory(range, signal) : await collectPublic(userSlug, signal);
      checkSignal(signal);
      const result = markdownFor(collected.records, range, useHistory ? onlyAccepted : true);
      output = { ...result, userSlug, date: selectedDate };
      $('#result').value = result.text;
      $('#copy').disabled = result.count === 0;
      $('#download').disabled = result.count === 0;
      setPreference('lc-records-profile', `${ORIGIN}/u/${userSlug}/`);
      setPreference('lc-records-source', selectedSource);
      setPreference('lc-records-accepted', onlyAccepted);
      const warnings = [collected.warning, storageWarning];
      if (!useHistory && !onlyAccepted) warnings.unshift('当前仅提供公开通过记录，不包含未通过提交。');
      const message = result.count
        ? `${selectedDate} · ${result.count} 道题，${result.submissions} 次提交 · ${collected.source}`
        : `${selectedDate} · ${collected.warning ? '公开最近记录中未找到' : '没有'}${useHistory && !onlyAccepted ? '' : '通过'}提交 · ${collected.source}`;
      const warning = warnings.filter(Boolean).join('\n');
      setStatus([message, warning].filter(Boolean).join('\n'), warning ? 'warning' : '');
    } catch (error) {
      clearOutput();
      setStatus(
        error.name === 'AbortError' ? '已取消抓取。' : error.message || '抓取失败，请重试。',
        error.name === 'AbortError' ? '' : 'error',
      );
    } finally {
      if (activeRequest === controller) {
        activeRequest = null;
        if (!disposed) setBusy(false);
      }
    }
  });

  on($('#copy'), 'click', async () => {
    if (!output?.text) return;
    const copiedOutput = output;
    const button = $('#copy');
    button.disabled = true;
    try {
      if (typeof GM_setClipboard === 'function') {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('复制超时，请手动选择结果复制。')), 5000);
          try {
            GM_setClipboard(copiedOutput.text, 'text', () => {
              clearTimeout(timer);
              resolve();
            });
          } catch (error) {
            clearTimeout(timer);
            reject(error);
          }
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copiedOutput.text);
      } else {
        throw new Error('浏览器不支持自动复制，请手动选择结果复制。');
      }
      if (output === copiedOutput && !disposed) button.textContent = '已复制';
    } catch (error) {
      if (output === copiedOutput && !disposed) setStatus(error.message || '复制失败，请手动复制。', 'error');
    } finally {
      if (output === copiedOutput && !disposed) button.disabled = false;
    }
  });
  on($('#download'), 'click', () => {
    if (!output?.text) return;
    let url;
    try {
      url = URL.createObjectURL(new Blob([`${output.text}\n`], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `leetcode-${output.userSlug}-${output.date}.md`;
      root.appendChild(link);
      link.click();
      link.remove();
      // 让浏览器先接收下载，再释放 Blob。
      const cleanup = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        EVENTS.signal.removeEventListener('abort', cleanup);
      };
      const timer = setTimeout(cleanup, 1000);
      EVENTS.signal.addEventListener('abort', cleanup, { once: true });
    } catch {
      if (url) URL.revokeObjectURL(url);
      setStatus('下载失败，请复制 Markdown 后手动保存。', 'error');
    }
  });
  on($('#result'), 'focus', (event) => {
    event.target.select();
  });

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function syncTheme() {
    const html = document.documentElement;
    const dark = html.classList.contains('dark') || html.dataset.theme === 'dark';
    const light = html.classList.contains('light') || html.dataset.theme === 'light';
    $('.shell').classList.toggle('dark', dark || (!light && media.matches));
  }
  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  on(media, 'change', syncTheme);
  on(window, 'pagehide', (event) => {
    if (event.persisted) return;
    disposed = true;
    activeRequest?.abort();
    themeObserver.disconnect();
    EVENTS.abort();
    host.remove();
  });
  syncSource();
  syncTheme();
  if (storageWarning) setStatus(storageWarning, 'warning');
})();
