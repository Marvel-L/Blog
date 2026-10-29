export const ABILITY_DIMENSIONS = [
  { title: '算法', description: '是否熟悉基础算法、常见题型与 LeetCode 100。' },
  { title: '语言广度', description: '是否熟悉 Golang、Java、C++、前端；停留在会用。' },
  { title: '语言深度', description: '是否用某个语言开发过完整项目，了解数据结构，知道优缺点；融会贯通。' },
  { title: '业务广度', description: '是否熟悉广告、交易、合同、履约、信用、金融、搜推；熟悉并知道业务模式。' },
  { title: '业务深度', description: '是否了解金融管理、快照与对账、合同状态流转以及支付实现。' },
  { title: '技术广度', description: '是否了解 CI/CD、部署、问题排查、开发模型、性能优化与中间件。' },
  { title: '技术深度', description: '是否知道并实现不同 CI/CD 方式，以及如何选择数据库。' },
  { title: 'AI', description: '是否了解 AI 概念、使用和搭建 AI 内容，以及如何看待 Vibe 与 harness。' },
  { title: '学历', description: '学历背景与评价依据由作者自己说明。' },
];
export const ABILITY_GRADES = {
  N: { name: 'Newbie', rank: 1, color: '#777e89' },
  G: { name: 'Green', rank: 2, color: '#2a9465' },
  B: { name: 'Blue', rank: 3, color: '#3875cb' },
  V: { name: 'Violet', rank: 4, color: '#9554c2' },
  O: { name: 'Orange', rank: 5, color: '#c27c24' },
  R: { name: 'Red', rank: 6, color: '#d55259' },
};
/** 缺失配置是没有数据，不是 Newbie。无效非空值仍阻断构建。 */
export function validateAbilityConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('能力 config.json 必须是对象');
  const titles = new Set(ABILITY_DIMENSIONS.map((item) => item.title));
  const result = {};
  for (const [title, grade] of Object.entries(value)) {
    if (!titles.has(title)) throw new Error(`未知能力维度：${title}`);
    if (grade === null || grade === '') continue;
    if (typeof grade !== 'string' || !Object.hasOwn(ABILITY_GRADES, grade))
      throw new Error(`${title} 等级必须为 N/G/B/V/O/R`);
    result[title] = grade;
  }
  return result;
}
export function abilityDocumentRoute(title, filename) {
  if (
    !ABILITY_DIMENSIONS.some((item) => item.title === title) ||
    !/\.md$/i.test(filename) ||
    /[/\\?#]/.test(filename) ||
    [...filename].some((character) => character.charCodeAt(0) < 32) ||
    filename.startsWith('.')
  ) {
    throw new Error('不安全的能力文档路径');
  }
  return `/about/ability/${encodeURIComponent(title)}/${encodeURIComponent(filename)}`;
}
export function getAbilityRoutes(data) {
  return data.documents.map((document) => abilityDocumentRoute(document.dimension, document.filename).slice(1));
}
export function abilityPoint(index, rank, radius = 176) {
  const angle = ((-90 + index * 40) * Math.PI) / 180;
  const distance = (radius * rank) / 6;
  return [Number((350 + distance * Math.cos(angle)).toFixed(4)), Number((262 + distance * Math.sin(angle)).toFixed(4))];
}
