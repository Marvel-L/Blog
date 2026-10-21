const bookPackages = [
  {
    id: 'algorithms',
    name: '算法学习手册',
    subtitle: '把题目、方法与复盘组织成可连续阅读的知识包。',
    edition: 'ALGORITHM FIELD NOTES',
    accent: '#365348',
    chapters: [
      {
        id: 'start',
        title: '阅读指南',
        group: '开始',
        content: `# 阅读指南

这不是按博客分类自动拼成的目录，而是一份可以持续维护的算法学习 package。正文负责讲清知识脉络，文章只作为延伸材料出现。

## 怎么使用

1. 先读每章的核心方法，建立稳定的判断框架。
2. 再打开章末关联文章，看具体题目与复盘。
3. 新内容优先补进 package；需要完整推导时再关联 Blog 文章。

> Book 是知识的主线，Blog 是沿途的案例与记录。`,
        relatedPostIds: ['leetCode-hot-100', 'xiaolin_algo_week1_day1', 'xiaolin_algo_week2_day1'],
      },
      {
        id: 'linked-list',
        title: '链表：从指针关系入手',
        group: '数据结构',
        content: `# 链表：从指针关系入手

链表题的难点通常不是语法，而是同时维护多个节点之间的关系。动手前先回答三个问题：当前节点是谁、下一步要保存什么、修改后哪条边会消失。

## 基础框架

\`\`\`text
保存 next → 修改连接 → 移动当前指针
\`\`\`

## 常见题型

- 遍历与计数
- 快慢指针
- 反转区间
- 删除或插入节点
- 合并多个链表

处理边界时优先考虑虚拟头节点，它能统一“修改头节点”和“修改中间节点”的分支。`,
        relatedPostIds: ['lcsaf-seek-link-list-0x01', 'lcsaf-reverse-link-0x01', 'lcsaf-add-two-numbers-ii-0x01'],
      },
      {
        id: 'number-theory',
        title: '数论：最大公约数',
        group: '数学基础',
        content: `# 数论：最大公约数

欧几里得算法利用 \`gcd(a, b) = gcd(b, a mod b)\` 不断缩小问题规模，直到余数为零。

## 实现

\`\`\`cpp
int gcd(int a, int b) {
  while (b != 0) {
    int next = a % b;
    a = b;
    b = next;
  }
  return a;
}
\`\`\`

它也是理解“用不变量缩小状态空间”的一个好例子。`,
        relatedPostIds: ['gcd_learning_0x01'],
      },
    ],
  },
  {
    id: 'golang',
    name: 'Go 语言笔记',
    subtitle: '从语义、指针到工程判断，记录真正容易混淆的地方。',
    edition: 'THINKING IN GO',
    accent: '#365d74',
    chapters: [
      {
        id: 'language-basics',
        title: '语言基础与阅读方式',
        group: '基础',
        content: `# 语言基础与阅读方式

学习 Go 时，不要只记“语法允许怎么写”，还要同时理解值的复制、变量的生命周期和接口背后的动态类型。

## 建议顺序

- 变量、切片与 map
- 函数参数与值传递
- 指针和方法集
- 接口与错误处理
- goroutine、channel 与 context

每一章只保留可复用的判断规则，具体踩坑放到关联文章里。`,
        relatedPostIds: ['for-gamma-error-0x01', 'go-pointer-pass-by-value-0x01'],
      },
      {
        id: 'pointers',
        title: '指针仍然按值传递',
        group: '核心语义',
        content: `# 指针仍然按值传递

把指针传入函数时，复制的是“地址值”。函数可以通过这个地址修改原对象，但如果只把形参重新指向另一个地址，调用方持有的指针不会变化。

## 判断方法

先区分两种动作：

1. 修改指针指向的对象；
2. 修改指针变量本身。

前者通常能影响调用方，后者若要影响调用方，需要传入指针的指针或返回新指针。`,
        relatedPostIds: ['go-pointer-pass-by-value-0x01'],
      },
    ],
  },
  {
    id: 'projects',
    name: '项目拆解',
    subtitle: '用链路、状态与证据理解复杂系统，而不是按目录逐文件阅读。',
    edition: 'BUILD & REFLECT',
    accent: '#665079',
    chapters: [
      {
        id: 'system-reading',
        title: '如何开始阅读一个项目',
        group: '方法',
        content: `# 如何开始阅读一个项目

面对大型工程，先寻找一条真实业务状态变化链路：入口、核心状态、持久化、异步消息与最终可见结果。

## 一条有效链路应回答

- 请求从哪里进入？
- 哪个状态是事实来源？
- 失败后如何重试或回滚？
- 哪些日志、指标或数据能证明结果？

完成一条链路后，再横向扩展到相邻模块，避免从目录树开始无目标地阅读。`,
        relatedPostIds: ['volc-contract-process-reading-0x01', 'cam-aim-tidy-0x01', 'my_program_weapon_0x01'],
      },
    ],
  },
  {
    id: 'life',
    name: '生活记录',
    subtitle: '把散落的片段整理成能回看的时间线。',
    edition: 'NOTES ON LIVING',
    accent: '#8c6045',
    chapters: [
      {
        id: 'recent-notes',
        title: '最近的记录',
        group: '时间线',
        content: `# 最近的记录

这里保存生活记录的阅读入口。正文负责串起阶段变化，关联文章保留当时更完整的细节和情绪。

## 记录原则

- 保留具体事件，不用抽象结论替代事实。
- 区分当时的感受和现在的复盘。
- 不要求每次记录都得出答案，但要留下可回看的线索。`,
        relatedPostIds: ['26-10-19-记录这几天', '2026-10-16-记录一次失眠', '26-中秋-记录一次运动'],
      },
    ],
  },
  {
    id: 'decisions',
    name: '重要选择',
    subtitle: '记录决策发生时的约束、权衡与验证信号。',
    edition: 'THE PATH WE TAKE',
    accent: '#7c4045',
    chapters: [
      {
        id: 'decision-log',
        title: '决策日志怎么写',
        group: '方法',
        content: `# 决策日志怎么写

好的决策记录不是事后证明自己正确，而是保存当时可见的信息、约束和取舍。

## 最小结构

1. 要解决的问题
2. 不可忽略的约束
3. 候选方案与代价
4. 最终选择及理由
5. 未来用什么信号验证或推翻

这样即使结果不理想，也能区分“判断过程有问题”还是“世界后来发生了变化”。`,
        relatedPostIds: ['2026-北京工作final-0x01', '北京工作切换-0x03', '26年新跑鞋-0x01'],
      },
    ],
  },
  {
    id: 'fitness',
    name: '训练手册',
    subtitle: '用动作目的、执行要点与训练安排组织健身内容。',
    edition: 'STRENGTH & BALANCE',
    accent: '#686c42',
    chapters: [
      {
        id: 'dumbbell',
        title: '哑铃训练索引',
        group: '动作库',
        content: `# 哑铃训练索引

训练内容按动作目的组织，而不是按器械数量堆叠。每次训练先确定目标肌群、动作模式和可控强度，再选择单哑铃或双哑铃版本。

## 执行检查

- 动作范围是否稳定
- 核心是否保持控制
- 重量是否允许完成目标次数
- 下一次训练如何渐进

身体不适时停止动作并重新评估，不把疼痛当作有效训练反馈。`,
        relatedPostIds: ['single_dumbbell_exec_0x01', 'double_dumbbell_exec_0x01'],
      },
    ],
  },
  {
    id: 'miscellany',
    name: '个人索引',
    subtitle: '收纳暂时不属于固定主题，但值得持续整理的材料。',
    edition: 'A PERSONAL INDEX',
    accent: '#68625a',
    chapters: [
      {
        id: 'inventory',
        title: '能力与关系索引',
        group: '整理',
        content: `# 能力与关系索引

不是所有内容都需要立刻归入一个稳定分类。这份 package 用来保存仍在形成中的项目能力、人物观察与可复用线索。

## 整理方式

- 能复用的工具与项目经验形成能力清单
- 对人的观察保留具体情境，避免只贴标签
- 当同类内容足够多时，再拆成新的独立 package`,
        relatedPostIds: ['my_program_weapon_0x01', '我接触过的人-0x01'],
      },
    ],
  },
  {
    id: 'career',
    name: '求职与成长',
    subtitle: '把经历整理成证据，把经验表达成可验证的能力。',
    edition: 'WORK IN PROGRESS',
    accent: '#49666a',
    chapters: [
      {
        id: 'career-story',
        title: '建立职业叙事',
        group: '准备',
        content: `# 建立职业叙事

职业叙事不等于罗列做过的需求。它应该说明你面对什么问题、承担了什么责任、做出了哪些判断，以及结果如何被验证。

## 组织方式

- 用少数能力域归纳经历
- 为每个能力域选择一条主案例
- 保存代码、指标、设计文档或复盘作为证据
- 准备失败场景与取舍问题，而不只准备成功结果`,
        relatedPostIds: ['三本社招6年Go后端-0x01', 'cam-aim-tidy-0x01'],
      },
    ],
  },
  {
    id: 'prompts',
    name: 'Prompt 工具箱',
    subtitle: '把一次有效对话沉淀成可复用的工作模板。',
    edition: 'WORDS INTO TOOLS',
    accent: '#62607d',
    chapters: [
      {
        id: 'prompt-structure',
        title: 'Prompt 的最小结构',
        group: '方法',
        content: `# Prompt 的最小结构

稳定的 Prompt 通常包含目标、输入、约束、输出格式和验收标准。与其堆叠角色设定，不如把真正会改变结果的条件写清楚。

## 检查清单

- 输入材料是否完整
- 任务边界是否明确
- 数字与事实是否要求来源
- 输出能否直接使用
- 失败或缺少信息时应该怎么处理`,
        relatedPostIds: ['cam-summary-prompts'],
      },
    ],
  },
];

export const getBookPackageDefinitions = () => bookPackages;
