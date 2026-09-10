/**
 * 站点配置。
 *
 * 数据源为同目录下的 site.config.json —— 可在 PagesCMS「站点配置」中直接编辑，
 * 保存即推送仓库生效，无需改动代码。本文件仅负责加载 JSON 并提供类型约束：
 * JSON 缺字段/类型不符会在 `npm run typecheck` 时直接报错（fail-fast）。
 *
 * 构建脚本侧（sitemap / RSS / SSG / SEO 审计）通过 scripts/site-config-loader.mjs
 * 读取同一份 JSON，保证客户端与构建期配置一致。
 */
import siteConfigJson from './site.config.json';

export interface SiteAuthor {
  name: string;
  avatar: string;
  role: string;
  bio: string;
}

export interface SiteSocial {
  github: string;
  email: string;
  rawEmail: string;
}

export interface SiteToc {
  collapseInactiveRootBranches?: boolean;
}

export interface SiteComments {
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
  /**
   * giscus 脚本/iframe/API 来源（有序回退链的「首选来源」）。
   * 默认直连官方 https://giscus.app（已移除站点同源代理边缘函数）。
   * 大陆网络下 giscus.app 被 DNS 污染/阻断，评论区可能无法加载；
   * 如需大陆可用的评论，可改为自托管 giscus 实例或可达镜像的完整 URL。
   * 注意：GitHub OAuth 登录回调固定指向 giscus.app，大陆网络下无法完成登录。
   */
  origin?: string;
  /**
   * 严格匹配（data-strict）：true 时按「正文 SHA-1 哈希」搜索 Discussion（新讨论由
   * giscus 自动附带哈希标记）；false 时按「标题」搜索并允许评论时自动创建讨论。
   * 注意：历史已存在的 Discussion 正文没有哈希标记时，严格匹配会搜不到（评论不显示），
   * 因此本仓库关闭严格匹配（现有讨论按标题 pathname 直接命中）。
   */
  strict?: boolean;
}

export interface SiteGuestbook {
  discussionId: number;
}

export interface SiteFriendsPage {
  repoUrl: string;
  repoFriendsUrl: string;
  repoFriendsDir: string;
  /** 友链申请/修改外部表单地址（Tally）。 */
  applyUrl: string;
}

export interface SiteFeedback {
  /** 站点反馈表单地址（Tally），右侧中下部贴边的反馈侧签点击直达。 */
  url: string;
}

export interface SiteContent {
  /** 文章源文件所在仓库（用于"在 GitHub 上编辑此文"跳转）。默认回退 friendsPage.repoUrl。 */
  repoUrl?: string;
  /** 文章源文件所在分支，默认 main。 */
  defaultBranch?: string;
}

export interface SiteBeian {
  text: string;
  url: string;
}

/** 首页首次进入的打字机引导文案（可在 site.config.json / PagesCMS 中修改）。 */
export interface SiteIntro {
  /** 是否启用引导遮罩；false 时不展示。 */
  enabled: boolean;
  /** 逐行打印的文案；空数组视为关闭。 */
  lines: string[];
  /** 全部行打印完成后自动进入首页的等待毫秒数。 */
  holdMs: number;
}

export interface SiteConfig {
  title: string;
  subtitle: string;
  /** 站点头条：首页 <title> 与 og:title 使用（含关键词，利于首页排名）。 */
  seoHomeTitle?: string;
  /** 首页 SEO 描述：仅用于 meta description / og:description / twitter:description 与站点级 schema，
      不改变页面可见文案（首页 Hero 与页脚可见文案仍使用 description）。 */
  seoHomeDescription?: string;
  description: string;
  /** 站点 Logo（绝对或站点内路径）；空字符串表示不使用 Logo。 */
  logo: string;
  /** 导航栏小 Logo；空字符串表示导航仅展示文字标题。 */
  logoSmall: string;
  /** 默认社交分享图；空字符串表示不输出默认 og:image。 */
  seoImage: string;
  footerText: string;
  url: string;
  social: SiteSocial;
  author: SiteAuthor;
  toc?: SiteToc;
  /** 是否启用 Giscus（文章评论区 + 留言板统一开关）。 */
  giscusEnabled?: boolean;
  comments: SiteComments;
  guestbook: SiteGuestbook;
  friendsPage: SiteFriendsPage;
  /** 站点反馈表单入口（右侧中下部贴边的反馈侧签）。 */
  feedback: SiteFeedback;
  /** 文章内容仓库（"在 GitHub 上编辑此文"/查看源文件入口使用）。 */
  content?: SiteContent;
  beian: SiteBeian;
  /** 首页首次进入的打字机引导；缺省或 enabled=false 时不展示。 */
  intro?: SiteIntro;
}

export const siteConfig: SiteConfig = siteConfigJson;
