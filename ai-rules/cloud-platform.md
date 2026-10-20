# 云端增强版与 package 边界

本规则依据用户 2026-10-20 的要求新增。详细架构、进度与版本记录位于 `packages/project-notes/`。

## 架构

- 根 package 是博客应用，继续管理 src/、config/、posts/、shuoshuo/、public/、scripts/ 和现有 CMS。
- packages/server 是独立 npm workspace，只提供 API，不读取 Markdown、不参与 SSG、不导入前端组件。
- packages/project-notes 是文档 workspace，保存 ADR、任务状态、版本范围、验证结果和部署记录，无运行时代码。
- 0.1.0 不移动博客目录。以后迁入 packages/blog 时单独实施和验证，不得把内容迁移混在账号功能中。

## 修改规则

1. Pages 构建显式使用 pages；默认不启用云端组件，不访问 /api/v1，不要求数据库和 OAuth 密钥。云端组件必须经条件动态导入，使 Pages 产物可裁剪。
2. 两个目标都调用 scripts/build.mjs 的同一条 SSG/构建/SEO 审计流水线。首版共同使用 /Blog/，cloud 只是部署能力配置，不是另一份博客代码。
3. 新增客户端能力在 effect 后挂载，SSG 与水合首帧一致；后端故障不能阻止阅读。
4. API 仅在云端同源提供；不添加宽泛 CORS。非安全方法校验精确 Origin；身份从服务端会话读取，不能接受客户端 user_id 授权。
5. OAuth 使用随机 state、S256 PKCE、10 分钟一次性数据库事务、固定回调地址。仅访问固定 GitHub API，不跟随携带凭据的重定向。
6. 会话使用 host-only、HttpOnly、SameSite=Lax Cookie；生产启用 Secure 与 __Host- 前缀。数据库仅保存会话 token 摘要，退出必须撤销数据库会话。不得新增假登录或生产测试后门。
7. 不记录 Cookie、密码、OAuth code/token/secret、数据库连接串和完整请求 URL。代理也不得记录 OAuth 回调查询串。错误反馈脱敏但不能假装成功。
8. 页面行为默认关闭，由用户本次主动开启。只允许白名单事件与 pathname，不采集查询参数/fragment/任意属性；登录成功事件只能由服务端创建。保持原 Umami 与不蒜子规则及现有行为。
9. 事件按 (user_id, event_id) 去重；重试保留事件 ID，次数有上限。账号切换、退出、卸载均处理请求取消、竞态与本机数据清理。事件默认保留 90 天。
10. API/账号响应 no-store。首版 /api/ 位于 /Blog/ Service Worker 作用域之外；不得扩展缓存到账号接口。未来改变代理路径需先验证 SW 排除行为。
11. 数据库 schema 通过编号 SQL 迁移；迁移串行化且事务执行，失败阻止 API 启动。禁止通过自动删除数据卷解决迁移失败。
12. 工作进度区分代码完成、测试通过、生产验证；未连接服务器或未经过真实 OAuth，不得记为已上线。每版更新 project-notes 的版本记录。
13. 服务端测试必须验证真实 SQL 持久化行为、授权失败、重放、账号隔离、幂等与故障反馈；纯 mock 不能替代存储验证。PGlite 通过不等于 pg 网络连接、迁移锁或容器部署已通过。
14. 新增服务端环境变量需同时说明于根 .env.example；真实 .env、证书与数据库备份不得提交或进入镜像构建上下文。

## 验证入口

- npm run typecheck：博客与服务端。
- npm test / npm run test:coverage：博客、脚本与服务端；CI 保持原三个 job 边界。
- npm run build：现有博客流水线；Pages 在 CI 中显式 VITE_DEPLOY_TARGET=pages。
- npm run build:cloud：同一流水线，启用云端组件。
- npm run build --workspace @d-blog/server：服务端编译。
- 部署文档见 deploy/cloud/README.md；镜像标签回滚与数据库恢复是两件不同的操作。
