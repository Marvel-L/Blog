import { emptyResume, type DraftDocument } from './model';

export function newDocument(title: string, outline = false): DraftDocument {
  const heading = title.trim() || '未命名定稿';
  const markdown = outline
    ? `# ${heading}\n\n## 项目背景与个人贡献\n\n## 业务主流程\n\n## 技术方案与选型取舍\n\n## 异常边界与恢复方案\n\n## 面试讲述\n\n## 追问与回答关键词\n\n## 来源与核对\n\n- Book：补充原始材料链接\n- Mind：补充快问快答链接\n- 核对代码与文档，区分已实现能力和改进建议。\n- 核对个人贡献、指标与结果的依据。\n- 盲答后修正主稿，仍答不出的独立问题再加入 Anki。\n`
    : '';
  return { id: crypto.randomUUID(), title: heading, content: { ...emptyResume(), markdown } };
}

export function copyDocument(doc: DraftDocument): DraftDocument {
  return { id: crypto.randomUUID(), title: `${doc.title.slice(0, 116)} 副本`, content: doc.content };
}

export function downloadTitle(title: string): string {
  return (
    [...title]
      .map((char) => (char.codePointAt(0)! < 32 ? '_' : char))
      .join('')
      .replace(/[<>:"/\\|?*]/g, '_')
      .slice(0, 120)
      .trim() || '定稿'
  );
}
