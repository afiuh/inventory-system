//! inventory-render — 数据 → SVG（纯函数库）
//!
//! 契约：见《契约冻结包》§2.2
//! 设计要点：
//! - 纯函数：`render_view` / `render_overview` 只读 `&Data`，无 IO、无状态
//! - 形状库在 `shapes` 模块（数据里一个词 → 真实形态）
//! - 颜色：按分类名哈希到主题色板（数据不存 color）
//! - 状态标记：去向（在位/带走/借出）+ 状况（正常/待补充/待维护）

mod shapes;

pub use shapes::{draw as draw_shape, KNOWN_SHAPES};

use inventory_core::{Data, Item};
use std::collections::HashSet;
use std::fmt::Write as _;

// ══════════════════════════════════════════════════════════
// 主题与选项
// ══════════════════════════════════════════════════════════

/// Tokyo Night 色板（与用户环境一致）
#[derive(Debug, Clone)]
pub struct Theme {
    pub bg: &'static str,
    pub card: &'static str,
    pub border: &'static str,
    pub fg: &'static str,
    pub dim: &'static str,
    pub font: &'static str,
    pub palette: &'static [&'static str],
}

impl Default for Theme {
    fn default() -> Self {
        Self {
            bg: "#16161e",
            card: "#1a1b26",
            border: "#2f3549",
            fg: "#c0caf5",
            dim: "#565f89",
            font: "Noto Sans CJK SC, sans-serif",
            palette: &[
                "#7aa2f7", "#9ece6a", "#ff9e64", "#bb9af7", "#7dcfff", "#f7768e", "#e0af68",
                "#73daca", "#9d7cd8",
            ],
        }
    }
}

#[derive(Debug, Clone)]
pub struct RenderOpts {
    pub theme: Theme,
    /// 每厘米多少像素
    pub scale: f32,
    /// 视图四周留白（像素）
    pub padding: f32,
    /// 是否显示物品标签
    pub show_labels: bool,
    /// 分类维度 key（决定颜色）
    pub color_key: String,
    /// 去向维度 key（状态标记）
    pub status_key: String,
    /// 状况维度 key（状态标记）
    pub condition_key: String,
    /// 需要高亮的物品名（其余变暗）
    pub highlight: Vec<String>,
    /// 目标宽高比（宽/高）。Some 时：视图区域（背景/网格）拉伸到该比例，
    /// 物品**位置按比例映射、形状不变**（"只拉背景"）。
    pub aspect: Option<f32>,
}

impl Default for RenderOpts {
    fn default() -> Self {
        Self {
            theme: Theme::default(),
            scale: 4.0,
            padding: 16.0,
            show_labels: true,
            color_key: "category".into(),
            status_key: "status".into(),
            condition_key: "condition".into(),
            highlight: Vec::new(),
            aspect: None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RenderError {
    #[error("视图不存在: {0}")]
    UnknownView(String),
    #[error("视图尺寸无效: {0}")]
    InvalidViewSize(String),
}

// ══════════════════════════════════════════════════════════
// 单视图渲染
// ══════════════════════════════════════════════════════════

/// 渲染单个视图为 SVG 文本
pub fn render_view(data: &Data, view_id: &str, opts: &RenderOpts) -> Result<String, RenderError> {
    let view = data
        .view(view_id)
        .ok_or_else(|| RenderError::UnknownView(view_id.to_string()))?;
    if view.size[0] <= 0.0 || view.size[1] <= 0.0 {
        return Err(RenderError::InvalidViewSize(view.name.clone()));
    }
    let items = data.items_in_view(view_id);

    let s = opts.scale;
    let pad = opts.padding;
    let (vw, vh) = (view.size[0], view.size[1]);

    // 显示区域：有 aspect 时非等比拉伸（保持视图一边，扩展另一边）
    let (disp_w, disp_h) = match opts.aspect {
        Some(a) if a > 0.0 => {
            if vw / vh >= a {
                (vw, vw / a) // 视图更宽 → 高度扩展
            } else {
                (vh * a, vh) // 视图更高 → 宽度扩展
            }
        }
        _ => (vw, vh),
    };
    let sx = disp_w / vw; // 物品 x 位置映射系数
    let sy = disp_h / vh; // 物品 y 位置映射系数

    let w = disp_w * s + pad * 2.0;
    let h = disp_h * s + pad * 2.0;

    let mut svg = String::with_capacity(4096);
    let _ = write!(
        svg,
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0}" height="{h:.0}" viewBox="0 0 {w:.0} {h:.0}">"##
    );
    let _ = write!(svg, r##"<rect width="{w:.0}" height="{h:.0}" fill="{}"/>"##, opts.theme.bg);

    // 视图范围底（浅色描边，标出 cm 边界）
    let _ = write!(
        svg,
        r##"<rect x="{pad:.1}" y="{pad:.1}" width="{vw:.1}" height="{vh:.1}" rx="6" fill="{}" stroke="{}" stroke-width="1"/>"##,
        opts.theme.card,
        opts.theme.border,
        vw = disp_w * s,
        vh = disp_h * s
    );

    // 网格（每 10cm 一条淡线）
    let mut grid = String::new();
    let mut x = 10.0;
    while x < disp_w {
        let _ = write!(
            grid,
            r##"<line x1="{:.1}" y1="{pad:.1}" x2="{:.1}" y2="{:.1}" stroke="{}" stroke-opacity="0.5" stroke-width="0.6"/>"##,
            pad + x * s,
            pad + x * s,
            pad + disp_h * s,
            opts.theme.border
        );
        x += 10.0;
    }
    let mut y = 10.0;
    while y < disp_h {
        let _ = write!(
            grid,
            r##"<line x1="{pad:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="{}" stroke-opacity="0.5" stroke-width="0.6"/>"##,
            pad + y * s,
            pad + disp_w * s,
            pad + y * s,
            opts.theme.border
        );
        y += 10.0;
    }
    svg.push_str(&grid);

    // 物品：位置按显示区域映射（形状/尺寸不变——"只拉背景"）
    for item in &items {
        render_item(&mut svg, item, pad, s, sx, sy, opts);
    }

    svg.push_str("</svg>");
    Ok(svg)
}

#[allow(clippy::too_many_arguments)]
fn render_item(
    out: &mut String,
    item: &Item,
    pad: f32,
    scale: f32,
    sx: f32,
    sy: f32,
    opts: &RenderOpts,
) {
    let cx = pad + item.pos[0] * sx * scale;
    let cy = pad + item.pos[1] * sy * scale;
    let s = (item.size * scale).max(3.0);

    let color = color_for(item.attr(&opts.color_key).unwrap_or(""), &opts.theme);
    // 纯色填充（渐变光栅化成本占 42%——性能优先；立体感靠描边与状态标记表达）
    let fill = color.to_string();

    let dimmed = !opts.highlight.is_empty() && !opts.highlight.iter().any(|n| n == &item.name);

    if dimmed {
        out.push_str(r##"<g opacity="0.22">"##);
    }

    // 形状
    out.push_str(&shapes::draw(item.shape.as_deref(), cx, cy, s, &fill));

    // 标签（够大才显示）
    if opts.show_labels && s > 26.0 {
        let name = truncate_chars(&item.name, 8);
        let font_size = (s * 0.22).clamp(8.0, 15.0);
        let _ = write!(
            out,
            r##"<text x="{cx:.1}" y="{:.1}" text-anchor="middle" font-family="{}" font-size="{font_size:.1}" fill="#ffffff" fill-opacity="0.95">{}</text>"##,
            cy + font_size * 0.36,
            opts.theme.font,
            escape_xml(&name)
        );
    }

    // 状态标记：去向
    match item.attr(&opts.status_key) {
        Some("带走") => {
            let r = (s * 0.1).clamp(3.0, 8.0);
            let _ = write!(
                out,
                r##"<circle cx="{:.1}" cy="{:.1}" r="{r:.1}" fill="#e0af68" stroke="#0d0e14" stroke-width="1.2"/>"##,
                cx + s * 0.4,
                cy - s * 0.4
            );
        }
        Some("借出") => {
            let _ = write!(
                out,
                r##"<rect x="{:.1}" y="{:.1}" width="{:.1}" height="{:.1}" rx="6" fill="none" stroke="#f7768e" stroke-width="2" stroke-dasharray="6 4"/>"##,
                cx - s / 2.0 - 2.0,
                cy - s / 2.0 - 2.0,
                s + 4.0,
                s + 4.0
            );
        }
        _ => {}
    }

    // 状态标记：状况
    match item.attr(&opts.condition_key) {
        Some("待补充") => {
            let _ = write!(
                out,
                r##"<rect x="{:.1}" y="{:.1}" width="{:.1}" height="{:.1}" rx="6" fill="none" stroke="#ff9e64" stroke-width="1.6" stroke-opacity="0.9"/>"##,
                cx - s / 2.0 - 1.0,
                cy - s / 2.0 - 1.0,
                s + 2.0,
                s + 2.0
            );
        }
        Some("待维护") => {
            let _ = write!(
                out,
                r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#565f89" stroke-width="2"/>"##,
                cx - s * 0.3,
                cy + s * 0.3,
                cx + s * 0.3,
                cy - s * 0.3
            );
        }
        _ => {}
    }

    if dimmed {
        out.push_str("</g>");
    }
}

// ══════════════════════════════════════════════════════════
// 总览渲染
// ══════════════════════════════════════════════════════════

/// 渲染全部视图的总览为 SVG 文本
pub fn render_overview(data: &Data, opts: &RenderOpts) -> Result<String, RenderError> {
    const COLS: usize = 3;
    const CARD_W: f32 = 470.0;
    const TITLE_H: f32 = 56.0;
    const GAP: f32 = 26.0;
    const MARGIN: f32 = 44.0;
    const HEADER_H: f32 = 100.0;
    const CARD_H: f32 = 330.0;

    let n = data.views.len().max(1);
    let rows = n.div_ceil(COLS);
    let w = MARGIN * 2.0 + COLS as f32 * CARD_W + (COLS as f32 - 1.0) * GAP;
    let h = MARGIN * 2.0 + HEADER_H + rows as f32 * (CARD_H + TITLE_H)
        + (rows as f32 - 1.0) * GAP;

    let mut svg = String::with_capacity(16384);
    let _ = write!(
        svg,
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0}" height="{h:.0}" viewBox="0 0 {w:.0} {h:.0}">"##
    );
    let _ = write!(svg, r##"<rect width="{w:.0}" height="{h:.0}" fill="{}"/>"##, opts.theme.bg);

    // 头部
    let _ = write!(
        svg,
        r##"<text x="{MARGIN}" y="{:.0}" font-family="{}" font-size="30" font-weight="700" fill="{}">物品布局总览</text>"##,
        MARGIN + 40.0,
        opts.theme.font,
        opts.theme.fg
    );
    let _ = write!(
        svg,
        r##"<text x="{MARGIN}" y="{:.0}" font-family="{}" font-size="15" fill="{}">{} 件物品 · {} 个视图</text>"##,
        MARGIN + 70.0,
        opts.theme.font,
        opts.theme.dim,
        data.items.len(),
        data.views.len()
    );
    let _ = write!(
        svg,
        r##"<line x1="{MARGIN}" y1="{:.0}" x2="{:.0}" y2="{:.0}" stroke="{}"/>"##,
        MARGIN + HEADER_H - 24.0,
        w - MARGIN,
        MARGIN + HEADER_H - 24.0,
        opts.theme.border
    );

    // 卡片
    for (idx, view) in data.views.iter().enumerate() {
        let col = idx % COLS;
        let row = idx / COLS;
        let x0 = MARGIN + col as f32 * (CARD_W + GAP);
        let y0 = MARGIN + HEADER_H + row as f32 * (CARD_H + TITLE_H + GAP);
        let items = data.items_in_view(&view.id);

        let _ = write!(
            svg,
            r##"<rect x="{x0:.0}" y="{y0:.0}" width="{CARD_W:.0}" height="{:.0}" rx="16" fill="{}" stroke="{}"/>"##,
            CARD_H + TITLE_H,
            opts.theme.card,
            opts.theme.border
        );
        let _ = write!(
            svg,
            r##"<text x="{:.0}" y="{:.0}" font-family="{}" font-size="19" font-weight="600" fill="{}">{}</text>"##,
            x0 + 22.0,
            y0 + 36.0,
            opts.theme.font,
            opts.theme.fg,
            escape_xml(&view.name)
        );
        let _ = write!(
            svg,
            r##"<text x="{:.0}" y="{:.0}" text-anchor="end" font-family="{}" font-size="13.5" fill="{}">{} 件</text>"##,
            x0 + CARD_W - 22.0,
            y0 + 36.0,
            opts.theme.font,
            opts.theme.dim,
            items.len()
        );

        if items.is_empty() {
            continue;
        }

        // 内容自适应：包围盒 → 卡片区域
        let (mut minx, mut maxx, mut miny, mut maxy) = (f32::MAX, f32::MIN, f32::MAX, f32::MIN);
        for it in &items {
            let half = it.size / 2.0;
            minx = minx.min(it.pos[0] - half);
            maxx = maxx.max(it.pos[0] + half);
            miny = miny.min(it.pos[1] - half);
            maxy = maxy.max(it.pos[1] + half);
        }
        let bw = (maxx - minx).max(1.0);
        let bh = (maxy - miny).max(1.0);
        let pad = 26.0;
        let k = ((CARD_W - 2.0 * pad) / bw).min((CARD_H - 2.0 * pad) / bh);
        let ox = x0 + pad + ((CARD_W - 2.0 * pad) - bw * k) / 2.0;
        let oy = y0 + TITLE_H + pad + ((CARD_H - 2.0 * pad) - bh * k) / 2.0;

        let _ = write!(
            svg,
            r##"<g transform="translate({:.1},{:.1}) scale({k:.4}) translate({:.1},{:.1})">"##,
            ox,
            oy,
            -minx,
            -miny
        );
        for it in &items {
            let cx = it.pos[0];
            let cy = it.pos[1];
            let s = it.size.max(1.0);
            let color = color_for(it.attr(&opts.color_key).unwrap_or(""), &opts.theme);
            svg.push_str(&shapes::draw(it.shape.as_deref(), cx, cy, s, color));
            if opts.show_labels && s * k > 26.0 {
                let name = truncate_chars(&it.name, 8);
                let fs = (s * 0.22).clamp(0.8, 30.0);
                let _ = write!(
                    svg,
                    r##"<text x="{cx:.1}" y="{:.1}" text-anchor="middle" font-family="{}" font-size="{fs:.1}" fill="#fff" fill-opacity="0.95">{}</text>"##,
                    cy + fs * 0.36,
                    opts.theme.font,
                    escape_xml(&name)
                );
            }
        }
        svg.push_str("</g>");
    }

    svg.push_str("</svg>");
    Ok(svg)
}

// ══════════════════════════════════════════════════════════
// 辅助
// ══════════════════════════════════════════════════════════

/// 分类名 → 色板颜色（哈希分配，稳定）
pub fn color_for(category: &str, theme: &Theme) -> &'static str {
    let h = category
        .bytes()
        .fold(0u64, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u64));
    theme.palette[(h % theme.palette.len() as u64) as usize]
}

fn gradient_id(color: &str) -> String {
    format!("g{}", color.trim_start_matches('#'))
}

/// 收集用到的颜色，生成渐变定义（当前未启用——纯色填充性能优先）
#[allow(dead_code)]
fn gradient_defs(items: &[&Item], opts: &RenderOpts) -> String {
    let mut colors: HashSet<&str> = HashSet::new();
    for it in items {
        colors.insert(color_for(it.attr(&opts.color_key).unwrap_or(""), &opts.theme));
    }
    let mut out = String::from("<defs>");
    for c in colors {
        let _ = write!(
            out,
            r##"<linearGradient id="{}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="{c}" stop-opacity="0.95"/><stop offset="1" stop-color="{c}" stop-opacity="0.62"/></linearGradient>"##,
            gradient_id(c)
        );
    }
    out.push_str("</defs>");
    out
}

fn truncate_chars(s: &str, max: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max {
        s.to_string()
    } else {
        format!("{}…", chars[..max].iter().collect::<String>())
    }
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

// ══════════════════════════════════════════════════════════
// 测试
// ══════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use inventory_core::{Dimension, DimensionKind, Item, Meta, View};
    use std::collections::HashMap;

    fn data() -> Data {
        Data {
            meta: Meta::default(),
            dimensions: vec![Dimension {
                key: "category".into(),
                name: "分类".into(),
                kind: DimensionKind::Enum,
                values: vec!["电子类".into()],
            }],
            views: vec![View { id: "desk".into(), name: "书桌桌面".into(), size: [120.0, 60.0] }],
            items: vec![Item {
                name: "手机".into(),
                view: "desk".into(),
                layer: 1,
                pos: [90.0, 15.0],
                size: 15.0,
                shape: Some("phone".into()),
                desc: None,
                attrs: HashMap::from([("category".to_string(), "电子类".to_string())]),
            }],
        }
    }

    #[test]
    fn render_view_produces_svg() {
        let svg = render_view(&data(), "desk", &RenderOpts::default()).unwrap();
        assert!(svg.starts_with("<svg"));
        assert!(svg.contains("手机"));
        assert!(svg.contains("</svg>"));
    }

    #[test]
    fn render_view_rejects_unknown_view() {
        assert!(render_view(&data(), "nope", &RenderOpts::default()).is_err());
    }

    #[test]
    fn render_overview_contains_all_views() {
        let svg = render_overview(&data(), &RenderOpts::default()).unwrap();
        assert!(svg.contains("书桌桌面"));
        assert!(svg.contains("物品布局总览"));
    }

    #[test]
    fn color_assignment_is_stable() {
        let t = Theme::default();
        assert_eq!(color_for("电子类", &t), color_for("电子类", &t));
        assert_ne!(color_for("电子类", &t), color_for("衣物类", &t));
    }

    #[test]
    fn xml_special_chars_are_escaped() {
        let mut d = data();
        d.items[0].name = "A<B>&\"C\"".into();
        let svg = render_view(&d, "desk", &RenderOpts::default()).unwrap();
        assert!(svg.contains("A&lt;B&gt;&amp;"));
    }
}
