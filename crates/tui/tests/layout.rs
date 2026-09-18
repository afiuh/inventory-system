//! 布局验收测试：结果栏独占最右 · 列区滑动窗口（多了就挤出去）

use inventory_core::{Data, Dimension, DimensionKind, Item, Meta, View};
use inventory_tui::app::{App, DebugState, SearchMode};
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

/// 列标题特征：`详情────`（避免误匹配状态栏的 "Tab 详情"）
fn has_column(text: &str, title: &str) -> bool {
    text.contains(&format!("{title}─"))
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
    assert!(has_column(&text, "维度"), "应显示维度栏");
    assert!(has_column(&text, "第1层"), "应显示第 1 层列");
    assert!(text.contains("结果"), "应显示结果栏");
    assert!(!has_column(&text, "第2层"), "第 2 层应被挤出视野（初始视口在最左）");
}

#[test]
fn sliding_shows_last_units_when_focus_moves_right() {
    let mut app = app_two_columns();
    app.focus = app.columns.len(); // 焦点移到第 2 层列（最后一个列区单位）
    let text = render_to_text(&mut app, 120, 20);
    assert!(has_column(&text, "第1层"), "滑窗应显示第 1 层");
    assert!(has_column(&text, "第2层"), "滑窗应显示第 2 层");
    assert!(!has_column(&text, "维度"), "维度栏应被挤出视野");
}

#[test]
fn detail_appears_only_when_focus_on_items() {
    let mut app = app_two_columns();
    // 焦点在维度栏 → 详情不出现
    let text = render_to_text(&mut app, 150, 20);
    assert!(!has_column(&text, "详情"), "焦点不在物品上时不应显示详情");

    // 焦点移到结果栏（物品上）→ 详情出现在窗口末尾（列二）
    app.focus = app.columns.len() + 1;
    let text = render_to_text(&mut app, 150, 20);
    assert!(has_column(&text, "详情"), "焦点在物品上时应显示详情");
    assert!(text.contains("手机"), "详情应显示当前物品");

    // 焦点离开 → 详情消失
    app.focus = 0;
    let text = render_to_text(&mut app, 150, 20);
    assert!(!has_column(&text, "详情"), "焦点离开物品后详情应消失");
}

#[test]
fn window_keeps_two_units_and_result_is_third_column() {
    // 三列结构：列一 / 列二 = 滑动窗口，列三 = 结果
    let mut app = app_two_columns();
    app.focus = app.columns.len() + 1; // 焦点在结果（物品）
    let text = render_to_text(&mut app, 150, 20);
    assert!(text.contains("结果"), "列三永远是结果");
    assert!(has_column(&text, "详情"), "详情占据窗口末位（列二）");
    assert!(!has_column(&text, "维度"), "窗口已滑到最右，维度栏被挤出");
}

#[test]
fn no_panic_on_tiny_terminal() {
    let mut app = app_two_columns();
    let _ = render_to_text(&mut app, 30, 10);
    let _ = render_to_text(&mut app, 1, 1);
}

#[test]
fn status_bar_keeps_keys_visible_with_message() {
    let mut app = app_two_columns();
    app.message = Some("已打开 viewer 窗口".into());
    let text = render_to_text(&mut app, 160, 20);
    assert!(text.contains("已打开viewer窗口"), "消息应显示");
    assert!(text.contains("jk移动"), "快捷键提示必须同时可见（不能被消息顶掉）");
}

#[test]
fn status_bar_shows_search_hint() {
    let mut app = app_two_columns();
    app.search = Some(SearchMode::Global);
    app.search_input = "手机".into();
    let text = render_to_text(&mut app, 160, 20);
    assert!(text.contains("全局搜索"), "搜索框应显示");
    assert!(text.contains("Enter确认"), "搜索模式提示应显示");
}

#[test]
fn status_bar_shows_debug_hint() {
    let mut app = app_two_columns();
    app.debug = Some(DebugState { result_idx: 0, item_name: "手机".into() });
    let text = render_to_text(&mut app, 160, 20);
    assert!(text.contains("退出调试"), "调试模式提示应显示");
}
