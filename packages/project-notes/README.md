# @d-blog/project-notes

云端增强版的长期工程记录。功能版本 0.1.0，运维修订 0.1.3。

| 文档 | 内容 |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 部署拓扑、package 边界、架构决策与迁移条件 |
| [deployments/2026-10-21.md](deployments/2026-10-21.md) | 发文同步、自动发布验收与备份恢复 |
| [deployments/2026-10-20.md](deployments/2026-10-20.md) | 服务器检查、IP HTTPS 方案和待处理事项 |
| [PROGRESS.md](PROGRESS.md) | 本版进度、待验证项和下一版任务 |
| [versions/0.1.3.md](versions/0.1.3.md) | 每日加密备份、隔离恢复和首份异地副本 |
| [versions/0.1.2.md](versions/0.1.2.md) | 发文同步、CI 修复、发布校验与回滚 |
| [versions/0.1.1.md](versions/0.1.1.md) | IP HTTPS 公网部署、证书续期和待验收状态 |
| [versions/0.1.0.md](versions/0.1.0.md) | 首版交付范围、验证结果、限制与上线状态 |
| [../../deploy/cloud/README.md](../../deploy/cloud/README.md) | 云端部署、授权配置、更新、回滚与备份 |

每个版本新建 versions/<版本>.md，记录日期、具体行为、迁移、验证结果和遗留项。
进度只记录实际完成；代码、模拟/本地验证、生产验证分别描述。
本文档 package 不生成站点路由，不会把内部进度发布到博客。
