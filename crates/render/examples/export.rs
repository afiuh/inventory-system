//! 导出 SVG：`cargo run -p inventory-render --example export -- <data.toml> [view_id] [out.svg]`
//!
//! 不传 view_id 则导出总览。

use inventory_core::load;
use inventory_render::{render_overview, render_view, RenderOpts};
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let data_path = args.get(1).ok_or("用法: export <data.toml> [view_id] [out.svg]")?;
    let data = load(Path::new(data_path))?;

    let opts = RenderOpts::default();
    let view_arg = args.get(2).map(|s| s.as_str()).filter(|s| !s.is_empty());
    let svg = match view_arg {
        Some(view_id) => render_view(&data, view_id, &opts)?,
        None => render_overview(&data, &opts)?,
    };

    let out = args.get(3).map(|s| s.as_str()).unwrap_or("out.svg");
    std::fs::write(out, svg)?;
    println!("已导出: {out}");
    Ok(())
}
