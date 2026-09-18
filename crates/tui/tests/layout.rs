//! 布局验收测试：结果栏独占最右 · 列区滑动窗口（多了就挤出去）

use inventory_core::{Data, Dimension, DimensionKind, Item, Meta, View};
use inventory_tui::app::App;
use ratatui::backend::TestBackend;
use ratatui::Terminal;
use std::collections::HashMap;
use std::path::PathBuf;

fn sample() -> Data {
    let item = |name: &str, view: &str, layer: u32| Item {
        name: name.into(),
        view: view.into(),
        layer,
        pos: [10.0, 10.0],
        size: 5.0,
        shape: None,
        desc: None,
        attrs: HashMap::from([("category".to_string(), "电子类".to_string())]),
    };
    Data {
        meta: Meta::default(),
        dimensions: vec![Dimension {
            key: "location".into(),
            name: "位置".into(),
            kind: DimensionKind::Tree,
            values: vec![],
        }],
        views: vec![
            View { id: "desk".into(), name: "书桌".into(), size: [100.0, 60.0] },
            View { id: "drawer".into(), name: "抽屉".into(), size: [40.0, 30.0] },
        ],
        items: vec![
            item("手机", "desk", 1),
            item("充电器", "desk", 2),
            item("T恤", "drawer", 1),
        ],
    }
}

fn render_to_text(app: &mut App, w: u16, h: u16) -> String {
    let backend = TestBackend::new(w, h);
    let mut terminal = Terminal::new(backend).unwrap();
    terminal.draw(|f| inventory_tui::ui::draw(f, app)).unwrap();
    let buf = terminal.backend().buffer();
    let mut out = String::new();
    for y in 0..buf.area.height {
        for x in 0..buf.area.width {
            out.push_str(buf[(x, y)].symbol());
        }
        out.push('\n');
    }
    // CJK 宽字符在 buffer 里占两格（第二格为空），匹配前去掉所有空白
    out.chars().filter(|c| !c.is_whitespace()).collect()
}

/// 只启用位置维度、选中"书桌" → 产生 2 列（视图列 + 层列）
fn app_two_columns() -> App {
    let mut app = App::new(sample(), PathBuf::from("/tmp/x.toml"));
    app.dim_enabled[0] = true;
    app.rebuild();
    app.columns[0].groups[0].selected = Some(0);
    app.rebuild();
    assert_eq!(app.columns.len(), 2);
    app
}

#[test]
fn layout_shows_two_units_and_result_owns_right() {
    let mut app = app_two_columns();
    let text = render_to_text(&mut app, 120, 20);
    assert!(text.contains("维度"), "应显示维度栏");
    assert!(text.contains("第1层"), "应显示第 1 层列");
    assert!(text.contains("结果"), "应显示结果栏");
    assert!(!text.contains("第2层"), "第 2 层应被挤出视野（初始视口在最左）");
}

#[test]
fn sliding_shows_last_units_when_focus_moves_right() {
    let mut app = app_two_columns();
    app.focus = app.columns.len(); // 焦点移到第 2 层列（最后一个列区单位）
    let text = render_to_text(&mut app, 120, 20);
    assert!(text.contains("第1层"), "滑窗应显示第 1 层");
    assert!(text.contains("第2层"), "滑窗应显示第 2 层");
    assert!(!text.contains("维度"), "维度栏应被挤出视野");
}

#[test]
fn detail_appears_with_selected_item() {
    let mut app = app_two_columns();
    let text = render_to_text(&mut app, 150, 20);
    assert!(text.contains("详情"), "有选中物品时应显示详情列");
    assert!(text.contains("手机"), "详情应显示当前物品");
}

#[test]
fn no_panic_on_tiny_terminal() {
    let mut app = app_two_columns();
    let _ = render_to_text(&mut app, 30, 10);
    let _ = render_to_text(&mut app, 1, 1);
}
