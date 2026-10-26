/* global document, requestAnimationFrame, PointerEvent */
/* 使用 html/scripts/shot.py --eval-file 调用；只在隔离检查浏览器内创建 fixture。 */
const check = (condition, name) => {
  if (!condition) throw new Error(name);
};
const waitFor = async (selector) => {
  for (let i = 0; i < 100; i++) {
    if (document.querySelector(selector)) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error('等待视图失败 ' + selector);
};
const click = (selector) => {
  const el = document.querySelector(selector);
  check(el, '找不到控件 ' + selector);
  el.click();
};
const original = localStorage.getItem('d-blog-anki-prototype-v1');
const createdName = '验证卡片库';
let result;
try {
  click('[data-action="new-deck"]');
  document.querySelector('[name="name"]').value = createdName;
  document.querySelector('[name="category"]').value = '验证分类';
  document.querySelector('#editor form').requestSubmit();
  check(!document.querySelector('#editor').open, '建库提交失败');
  let saved = JSON.parse(localStorage.getItem('d-blog-anki-prototype-v1'));
  const deck = saved.decks.find((item) => item.name === createdName);
  check(deck, '卡片库未持久化');
  click('[data-action="new-card"]');
  document.querySelector('[name="deckId"]').value = deck.id;
  document.querySelector('[name="q"]').value = 'Q：测试问题 <b>纯文本</b>';
  document.querySelector('[name="a"]').value = 'A：测试答案 <img src=x onerror=alert(1)>';
  document.querySelector('#editor form').requestSubmit();
  saved = JSON.parse(localStorage.getItem('d-blog-anki-prototype-v1'));
  const card = saved.cards.find((item) => item.deckId === deck.id);
  check(card, '卡片未持久化');
  click('[data-action="start"][data-deck="' + deck.id + '"]');
  await waitFor('.question');
  check(document.querySelector('.question')?.textContent === card.q, '问题未呈现');
  check(!document.querySelector('.question b'), 'Q 未安全转义');
  check(!document.querySelector('.answer'), '答案在操作前可见');
  check(!document.querySelector('[data-action="rate"]'), '揭示前能够评价');
  click('[data-action="reveal"]');
  check(document.querySelector('.answer p')?.textContent === card.a, '答案未揭示');
  check(!document.querySelector('.answer img'), 'A 未安全转义');
  click('[data-action="rate"][data-rating="good"]');
  saved = JSON.parse(localStorage.getItem('d-blog-anki-prototype-v1'));
  const updated = saved.cards.find((item) => item.id === card.id);
  check(updated.interval === 3, '首次正确间隔不符');
  check(updated.due - updated.last === 3 * 86400000, '到期时间与间隔不一致');
  check(saved.logs.filter((item) => item.cardId === card.id).length === 1, '评价未准确入账');
  check(document.querySelector('.completion'), '未完成本轮');
  click('a[href="#stats"]');
  await waitFor('.split-title');
  check(document.querySelector('.split-title h2').textContent === '1 张不同卡片', '每日去重完成量不符');
  check(document.querySelector('.split-title .small').textContent === '1 次评价', '每日评价次数不符');
  check(document.querySelector('.line-chart polyline'), '统计未使用折线');
  check(!document.querySelector('.chart-bars'), '旧柱图仍被渲染');
  const heatCell = document.querySelector('.heat-cell[data-count="1"]');
  check(heatCell && !heatCell.textContent.trim(), '热力单元格未隐藏数量');
  check(document.querySelector('#data-tip').hidden, '提示默认不应显示');
  heatCell.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  check(
    !document.querySelector('#data-tip').hidden &&
      document.querySelector('#data-tip').textContent === heatCell.dataset.tip,
    '悬停提示未匹配真实数量',
  );
  heatCell.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
  check(document.querySelector('#data-tip').hidden, '离开后提示未收起');
  click('a[href="#home"]');
  await waitFor('.home-entry');
  click('a[href="#overview"]');
  await waitFor('#deck-results');
  const noDue = document.querySelector('[data-action="start"][data-deck="' + deck.id + '"]');
  check(noDue.disabled, '测试库不应有到期卡');
  const beforeBrowsing = localStorage.getItem('d-blog-anki-prototype-v1');
  click('[data-action="browse"][data-deck="' + deck.id + '"]');
  await waitFor('.random-controls');
  check(document.querySelector('.question').textContent === card.q, '未来卡不能随机浏览');
  check(
    !document.querySelector('.answer') && !document.querySelector('[data-action="rate"]'),
    '浏览泄露答案或开放评价',
  );
  click('[data-action="browse-reveal"]');
  check(document.querySelector('.answer p').textContent === card.a, '随机浏览未揭示答案');
  click('[data-action="browse-shuffle"]');
  check(!document.querySelector('.answer'), '重新洗牌后答案未隐藏');
  check(document.querySelector('[data-action="browse-next"]').disabled, '单张卡片边界不符');
  check(localStorage.getItem('d-blog-anki-prototype-v1') === beforeBrowsing, '随机浏览改变排期或统计');
  click('[data-action="nav"][data-route="overview"]');
  await waitFor('#deck-results');
  click('[data-action="browse"][data-deck="go"]');
  await waitFor('.random-controls');
  const questions = [];
  for (let i = 0; i < 4; i++) {
    questions.push(document.querySelector('.question').textContent);
    click('[data-action="browse-reveal"]');
    if (i < 3) {
      click('[data-action="browse-next"]');
      check(!document.querySelector('.answer'), '切卡没有隐藏答案');
    }
  }
  check(
    new Set(questions).size === 4 && saved.cards.filter((c) => c.deckId === 'go').every((c) => questions.includes(c.q)),
    '洗牌未覆盖整个库或重复卡片',
  );
  click('[data-action="browse-shuffle"]');
  check(document.querySelector('[data-action="browse-prev"]').disabled, '重洗后未回到首张');
  check(localStorage.getItem('d-blog-anki-prototype-v1') === beforeBrowsing, '多卡浏览改动数据');
  click('[data-action="nav"][data-route="stats"]');
  await waitFor('.heat-cells');
  result = {
    coreFlow: '建库录入 → Q/A 自评排期 → 折线热力统计 → 未到期随机浏览 → 统计不变',
    randomBrowseKeepsSchedule: true,
    heatmapHover: true,
    passed: true,
    createdCardCount: saved.cards.filter((item) => item.deckId === deck.id).length,
    savedIntervalDays: updated.interval,
    loggedReviews: saved.logs.filter((item) => item.cardId === card.id).length,
  };
} finally {
  if (original === null) localStorage.removeItem('d-blog-anki-prototype-v1');
  else localStorage.setItem('d-blog-anki-prototype-v1', original);
}
return result;
