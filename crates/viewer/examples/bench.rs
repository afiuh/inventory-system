//! 渲染性能 bench：定位 raster 瓶颈
//!
//! 运行：cargo run -p inventory-viewer --example bench

use inventory_core::load;
use inventory_render::{render_view, RenderOpts};
use std::path::Path;
use std::time::Instant;

const W: u32 = 950;
const H: u32 = 512;
const SCALE: f32 = 1.8;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let data = load(Path::new("/mnt/data/AI自由工作区/inventory/data.toml"))?;

    println!("=== 不同视图（元素数量对比）===");
    for view in ["bed", "desk", "drawer"] {
        let svg = render_view(&data, view, &RenderOpts::default())?;
        bench(&format!("{view}（{} 件）", data.items_in_view(view).len()), &svg);
    }

    println!("\n=== 成本拆解（desk 视图）===");
    let svg = render_view(&data, "desk", &RenderOpts::default())?;
    bench("完整", &svg);

    let no_labels = render_view(&data, "desk", &RenderOpts { show_labels: false, ..Default::default() })?;
    bench("无文字标签", &no_labels);

    let flat = flatten_gradients(&svg);
    bench("无渐变（纯色）", &flat);

    let flat_no_labels = flatten_gradients(&no_labels);
    bench("无渐变 + 无文字", &flat_no_labels);

    println!("\n=== 渲染质量设置（desk）===");
    for (name, sr) in [
        ("GeometricPrecision(默认)", resvg::usvg::ShapeRendering::GeometricPrecision),
        ("OptimizeSpeed", resvg::usvg::ShapeRendering::OptimizeSpeed),
        ("CrispEdges", resvg::usvg::ShapeRendering::CrispEdges),
    ] {
        let mut o = resvg::usvg::Options::default();
        o.shape_rendering = sr;
        bench_opts(name, &svg, &o);
    }

    println!("\n=== 分辨率影响（desk 完整）===");
    for (w, h) in [(475, 256), (950, 512), (1900, 1024)] {
        bench_res(&format!("{w}x{h}"), &svg, w, h);
    }

    Ok(())
}

fn bench(name: &str, svg: &str) {
    bench_res(name, svg, W, H);
}

fn bench_opts(name: &str, svg: &str, opts: &resvg::usvg::Options) {
    let tree = match resvg::usvg::Tree::from_str(svg, opts) {
        Ok(t) => t,
        Err(e) => {
            println!("{name}: 解析失败 {e}");
            return;
        }
    };
    let transform = resvg::tiny_skia::Transform::from_scale(SCALE, SCALE);
    let mut pixmap = resvg::tiny_skia::Pixmap::new(W, H).unwrap();
    resvg::render(&tree, transform, &mut pixmap.as_mut());
    let n = 5;
    let t = Instant::now();
    for _ in 0..n {
        let mut pixmap = resvg::tiny_skia::Pixmap::new(W, H).unwrap();
        resvg::render(&tree, transform, &mut pixmap.as_mut());
    }
    println!("{name}: {:?}/次", t.elapsed() / n);
}

fn bench_res(name: &str, svg: &str, w: u32, h: u32) {
    let tree = match resvg::usvg::Tree::from_str(svg, &resvg::usvg::Options::default()) {
        Ok(t) => t,
        Err(e) => {
            println!("{name}: 解析失败 {e}");
            return;
        }
    };
    let transform = resvg::tiny_skia::Transform::from_scale(SCALE, SCALE);

    // 预热一次（字体缓存等）
    let mut pixmap = resvg::tiny_skia::Pixmap::new(w, h).unwrap();
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    let n = 5;
    let t = Instant::now();
    for _ in 0..n {
        let mut pixmap = resvg::tiny_skia::Pixmap::new(w, h).unwrap();
        resvg::render(&tree, transform, &mut pixmap.as_mut());
    }
    println!("{name}: {:?}/次", t.elapsed() / n);
}

/// 把 `url(#gXXXXXX)` 替换为 `#XXXXXX`（渐变 → 纯色）
fn flatten_gradients(svg: &str) -> String {
    let mut out = String::new();
    let mut rest = svg;
    while let Some(pos) = rest.find("url(#g") {
        out.push_str(&rest[..pos]);
        rest = &rest[pos + 5..]; // 跳过 "url(#"
        if let Some(end) = rest.find(')') {
            out.push('#');
            out.push_str(&rest[..end]);
            rest = &rest[end + 1..];
        } else {
            break;
        }
    }
    out.push_str(rest);
    out
}
