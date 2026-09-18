//! core::save 耗时 bench（TUI 每次按键都会调用）
//!
//! 运行：cargo run -p inventory-core --example save_bench

use inventory_core::{load, save};
use std::path::Path;
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "/mnt/data/AI自由工作区/inventory/data.toml".into());
    let path = Path::new(&path);

    let t = Instant::now();
    let data = load(path)?;
    println!("load（读+解析）: {:?}  ·  {} 件物品", t.elapsed(), data.items.len());

    // save 会重写文件（内容相同，幂等）
    let n = 5;
    let mut times = Vec::new();
    for _ in 0..n {
        let t = Instant::now();
        save(path, &data)?;
        times.push(t.elapsed());
    }
    let avg = times.iter().sum::<std::time::Duration>() / n as u32;
    println!("save（对比+序列化+原子写）: {avg:?}/次  （明细: {times:?}）");

    Ok(())
}
