//! TUI 应用状态与核心逻辑
//!
//! 设计（契约 §5.3 / §5.5）：
//! - **列 = 深度**：每列堆着"还没耗尽的维度"在该层的候选
//! - 每步操作 = 所有选中维度**同步下钻一层**
//! - 同维度单选（物理约束）；跨维度 AND
//! - 维度耗尽自动退出后续列
//!
//! 结构借鉴 yazi：`Column{cursor, offset}`（对应 yazi 的 Folder）、列搜索（对应 Finder）

use inventory_core::{Data, DimensionKind};
use std::path::PathBuf;

/// 列里的一个候选项
#[derive(Debug, Clone)]
pub struct Candidate {
    pub label: String,
    pub value: String,
    /// 匹配到的物品数
    pub count: usize,
}

/// 列里的一个分组（一个维度在该层的候选）
#[derive(Debug, Clone)]
pub struct Group {
    pub dim: String,
    pub name: String,
    pub items: Vec<Candidate>,
    /// 该维度在这一列选中的项（单选）
    pub selected: Option<usize>,
}

/// 一列（= 一个深度）
#[derive(Debug, Clone, Default)]
pub struct Column {
    pub groups: Vec<Group>,
    /// 扁平光标位置
    pub cursor: usize,
    /// 滚动偏移
    pub offset: usize,
    /// 列搜索词
    pub filter: Option<String>,
}

impl Column {
    /// 扁平化的可见项数（group 标题 + items）
    pub fn flat_len(&self) -> usize {
        self.groups.iter().map(|g| g.items.len()).sum()
    }

    /// 扁平索引 → (group 索引, item 索引)
    pub fn locate(&self, mut flat: usize) -> Option<(usize, usize)> {
        for (gi, g) in self.groups.iter().enumerate() {
            if flat < g.items.len() {
                return Some((gi, flat));
            }
            flat -= g.items.len();
        }
        None
    }
}

/// 滑动窗口里的一个单位
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unit {
    /// 维度栏
    Dim,
    /// 第 n 个深度列（0-based）
    Column(usize),
    /// 详情（仅当焦点在物品上时存在）
    Detail,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchMode {
    /// 列搜索（过滤当前列的候选）
    Column,
    /// 全局搜索（直接搜物品）
    Global,
}

#[derive(Debug, Clone)]
pub struct DebugState {
    /// 正在微调的结果项索引（指向 result）
    pub result_idx: usize,
    /// 被调整的物品名
    pub item_name: String,
}

/// 详情列可编辑字段（顺序 = 显示顺序）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DetailField {
    Name,
    Category,
    Status,
    Condition,
    Layer,
    View,
    Desc,
}

impl DetailField {
    /// 显示顺序
    pub const ALL: [DetailField; 7] = [
        DetailField::Name,
        DetailField::Category,
        DetailField::Status,
        DetailField::Condition,
        DetailField::Layer,
        DetailField::View,
        DetailField::Desc,
    ];

    pub fn label(&self) -> &'static str {
        match self {
            DetailField::Name => "名称",
            DetailField::Category => "分类",
            DetailField::Status => "去向",
            DetailField::Condition => "状态",
            DetailField::Layer => "层",
            DetailField::View => "位置",
            DetailField::Desc => "描述",
        }
    }

    /// 文本输入型（否则为枚举/数字选择型：jk 换值）
    pub fn is_text(&self) -> bool {
        matches!(self, DetailField::Name | DetailField::Desc)
    }
}

/// 详情列编辑态（Enter 进入，再 Enter 确定）
#[derive(Debug, Clone)]
pub struct DetailEdit {
    pub field: DetailField,
    /// 编辑中的值（文本=输入缓冲；枚举/数字=当前候选）
    pub buffer: String,
}

pub struct App {
    pub data: Data,
    pub data_path: PathBuf,
    pub quit: bool,

    // ── 维度栏 ──
    pub dim_cursor: usize,
    pub dim_enabled: Vec<bool>,

    // ── 列栈 ──
    pub columns: Vec<Column>,
    /// 焦点：0 = 维度栏，1.. = 列索引+1
    pub focus: usize,

    // ── 结果 ──
    pub result: Vec<usize>,
    pub result_cursor: usize,

    // ── 详情 ──
    pub show_detail: bool,
    /// 详情列选中的字段索引
    pub detail_cursor: usize,
    /// 详情列编辑态（Enter 进入，再 Enter 确定）
    pub detail_edit: Option<DetailEdit>,

    // ── 搜索 ──
    pub search: Option<SearchMode>,
    pub search_input: String,

    // ── 调试模式 ──
    pub debug: Option<DebugState>,

    // ── 消息 ──
    pub message: Option<String>,

    // ── 列区视口（0 = 维度栏；超过可见列数时最左的滑出视野）──
    pub viewport_start: usize,
}

impl App {
    pub fn new(data: Data, data_path: PathBuf) -> Self {
        let n = data.dimensions.len();
        let mut app = Self {
            data,
            data_path,
            quit: false,
            dim_cursor: 0,
            dim_enabled: vec![false; n],
            columns: Vec::new(),
            focus: 0,
            result: Vec::new(),
            result_cursor: 0,
            show_detail: true,
            detail_cursor: 0,
            detail_edit: None,
            search: None,
            search_input: String::new(),
            debug: None,
            message: None,
            viewport_start: 0,
        };
        app.rebuild();
        app
    }

    /// 启用的维度 key 列表（保持定义顺序）
    pub fn enabled_dims(&self) -> Vec<String> {
        self.data
            .dimensions
            .iter()
            .zip(&self.dim_enabled)
            .filter(|(_, on)| **on)
            .map(|(d, _)| d.key.clone())
            .collect()
    }

    /// 当前所有选中路径（列里的选择）
    pub fn selections(&self) -> Vec<(String, Vec<String>)> {
        let mut out: Vec<(String, Vec<String>)> = Vec::new();
        for col in &self.columns {
            for g in &col.groups {
                if let Some(idx) = g.selected {
                    if let Some(c) = g.items.get(idx) {
                        out.push((g.dim.clone(), vec![c.value.clone()]));
                    }
                }
            }
        }
        out
    }

    /// 位置维度的特殊路径（视图 + 层）—— 在给定列栈上读取
    fn location_path_in(columns: &[Column]) -> (Option<String>, Option<u32>) {
        let mut view = None;
        let mut layer = None;
        for col in columns {
            for g in &col.groups {
                if g.dim == "location" {
                    if let Some(idx) = g.selected {
                        if let Some(c) = g.items.get(idx) {
                            if view.is_none() {
                                view = Some(c.value.clone());
                            } else {
                                layer = c.value.parse().ok();
                            }
                        }
                    }
                }
            }
        }
        (view, layer)
    }

    /// 某维度在深度 `depth` 的候选（在给定列栈的选择前提下）
    fn candidates_at(&self, columns: &[Column], dim: &str, depth: usize) -> Vec<Candidate> {
        let dim_def = self.data.dimensions.iter().find(|d| d.key == dim);
        let (sel_view, _sel_layer) = Self::location_path_in(columns);

        match dim_def.map(|d| d.kind) {
            Some(DimensionKind::Tree) => {
                // 位置：第 0 层 = 视图列表；第 1 层 = 该视图的层
                if depth == 0 {
                    self.data
                        .views
                        .iter()
                        .map(|v| {
                            let count = self
                                .data
                                .items_in_view(&v.id)
                                .into_iter()
                                .filter(|i| self.matches_other_dims(columns, i, dim))
                                .count();
                            Candidate { label: v.name.clone(), value: v.id.clone(), count }
                        })
                        .collect()
                } else if depth == 1 {
                    match &sel_view {
                        Some(vid) => {
                            let max_layer = self
                                .data
                                .items_in_view(vid)
                                .iter()
                                .map(|i| i.layer)
                                .max()
                                .unwrap_or(1);
                            (1..=max_layer)
                                .map(|l| {
                                    let count = self
                                        .data
                                        .items_in_view(vid)
                                        .into_iter()
                                        .filter(|i| i.layer == l)
                                        .count();
                                    Candidate {
                                        label: format!("第 {l} 层"),
                                        value: l.to_string(),
                                        count,
                                    }
                                })
                                .collect()
                        }
                        None => Vec::new(),
                    }
                } else {
                    Vec::new()
                }
            }
            Some(DimensionKind::Enum) => {
                if depth > 0 {
                    return Vec::new();
                }
                let def = dim_def.unwrap();
                def.values
                    .iter()
                    .map(|v| {
                        let count = self
                            .data
                            .items
                            .iter()
                            .filter(|i| i.attr(dim) == Some(v.as_str()))
                            .filter(|i| self.matches_other_dims(columns, i, dim))
                            .count();
                        Candidate { label: v.clone(), value: v.clone(), count }
                    })
                    .collect()
            }
            _ => Vec::new(),
        }
    }

    /// 物品是否匹配"其他维度"的已选条件（排除 dim 自己）
    fn matches_other_dims(&self, columns: &[Column], item: &inventory_core::Item, exclude: &str) -> bool {
        let (sel_view, sel_layer) = Self::location_path_in(columns);
        for col in columns {
            for g in &col.groups {
                if g.dim == exclude {
                    continue;
                }
                if let Some(idx) = g.selected {
                    if let Some(c) = g.items.get(idx) {
                        if g.dim == "location" {
                            if let Some(v) = &sel_view {
                                if &item.view != v {
                                    return false;
                                }
                            }
                            if let Some(l) = sel_layer {
                                if item.layer != l {
                                    return false;
                                }
                            }
                        } else if item.attr(&g.dim) != Some(c.value.as_str()) {
                            return false;
                        }
                    }
                }
            }
        }
        true
    }

    /// 重建列栈 + 结果（任何选择变化后调用）
    ///
    /// 关键：先取出旧列（含用户最新选择）作为过滤前提，生成完新列再替换——
    /// 否则生成候选时读不到选择，计数与多层路径恢复都会错。
    pub fn rebuild(&mut self) {
        let dims = self.enabled_dims();
        let old_columns = std::mem::take(&mut self.columns);

        // 各维度的选择路径（按深度顺序）
        let mut old_paths: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();
        for col in &old_columns {
            for g in &col.groups {
                if let Some(idx) = g.selected {
                    if let Some(c) = g.items.get(idx) {
                        old_paths.entry(g.dim.clone()).or_default().push(c.value.clone());
                    }
                }
            }
        }

        let mut new_columns: Vec<Column> = Vec::new();
        let mut depth = 0;
        loop {
            let mut groups = Vec::new();
            for dim in &dims {
                let cands = self.candidates_at(&old_columns, dim, depth);
                if cands.is_empty() {
                    continue;
                }
                let dim_name = self
                    .data
                    .dimensions
                    .iter()
                    .find(|d| &d.key == dim)
                    .map(|d| d.name.clone())
                    .unwrap_or_else(|| dim.clone());

                // 按深度恢复旧选择
                let selected = old_paths
                    .get(dim)
                    .and_then(|path| path.get(depth))
                    .and_then(|v| cands.iter().position(|c| &c.value == v));

                groups.push(Group { dim: dim.clone(), name: dim_name, items: cands, selected });
            }
            if groups.is_empty() {
                break;
            }
            new_columns.push(Column { groups, cursor: 0, offset: 0, filter: None });
            depth += 1;
            if depth > 8 {
                break; // 安全阀
            }
        }

        self.columns = new_columns;
        self.focus = self.focus.min(self.columns.len());
        self.recompute_result();
    }

    /// 根据选中路径重算结果
    pub fn recompute_result(&mut self) {
        let (sel_view, sel_layer) = Self::location_path_in(&self.columns);
        let mut others: Vec<(String, String)> = Vec::new();
        for col in &self.columns {
            for g in &col.groups {
                if g.dim == "location" {
                    continue;
                }
                if let Some(idx) = g.selected {
                    if let Some(c) = g.items.get(idx) {
                        others.push((g.dim.clone(), c.value.clone()));
                    }
                }
            }
        }

        self.result = self
            .data
            .items
            .iter()
            .enumerate()
            .filter(|(_, i)| {
                if let Some(v) = &sel_view {
                    if &i.view != v {
                        return false;
                    }
                }
                if let Some(l) = sel_layer {
                    if i.layer != l {
                        return false;
                    }
                }
                others.iter().all(|(k, v)| i.attr(k) == Some(v.as_str()))
            })
            .map(|(idx, _)| idx)
            .collect();

        if self.result_cursor >= self.result.len() {
            self.result_cursor = self.result.len().saturating_sub(1);
        }
        // 无选中物品 → 焦点不能停在详情列/结果栏（兜底回最后一列）
        if self.result.is_empty() && self.focus > self.columns.len() {
            self.focus = self.columns.len();
        }
    }

    /// 当前列（None = 维度栏）
    pub fn current_column(&self) -> Option<&Column> {
        if self.focus == 0 {
            None
        } else {
            self.columns.get(self.focus - 1)
        }
    }

    pub fn current_column_mut(&mut self) -> Option<&mut Column> {
        if self.focus == 0 {
            None
        } else {
            self.columns.get_mut(self.focus - 1)
        }
    }

    /// 光标移动（列内 / 维度栏 / 详情列 / 结果）
    pub fn move_cursor(&mut self, delta: isize) {
        if self.focus == 0 {
            let n = self.dim_enabled.len();
            if n == 0 {
                return;
            }
            self.dim_cursor = (self.dim_cursor as isize + delta).rem_euclid(n as isize) as usize;
        } else if self.focus == self.columns.len() + 1 {
            // 详情列：选字段
            let n = DetailField::ALL.len();
            self.detail_cursor =
                (self.detail_cursor as isize + delta).rem_euclid(n as isize) as usize;
        } else if self.focus == self.columns.len() + 2 {
            // 结果栏
            let n = self.result.len();
            if n == 0 {
                return;
            }
            self.result_cursor = (self.result_cursor as isize + delta).rem_euclid(n as isize) as usize;
        } else if let Some(col) = self.current_column_mut() {
            let n = col.flat_len();
            if n == 0 {
                return;
            }
            col.cursor = (col.cursor as isize + delta).rem_euclid(n as isize) as usize;
        }
    }

    /// 当前滑动窗口的单位序列
    ///
    /// 规则（用户定案）：整个 TUI 三列 —— 列一/列二 = 滑动窗口，列三 = 结果（永远最右）。
    /// 详情列：**选中物品时出现**（焦点在详情列/结果栏），焦点离开就滑走。
    pub fn units(&self) -> Vec<Unit> {
        let mut units = vec![Unit::Dim];
        for i in 0..self.columns.len() {
            units.push(Unit::Column(i));
        }
        if self.show_detail && !self.result.is_empty() && self.focus > self.columns.len() {
            units.push(Unit::Detail);
        }
        units
    }

    /// 焦点对应的单位索引（focus：0=维度栏，1..=N=列，N+1=详情列，N+2=结果栏）
    pub fn focus_unit_index(&self) -> usize {
        if self.focus == 0 {
            0
        } else if self.focus <= self.columns.len() {
            self.focus
        } else {
            // 详情列 / 结果栏 → 列区最后一个单位（详情，若存在）
            self.units().len().saturating_sub(1)
        }
    }

    /// 滑动视口：保证焦点单位可见（visible = 窗口容量，通常 2）
    pub fn ensure_visible(&mut self, visible: usize) {
        if visible == 0 {
            return;
        }
        let units_len = self.units().len();
        let fi = self.focus_unit_index();
        if fi < self.viewport_start {
            self.viewport_start = fi;
        } else if fi >= self.viewport_start + visible {
            self.viewport_start = fi + 1 - visible;
        }
        let max_start = units_len.saturating_sub(visible);
        self.viewport_start = self.viewport_start.min(max_start);
    }

    /// 焦点左右移动（0=维度栏，1..=N=列，N+1=详情列，N+2=结果栏）
    pub fn move_focus(&mut self, delta: isize) {
        // 无选中物品时详情列/结果栏不存在 → 最远只能到最后一列
        let max = if self.result.is_empty() {
            self.columns.len()
        } else {
            self.columns.len() + 2
        };
        self.focus = (self.focus as isize + delta).clamp(0, max as isize) as usize;
    }

    /// 维度栏：切换启用
    pub fn toggle_dim(&mut self) {
        if self.focus != 0 {
            return;
        }
        let i = self.dim_cursor;
        if i < self.dim_enabled.len() {
            self.dim_enabled[i] = !self.dim_enabled[i];
            // 关闭的维度：清掉其选择
            if !self.dim_enabled[i] {
                let key = self.data.dimensions[i].key.clone();
                for col in &mut self.columns {
                    for g in &mut col.groups {
                        if g.dim == key {
                            g.selected = None;
                        }
                    }
                }
            }
            self.rebuild();
        }
    }

    /// 当前列：选中/取消选中
    pub fn toggle_select(&mut self) {
        let Some(col) = self.current_column_mut() else { return };
        let Some((gi, ii)) = col.locate(col.cursor) else { return };
        let g = &mut col.groups[gi];
        if g.selected == Some(ii) {
            g.selected = None;
        } else {
            g.selected = Some(ii);
        }
        self.rebuild();
    }

    /// 回退（清空最后一列的选择 → 相当于上钻一层）
    pub fn back(&mut self) {
        // 从最后一列往前找第一个有选择的维度，清掉它
        for col in self.columns.iter_mut().rev() {
            let mut cleared = false;
            for g in col.groups.iter_mut() {
                if g.selected.is_some() {
                    g.selected = None;
                    cleared = true;
                    break;
                }
            }
            if cleared {
                self.rebuild();
                return;
            }
        }
        // 没有选择 → 清空所有维度
        for on in self.dim_enabled.iter_mut() {
            *on = false;
        }
        self.rebuild();
    }

    /// 当前选中的物品（结果栏）
    pub fn current_item(&self) -> Option<&inventory_core::Item> {
        self.result.get(self.result_cursor).and_then(|i| self.data.items.get(*i))
    }

    // ── 详情列：字段读取 / 编辑（Enter 进入，再 Enter 确定）──

    /// 详情列字段的原始值（编辑缓冲初始化用）
    fn detail_raw(&self, item: &inventory_core::Item, field: DetailField) -> String {
        match field {
            DetailField::Name => item.name.clone(),
            DetailField::Category => item.attr("category").unwrap_or("").to_string(),
            DetailField::Status => item.attr("status").unwrap_or("").to_string(),
            DetailField::Condition => item.attr("condition").unwrap_or("").to_string(),
            DetailField::Layer => item.layer.to_string(),
            DetailField::View => item.view.clone(),
            DetailField::Desc => item.desc.clone().unwrap_or_default(),
        }
    }

    /// 详情列字段的显示值
    pub fn detail_value(&self, field: DetailField) -> String {
        let Some(item) = self.current_item() else {
            return "-".into();
        };
        match field {
            DetailField::Layer => format!("第 {} 层", item.layer),
            DetailField::View => self
                .data
                .view(&item.view)
                .map(|v| v.name.clone())
                .unwrap_or_else(|| item.view.clone()),
            _ => self.detail_raw(item, field),
        }
    }

    /// 焦点是否在详情列（需详情列可见）
    pub fn on_detail(&self) -> bool {
        self.focus == self.columns.len() + 1 && self.show_detail && !self.result.is_empty()
    }

    /// 进入详情列编辑态（Enter）
    pub fn enter_detail_edit(&mut self) {
        if !self.on_detail() || self.detail_edit.is_some() {
            return;
        }
        let field = DetailField::ALL[self.detail_cursor];
        let buffer = self
            .current_item()
            .map(|i| self.detail_raw(i, field))
            .unwrap_or_default();
        self.detail_edit = Some(DetailEdit { field, buffer });
    }

    /// 编辑态：切换候选值（枚举/数字用 jk 或上下键）
    pub fn cycle_detail_edit(&mut self, delta: isize) {
        let Some(edit) = self.detail_edit.as_ref() else {
            return;
        };
        let field = edit.field;
        let cur = edit.buffer.clone();

        let next: Option<String> = match field {
            DetailField::Layer => {
                let v: i64 = cur.parse().unwrap_or(1);
                Some((v + delta as i64).max(1).to_string())
            }
            DetailField::View => {
                let ids: Vec<String> = self.data.views.iter().map(|v| v.id.clone()).collect();
                cycle_in(&ids, &cur, delta)
            }
            DetailField::Category | DetailField::Status | DetailField::Condition => {
                let key = match field {
                    DetailField::Category => "category",
                    DetailField::Status => "status",
                    _ => "condition",
                };
                let values: Vec<String> = self
                    .data
                    .dimensions
                    .iter()
                    .find(|d| d.key == key)
                    .map(|d| d.values.clone())
                    .unwrap_or_default();
                cycle_in(&values, &cur, delta)
            }
            DetailField::Name | DetailField::Desc => None,
        };

        if let Some(v) = next {
            if let Some(edit) = self.detail_edit.as_mut() {
                edit.buffer = v;
            }
        }
    }

    /// 编辑态：输入字符（文本字段）
    pub fn detail_edit_push(&mut self, c: char) {
        if let Some(edit) = self.detail_edit.as_mut() {
            edit.buffer.push(c);
        }
    }

    /// 编辑态：退格
    pub fn detail_edit_backspace(&mut self) {
        if let Some(edit) = self.detail_edit.as_mut() {
            edit.buffer.pop();
        }
    }

    /// 编辑态：取消（Esc）
    pub fn cancel_detail_edit(&mut self) {
        self.detail_edit = None;
    }

    /// 编辑态：确定（写内存 + 写盘 + 重算）
    pub fn confirm_detail_edit(&mut self) -> anyhow::Result<()> {
        let Some(edit) = self.detail_edit.take() else {
            return Ok(());
        };
        let Some(idx) = self.result.get(self.result_cursor).copied() else {
            return Ok(());
        };

        // 换视图：先取新视图尺寸（避免与 items 的可变借用冲突）
        let new_view_size = if edit.field == DetailField::View {
            self.data.view(&edit.buffer).map(|v| v.size)
        } else {
            None
        };

        let field = edit.field;
        let buffer = edit.buffer;
        {
            let item = &mut self.data.items[idx];
            match field {
                DetailField::Name => item.name = buffer,
                DetailField::Desc => {
                    item.desc = if buffer.trim().is_empty() { None } else { Some(buffer) }
                }
                DetailField::Layer => {
                    if let Ok(l) = buffer.parse::<u32>() {
                        item.layer = l.max(1);
                    }
                }
                DetailField::View => {
                    item.view = buffer;
                    // 坐标 clamp 进新视图（避免物品落在视图外看不见）
                    if let Some(size) = new_view_size {
                        item.pos[0] = item.pos[0].clamp(0.0, size[0]);
                        item.pos[1] = item.pos[1].clamp(0.0, size[1]);
                    }
                }
                DetailField::Category => {
                    item.attrs.insert("category".into(), buffer);
                }
                DetailField::Status => {
                    item.attrs.insert("status".into(), buffer);
                }
                DetailField::Condition => {
                    item.attrs.insert("condition".into(), buffer);
                }
            }
        }

        inventory_core::save(&self.data_path, &self.data)?;
        self.rebuild();
        Ok(())
    }

    /// 列搜索：过滤当前列的候选项
    pub fn apply_column_filter(&mut self) {
        let filter = self.search_input.clone();
        if let Some(col) = self.current_column_mut() {
            col.filter = if filter.is_empty() { None } else { Some(filter) };
            col.cursor = 0;
            col.offset = 0;
        }
    }

    /// 全局搜索：过滤结果列表
    pub fn apply_global_filter(&mut self) {
        let kw = self.search_input.to_lowercase();
        if kw.is_empty() {
            self.recompute_result();
            return;
        }
        let (sel_view, sel_layer) = Self::location_path_in(&self.columns);
        let mut others: Vec<(String, String)> = Vec::new();
        for col in &self.columns {
            for g in &col.groups {
                if g.dim == "location" {
                    continue;
                }
                if let Some(idx) = g.selected {
                    if let Some(c) = g.items.get(idx) {
                        others.push((g.dim.clone(), c.value.clone()));
                    }
                }
            }
        }
        self.result = self
            .data
            .items
            .iter()
            .enumerate()
            .filter(|(_, i)| {
                let kw_hit = i.name.to_lowercase().contains(&kw)
                    || i.desc.as_deref().map(|d| d.to_lowercase().contains(&kw)).unwrap_or(false);
                if !kw_hit {
                    return false;
                }
                if let Some(v) = &sel_view {
                    if &i.view != v {
                        return false;
                    }
                }
                if let Some(l) = sel_layer {
                    if i.layer != l {
                        return false;
                    }
                }
                others.iter().all(|(k, v)| i.attr(k) == Some(v.as_str()))
            })
            .map(|(idx, _)| idx)
            .collect();
        self.result_cursor = 0;
    }
}

// ══════════════════════════════════════════════════════════
// 测试
// ══════════════════════════════════════════════════════════

/// 在候选列表里循环取下一个值（delta 步）
fn cycle_in(values: &[String], cur: &str, delta: isize) -> Option<String> {
    if values.is_empty() {
        return None;
    }
    let idx = values.iter().position(|v| v == cur).unwrap_or(0) as isize;
    let next = (idx + delta).rem_euclid(values.len() as isize) as usize;
    Some(values[next].clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use inventory_core::{Dimension, DimensionKind, Item, Meta, View};
    use std::collections::HashMap;

    fn sample() -> Data {
        let item = |name: &str, view: &str, layer: u32, cat: &str| Item {
            name: name.into(),
            view: view.into(),
            layer,
            pos: [10.0, 10.0],
            size: 5.0,
            shape: None,
            desc: None,
            attrs: HashMap::from([("category".to_string(), cat.to_string())]),
        };
        Data {
            meta: Meta::default(),
            dimensions: vec![
                Dimension {
                    key: "location".into(),
                    name: "位置".into(),
                    kind: DimensionKind::Tree,
                    values: vec![],
                },
                Dimension {
                    key: "category".into(),
                    name: "分类".into(),
                    kind: DimensionKind::Enum,
                    values: vec!["电子类".into(), "衣物类".into()],
                },
            ],
            views: vec![
                View { id: "desk".into(), name: "书桌".into(), size: [100.0, 60.0] },
                View { id: "drawer".into(), name: "抽屉".into(), size: [40.0, 30.0] },
            ],
            items: vec![
                item("手机", "desk", 1, "电子类"),
                item("充电器", "desk", 2, "电子类"),
                item("T恤", "drawer", 1, "衣物类"),
            ],
        }
    }

    fn app_with(dims: &[usize]) -> App {
        let mut app = App::new(sample(), PathBuf::from("/tmp/test.toml"));
        for i in dims {
            app.dim_enabled[*i] = true;
        }
        app.rebuild();
        app
    }

    #[test]
    fn location_dim_columns_appear_after_selection() {
        let mut app = app_with(&[0]);
        assert_eq!(app.columns.len(), 1, "未选择时只有视图候选列");
        app.columns[0].groups[0].selected = Some(0); // 选书桌
        app.rebuild();
        assert_eq!(app.columns.len(), 2, "选择视图后出现层候选列");
    }

    #[test]
    fn enum_dim_generates_one_column() {
        let app = app_with(&[1]); // 分类：单层
        assert_eq!(app.columns.len(), 1);
        assert_eq!(app.columns[0].groups[0].items.len(), 2, "2 个分类值");
    }

    #[test]
    fn selecting_view_filters_result() {
        let mut app = app_with(&[0]);
        app.columns[0].groups[0].selected = Some(0); // 书桌
        app.rebuild();
        assert_eq!(app.result.len(), 2, "书桌有 2 件");
        app.columns[1].groups[0].selected = Some(1); // 第 2 层
        app.rebuild();
        assert_eq!(app.result.len(), 1, "书桌第 2 层只有 1 件");
    }

    #[test]
    fn detail_focus_and_cursor_move() {
        let mut app = app_with(&[]);
        // 焦点在结果栏区域（详情列）时，详情才加入列区
        app.focus = app.columns.len() + 1;
        assert!(app.units().contains(&Unit::Detail), "选中物品时详情在列区");
        assert!(app.on_detail(), "N+1 是详情列");
        // 焦点最远到结果栏（N+2）
        for _ in 0..10 {
            app.move_focus(1);
        }
        assert_eq!(app.focus, app.columns.len() + 2, "焦点最远到结果栏");
        // 回详情列，字段循环
        app.focus = app.columns.len() + 1;
        app.move_cursor(1);
        assert_eq!(app.detail_cursor, 1);
        app.move_cursor(-1);
        assert_eq!(app.detail_cursor, 0);
        app.move_cursor(-1);
        assert_eq!(app.detail_cursor, DetailField::ALL.len() - 1, "向上循环到末尾");
        // 焦点离开结果栏区域 → 详情滑走（不在列区）
        app.focus = 0;
        assert!(!app.units().contains(&Unit::Detail), "焦点离开后详情滑走");
    }

    #[test]
    fn detail_edit_cycle_and_confirm() {
        let mut app = app_with(&[]);
        app.focus = app.columns.len() + 1;
        app.detail_cursor = 1; // 分类字段
        app.enter_detail_edit();
        assert!(app.detail_edit.is_some(), "Enter 进入编辑态");

        let before = app.current_item().unwrap().attr("category").unwrap().to_string();
        app.cycle_detail_edit(1);
        let after = app.detail_edit.as_ref().unwrap().buffer.clone();
        assert_ne!(before, after, "jk 应切换到下一个候选值");

        app.confirm_detail_edit().unwrap();
        assert!(app.detail_edit.is_none(), "确定后退出编辑态");
        assert_eq!(
            app.current_item().unwrap().attr("category").unwrap(),
            after,
            "确定后数据已更新"
        );
    }

    #[test]
    fn detail_edit_cancel_keeps_data() {
        let mut app = app_with(&[]);
        app.focus = app.columns.len() + 1;
        app.detail_cursor = 1;
        app.enter_detail_edit();
        let before = app.current_item().unwrap().attr("category").unwrap().to_string();
        app.cycle_detail_edit(1);
        app.cancel_detail_edit();
        assert!(app.detail_edit.is_none(), "Esc 退出编辑态");
        assert_eq!(
            app.current_item().unwrap().attr("category").unwrap(),
            before,
            "取消后数据不变"
        );
    }

    #[test]
    fn tab_hides_detail_unit() {
        let mut app = app_with(&[]);
        app.focus = app.columns.len() + 1; // 焦点到详情列
        assert!(app.units().contains(&Unit::Detail));
        app.show_detail = false;
        assert!(!app.units().contains(&Unit::Detail), "Tab 隐藏后详情单位移除");
        assert!(!app.on_detail(), "隐藏后焦点不在详情列");
    }

    #[test]
    fn multi_dim_is_and() {
        let mut app = app_with(&[0, 1]);
        let loc = app.columns[0].groups.iter().position(|g| g.dim == "location").unwrap();
        app.columns[0].groups[loc].selected = Some(1); // 抽屉
        app.rebuild();
        assert_eq!(app.result.len(), 1, "抽屉 1 件");
        let cat = app.columns[0].groups.iter().position(|g| g.dim == "category").unwrap();
        app.columns[0].groups[cat].selected = Some(1); // 衣物类
        app.rebuild();
        assert_eq!(app.result.len(), 1, "抽屉 + 衣物类 仍 1 件");
        app.columns[0].groups[cat].selected = Some(0); // 改成电子类
        app.rebuild();
        assert_eq!(app.result.len(), 0, "抽屉 + 电子类 = 空（跨维度 AND）");
    }

    #[test]
    fn back_rewinds_one_level_at_a_time() {
        let mut app = app_with(&[0]);
        app.columns[0].groups[0].selected = Some(0); // 书桌
        app.rebuild();
        app.columns[1].groups[0].selected = Some(0); // 第 1 层
        app.rebuild();
        assert_eq!(app.result.len(), 1, "书桌第 1 层 1 件");

        app.back(); // 回退一层 → 只剩"书桌"
        assert_eq!(app.result.len(), 2, "回退到书桌全部");
        app.back(); // 再回退 → 无筛选
        assert!(app.columns.iter().all(|c| c.groups.iter().all(|g| g.selected.is_none())));
        assert_eq!(app.result.len(), 3, "全部物品");
    }

    #[test]
    fn viewport_slides_to_keep_focus_visible() {
        let mut app = app_with(&[0, 1]); // 位置 + 分类
        // 选位置的第一个视图 → 产生第 2 列
        let loc = app.columns[0].groups.iter().position(|g| g.dim == "location").unwrap();
        app.columns[0].groups[loc].selected = Some(0);
        app.rebuild();
        assert_eq!(app.columns.len(), 2, "应有 2 列（视图 + 层）");
        let total_units = 1 + app.columns.len(); // 维度栏 + 2 列 = 3
        assert_eq!(total_units, 3);

        // 焦点在最后一个列区单位（列 2）、只能显示 2 个 → 视口滑动
        app.focus = 2;
        app.ensure_visible(2);
        assert_eq!(app.viewport_start, 1, "焦点在右端时视口滑到 1（显示列 1、2）");

        // 焦点在结果栏（物品上）→ 详情加入窗口末尾，视口滑到 [最后一列, 详情]
        app.focus = app.columns.len() + 1;
        app.ensure_visible(2);
        assert_eq!(app.viewport_start, 2, "焦点在物品上时窗口滑到最右（含详情）");
        assert_eq!(app.units().last(), Some(&Unit::Detail), "窗口末尾应是详情");

        // 焦点回到维度栏 → 视口回起点
        app.focus = 0;
        app.ensure_visible(2);
        assert_eq!(app.viewport_start, 0, "焦点在左端时视口回 0");
    }

    #[test]
    fn flat_len_matches_items() {
        let app = app_with(&[0, 1]);
        let col = &app.columns[0];
        assert_eq!(col.flat_len(), 4, "2 视图 + 2 分类");
        assert_eq!(col.locate(0), Some((0, 0)));
        assert_eq!(col.locate(3), Some((1, 1)));
    }
}
