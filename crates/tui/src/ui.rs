//! TUI 渲染（ratatui）

use crate::app::{App, SearchMode};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Wrap};
use ratatui::Frame;

const C_BG: Color = Color::Rgb(0x16, 0x16, 0x1e);
const C_FG: Color = Color::Rgb(0xc0, 0xca, 0xf5);
const C_DIM: Color = Color::Rgb(0x56, 0x5f, 0x89);
const C_BLUE: Color = Color::Rgb(0x7a, 0xa2, 0xf7);
const C_GREEN: Color = Color::Rgb(0x9e, 0xce, 0x6a);
const C_YELLOW: Color = Color::Rgb(0xe0, 0xaf, 0x68);
const C_RED: Color = Color::Rgb(0xf7, 0x76, 0x8e);
const C_MAGENTA: Color = Color::Rgb(0xbb, 0x9a, 0xf7);
const C_ORANGE: Color = Color::Rgb(0xff, 0x9e, 0x64);

pub fn draw(f: &mut Frame, app: &mut App) {
    let area = f.area();
    if area.width == 0 || area.height == 0 {
        return; // 终端尺寸为 0（最小化/未分配）时跳过
    }

    // ── 主布局：维度栏 | 列… | 结果 | 详情 ──
    let mut constraints = vec![Constraint::Length(14)];
    for _ in &app.columns {
        constraints.push(Constraint::Length(26));
    }
    constraints.push(Constraint::Min(26));
    if app.show_detail {
        constraints.push(Constraint::Length(34));
    }
    let chunks = Layout::horizontal(constraints).split(area);

    draw_dim_bar(f, app, chunks[0]);
    for (i, _) in app.columns.iter().enumerate() {
        draw_column(f, app, i, chunks[i + 1]);
    }
    let result_idx = app.columns.len() + 1;
    draw_results(f, app, chunks[result_idx]);
    if app.show_detail {
        draw_detail(f, app, chunks[result_idx + 1]);
    }

    // ── 状态栏（底部一行覆盖）──
    draw_status(f, app, area);
}

fn block(title: &str, focused: bool) -> Block<'static> {
    let style = if focused {
        Style::default().fg(C_BLUE)
    } else {
        Style::default().fg(C_DIM)
    };
    Block::default()
        .borders(Borders::ALL)
        .border_style(style)
        .title(Span::styled(format!(" {title} "), style))
}

fn draw_dim_bar(f: &mut Frame, app: &App, area: Rect) {
    let focused = app.focus == 0;
    let mut items: Vec<ListItem> = Vec::new();
    for (i, dim) in app.data.dimensions.iter().enumerate() {
        let on = app.dim_enabled.get(i).copied().unwrap_or(false);
        let (mark, style) = if on {
            ("✓", Style::default().fg(C_GREEN).add_modifier(Modifier::BOLD))
        } else {
            (" ", Style::default().fg(C_DIM))
        };
        items.push(ListItem::new(Line::from(vec![
            Span::styled(format!("{mark} "), style),
            Span::styled(dim.name.clone(), style),
        ])));
    }

    let list = List::new(items)
        .block(block("维度", focused))
        .highlight_style(if focused {
            Style::default().bg(C_BLUE).fg(C_BG).add_modifier(Modifier::BOLD)
        } else {
            Style::default()
        });
    let mut state = ListState::default();
    state.select(Some(app.dim_cursor));
    f.render_stateful_widget(list, area, &mut state);
}

fn draw_column(f: &mut Frame, app: &App, col_idx: usize, area: Rect) {
    let Some(col) = app.columns.get(col_idx) else { return };
    let focused = app.focus == col_idx + 1;

    let mut items: Vec<ListItem> = Vec::new();
    let mut list_cursor = 0usize;
    let mut flat = 0usize;

    for g in &col.groups {
        // 分组标题
        items.push(ListItem::new(Line::from(Span::styled(
            format!("▾ {}", g.name),
            Style::default().fg(C_MAGENTA).add_modifier(Modifier::BOLD),
        ))));
        if flat == col.cursor {
            list_cursor = items.len() - 1;
        }

        for (ii, c) in g.items.iter().enumerate() {
            // 列搜索过滤
            if let Some(filter) = &col.filter {
                if !c.label.to_lowercase().contains(&filter.to_lowercase()) {
                    continue;
                }
            }
            let selected = g.selected == Some(ii);
            let (mark, style) = if selected {
                ("●", Style::default().fg(C_YELLOW).add_modifier(Modifier::BOLD))
            } else {
                (" ", Style::default().fg(C_FG))
            };
            let count_style = Style::default().fg(C_DIM);
            items.push(ListItem::new(Line::from(vec![
                Span::styled(format!("{mark} "), style),
                Span::styled(c.label.clone(), style),
                Span::styled(format!(" ({})", c.count), count_style),
            ])));
            if flat == col.cursor {
                list_cursor = items.len() - 1;
            }
            flat += 1;
        }
    }

    let title = if let Some(f) = &col.filter {
        format!("第{}层 /{f}", col_idx + 1)
    } else {
        format!("第{}层", col_idx + 1)
    };
    let list = List::new(items)
        .block(block(&title, focused))
        .highlight_style(if focused {
            Style::default().bg(C_BLUE).fg(C_BG)
        } else {
            Style::default().bg(Color::Rgb(0x2f, 0x35, 0x49))
        });
    let mut state = ListState::default();
    state.select(Some(list_cursor));
    f.render_stateful_widget(list, area, &mut state);
}

fn draw_results(f: &mut Frame, app: &App, area: Rect) {
    let focused = app.focus == app.columns.len() + 1;
    let total = app.data.items.len();
    let title = format!("结果 {}/{}", app.result.len(), total);

    let items: Vec<ListItem> = app
        .result
        .iter()
        .filter_map(|idx| app.data.items.get(*idx))
        .map(|item| {
            let view = app
                .data
                .view(&item.view)
                .map(|v| v.name.as_str())
                .unwrap_or(item.view.as_str());
            let status = item.attr("status").unwrap_or("-");
            let status_style = match status {
                "借出" => Style::default().fg(C_RED),
                "带走" => Style::default().fg(C_YELLOW),
                _ => Style::default().fg(C_GREEN),
            };
            ListItem::new(Line::from(vec![
                Span::styled(item.name.clone(), Style::default().fg(C_FG)),
                Span::styled("  ", Style::default()),
                Span::styled(
                    item.attr("category").unwrap_or("-").to_string(),
                    Style::default().fg(C_DIM),
                ),
                Span::styled(" · ", Style::default().fg(C_DIM)),
                Span::styled(status.to_string(), status_style),
                Span::styled(" · ", Style::default().fg(C_DIM)),
                Span::styled(view.to_string(), Style::default().fg(C_DIM)),
            ]))
        })
        .collect();

    let list = List::new(items)
        .block(block(&title, focused))
        .highlight_style(if focused {
            Style::default().bg(C_BLUE).fg(C_BG).add_modifier(Modifier::BOLD)
        } else {
            Style::default().bg(Color::Rgb(0x2f, 0x35, 0x49))
        });
    let mut state = ListState::default();
    state.select(Some(app.result_cursor));
    f.render_stateful_widget(list, area, &mut state);
}

fn draw_detail(f: &mut Frame, app: &App, area: Rect) {
    let mut lines: Vec<Line> = Vec::new();

    if let Some(dbg) = &app.debug {
        lines.push(Line::from(Span::styled(
            "── 调试模式 ──",
            Style::default().fg(C_ORANGE).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::from(Span::styled(
            "←→↑↓ 移动  +/- 缩放",
            Style::default().fg(C_ORANGE),
        )));
        lines.push(Line::from(Span::styled(
            "Esc 退出调试",
            Style::default().fg(C_DIM),
        )));
        lines.push(Line::from(""));
        let _ = dbg;
    }

    if let Some(item) = app.current_item() {
        lines.push(Line::from(Span::styled(
            item.name.clone(),
            Style::default().fg(C_FG).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::from(""));
        let view = app
            .data
            .view(&item.view)
            .map(|v| v.name.as_str())
            .unwrap_or(item.view.as_str());
        for (label, value) in [
            ("分类", item.attr("category").unwrap_or("-")),
            ("去向", item.attr("status").unwrap_or("-")),
            ("状态", item.attr("condition").unwrap_or("-")),
            ("层", &format!("第 {} 层", item.layer)),
        ] {
            lines.push(Line::from(vec![
                Span::styled(format!("{label}  "), Style::default().fg(C_DIM)),
                Span::styled(value.to_string(), Style::default().fg(C_FG)),
            ]));
        }
        lines.push(Line::from(vec![
            Span::styled("位置  ", Style::default().fg(C_DIM)),
            Span::styled(view.to_string(), Style::default().fg(C_FG)),
        ]));
        lines.push(Line::from(vec![
            Span::styled("坐标  ", Style::default().fg(C_DIM)),
            Span::styled(
                format!("({:.1}, {:.1}) 大小 {:.1}", item.pos[0], item.pos[1], item.size),
                Style::default().fg(C_FG),
            ),
        ]));
        if let Some(desc) = &item.desc {
            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled(
                desc.clone(),
                Style::default().fg(C_DIM),
            )));
        }
    } else {
        lines.push(Line::from(Span::styled(
            "（无选中物品）",
            Style::default().fg(C_DIM),
        )));
    }

    let p = Paragraph::new(lines)
        .block(block("详情", false))
        .wrap(Wrap { trim: false });
    f.render_widget(p, area);
}

fn draw_status(f: &mut Frame, app: &App, area: Rect) {
    if area.height == 0 || area.width == 0 {
        return;
    }
    let y = area.y + area.height - 1;
    let bar = Rect::new(area.x, y, area.width, 1);

    let text = if let Some(mode) = app.search {
        let prefix = match mode {
            SearchMode::Column => "列搜索",
            SearchMode::Global => "全局搜索",
        };
        Line::from(vec![
            Span::styled(format!(" {prefix}: "), Style::default().fg(C_YELLOW)),
            Span::styled(app.search_input.clone(), Style::default().fg(C_FG)),
            Span::styled("█", Style::default().fg(C_YELLOW)),
        ])
    } else if let Some(msg) = &app.message {
        Line::from(Span::styled(format!(" {msg}"), Style::default().fg(C_GREEN)))
    } else {
        Line::from(Span::styled(
            " jk 移动  空格 选中  hl 切列  / 列搜索  s 全局  d 调试  o 看图  Tab 详情  Esc 回退  q 退出",
            Style::default().fg(C_DIM),
        ))
    };

    let p = Paragraph::new(text).style(Style::default().bg(Color::Rgb(0x1a, 0x1b, 0x26)));
    f.render_widget(p, bar);
}
