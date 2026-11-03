import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

/** 隔离真实前端预览：只有进程内存样例数据，不连接数据库、OAuth、厂商或生产。 */
export async function startPreview() {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const cards = [
    {
      id: 'urgent',
      deckId: 'preview-deck',
      question: '到期优先：为什么要先复习容易遗忘的内容？',
      answer: Array.from(
        { length: 24 },
        (_, i) =>
          `第 ${i + 1} 段：这是一段用于测试手机长答案自然滚动的样例。先在心中回忆，再对照答案，最后选择正确、模糊或错误。`,
      ).join('\n\n'),
      dueAt: '2026-11-01T00:00:00Z',
      intervalDays: 1,
      reviewCount: 1,
    },
    {
      id: 'fresh',
      deckId: 'preview-deck',
      question: '新卡：主动回忆与只看答案有什么区别？',
      answer: '主动回忆之后自评才会计入正式练习；只看答案或切卡不计数。',
      dueAt: '2026-11-03T00:00:00Z',
      intervalDays: 0,
      reviewCount: 0,
    },
    {
      id: 'future',
      deckId: 'preview-second',
      question: '未到期卡：能否手动发起全量练习？',
      answer: '可以。此页是模拟数据，真实功能沿用服务器主动练习接口更新排期和统计。',
      dueAt: '2099-01-01T00:00:00Z',
      intervalDays: 30,
      reviewCount: 2,
    },
  ].map((card) => ({
    ...card,
    version: 1,
    repetitions: 1,
    easeFactor: 2.5,
    tags: ['样例'],
    practiceCount: card.reviewCount,
    correctCount: card.reviewCount,
    hardCount: 0,
    wrongCount: 0,
    customCount: 0,
  }));
  const receipts = new Map();
  const seen = new Set();
  let reviews = 0;
  const json = (res, data, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(data));
  };
  const fixture = {
    name: 'anki-priority-isolated-fixture',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/anki' || url.pathname === '/') {
          const html = await server.transformIndexHtml(
            '/anki',
            '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Anki 隔离预览</title></head><body><div style="padding:10px 22px;background:#fff1a8;font-size:12px">本地隔离预览 · 模拟账号和卡片 · 不连接生产，重启清空操作</div><div id="root"></div><script type="module" src="/packages/project-notes/verification/anki-priority-preview.tsx"></script></body></html>',
          );
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
          return;
        }
        if (!url.pathname.startsWith('/api/')) return next();
        if (req.method === 'GET' && url.pathname.endsWith('/me'))
          return json(res, { user: { id: 'preview-only', login: '模拟账号' } });
        if (req.method === 'GET' && url.pathname.endsWith('/dashboard'))
          return json(res, {
            categories: [{ id: 'preview-category', name: '模拟库' }],
            decks: ['preview-deck', 'preview-second'].map((id, i) => {
              const subset = cards.filter((c) => c.deckId === id);
              return {
                id,
                categoryId: 'preview-category',
                name: i ? '全量覆盖样例' : '长答案滚动样例',
                total: subset.length,
                due: subset.filter((c) => c.dueAt <= '2026-11-03T00:00:00Z').length,
                learned: subset.filter((c) => c.reviewCount > 0).length,
                stable: 0,
              };
            }),
            today: seen.size,
            goal: 12,
            timeZone: 'Asia/Shanghai',
            history: [{ date: '2026-11-03', uniqueCards: seen.size, reviews, goal: 12 }],
          });
        const match = url.pathname.match(/\/anki\/decks\/([^/]+)\/(cards|queue|tags)$/);
        if (req.method === 'GET' && match) {
          const subset = cards.filter((c) => c.deckId === match[1]);
          if (match[2] === 'tags')
            return json(res, { tags: [{ id: 'sample-tag', name: '样例', cardCount: subset.length }] });
          return json(res, {
            cards: match[2] === 'queue' ? subset.filter((c) => c.dueAt <= '2026-11-03T00:00:00Z') : subset,
            serverNow: '2026-11-03T00:00:00Z',
            previews: {},
          });
        }
        if (req.method === 'POST' && /\/(practice|reviews)$/.test(url.pathname)) {
          try {
            const chunks = [];
            let bytes = 0;
            for await (const chunk of req) {
              bytes += chunk.length;
              if (bytes > 4096) return json(res, { error: 'payload too large' }, 413);
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (receipts.has(body.mutationId)) return json(res, receipts.get(body.mutationId));
            const card = cards.find((c) => c.id === body.cardId);
            if (!card || card.version !== body.version) return json(res, { error: '版本已变化' }, 409);
            if (!['correct', 'hard', 'wrong'].includes(body.rating))
              return json(res, { error: '预览仅支持三档自评' }, 400);
            card.version += 1;
            card.reviewCount += 1;
            card.practiceCount += 1;
            card[`${body.rating}Count`] += 1;
            card.intervalDays = body.rating === 'wrong' ? 0 : 6;
            card.dueAt = body.rating === 'wrong' ? '2026-11-03T00:10:00Z' : '2026-11-09T00:00:00Z';
            seen.add(card.id);
            reviews += 1;
            const output = { card: { ...card } };
            receipts.set(body.mutationId, output);
            return json(res, output);
          } catch {
            return json(res, { error: '模拟请求解析失败' }, 400);
          }
        }
        return json(res, { error: '隔离预览不支持此操作' }, 403);
      });
    },
  };
  const server = await createServer({
    configFile: false,
    root,
    cacheDir: path.join(root, 'node_modules/.vite-anki-priority-preview'),
    plugins: [react(), fixture],
    resolve: { alias: { '@': path.join(root, 'packages/blog/src'), '@config': path.join(root, 'config') } },
    define: { 'import.meta.env.VITE_DEPLOY_TARGET': JSON.stringify('cloud') },
    css: { postcss: path.join(root, 'config/postcss.config.js') },
    publicDir: path.join(root, 'public'),
    server: { host: '127.0.0.1', port: 32741, strictPort: true },
  });
  await server.listen();
  server.printUrls();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  startPreview().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
