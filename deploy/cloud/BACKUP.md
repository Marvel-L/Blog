# 数据库加密备份与恢复演练

`backup.py`、`dblog-backup.service`、`dblog-backup.timer` 已安装到当前服务器。
2026-10-21 首次备份、真实 PostgreSQL 恢复演练和 Mac 异地副本校验通过。
自动向异地存储传输尚未配置，当前只完成一次异地复制。

## 密钥与文件

备份使用 [age 官方工具](https://github.com/FiloSottile/age) 的收件人公钥加密。
服务器安装 age 1.2.1，只保存 `/opt/dblog/shared/backup-recipients.txt` 公钥。
Mac 使用 age 1.3.2，私钥保存在仓库外 `/Users/gzm/.config/dblog/backup-age.key`（0600）。
不要将恢复私钥提交 Git、放入镜像或与站点制品一起上传；应另行保管离线副本。
若 Mac 私钥丢失且没有其他私钥副本，服务器已有密文将无法恢复。

备份目录 `/var/backups/dblog` 为 root:root 0700；密文及 SHA256 文件为 0600。
密文包内只有数据库 custom dump 和清单（快照行数、dump 摘要、创建时间、应用 release）。
不包含 OAuth Secret、数据库密码、TLS 私钥或恢复私钥，重建整台服务器仍需独立恢复这些配置。

## 运行方式

- 每天北京时间 03:00 后随机 15 分钟内运行；漏跑后补执行，失败最多重试两次，间隔 15 分钟。
- `pg_dump -Fc` 与清单中的 5 张表行数读取同一个 PostgreSQL 导出快照，正常读写继续进行。
- 明文只在 `/run` 的临时目录中处理；systemd 自动清理自己的运行目录，恢复工具退出时清理演练工作区。
- 备份失败不发布半成品、不清理旧备份；成功生成新备份后才清理 14 天前的历史密文。
- 备份与恢复持有发布锁的共享锁，避免与发布中的迁移重叠；备份锁串行执行维护任务。
- 脚本安装到 `/opt/dblog/maintenance/backup.py`，与应用 release 独立，发布切换不影响定时器路径。

更新脚本与定时器（服务器，从待安装的源码目录执行；需先安装 age 并配置加密公钥）：

```sh
sudo install -d -m 700 /opt/dblog/maintenance
sudo install -m 700 deploy/cloud/backup.py /opt/dblog/maintenance/backup.py
sudo install -m 644 deploy/cloud/dblog-backup.service /etc/systemd/system/
sudo install -m 644 deploy/cloud/dblog-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dblog-backup.timer
sudo systemctl start dblog-backup.service
sudo systemctl show dblog-backup.service -p Result -p ExecMainStatus
sudo systemctl list-timers dblog-backup.timer
```

检查 `journalctl -u dblog-backup.service`，确保不是只有定时器启用而没有成功备份。
脚本非零退出、systemd 的 Result 非 success 时，不能当作成功备份。

## 隔离恢复演练

仅恢复自己的可信备份。私钥临时放在服务器 `/run` 的 0600 文件，演练后删除；每日备份任务不需要私钥。

```sh
sudo python3 /opt/dblog/maintenance/backup.py verify \
  --archive /var/backups/dblog/<备份文件>.tar.age \
  --identity /run/dblog-recovery.key
```

工具先核验密文 SHA256、age 解密、归档成员和 dump 摘要，再创建随机命名的 `dblog_restore_<随机值>` 数据库。
恢复在单事务内执行，校验所有表的快照行数和约束，最后删除演练库；失败也清理演练库，清理失败按失败报告。
工具不接受调用者指定目标数据库，不能覆盖线上 `dblog`。真正灾难恢复需另行安排停写和切换步骤。

## 异地复制与余项

首份密文和校验文件位于 Mac `/Users/gzm/Library/Application Support/D-blog/backups/`，已实际解密并核验 dump 摘要。
这是一份手动异地副本；服务器每天生成的后续备份仍需定期复制。待确定 COS 或其他存储后配置自动传输。
周期性恢复演练目前需要手动执行，因为私钥没有长期保存在服务器；本次通过不代表未来每份备份已经恢复验证。
第二个真实账号的生产隔离、应用发布切换的短暂中断优化、生产回滚演练分别跟踪。
