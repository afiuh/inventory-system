//! inventory-viewer — 极简 SVG 查看器
//!
//! 功能（就三样）：显示 · 滚轮缩放 + 拖动平移 · 数据文件变化自动刷新
//! 用法：`viewer <data.toml> [--view <view-id>] [--focus <物品名>]`
//!
//! 契约：见《契约冻结包》§2.3

use anyhow::{Context as _, Result};
use inventory_core::load;
use inventory_render::{render_overview, render_view, RenderOpts};
use notify::{RecursiveMode, Watcher};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::Arc;
use winit::application::ApplicationHandler;
use winit::event::{ElementState, MouseButton, MouseScrollDelta, WindowEvent};
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop, EventLoopProxy};
use winit::keyboard::{Key, NamedKey};
use winit::window::{Window, WindowId};

/// 缩放步长
const ZOOM_STEP: f64 = 1.15;
/// 缩放范围
const ZOOM_MIN: f64 = 0.05;
const ZOOM_MAX: f64 = 20.0;

#[derive(Debug)]
enum UserEvent {
    DataChanged,
}

struct Viewer {
    data_path: PathBuf,
    view_id: Option<String>,
    focus: Vec<String>,

    /// SVG 逻辑尺寸（用于 fit 与缩放基准）
    svg_size: (f32, f32),
    zoom: f64,
    offset: (f64, f64),
    needs_fit: bool,

    window: Option<Arc<Window>>,
    sb_context: Option<softbuffer::Context<Arc<Window>>>,
    surface: Option<softbuffer::Surface<Arc<Window>, Arc<Window>>>,

    dragging: bool,
    last_cursor: (f64, f64),

    /// 缓存的 usvg 配置（含系统字体库——只加载一次，是渲染性能的关键）
    usvg_opts: resvg::usvg::Options<'static>,
    /// 缓存的 SVG 树（数据变化时才重建；zoom/pan 复用）
    cached_tree: Option<resvg::usvg::Tree>,

    _watcher: Option<notify::RecommendedWatcher>,
    proxy: EventLoopProxy<UserEvent>,
}

impl Viewer {
    fn new(
        data_path: PathBuf,
        view_id: Option<String>,
        focus: Vec<String>,
        proxy: EventLoopProxy<UserEvent>,
    ) -> Self {
        // 性能关键（bench 实测，desk 视图 950x512）：
        // - load_system_fonts() 会让 parse 从 1.6ms 涨到 126ms（CJK 字体 fallback 查询）→ 不加载
        // - 抗锯齿(GeometricPrecision) 光栅化 53ms vs OptimizeSpeed 16ms → 用后者
        let mut usvg_opts = resvg::usvg::Options::default();
        usvg_opts.shape_rendering = resvg::usvg::ShapeRendering::OptimizeSpeed;

        Self {
            proxy,
            usvg_opts,
            cached_tree: None,
            data_path,
            view_id,
            focus,
            svg_size: (100.0, 100.0),
            zoom: 1.0,
            offset: (0.0, 0.0),
            needs_fit: true,
            window: None,
            sb_context: None,
            surface: None,
            dragging: false,
            last_cursor: (0.0, 0.0),
            _watcher: None,
        }
    }

    /// 读数据 → render → 解析 SVG（返回 usvg Tree）
    fn build_tree(&mut self) -> Result<resvg::usvg::Tree> {
        let t0 = std::time::Instant::now();
        let data = load(&self.data_path)
            .with_context(|| format!("读取数据失败: {}", self.data_path.display()))?;
        let t1 = std::time::Instant::now();

        let opts = RenderOpts { highlight: self.focus.clone(), ..Default::default() };
        let svg = match &self.view_id {
            Some(id) => render_view(&data, id, &opts)?,
            None => render_overview(&data, &opts)?,
        };
        let t2 = std::time::Instant::now();

        let tree = resvg::usvg::Tree::from_str(&svg, &self.usvg_opts)
            .context("SVG 解析失败（render 输出的 SVG 不合法）")?;
        let t3 = std::time::Instant::now();
        let total = (t1 - t0) + (t3 - t2);
        if total > std::time::Duration::from_millis(100) {
            eprintln!(
                "[perf] 慢渲染: load={:?} parse={:?} total={:?}",
                t1 - t0,
                t3 - t2,
                total
            );
        }

        let size = tree.size();
        self.svg_size = (size.width(), size.height());
        Ok(tree)
    }

    /// 渲染到像素缓冲（窗口尺寸）
    fn render_pixels(&mut self) -> Result<()> {
        // Tree 缓存：数据未变（zoom/pan）时复用，避免重复解析
        if self.cached_tree.is_none() {
            self.cached_tree = Some(self.build_tree()?);
        }

        // 首次渲染（或按 0 复位）：此时 svg_size 已测量，fit 才准确
        if self.needs_fit {
            self.fit();
        }

        let tree = self.cached_tree.as_ref().expect("tree 刚被填充");

        let window = match self.window.clone() {
            Some(w) => w,
            None => return Ok(()),
        };
        let size = window.inner_size();
        let (w, h) = (size.width.max(1), size.height.max(1));

        let mut pixmap = resvg::tiny_skia::Pixmap::new(w, h)
            .ok_or_else(|| anyhow::anyhow!("创建像素缓冲失败（窗口 {w}x{h} 过大？）"))?;
        let transform = resvg::tiny_skia::Transform::from_scale(self.zoom as f32, self.zoom as f32)
            .post_translate(self.offset.0 as f32, self.offset.1 as f32);
        resvg::render(&tree, transform, &mut pixmap.as_mut());

        let surface = match self.surface.as_mut() {
            Some(s) => s,
            None => return Ok(()),
        };
        surface
            .resize(NonZeroU32::new(w).unwrap(), NonZeroU32::new(h).unwrap())
            .map_err(|e| anyhow::anyhow!("surface resize 失败: {e}"))?;
        let mut buffer = surface
            .buffer_mut()
            .map_err(|e| anyhow::anyhow!("获取绘制缓冲失败: {e}"))?;
        for (dst, src) in buffer.iter_mut().zip(pixmap.pixels()) {
            *dst = ((src.red() as u32) << 16) | ((src.green() as u32) << 8) | (src.blue() as u32);
        }
        buffer
            .present()
            .map_err(|e| anyhow::anyhow!("呈现失败: {e}"))?;
        Ok(())
    }

    /// 适应窗口（居中 + 缩放）
    fn fit(&mut self) {
        let Some(window) = self.window.clone() else { return };
        let size = window.inner_size();
        let (w, h) = (size.width.max(1) as f64, size.height.max(1) as f64);
        let (sw, sh) = (self.svg_size.0 as f64, self.svg_size.1 as f64);
        let zoom = (w / sw).min(h / sh) * 0.98;
        self.zoom = zoom.clamp(ZOOM_MIN, ZOOM_MAX);
        self.offset = (
            (w - sw * self.zoom) / 2.0,
            (h - sh * self.zoom) / 2.0,
        );
        self.needs_fit = false;
    }

    /// 以某点为中心缩放
    fn zoom_at(&mut self, factor: f64, px: f64, py: f64) {
        let new_zoom = (self.zoom * factor).clamp(ZOOM_MIN, ZOOM_MAX);
        let actual = new_zoom / self.zoom;
        // 保持 (px, py) 处的内容不动
        self.offset.0 = px - (px - self.offset.0) * actual;
        self.offset.1 = py - (py - self.offset.1) * actual;
        self.zoom = new_zoom;
    }

    fn request_redraw(&self) {
        if let Some(w) = &self.window {
            w.request_redraw();
        }
    }
}

impl ApplicationHandler<UserEvent> for Viewer {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        let attrs = Window::default_attributes()
            .with_title(format!(
                "inventory viewer — {}",
                self.data_path.file_name().and_then(|s| s.to_str()).unwrap_or("data.toml")
            ))
            .with_inner_size(winit::dpi::LogicalSize::new(1280.0, 860.0));
        let window = match event_loop.create_window(attrs) {
            Ok(w) => Arc::new(w),
            Err(e) => {
                eprintln!("创建窗口失败: {e}");
                event_loop.exit();
                return;
            }
        };

        match softbuffer::Context::new(window.clone()) {
            Ok(ctx) => {
                match softbuffer::Surface::new(&ctx, window.clone()) {
                    Ok(surface) => {
                        self.surface = Some(surface);
                        self.sb_context = Some(ctx);
                    }
                    Err(e) => {
                        eprintln!("创建绘制表面失败: {e}");
                        event_loop.exit();
                        return;
                    }
                }
            }
            Err(e) => {
                eprintln!("初始化 softbuffer 失败: {e}");
                event_loop.exit();
                return;
            }
        }

        // 文件监听
        let proxy = self.proxy.clone();
        match watch_file(&self.data_path, proxy) {
            Ok(w) => self._watcher = Some(w),
            Err(e) => eprintln!("警告：文件监听启动失败（自动刷新不可用）: {e}"),
        }

        self.window = Some(window);
        self.request_redraw();
    }

    fn user_event(&mut self, _event_loop: &ActiveEventLoop, event: UserEvent) {
        match event {
            UserEvent::DataChanged => {
                // 数据变了 → 失效缓存的 tree，下次渲染重建
                self.cached_tree = None;
                // 不防抖：渲染成本已优化到毫秒级；防抖会丢弃窗口内事件（含最后一次更新）
                self.request_redraw();
            }
        }
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::Resized(_) => {
                self.request_redraw();
            }
            WindowEvent::RedrawRequested => {
                if let Err(e) = self.render_pixels() {
                    eprintln!("渲染失败: {e:#}");
                    // 失败时在标题提示（保留上一帧，不白屏）
                    if let Some(w) = &self.window {
                        w.set_title(&format!("inventory viewer — ⚠ {e}"));
                    }
                }
            }
            WindowEvent::MouseWheel { delta, .. } => {
                let (px, py) = self.last_cursor;
                let factor = match delta {
                    MouseScrollDelta::LineDelta(_, y) => {
                        if y > 0.0 { ZOOM_STEP } else { 1.0 / ZOOM_STEP }
                    }
                    MouseScrollDelta::PixelDelta(p) => {
                        if p.y > 0.0 { ZOOM_STEP } else { 1.0 / ZOOM_STEP }
                    }
                };
                self.zoom_at(factor, px, py);
                self.request_redraw();
            }
            WindowEvent::CursorMoved { position, .. } => {
                let (x, y) = (position.x, position.y);
                if self.dragging {
                    self.offset.0 += x - self.last_cursor.0;
                    self.offset.1 += y - self.last_cursor.1;
                    self.request_redraw();
                }
                self.last_cursor = (x, y);
            }
            WindowEvent::MouseInput { state, button, .. } => {
                if button == MouseButton::Left {
                    self.dragging = state == ElementState::Pressed;
                }
            }
            WindowEvent::KeyboardInput { event, .. } => {
                if event.state != ElementState::Pressed {
                    return;
                }
                let (px, py) = self.last_cursor;
                match event.logical_key.as_ref() {
                    Key::Named(NamedKey::Escape) => event_loop.exit(),
                    Key::Character("q") => event_loop.exit(),
                    Key::Character("+") | Key::Character("=") => {
                        self.zoom_at(ZOOM_STEP, px, py);
                        self.request_redraw();
                    }
                    Key::Character("-") | Key::Character("_") => {
                        self.zoom_at(1.0 / ZOOM_STEP, px, py);
                        self.request_redraw();
                    }
                    Key::Character("0") => {
                        self.needs_fit = true;
                        self.request_redraw();
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {
        // 事件循环空闲（保持 Wait 模式，无轮询开销）
        let _ = ControlFlow::Wait;
    }
}

fn watch_file(
    path: &PathBuf,
    proxy: EventLoopProxy<UserEvent>,
) -> Result<notify::RecommendedWatcher> {
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        // 只监听单个文件：任何事件都视为"数据可能已变"，直接触发重渲染。
        // （不过滤事件类型——rename/权限变更等在不同后端下类型不一，过滤会丢更新）
        if res.is_ok() {
            let _ = proxy.send_event(UserEvent::DataChanged);
        }
    })?;
    watcher.watch(path, RecursiveMode::NonRecursive)?;
    Ok(watcher)
}

fn main() -> Result<()> {
    // 参数解析
    let args: Vec<String> = std::env::args().collect();
    let mut data_path: Option<PathBuf> = None;
    let mut view_id: Option<String> = None;
    let mut focus: Vec<String> = Vec::new();

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--view" => {
                i += 1;
                view_id = args.get(i).cloned();
            }
            "--focus" => {
                i += 1;
                if let Some(f) = args.get(i) {
                    focus.push(f.clone());
                }
            }
            other => data_path = Some(PathBuf::from(other)),
        }
        i += 1;
    }

    let data_path = data_path.ok_or_else(|| {
        anyhow::anyhow!("用法: viewer <data.toml> [--view <view-id>] [--focus <物品名>]")
    })?;
    if !data_path.exists() {
        anyhow::bail!("数据文件不存在: {}", data_path.display());
    }

    let event_loop = EventLoop::<UserEvent>::with_user_event().build()?;
    event_loop.set_control_flow(ControlFlow::Wait);
    let proxy = event_loop.create_proxy();
    let mut viewer = Viewer::new(data_path, view_id, focus, proxy);
    event_loop.run_app(&mut viewer)?;
    Ok(())
}
