# Planner：月度目标与每日遗留

2026-11-07：将已确认的交互 demo 接入现有 Planner。代码与本地验证进度见下文，生产发布需另行执行。

页面使用松石绿、浅色面板与博客原有深色主题。左侧按年份和月份选择，中间管理月度目标，右侧记录每日遗留；窄屏通过顶部按钮切换两类任务。月度目标支持快速添加、编辑、分类、优先级排序、搜索、完成、删除和撤销；进度条依据真实月度任务计算年、季度和月完成率。

月度数据继续使用版本 1 协议，任务的 `category`（work / learning / life / other）与 `priority`（normal / high）为可选字段。旧三字段任务保持兼容，新增字段写在 Markdown 的 ID 注释中，前后端生成格式一致。匿名计划沿用项目 Markdown 与本机缓存；静态站点刷新优先恢复访客本机编辑，开发模式沿用项目文件；已连接账号的月度目标只写账号草稿与云端，避免账号数据落入公开项目文件。

每日遗留由用户主动记录，保留来源日期与补充说明；支持安排今天/明天、完成、回看当日记录和删除撤销。未完成记录跨日可见，完成记录可按完成日期查找。每日遗留不计入月度进度，不写入项目 Markdown 或 GitHub 提交队列。

`GET /api/v1/planner/daily` 与 `PUT /api/v1/planner/daily` 沿用 Planner 会话/精确 Origin 授权规则，用户身份由服务端获取。现有系统账号须先绑定 GitHub 的业务守卫保持。响应为 `{user, planner: {state, revision, updatedAt}}`；PUT 使用 `{baseRevision, mutationId, state}`，乐观版本冲突返回 409 及远端快照，重复请求幂等，同一个 mutation ID 不能改写请求内容。

新增迁移 `012_planner_daily.sql` 创建按 `user_id` 隔离的私有 JSONB 快照；保存事务锁定用户行，串行处理同一账号并发写入。每日状态为 `{version: 1, tasks}`，每条任务包含 `id`、`text`、`date`、`note`、`priority`、`scheduledFor`、`completedOn`。最多 1000 条，日期必须有效且排期/完成日期不早于来源日期。删除用户时级联清理。

月度和每日同步共享带状态解析器的 `PlannerSynchronizer`，账号草稿分别存于 `d-blog-monthly-planner-sync-v1:<userId>` 与 `d-blog-daily-planner-sync-v1:<userId>`。900ms 防抖上传，前台每 15s 检查；失败保留原 mutation ID 重试，上传期间的新编辑在确认后继续上传；409 提供两个版本的明确选择。退出、账号切换和卸载取消请求、隐藏私有记录并恢复匿名月度计划。

同步浮球合并两类任务的状态，只有真实确认且没有待上传/冲突/失败时显示已同步。详情提供账号、月度/每日状态、最近确认、GitHub 回写状态、立即同步、冲突选择与断开；浮球与全站底栏、Cookie 提示和更新提示高度变量配合避让。编辑弹层使用共享焦点管理、Escape 与滚动锁，SSG 首帧不读取时钟或浏览器存储。

验证覆盖：Markdown 新旧数据往返、目标 CRUD/搜索/撤销与进度、SSR 确定性、公共缓存隔离、每日排期/完成、切换账号的取消与迟到响应、网络失败重试与上传期间继续编辑，以及真实 PostgreSQL 的持久化/账号隔离/授权拒绝/幂等/并发冲突/故障反馈。生产迁移和真实 OAuth 未执行。
