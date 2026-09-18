//! TUI 界面绘制耗时 bench（事件循环每轮都会 draw）
//!
//! 运行：cargo run -p inventory-tui --example draw_bench

use inventory_core::load;
use inventory_tui::app::App;
use inventory_tui::ui;
use ratatui::backend::TestBackend;
use ratatui::Terminal;
use std::path::Path;
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = "/mnt/data/AI自由工作区/inventory/data.toml";
    let data = load(Path::new(path))?;
    let mut app = App::new(data, path.into());

    // 模拟真实使用：启用全部维度（列最多）+ 结果 214 件
    for i in 0..app.dim_enabled.len() {
        app.dim_enabled[i] = true;
    }
    app.rebuild();

    let backend = TestBackend::new(150, 40);
    let mut terminal = Terminal::new(backend)?;

    // 预热
    terminal.draw(|f| ui::draw(f, &mut app))?;

    let n = 20;
    let t = Instant::now();
    for _ in 0..n {
        terminal.draw(|f| ui::draw(f, &mut app))?;
    }
    println!("TUI draw（150x40）: {:?}/次", t.elapsed() / n);

    // 结果栏聚焦（详情列出现）时的耗时
    app.focus = app.columns.len() + 1;
    let t = Instant::now();
    for _ in 0..n {
        terminal.draw(|f| ui::draw(f, &mut app))?;
    }
    println!("TUI draw（含详情列）: {:?}/次", t.elapsed() / n);

    Ok(())
}
