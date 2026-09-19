# inventory · 个人物品管理系统

用 **TOML** 记录物品、用 **TUI** 筛选编辑、用 **SVG** 渲染空间布局。

> 重构自旧版（JS + localStorage 单页应用）——三层解耦：**数据（TOML 文件）· 控制（CLI / TUI）· 渲染（SVG 查看器）**。

## 特性

- **数据即文本**：单文件 `data.toml`——手改友好、git 版本化、注释保留
- **TUI 筛选器**：yazi 风格的同步下钻（维度栏 → 列 → 结果），支持列搜索 / 全局搜索
- **详情列编辑**：选中物品即可改 名称/分类/去向/状态/层/位置/描述（Enter 进入，再 Enter 确定）
- **空间渲染**：物品按真实位置（cm 坐标）与形状画在视图上，形状库让"手机就是手机的样子"
- **独立查看器**：缩放 / 平移 / 数据变化自动刷新；**TUI 选中物品 → viewer 实时高亮**（其余变暗）
- **调试模式**：方向键微调物品位置、`+/-` 等比缩放，实时写回数据并渲染
- **数据驱动维度**：分类/去向/状态等维度在 TOML 里定义——加维度不用改代码

## 安装（本机已装到 `/opt/inventory`）

```bash
cargo build --release
sudo mv <项目目录> /opt/inventory && sudo chown -R $USER:$USER /opt/inventory
ln -s /opt/inventory/target/release/inv ~/.local/bin/inv
```

## 使用

```bash
inv                    # 直接进入 TUI（像 yazi 一样）
inv list --view desk   # 列物品
inv find 电池           # 按关键词找
inv stats              # 统计
inv check              # 校验（越界/重名/悬空引用）
inv render --out out.svg   # 导出 SVG（--view desk 导单个视图）

# 独立查看器（可多开）
/opt/inventory/target/release/inventory-viewer /opt/inventory/data.toml --view desk
/opt/inventory/target/release/inventory-viewer /opt/inventory/data.toml --view desk --focus 台灯
```

**数据文件**：默认 `/opt/inventory/data.toml`（用 `-d <路径>` 指定别的）。

## 架构

| crate | 职责 | 关键点 |
|---|---|---|
| `core` | 数据模型 + TOML 读写 + 校验 | 原子写（tmp+rename）、保留注释（toml_edit）、维度值平铺 |
| `render` | 形状库 + SVG 生成 | 形状自带宽高比；颜色属于图形自身；视图/总览两种输出 |
| `cli` | 命令行 | list / find / stats / add / move / status / condition / rm / check / render / tui |
| `tui` | 筛选器 + 详情列编辑 + 调试模式 | 三列模型（列区滑动窗口 + 结果独占最右） |
| `viewer` | 窗口查看器 | winit + softbuffer + resvg（CPU 渲染）；notify 监听自动刷新 |

## 数据格式（`data.toml` 节选）

```toml
[meta]
version = 2

# 维度定义（驱动 TUI 列与校验——加维度零代码）
[[dimension]]
key = "category"
name = "分类"
kind = "enum"
values = ["电子类", "厨具", "文具", "衣物类", "睡眠类", "其他"]

# 视图（物理空间，cm）
[[view]]
id = "desk"
name = "书桌桌面"
size = [120.0, 60.0]

# 物品
[[item]]
name = "笔记本"
view = "desk"          # 视图 id
layer = 1              # 层号
pos = [30.0, 25.0]     # 中心点坐标（cm）
size = 32.0            # 长边尺寸（cm，形状自带比例）
shape = "laptop"       # 形状库键（未知/省略 → 通用圆角矩形）
category = "电子类"
status = "在位"         # 去向
condition = "正常"      # 状况
desc = "…"             # 备注（借用人/数量/日期都写这里）
```

## TUI 快捷键

| 键 | 作用 |
|---|---|
| `j` `k` / `↑` `↓` | 光标移动（选维度值 / 选物品 / 选详情字段） |
| `h` `l` / `←` `→` | 切换列（维度栏 → 列 → 详情列 → 结果栏） |
| `空格` / `Enter` | 选中维度值；焦点在详情列时进入字段编辑（再 Enter 确定） |
| `/` / `s` | 列搜索 / 全局搜索 |
| `d` | 调试模式：`←→↑↓` 移动物品、`+/-` 缩放（实时写回） |
| `o` | 打开 viewer 窗口（聚焦当前物品） |
| `Tab` | 隐藏 / 显示详情列 |
| `Esc` / `q` | 逐级回退 / 退出 |

（`inv` 无参数即进入 TUI；`inv tui` 等价。）

## 开发

```bash
cargo test                     # 全部测试（core 6 + render 7 + tui 12 + layout 8）
cargo clippy --all-targets     # 静态检查（当前零警告）
```

设计文档、契约与决策记录（MADD v2.0 流程）见项目笔记。
