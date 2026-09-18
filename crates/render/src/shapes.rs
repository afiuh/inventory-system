//! 形状库：数据里一个词 → 物品真实形态的 SVG 片段
//!
//! 约定：所有形状在 (cx, cy) 为中心、`s` 为长边边长的范围内绘制。
//! `fill` 为渐变引用（形如 `url(#g7aa2f7)`）或纯色。

/// 形状分发：未知形状 → 通用圆角矩形（兜底，保证系统永远可用）
pub fn draw(shape: Option<&str>, cx: f32, cy: f32, s: f32, fill: &str) -> String {
    match shape.unwrap_or("box") {
        "phone" => phone(cx, cy, s, fill),
        "laptop" => laptop(cx, cy, s, fill),
        "headphone" => headphone(cx, cy, s, fill),
        "charger" => charger(cx, cy, s, fill),
        "keyboard" => keyboard(cx, cy, s, fill),
        "book" => book(cx, cy, s, fill),
        "notebook" => notebook(cx, cy, s, fill),
        "file" => file(cx, cy, s, fill),
        "tshirt" => tshirt(cx, cy, s, fill),
        "pants" => pants(cx, cy, s, fill),
        "coat" => coat(cx, cy, s, fill),
        "bottle" => bottle(cx, cy, s, fill),
        "cup" => cup(cx, cy, s, fill),
        "ball" => ball(cx, cy, s, fill),
        "pouch" => pouch(cx, cy, s, fill),
        "round" => round(cx, cy, s, fill),
        "blob" => blob(cx, cy, s, fill),
        _ => generic_rect(cx, cy, s, fill),
    }
}

/// 形状库中可用的键（供文档/校验参考）
pub const KNOWN_SHAPES: &[&str] = &[
    "phone", "laptop", "headphone", "charger", "keyboard", "book", "notebook", "file", "tshirt",
    "pants", "coat", "bottle", "cup", "ball", "pouch", "round", "blob", "box",
];

const STROKE: &str = r##"stroke="#ffffff" stroke-opacity="0.28""##;

// ── 形状实现 ────────────────────────────────────────────

fn generic_rect(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (w, h) = (s, s * 0.78);
    format!(
        r##"<rect x="{:.1}" y="{:.1}" width="{w:.1}" height="{h:.1}" rx="6" fill="{fill}" {STROKE}/>"##,
        cx - w / 2.0,
        cy - h / 2.0
    )
}

fn phone(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (w, h) = (s * 0.55, s);
    let (x, y) = (cx - w / 2.0, cy - h / 2.0);
    format!(
        r##"<rect x="{x:.1}" y="{y:.1}" width="{w:.1}" height="{h:.1}" rx="{r:.1}" fill="{fill}" {STROKE}/><rect x="{ix:.1}" y="{iy:.1}" width="{iw:.1}" height="{ih:.1}" rx="{ir:.1}" fill="#0d0e14" fill-opacity="0.5"/><circle cx="{cx:.1}" cy="{dy:.1}" r="{dr:.1}" fill="#fff" fill-opacity="0.6"/>"##,
        r = s * 0.09,
        ix = x + w * 0.09,
        iy = y + h * 0.07,
        iw = w * 0.82,
        ih = h * 0.78,
        ir = s * 0.05,
        dy = y + h * 0.92,
        dr = s * 0.022
    )
}

fn laptop(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (w, h) = (s * 0.95, s * 0.6);
    let top = cy - h * 0.62;
    format!(
        r##"<rect x="{:.1}" y="{top:.1}" width="{w:.1}" height="{h:.1}" rx="4" fill="{fill}" {STROKE}/><rect x="{ix:.1}" y="{iy:.1}" width="{iw:.1}" height="{ih:.1}" rx="2" fill="#0d0e14" fill-opacity="0.55"/><path d="M {bx1:.1} {by:.1} L {bx2:.1} {by:.1} L {bx3:.1} {by2:.1} L {bx4:.1} {by2:.1} Z" fill="{fill}" stroke="#ffffff" stroke-opacity="0.22"/>"##,
        cx - w / 2.0,
        ix = cx - w / 2.0 + 3.0,
        iy = top + 3.0,
        iw = w - 6.0,
        ih = h * 0.8,
        bx1 = cx - w / 2.0 - w * 0.1,
        bx2 = cx + w / 2.0 + w * 0.1,
        by = top + h,
        bx3 = cx + w / 2.0 + w * 0.06,
        bx4 = cx - w / 2.0 - w * 0.06,
        by2 = top + h + s * 0.07
    )
}

fn headphone(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let r = s * 0.36;
    let ear_w = s * 0.16;
    let ear_h = s * 0.34;
    format!(
        r##"<path d="M {x1:.1} {cy:.1} A {r:.1} {r:.1} 0 0 1 {x2:.1} {cy:.1}" fill="none" stroke="{fill}" stroke-width="{sw:.1}" stroke-linecap="round"/><rect x="{ex1:.1}" y="{ey:.1}" width="{ear_w:.1}" height="{ear_h:.1}" rx="{er:.1}" fill="{fill}" {STROKE}/><rect x="{ex2:.1}" y="{ey:.1}" width="{ear_w:.1}" height="{ear_h:.1}" rx="{er:.1}" fill="{fill}" {STROKE}/>"##,
        x1 = cx - r,
        x2 = cx + r,
        sw = s * 0.1,
        ex1 = cx - r - ear_w * 0.5,
        ex2 = cx + r - ear_w * 0.5,
        ey = cy - ear_h * 0.15,
        er = s * 0.06
    )
}

fn charger(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (w, h) = (s * 0.5, s * 0.42);
    let (x, y) = (cx - w / 2.0, cy - h / 2.0);
    format!(
        r##"<rect x="{x:.1}" y="{y:.1}" width="{w:.1}" height="{h:.1}" rx="{r:.1}" fill="{fill}" {STROKE}/><rect x="{p1:.1}" y="{py:.1}" width="{pw:.1}" height="{ph:.1}" rx="1.5" fill="{fill}"/><rect x="{p2:.1}" y="{py:.1}" width="{pw:.1}" height="{ph:.1}" rx="1.5" fill="{fill}"/>"##,
        r = s * 0.08,
        p1 = cx - w * 0.22,
        p2 = cx + w * 0.1,
        py = y - s * 0.07,
        pw = w * 0.12,
        ph = s * 0.08
    )
}

fn keyboard(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (w, h) = (s * 0.95, s * 0.42);
    let (x, y) = (cx - w / 2.0, cy - h / 2.0);
    let mut keys = String::new();
    let (cols, rows) = (8, 3);
    let kw = (w - 10.0) / cols as f32;
    let kh = (h - 10.0) / rows as f32;
    for r in 0..rows {
        for c in 0..cols {
            keys.push_str(&format!(
                r##"<rect x="{:.1}" y="{:.1}" width="{:.1}" height="{:.1}" rx="1.5" fill="#0d0e14" fill-opacity="0.45"/>"##,
                x + 5.0 + c as f32 * kw + 1.0,
                y + 5.0 + r as f32 * kh + 1.0,
                kw - 2.0,
                kh - 2.0
            ));
        }
    }
    format!(
        r##"<rect x="{x:.1}" y="{y:.1}" width="{w:.1}" height="{h:.1}" rx="5" fill="{fill}" {STROKE}/>{keys}"##
    )
}

fn book(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (w, h) = (s * 0.6, s * 0.85);
    let (x, y) = (cx - w / 2.0, cy - h / 2.0);
    format!(
        r##"<rect x="{x:.1}" y="{y:.1}" width="{w:.1}" height="{h:.1}" rx="3" fill="{fill}" {STROKE}/><rect x="{x:.1}" y="{y:.1}" width="{sw:.1}" height="{h:.1}" rx="3" fill="#000" fill-opacity="0.25"/><line x1="{l1:.1}" y1="{ly1:.1}" x2="{l2:.1}" y2="{ly1:.1}" stroke="#fff" stroke-opacity="0.35" stroke-width="1.4"/><line x1="{l1:.1}" y1="{ly2:.1}" x2="{l3:.1}" y2="{ly2:.1}" stroke="#fff" stroke-opacity="0.2" stroke-width="1.2"/>"##,
        sw = w * 0.16,
        l1 = x + w * 0.24,
        l2 = x + w - 6.0,
        l3 = x + w * 0.6,
        ly1 = y + h * 0.14,
        ly2 = y + h * 0.24
    )
}

fn notebook(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (w, h) = (s * 0.68, s * 0.85);
    let (x, y) = (cx - w / 2.0, cy - h / 2.0);
    let mut rings = String::new();
    for i in 0..7 {
        let ry = y + h * 0.12 + i as f32 * (h * 0.76 / 6.0);
        rings.push_str(&format!(
            r##"<circle cx="{x:.1}" cy="{ry:.1}" r="2.2" fill="none" stroke="#c0caf5" stroke-opacity="0.5" stroke-width="1.4"/>"##
        ));
    }
    format!(
        r##"<rect x="{x:.1}" y="{y:.1}" width="{w:.1}" height="{h:.1}" rx="4" fill="{fill}" {STROKE}/>{rings}"##
    )
}

fn file(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (w, h) = (s * 0.62, s * 0.85);
    let (x, y) = (cx - w / 2.0, cy - h / 2.0);
    let fold = w * 0.3;
    format!(
        r##"<path d="M {x:.1} {y:.1} L {fx:.1} {y:.1} L {x2:.1} {fy:.1} L {x2:.1} {y2:.1} L {x:.1} {y2:.1} Z" fill="{fill}" {STROKE}/><path d="M {fx:.1} {y:.1} L {fx:.1} {fy:.1} L {x2:.1} {fy:.1}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.4"/>"##,
        fx = x + w - fold,
        x2 = x + w,
        fy = y + fold,
        y2 = y + h
    )
}

fn tshirt(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (ls_x, ls_y) = (cx - s * 0.32, cy - s * 0.24); // 左肩
    let (ll_x, ll_y) = (cx - s * 0.15, cy - s * 0.35); // 左领
    let (rl_x, rl_y) = (cx + s * 0.15, cy - s * 0.35); // 右领
    let (rs_x, rs_y) = (cx + s * 0.32, cy - s * 0.24); // 右肩
    let (rr_x, rr_y) = (cx + s * 0.26, cy - s * 0.02); // 右袖
    let (ra_x, ra_y) = (cx + s * 0.17, cy - s * 0.07); // 右腋
    let (rb_x, rb_y) = (cx + s * 0.17, cy + s * 0.36); // 右下
    let (lb_x, lb_y) = (cx - s * 0.17, cy + s * 0.36); // 左下
    let (la_x, la_y) = (cx - s * 0.17, cy - s * 0.07); // 左腋
    let (lr_x, lr_y) = (cx - s * 0.26, cy - s * 0.02); // 左袖
    let midy = cy - s * 0.3;
    format!(
        r##"<path d="M {ls_x:.1} {ls_y:.1} L {ll_x:.1} {ll_y:.1} Q {cx:.1} {midy:.1} {rl_x:.1} {rl_y:.1} L {rs_x:.1} {rs_y:.1} L {rr_x:.1} {rr_y:.1} L {ra_x:.1} {ra_y:.1} L {rb_x:.1} {rb_y:.1} L {lb_x:.1} {lb_y:.1} L {la_x:.1} {la_y:.1} L {lr_x:.1} {lr_y:.1} Z" fill="{fill}" {STROKE}/>"##
    )
}

fn pants(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    format!(
        r##"<path d="M {:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1} L {cx:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1} Z" fill="{fill}" {STROKE}/>"##,
        cx - s * 0.24, cy - s * 0.36,
        cx + s * 0.24, cy - s * 0.36,
        cx + s * 0.26, cy + s * 0.36,
        cx + s * 0.07, cy + s * 0.36,
        cy - s * 0.02,
        cx - s * 0.07, cy + s * 0.36,
        cx - s * 0.26, cy + s * 0.36
    )
}

fn coat(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    format!(
        r##"<path d="M {:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1} L {:.1} {:.1} Z" fill="{fill}" {STROKE}/><line x1="{cx:.1}" y1="{:.1}" x2="{cx:.1}" y2="{:.1}" stroke="#fff" stroke-opacity="0.3" stroke-width="1.4"/>"##,
        cx - s * 0.3, cy - s * 0.26,
        cx - s * 0.13, cy - s * 0.36,
        cx + s * 0.13, cy - s * 0.36,
        cx + s * 0.3, cy - s * 0.26,
        cx + s * 0.27, cy + s * 0.36,
        cx - s * 0.27, cy + s * 0.36,
        cy - s * 0.32,
        cy + s * 0.36
    )
}

fn bottle(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (w, h) = (s * 0.42, s * 0.6);
    let (x, y) = (cx - w / 2.0, cy - h / 2.0 + s * 0.08);
    let (nw, nh) = (w * 0.42, s * 0.16);
    format!(
        r##"<rect x="{x:.1}" y="{y:.1}" width="{w:.1}" height="{h:.1}" rx="{r:.1}" fill="{fill}" {STROKE}/><rect x="{nx:.1}" y="{ny:.1}" width="{nw:.1}" height="{nh:.1}" rx="2" fill="{fill}" {STROKE}/><rect x="{capx:.1}" y="{capy:.1}" width="{capw:.1}" height="{caph:.1}" rx="2" fill="{fill}"/>"##,
        r = s * 0.09,
        nx = cx - nw / 2.0,
        ny = y - nh + 1.0,
        capx = cx - w * 0.27,
        capy = y - nh - s * 0.07,
        capw = w * 0.54,
        caph = s * 0.08
    )
}

fn cup(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (w, h) = (s * 0.5, s * 0.55);
    let x1 = cx - w / 2.0;
    let x2 = cx + w / 2.0;
    let x3 = cx + w * 0.36;
    let x4 = cx - w * 0.36;
    let (y1, y2) = (cy - h / 2.0, cy + h / 2.0);
    format!(
        r##"<path d="M {x1:.1} {y1:.1} L {x2:.1} {y1:.1} L {x3:.1} {y2:.1} L {x4:.1} {y2:.1} Z" fill="{fill}" {STROKE}/><path d="M {x2:.1} {:.1} q {:.1} {:.1} {:.1} {:.1}" fill="none" stroke="{fill}" stroke-width="{sw:.1}" stroke-linecap="round"/>"##,
        cy - h * 0.2,
        s * 0.2, s * 0.05, s * 0.12, s * 0.16,
        sw = s * 0.09
    )
}

fn ball(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let r = s / 2.0;
    format!(
        r##"<circle cx="{cx:.1}" cy="{cy:.1}" r="{r:.1}" fill="{fill}" {STROKE}/><circle cx="{hx:.1}" cy="{hy:.1}" r="{hr:.1}" fill="#fff" fill-opacity="0.25"/>"##,
        hx = cx - r * 0.32,
        hy = cy - r * 0.36,
        hr = r * 0.2
    )
}

fn round(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let r = s / 2.0;
    format!(r##"<circle cx="{cx:.1}" cy="{cy:.1}" r="{r:.1}" fill="{fill}" {STROKE}/>"##)
}

fn blob(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let r = s / 2.0;
    format!(
        r##"<path d="M {cx:.1} {y1:.1} Q {qx1:.1} {cy:.1} {x2:.1} {cy:.1} Q {cx:.1} {qy2:.1} {cx:.1} {y2:.1} Q {qx2:.1} {cy:.1} {x1:.1} {cy:.1} Q {cx:.1} {qy1:.1} {cx:.1} {y1:.1} Z" fill="{fill}" {STROKE} stroke-dasharray="5 3"/>"##,
        y1 = cy - r,
        y2 = cy + r,
        x1 = cx - r * 1.1,
        x2 = cx + r * 1.1,
        qx1 = cx + r * 1.15,
        qx2 = cx - r * 1.15,
        qy1 = cy - r * 1.1,
        qy2 = cy + r * 1.1
    )
}

fn pouch(cx: f32, cy: f32, s: f32, fill: &str) -> String {
    let (x1, y1) = (cx - s * 0.3, cy - s * 0.12); // 左上
    let (x2, y2) = (cx + s * 0.3, cy - s * 0.12); // 右上
    let (x3, y3) = (cx + s * 0.36, cy + s * 0.34); // 右下
    let (x4, y4) = (cx - s * 0.36, cy + s * 0.34); // 左下
    let boty = cy + s * 0.36;
    let topy = cy - s * 0.24;
    format!(
        r##"<path d="M {x1:.1} {y1:.1} Q {x4:.1} {y4:.1} {cx:.1} {boty:.1} Q {x3:.1} {y3:.1} {x2:.1} {y2:.1} Q {cx:.1} {topy:.1} {x1:.1} {y1:.1} Z" fill="{fill}" {STROKE}/><path d="M {x1:.1} {y1:.1} Q {cx:.1} {topy:.1} {x2:.1} {y2:.1}" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="1.6"/>"##
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_known_shapes_produce_svg() {
        for s in KNOWN_SHAPES {
            let out = draw(Some(s), 50.0, 50.0, 40.0, "url(#g7aa2f7)");
            assert!(out.contains('<'), "形状 {s} 应产生 SVG 元素");
        }
    }

    #[test]
    fn unknown_shape_falls_back_to_rect() {
        let out = draw(Some("no-such-shape"), 50.0, 50.0, 40.0, "url(#g7aa2f7)");
        assert!(out.contains("rect"), "未知形状应兜底为矩形");
        let none = draw(None, 50.0, 50.0, 40.0, "url(#g7aa2f7)");
        assert!(none.contains("rect"), "None 形状应兜底为矩形");
    }
}
