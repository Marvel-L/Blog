# 云端发布性能与安全规则

## 适用范围

本规则约束 `Deploy to Cloud`、`deploy/cloud/upload-ip.sh`、`deploy/cloud/publish-ip.sh`、云端发布包/差异包生成器，以及相关 Docker Compose、镜像构建和生产验收逻辑。

## 修改规则（必须遵守）

1. **增量传输，完整验收**：日常发布必须以当前 `/opt/dblog/current` 的不可变 `SHA256SUMS` 为可信基线，只传输新增、变更文件和完整的新清单；基线缺失、格式异常或不可信时必须自动退化为完整发布，不得猜测或跳过文件。
2. **不可变历史版本**：新 release 可用硬链接复用上一版未变化文件，但覆盖前必须先删除目标硬链接并复制新文件，禁止原地写入共享 inode；历史 release、数据卷和证书不得因提速被修改或删除。
3. **双重完整性校验**：传输包先做整包 SHA256；服务端组装后必须按照完整 `SHA256SUMS` 校验全部发布文件，并检查实际文件集合与清单一致。差异包自身的控制文件不得冒充发布文件进入清单。
4. **绑定精确基线**：差异包必须记录生成时的完整基线 release 路径；服务端应用前必须确认它等于当前 release。基线已经变化时必须拒绝发布并重新生成，不得把差异强行套到其他版本。
5. **选择性构建**：仅 `dist/**` 变化时只构建并重启 Web；`packages/server/**` 变化时构建 API/Migrate 并运行迁移；`.dockerignore` 或 `deploy/cloud/**` 变化时默认 Web 与 API 都重建。无法可靠分类时走完整路径。
6. **选择性重启**：前端-only 发布使用 `--no-deps` 更新 Web，不重建、不重启 API，也不重复执行数据库迁移；后端或基础设施变化继续等待 API/Web 健康检查。
7. **同提交幂等**：release 标识必须来自完整发布内容的摘要，不能使用依赖当前基线的差异包摘要；同一提交和同一完整制品无论从哪个基线发布，都应得到同一 release 标识。
8. **原子切换与回滚**：只有容器健康检查和公网 `/api/v1/health`、`/Blog/cloud-release.json` 验收全部通过后，才可更新镜像标签与 `/opt/dblog/current`。失败继续恢复上一版镜像和指针；SQL 迁移仍不自动回退。
9. **发布耗时可观测**：至少分别记录差异包准备、上传、远端重组校验、release 物化、镜像构建、容器健康等待和公网验收耗时。不得把所有慢操作重新合并成无法定位的单条黑盒日志。
10. **失败必须封闭**：上传失败、包损坏、路径穿越、符号链接、清单重复/缺失、基线不匹配或最终文件集合不一致，均必须在切换生产前失败并清理临时目录；不得覆盖已存在的有效上传包或 release。
11. **密钥与主机身份不降级**：SSH 私钥仅由外部 secret 文件注入；保持 `BatchMode`、`IdentitiesOnly`、严格 known_hosts 校验，禁止为提速使用 `StrictHostKeyChecking=no` 或在日志中输出凭据。
12. **回归测试**：修改差异生成、分块上传、release 物化、构建范围判定或回滚逻辑时，必须覆盖完整回退、增量新增/修改/删除、多批次乱序上传、分块失败、内容损坏、不安全路径和历史 release 不被改写。

## 验证入口

- `bash -n deploy/cloud/upload-ip.sh deploy/cloud/publish-ip.sh`
- `npx vitest run scripts/create-cloud-delta.test.mjs scripts/package-cloud-release.test.mjs scripts/upload-cloud-release.test.mjs`
- `npm run typecheck`
- `npm run lint`
- 涉及构建或制品格式时运行 `npm run build:cloud` 并重新生成完整包与差异包。

## 破例条款

> 本文件规则为硬性约束。需要打破其中任何一条时，必须先向用户说明原因、影响与回退方案并获得明确授权；未授权不得实施。
