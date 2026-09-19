//! inventory-cli — 终端控制器
//!
//! 契约：见《契约冻结包》§2.4
//! 命令：list / find / stats / add / move / status / condition / rm / check / render / tui

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use inventory_core::{check, load, save, Item};
use inventory_render::{render_overview, render_view, RenderOpts};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(name = "inv", version, about = "物品管理系统（数据 = TOML 文件）")]
struct Cli {
    /// 数据文件路径（默认：安装位置的数据文件）
    #[arg(short, long, default_value = "/opt/inventory/data.toml", global = true)]
    data: PathBuf,

    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// 列出物品（可按视图/分类/去向过滤）
    List {
        #[arg(short, long)]
        view: Option<String>,
        #[arg(short, long)]
        category: Option<String>,
        #[arg(short, long)]
        status: Option<String>,
    },
    /// 按关键词查找（名称/描述），显示物品在哪
    Find { keyword: String },
    /// 统计（总数 / 分类分布 / 去向分布）
    Stats,
    /// 新增物品
    Add {
        name: String,
        #[arg(short, long)]
        category: Option<String>,
        #[arg(short, long, default_value = "在位")]
        status: String,
        #[arg(short = 'k', long, default_value = "正常")]
        condition: String,
        #[arg(short, long)]
        view: String,
        #[arg(short, long, default_value_t = 1)]
        layer: u32,
        /// 中心点坐标，形如 "90,15"（cm）
        #[arg(short, long)]
        pos: String,
        /// 长边尺寸（cm）
        #[arg(short = 'z', long, default_value_t = 10.0)]
        size: f32,
        #[arg(long)]
        shape: Option<String>,
        #[arg(short = 'D', long)]
        desc: Option<String>,
    },
    /// 移动物品到新坐标
    Move {
        name: String,
        /// 中心点坐标，形如 "90,15"（cm）
        pos: String,
    },
    /// 修改去向（在位/带走/借出）
    Status { name: String, value: String },
    /// 修改状态（正常/待补充/待维护）
    Condition { name: String, value: String },
    /// 删除物品
    Rm {
        name: String,
        /// 跳过确认
        #[arg(short, long)]
        yes: bool,
    },
    /// 校验数据（越界 / 重名 / 悬空引用 / 维度值）
    Check,
    /// 导出 SVG（不指定 --view 则导出总览）
    Render {
        #[arg(short, long)]
        view: Option<String>,
        #[arg(short, long, default_value = "out.svg")]
        out: PathBuf,
    },
    /// 进入 TUI 筛选器
    Tui,
}

fn main() -> Result<()> {
    // 管道关闭时（如 `inv list | head`）静默退出，而不是 panic
    #[cfg(unix)]
    unsafe {
        libc::signal(libc::SIGPIPE, libc::SIG_DFL);
    }

    let cli = Cli::parse();
    let path = &cli.data;
    match cli.command {
        // 无子命令（直接敲 `inv`）或显式 `inv tui` → 进入 TUI（像 yazi 一样）
        None | Some(Command::Tui) => {
            let data = load(path)?;
            drop(data);
            inventory_tui::run(path.clone())?;
            Ok(())
        }
        Some(Command::List { view, category, status }) => cmd_list(path, view, category, status),
        Some(Command::Find { keyword }) => cmd_find(path, &keyword),
        Some(Command::Stats) => cmd_stats(path),
        Some(Command::Add {
            name,
            category,
            status,
            condition,
            view,
            layer,
            pos,
            size,
            shape,
            desc,
        }) => cmd_add(path, name, category, status, condition, view, layer, pos, size, shape, desc),
        Some(Command::Move { name, pos }) => cmd_move(path, &name, &pos),
        Some(Command::Status { name, value }) => cmd_set_attr(path, &name, "status", &value),
        Some(Command::Condition { name, value }) => cmd_set_attr(path, &name, "condition", &value),
        Some(Command::Rm { name, yes }) => cmd_rm(path, &name, yes),
        Some(Command::Check) => cmd_check(path),
        Some(Command::Render { view, out }) => cmd_render(path, view, out),
    }
}

// ══════════════════════════════════════════════════════════
// 命令实现
// ══════════════════════════════════════════════════════════

fn cmd_list(
    path: &Path,
    view: Option<String>,
    category: Option<String>,
    status: Option<String>,
) -> Result<()> {
    let data = load(path)?;
    let mut rows: Vec<&Item> = data.items.iter().collect();
    if let Some(v) = &view {
        rows.retain(|i| &i.view == v);
    }
    if let Some(c) = &category {
        rows.retain(|i| i.attr("category") == Some(c.as_str()));
    }
    if let Some(s) = &status {
        rows.retain(|i| i.attr("status") == Some(s.as_str()));
    }

    if rows.is_empty() {
        println!("（无匹配物品）");
        return Ok(());
    }

    let headers = ["名称", "分类", "去向", "状态", "位置"];
    let mut table: Vec<Vec<String>> = vec![headers.iter().map(|s| s.to_string()).collect()];
    for item in &rows {
        let view_name = data
            .view(&item.view)
            .map(|v| v.name.clone())
            .unwrap_or_else(|| item.view.clone());
        table.push(vec![
            item.name.clone(),
            item.attr("category").unwrap_or("-").to_string(),
            item.attr("status").unwrap_or("-").to_string(),
            item.attr("condition").unwrap_or("-").to_string(),
            format!("{view_name} · 第{}层", item.layer),
        ]);
    }
    print_table(&table);
    println!("\n共 {} 件", rows.len());
    Ok(())
}

fn cmd_find(path: &Path, keyword: &str) -> Result<()> {
    let data = load(path)?;
    let kw = keyword.to_lowercase();
    let hits: Vec<&Item> = data
        .items
        .iter()
        .filter(|i| {
            i.name.to_lowercase().contains(&kw)
                || i.desc.as_deref().map(|d| d.to_lowercase().contains(&kw)).unwrap_or(false)
        })
        .collect();

    if hits.is_empty() {
        println!("未找到包含「{keyword}」的物品");
        return Ok(());
    }
    for item in &hits {
        let view_name = data
            .view(&item.view)
            .map(|v| v.name.as_str())
            .unwrap_or(item.view.as_str());
        println!(
            "{}  {} · {} · {} 第{}层  ({:.0},{:.0})",
            item.name,
            item.attr("category").unwrap_or("-"),
            item.attr("status").unwrap_or("-"),
            view_name,
            item.layer,
            item.pos[0],
            item.pos[1]
        );
        if let Some(d) = &item.desc {
            println!("    {d}");
        }
    }
    println!("\n共 {} 条结果", hits.len());
    Ok(())
}

fn cmd_stats(path: &Path) -> Result<()> {
    let data = load(path)?;
    println!("物品总数: {}", data.items.len());
    println!("视图: {} · 维度: {}", data.views.len(), data.dimensions.len());

    // 各枚举维度的分布
    for dim in &data.dimensions {
        if dim.kind != inventory_core::DimensionKind::Enum {
            continue;
        }
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for item in &data.items {
            if let Some(v) = item.attr(&dim.key) {
                *counts.entry(v).or_default() += 1;
            }
        }
        let mut entries: Vec<_> = counts.into_iter().collect();
        entries.sort_by_key(|e| std::cmp::Reverse(e.1));
        println!("\n{} 分布:", dim.name);
        for (k, n) in entries {
            println!("  {k:<12} {n}");
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn cmd_add(
    path: &Path,
    name: String,
    category: Option<String>,
    status: String,
    condition: String,
    view: String,
    layer: u32,
    pos: String,
    size: f32,
    shape: Option<String>,
    desc: Option<String>,
) -> Result<()> {
    let mut data = load(path)?;

    if data.item(&name).is_some() {
        bail!("物品「{name}」已存在（名字必须唯一）");
    }
    if data.view(&view).is_none() {
        bail!("视图「{view}」不存在（可用: {}）", data.views.iter().map(|v| v.id.as_str()).collect::<Vec<_>>().join(", "));
    }
    let pos = parse_pos(&pos)?;

    let mut attrs = HashMap::new();
    if let Some(c) = category {
        attrs.insert("category".to_string(), c);
    }
    attrs.insert("status".to_string(), status);
    attrs.insert("condition".to_string(), condition);

    let item = Item {
        name: name.clone(),
        view,
        layer,
        pos,
        size,
        shape,
        desc,
        attrs,
    };

    data.items.push(item);

    // 校验（越界/维度值等）——有问题就拒绝写入
    let issues = check(&data);
    let errors: Vec<_> = issues.iter().filter(|i| i.is_error()).collect();
    if !errors.is_empty() {
        for e in &errors {
            eprintln!("✗ {}: {}", e.subject.as_deref().unwrap_or("-"), e.message);
        }
        bail!("新增被拒绝（{} 个错误）", errors.len());
    }
    for w in issues.iter().filter(|i| !i.is_error()) {
        eprintln!("⚠ {}: {}", w.subject.as_deref().unwrap_or("-"), w.message);
    }

    save(path, &data)?;
    println!("已新增「{name}」→ {}", path.display());
    Ok(())
}

fn cmd_move(path: &Path, name: &str, pos: &str) -> Result<()> {
    let mut data = load(path)?;
    let pos = parse_pos(pos)?;
    let item = data
        .item_mut(name)
        .with_context(|| format!("物品「{name}」不存在"))?;
    let old = item.pos;
    item.pos = pos;

    let issues = check(&data);
    let errors: Vec<_> = issues.iter().filter(|i| i.is_error() && i.subject.as_deref() == Some(name)).collect();
    if !errors.is_empty() {
        for e in &errors {
            eprintln!("✗ {}", e.message);
        }
        bail!("移动被拒绝（会导致越界）");
    }

    save(path, &data)?;
    println!("已移动「{name}」({:.0},{:.0}) → ({:.0},{:.0})", old[0], old[1], pos[0], pos[1]);
    Ok(())
}

fn cmd_set_attr(path: &Path, name: &str, key: &str, value: &str) -> Result<()> {
    let mut data = load(path)?;

    // 维度值合法性（若该 key 是枚举维度）
    if let Some(dim) = data.dimensions.iter().find(|d| d.key == key) {
        if !dim.values.is_empty() && !dim.values.iter().any(|v| v == value) {
            bail!("「{value}」不是 {} 的合法取值（可用: {}）", dim.name, dim.values.join("/"));
        }
    }

    let item = data
        .item_mut(name)
        .with_context(|| format!("物品「{name}」不存在"))?;
    let old = item.attrs.get(key).cloned().unwrap_or_else(|| "-".into());
    item.attrs.insert(key.to_string(), value.to_string());
    save(path, &data)?;
    println!("「{name}」{key}: {old} → {value}");
    Ok(())
}

fn cmd_rm(path: &Path, name: &str, yes: bool) -> Result<()> {
    let mut data = load(path)?;
    let idx = data
        .items
        .iter()
        .position(|i| i.name == name)
        .with_context(|| format!("物品「{name}」不存在"))?;

    if !yes {
        // 无 TTY 环境（管道/脚本）直接拒绝，避免误删
        use std::io::IsTerminal;
        if !std::io::stdin().is_terminal() {
            bail!("删除需确认：请加 --yes（当前非交互环境）");
        }
        print!("确认删除「{name}」？[y/N] ");
        use std::io::Write;
        std::io::stdout().flush()?;
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        if !matches!(input.trim().to_lowercase().as_str(), "y" | "yes") {
            println!("已取消");
            return Ok(());
        }
    }

    data.items.remove(idx);
    save(path, &data)?;
    println!("已删除「{name}」");
    Ok(())
}

fn cmd_check(path: &Path) -> Result<()> {
    let data = load(path)?;
    let issues = check(&data);
    if issues.is_empty() {
        println!("✓ 数据校验通过（{} 件物品 / {} 视图）", data.items.len(), data.views.len());
        return Ok(());
    }
    let errors = issues.iter().filter(|i| i.is_error()).count();
    let warnings = issues.len() - errors;
    for issue in &issues {
        let mark = if issue.is_error() { "✗" } else { "⚠" };
        println!("{mark} {}: {}", issue.subject.as_deref().unwrap_or("-"), issue.message);
    }
    println!("\n共 {} 个错误 · {} 个警告", errors, warnings);
    if errors > 0 {
        std::process::exit(1);
    }
    Ok(())
}

fn cmd_render(path: &Path, view: Option<String>, out: PathBuf) -> Result<()> {
    let data = load(path)?;
    let opts = RenderOpts::default();
    let svg = match view {
        Some(v) => render_view(&data, &v, &opts)?,
        None => render_overview(&data, &opts)?,
    };
    std::fs::write(&out, svg)?;
    println!("已导出: {}", out.display());
    Ok(())
}

// ══════════════════════════════════════════════════════════
// 辅助
// ══════════════════════════════════════════════════════════

fn parse_pos(s: &str) -> Result<[f32; 2]> {
    let parts: Vec<&str> = s.split(',').collect();
    if parts.len() != 2 {
        bail!("坐标格式应为 \"x,y\"，例如 \"90,15\"");
    }
    let x: f32 = parts[0].trim().parse().context("x 坐标不是数字")?;
    let y: f32 = parts[1].trim().parse().context("y 坐标不是数字")?;
    Ok([x, y])
}

/// 显示宽度（CJK 字符算 2 列）
fn display_width(s: &str) -> usize {
    s.chars()
        .map(|c| {
            let cp = c as u32;
            // CJK / 全角标点范围（近似）
            if (0x1100..=0x115F).contains(&cp)
                || (0x2E80..=0xA4CF).contains(&cp)
                || (0xAC00..=0xD7A3).contains(&cp)
                || (0xF900..=0xFAFF).contains(&cp)
                || (0xFE30..=0xFE4F).contains(&cp)
                || (0xFF00..=0xFF60).contains(&cp)
                || (0xFFE0..=0xFFE6).contains(&cp)
            {
                2
            } else {
                1
            }
        })
        .sum()
}

fn pad(s: &str, width: usize) -> String {
    let w = display_width(s);
    if w >= width {
        s.to_string()
    } else {
        format!("{s}{}", " ".repeat(width - w))
    }
}

fn print_table(rows: &[Vec<String>]) {
    if rows.is_empty() {
        return;
    }
    let cols = rows[0].len();
    let mut widths = vec![0usize; cols];
    for row in rows {
        for (i, cell) in row.iter().enumerate() {
            widths[i] = widths[i].max(display_width(cell));
        }
    }
    for (ri, row) in rows.iter().enumerate() {
        let line: Vec<String> = row
            .iter()
            .enumerate()
            .map(|(i, cell)| pad(cell, widths[i]))
            .collect();
        println!("{}", line.join("  "));
        if ri == 0 {
            let sep: Vec<String> = widths.iter().map(|w| "─".repeat(*w)).collect();
            println!("{}", sep.join("──"));
        }
    }
}
