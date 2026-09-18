//! inventory-tui — yazi 风格同步下钻筛选器
//!
//! 契约：见《契约冻结包》§2.5 · 设计：方案文档 §5.3 / §5.5
//! 结构借鉴 yazi：列状态（cursor/offset）+ 列搜索 + 模式切换

pub mod app;
pub mod ui;

use anyhow::{Context, Result};
use app::{App, DebugState, SearchMode};
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use inventory_core::{load, save};
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use std::io::stdout;
use std::path::PathBuf;
use std::time::Duration;

/// TUI 入口（由 `inv tui` 调用）
pub fn run(data_path: PathBuf) -> Result<()> {
    let data = load(&data_path)?;
    let mut app = App::new(data, data_path);

    enable_raw_mode().context("启用 raw 模式失败（终端不支持？）")?;
    let mut out = stdout();
    execute!(out, EnterAlternateScreen).context("进入备用屏幕失败")?;
    let backend = CrosstermBackend::new(out);
    let mut terminal = Terminal::new(backend).context("初始化终端失败")?;

    let result = event_loop(&mut terminal, &mut app);

    // 无论成败都恢复终端
    disable_raw_mode().ok();
    execute!(terminal.backend_mut(), LeaveAlternateScreen).ok();
    terminal.show_cursor().ok();

    result
}

fn event_loop<B: ratatui::backend::Backend>(terminal: &mut Terminal<B>, app: &mut App) -> Result<()> {
    loop {
        terminal.draw(|f| ui::draw(f, app))?;
        if app.quit {
            return Ok(());
        }

        // 100ms 超时：无事件也重绘（保持界面刷新）
        if !event::poll(Duration::from_millis(100))? {
            continue;
        }
        match event::read()? {
            Event::Key(key) if key.kind == KeyEventKind::Press => {
                handle_key(app, key)?;
            }
            Event::Resize(_, _) => {}
            _ => {}
        }
    }
}

fn handle_key(app: &mut App, key: KeyEvent) -> Result<()> {
    // ── 搜索模式 ──
    if let Some(mode) = app.search {
        match key.code {
            KeyCode::Char(c) => {
                app.search_input.push(c);
                apply_search(app, mode);
            }
            KeyCode::Backspace => {
                app.search_input.pop();
                apply_search(app, mode);
            }
            KeyCode::Enter => {
                app.search = None;
                app.message = Some(format!("搜索: {}", app.search_input));
            }
            KeyCode::Esc => {
                app.search = None;
                app.search_input.clear();
                // 清除过滤
                for col in &mut app.columns {
                    col.filter = None;
                }
                app.recompute_result();
            }
            _ => {}
        }
        return Ok(());
    }

    // ── 调试模式（微调位置/大小）──
    if app.debug.is_some() {
        let step = 1.0f32;
        match key.code {
            KeyCode::Left | KeyCode::Char('h') => nudge(app, -step, 0.0)?,
            KeyCode::Right | KeyCode::Char('l') => nudge(app, step, 0.0)?,
            KeyCode::Up | KeyCode::Char('k') => nudge(app, 0.0, -step)?,
            KeyCode::Down | KeyCode::Char('j') => nudge(app, 0.0, step)?,
            KeyCode::Char('+') | KeyCode::Char('=') => scale(app, 1.1)?,
            KeyCode::Char('-') | KeyCode::Char('_') => scale(app, 1.0 / 1.1)?,
            KeyCode::Esc => {
                app.debug = None;
                app.message = Some("已退出调试模式".into());
            }
            _ => {}
        }
        return Ok(());
    }

    // ── 普通模式 ──
    let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
    match key.code {
        KeyCode::Char('q') => app.quit = true,
        KeyCode::Char('c') if ctrl => app.quit = true,

        KeyCode::Char('j') | KeyCode::Down => app.move_cursor(1),
        KeyCode::Char('k') | KeyCode::Up => app.move_cursor(-1),
        KeyCode::Char('l') | KeyCode::Right => app.move_focus(1),
        KeyCode::Char('h') | KeyCode::Left => app.move_focus(-1),

        KeyCode::Char(' ') => {
            if app.focus == 0 {
                app.toggle_dim();
            } else {
                app.toggle_select();
            }
        }
        KeyCode::Enter => {
            if app.focus == 0 {
                app.toggle_dim();
            } else {
                app.toggle_select();
            }
        }

        KeyCode::Esc => app.back(),

        KeyCode::Char('/') => {
            app.search = Some(SearchMode::Column);
            app.search_input.clear();
        }
        KeyCode::Char('s') => {
            app.search = Some(SearchMode::Global);
            app.search_input.clear();
        }

        KeyCode::Char('d') => {
            if let Some(name) = app.current_item().map(|i| i.name.clone()) {
                app.debug = Some(DebugState { result_idx: app.result_cursor, item_name: name.clone() });
                app.message = Some(format!("调试模式：{name}"));
            } else {
                app.message = Some("先选中一个物品（l 切到结果栏）".into());
            }
        }

        KeyCode::Char('o') => {
            open_viewer(app);
        }

        KeyCode::Tab => {
            app.show_detail = !app.show_detail;
        }

        _ => {}
    }
    Ok(())
}

fn apply_search(app: &mut App, mode: SearchMode) {
    match mode {
        SearchMode::Column => app.apply_column_filter(),
        SearchMode::Global => app.apply_global_filter(),
    }
}

/// 调试模式：移动物品（cm）
fn nudge(app: &mut App, dx: f32, dy: f32) -> Result<()> {
    let Some(idx) = app.result.get(app.result_cursor).copied() else {
        return Ok(());
    };
    let item = &mut app.data.items[idx];
    item.pos[0] = (item.pos[0] + dx).max(0.0);
    item.pos[1] = (item.pos[1] + dy).max(0.0);
    let pos = item.pos;
    let name = item.name.clone();
    save(&app.data_path, &app.data).context("写回数据失败")?;
    app.message = Some(format!("{name} → ({:.1}, {:.1})", pos[0], pos[1]));
    Ok(())
}

/// 调试模式：等比缩放（长边 × factor）
fn scale(app: &mut App, factor: f32) -> Result<()> {
    let Some(idx) = app.result.get(app.result_cursor).copied() else {
        return Ok(());
    };
    let item = &mut app.data.items[idx];
    item.size = (item.size * factor).clamp(0.5, 200.0);
    let size = item.size;
    let name = item.name.clone();
    save(&app.data_path, &app.data).context("写回数据失败")?;
    app.message = Some(format!("{name} 大小 → {size:.1}"));
    Ok(())
}

/// 打开 viewer 窗口（独立进程，可多开）
fn open_viewer(app: &mut App) {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            app.message = Some(format!("找不到自身路径: {e}"));
            return;
        }
    };
    let viewer = exe.with_file_name("inventory-viewer");
    if !viewer.exists() {
        app.message = Some(format!("viewer 不存在: {}（先 cargo build）", viewer.display()));
        return;
    }
    let mut cmd = std::process::Command::new(&viewer);
    cmd.arg(&app.data_path);
    // 若有选中物品 → 聚焦其所在视图
    if let Some(item) = app.current_item() {
        cmd.arg("--view").arg(&item.view);
        cmd.arg("--focus").arg(&item.name);
    }
    match cmd.spawn() {
        Ok(_) => app.message = Some("已打开 viewer 窗口".into()),
        Err(e) => app.message = Some(format!("启动 viewer 失败: {e}")),
    }
}
