//! inventory-core — 数据模型 + TOML 读写 + 校验
//!
//! 契约：见《契约冻结包》§2.1
//! 设计要点：
//! - `pos` 是物品**中心点**坐标（cm），缩放锚点为中心
//! - `save` 采用**未变项原样搬运**策略：未修改的条目保留原始格式与注释
//! - 所有失败路径返回 `Result`，不 panic（输入校验律：数据文件半可信）

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use toml_edit::{value, ArrayOfTables, DocumentMut, Item as TomlItem, Table};

// ══════════════════════════════════════════════════════════
// 数据结构
// ══════════════════════════════════════════════════════════

/// 完整数据（对应 data.toml）
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Data {
    #[serde(default)]
    pub meta: Meta,
    #[serde(default, rename = "dimension")]
    pub dimensions: Vec<Dimension>,
    #[serde(default, rename = "view")]
    pub views: Vec<View>,
    #[serde(default, rename = "item")]
    pub items: Vec<Item>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Meta {
    #[serde(default = "default_version")]
    pub version: u32,
}

impl Default for Meta {
    fn default() -> Self {
        Self { version: default_version() }
    }
}

fn default_version() -> u32 {
    2
}

/// 维度定义（数据驱动：TUI 列从这里生成）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Dimension {
    /// 物品里的属性键（如 "category"）
    pub key: String,
    /// 显示名（如 "分类"）
    pub name: String,
    /// 维度种类
    #[serde(default)]
    pub kind: DimensionKind,
    /// 取值集合（= 校验依据 + 列顺序）
    #[serde(default)]
    pub values: Vec<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DimensionKind {
    /// 枚举（单值）
    #[default]
    Enum,
    /// 树形（值来自 [[view]] 等结构，如位置）
    Tree,
    /// 多值（预留，v1 不用）
    Multi,
}

/// 视图（物理空间）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct View {
    pub id: String,
    pub name: String,
    /// 尺寸 [宽, 高]（cm）
    pub size: [f32; 2],
}

/// 物品
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Item {
    pub name: String,
    /// 位置维度第 1 层：视图 id
    pub view: String,
    /// 位置维度第 2 层：层号
    #[serde(default = "default_layer")]
    pub layer: u32,
    /// 中心点坐标（cm，视图内）
    pub pos: [f32; 2],
    /// 长边尺寸（cm，形状自带比例）
    pub size: f32,
    /// 形状键（形状库的键；None = 通用矩形）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shape: Option<String>,
    /// 自定义描述（唯一的描述字段：借用人/数量/日期都写这里）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
    /// 维度值平铺（category/status/condition/…）
    #[serde(flatten)]
    pub attrs: HashMap<String, String>,
}

fn default_layer() -> u32 {
    1
}

impl Item {
    /// 取维度属性值
    pub fn attr(&self, key: &str) -> Option<&str> {
        self.attrs.get(key).map(|s| s.as_str())
    }
}

impl Data {
    pub fn view(&self, id: &str) -> Option<&View> {
        self.views.iter().find(|v| v.id == id)
    }

    pub fn items_in_view(&self, id: &str) -> Vec<&Item> {
        self.items.iter().filter(|i| i.view == id).collect()
    }

    pub fn item(&self, name: &str) -> Option<&Item> {
        self.items.iter().find(|i| i.name == name)
    }

    pub fn item_mut(&mut self, name: &str) -> Option<&mut Item> {
        self.items.iter_mut().find(|i| i.name == name)
    }
}

// ══════════════════════════════════════════════════════════
// 错误
// ══════════════════════════════════════════════════════════

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("TOML 解析错误: {0}")]
    De(String),
    #[error("TOML 序列化错误: {0}")]
    Ser(#[from] toml_edit::ser::Error),
    #[error("TOML 语法错误: {0}")]
    Syntax(#[from] toml_edit::TomlError),
    #[error("数据无效: {0}")]
    Invalid(String),
}

// ══════════════════════════════════════════════════════════
// 校验
// ══════════════════════════════════════════════════════════

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Level {
    Error,
    Warning,
}

#[derive(Debug, Clone)]
pub struct Issue {
    pub level: Level,
    pub subject: Option<String>,
    pub message: String,
}

impl Issue {
    fn error(subject: Option<&str>, message: impl Into<String>) -> Self {
        Self { level: Level::Error, subject: subject.map(String::from), message: message.into() }
    }
    fn warning(subject: Option<&str>, message: impl Into<String>) -> Self {
        Self { level: Level::Warning, subject: subject.map(String::from), message: message.into() }
    }
    pub fn is_error(&self) -> bool {
        self.level == Level::Error
    }
}

/// 校验数据一致性（不 panic；返回全部问题）
pub fn check(data: &Data) -> Vec<Issue> {
    let mut issues = Vec::new();

    // 1. 物品重名
    let mut seen: HashMap<&str, usize> = HashMap::new();
    for (idx, item) in data.items.iter().enumerate() {
        if let Some(prev) = seen.insert(item.name.as_str(), idx) {
            issues.push(Issue::error(
                Some(&item.name),
                format!("物品名重复（第 {} 条与第 {} 条）", prev + 1, idx + 1),
            ));
        }
    }

    // 2. 视图 id 重复
    let mut view_ids: HashMap<&str, usize> = HashMap::new();
    for (idx, v) in data.views.iter().enumerate() {
        if let Some(prev) = view_ids.insert(v.id.as_str(), idx) {
            issues.push(Issue::error(
                Some(&v.id),
                format!("视图 id 重复（第 {} 条与第 {} 条）", prev + 1, idx + 1),
            ));
        }
    }

    // 3. 每个物品的检查
    for item in &data.items {
        // 3a. 视图引用
        let view = match data.view(&item.view) {
            Some(v) => v,
            None => {
                issues.push(Issue::error(
                    Some(&item.name),
                    format!("引用了不存在的视图 '{}'", item.view),
                ));
                continue;
            }
        };

        // 3b. 尺寸
        if item.size <= 0.0 {
            issues.push(Issue::error(Some(&item.name), "size 必须为正数"));
            continue;
        }

        // 3c. 坐标越界（中心点 ± 半边长，形状按正方形外接估算）
        let half = item.size / 2.0;
        let (x, y) = (item.pos[0], item.pos[1]);
        if x - half < 0.0 || y - half < 0.0 || x + half > view.size[0] || y + half > view.size[1] {
            issues.push(Issue::error(
                Some(&item.name),
                format!(
                    "超出视图「{}」边界（{:.0}×{:.0}cm，物品中心 {:.1},{:.1} 半边长 {:.1}）",
                    view.name, view.size[0], view.size[1], x, y, half
                ),
            ));
        }

        // 3d. 维度值校验（枚举维度）
        for dim in &data.dimensions {
            if dim.kind != DimensionKind::Enum {
                continue;
            }
            match item.attr(&dim.key) {
                Some(v) => {
                    if !dim.values.is_empty() && !dim.values.iter().any(|x| x == v) {
                        issues.push(Issue::warning(
                            Some(&item.name),
                            format!("{} = '{}' 不在维度「{}」的定义取值内", dim.key, v, dim.name),
                        ));
                    }
                }
                None => {
                    issues.push(Issue::warning(
                        Some(&item.name),
                        format!("缺少维度「{}」（{}）", dim.name, dim.key),
                    ));
                }
            }
        }
    }

    issues
}

// ══════════════════════════════════════════════════════════
// 读写
// ══════════════════════════════════════════════════════════

/// 读取数据文件
pub fn load(path: &Path) -> Result<Data, CoreError> {
    let text = fs::read_to_string(path)?;
    let data: Data = toml_edit::de::from_str(&text)
        .map_err(|e| CoreError::De(e.message().to_owned()))?;
    Ok(data)
}

/// 写回数据文件（原子写 + 未变项原样搬运）
///
/// 策略：读入现有文档 → 逐数组对比 → 未变项搬原文（保注释/格式），
/// 变化/新增项重建，多余项删除 → 临时文件 + rename 落盘。
pub fn save(path: &Path, data: &Data) -> Result<(), CoreError> {
    let existing = if path.exists() { fs::read_to_string(path)? } else { String::new() };
    let mut doc: DocumentMut = existing.parse()?;

    // 旧值（用于差异对比）——直接用原始文本反序列化，避免 doc.to_string() 的重复序列化
    let old: Data = toml_edit::de::from_str(&existing).unwrap_or_default();

    // meta
    if doc.get("meta").is_none() {
        doc.insert("meta", TomlItem::Table(Table::new()));
    }
    if let Some(t) = doc.get_mut("meta").and_then(|v| v.as_table_mut()) {
        t["version"] = value(data.meta.version as i64);
    }

    sync_array(&mut doc, "dimension", "key", &old.dimensions, &data.dimensions, |d| d.key.as_str())?;
    sync_array(&mut doc, "view", "id", &old.views, &data.views, |v| v.id.as_str())?;
    sync_array(&mut doc, "item", "name", &old.items, &data.items, |i| i.name.as_str())?;

    // 原子写：临时文件 + rename（状态可见律：多进程读，写入必须原子）
    let tmp = path.with_extension("toml.tmp");
    fs::write(&tmp, doc.to_string())?;
    fs::rename(&tmp, path)?;
    Ok(())
}

/// 同步一个 `[[key]]` 数组：未变项搬原文，变化/新增重建，多余删除
///
/// 原地替换数组内容（保留 `key` 自身的装饰/头部注释）
fn sync_array<T>(
    doc: &mut DocumentMut,
    key: &str,
    id_field: &str,
    old: &[T],
    new: &[T],
    id_of: impl Fn(&T) -> &str,
) -> Result<(), CoreError>
where
    T: Serialize + DeserializeOwned + PartialEq,
{
    // 确保数组存在
    if doc.get(key).and_then(|v| v.as_array_of_tables()).is_none() {
        doc.insert(key, TomlItem::ArrayOfTables(ArrayOfTables::new()));
    }
    let orig = doc
        .get(key)
        .and_then(|v| v.as_array_of_tables())
        .cloned()
        .unwrap_or_default();

    // 旧值索引（HashMap：O(n²) 全量比较 → O(n) 查找）
    let old_index: std::collections::HashMap<&str, &T> =
        old.iter().map(|o| (id_of(o), o)).collect();

    let mut out = ArrayOfTables::new();
    for n in new {
        let nid = id_of(n);
        let unchanged = old_index.get(nid).map(|o| *o == n).unwrap_or(false);

        if unchanged {
            // 搬原文（保留该条目自身的格式与注释）
            if let Some(t) = orig
                .iter()
                .find(|t| t.get(id_field).and_then(|v| v.as_str()) == Some(nid))
            {
                out.push(t.clone());
                continue;
            }
        }
        // 变化或新增：重新构造
        out.push(to_table(n)?);
    }

    // 原地替换内容（保留 key 的头部注释）
    let arr = doc
        .get_mut(key)
        .and_then(|v| v.as_array_of_tables_mut())
        .ok_or_else(|| CoreError::Invalid(format!("{key} 不是数组表")))?;
    arr.clear();
    for t in out {
        arr.push(t);
    }
    Ok(())
}

/// 值 → TOML 表
fn to_table<T: Serialize>(v: &T) -> Result<Table, CoreError> {
    let s = toml_edit::ser::to_string(v)?;
    let d: DocumentMut = s.parse()?;
    Ok(d.as_table().clone())
}

// ══════════════════════════════════════════════════════════
// 测试
// ══════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Data {
        Data {
            meta: Meta::default(),
            dimensions: vec![
                Dimension {
                    key: "category".into(),
                    name: "分类".into(),
                    kind: DimensionKind::Enum,
                    values: vec!["电子类".into(), "衣物类".into()],
                },
                Dimension {
                    key: "status".into(),
                    name: "去向".into(),
                    kind: DimensionKind::Enum,
                    values: vec!["在位".into(), "带走".into(), "借出".into()],
                },
            ],
            views: vec![View { id: "desk".into(), name: "书桌桌面".into(), size: [120.0, 60.0] }],
            items: vec![Item {
                name: "手机".into(),
                view: "desk".into(),
                layer: 1,
                pos: [90.0, 15.0],
                size: 15.0,
                shape: Some("phone".into()),
                desc: None,
                attrs: HashMap::from([
                    ("category".to_string(), "电子类".to_string()),
                    ("status".to_string(), "在位".to_string()),
                ]),
            }],
        }
    }

    #[test]
    fn roundtrip_preserves_data() {
        let dir = std::env::temp_dir().join("inv-core-test");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("data.toml");

        let data = sample();
        save(&path, &data).unwrap();
        let loaded = load(&path).unwrap();
        assert_eq!(data, loaded);

        // 二次保存：未变项应保持稳定（幂等）
        let text1 = fs::read_to_string(&path).unwrap();
        save(&path, &loaded).unwrap();
        let text2 = fs::read_to_string(&path).unwrap();
        assert_eq!(text1, text2, "幂等性：未变数据二次保存输出应一致");
    }

    #[test]
    fn check_detects_duplicate_name() {
        let mut data = sample();
        let mut dup = data.items[0].clone();
        dup.pos = [10.0, 10.0];
        data.items.push(dup);
        let issues = check(&data);
        assert!(issues.iter().any(|i| i.message.contains("重复") && i.is_error()));
    }

    #[test]
    fn check_detects_out_of_bounds() {
        let mut data = sample();
        data.items[0].pos = [200.0, 15.0]; // 视图只有 120 宽
        let issues = check(&data);
        assert!(issues.iter().any(|i| i.message.contains("超出视图")));
    }

    #[test]
    fn check_detects_unknown_view() {
        let mut data = sample();
        data.items[0].view = "nope".into();
        let issues = check(&data);
        assert!(issues.iter().any(|i| i.message.contains("不存在的视图")));
    }

    #[test]
    fn save_preserves_comments() {
        // 契约 V5：新增物品时，原有注释/格式不丢
        let dir = std::env::temp_dir().join("inv-core-test-comments");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("data.toml");
        fs::write(
            &path,
            r#"# 文件头部注释

[[view]]
id = "desk"
name = "书桌桌面"
size = [120.0, 60.0]

# 手机这一条是重点物品
[[item]]
name = "手机"   # 行尾注释
view = "desk"
pos = [90.0, 15.0]
size = 15.0
"#,
        )
        .unwrap();

        let mut data = load(&path).unwrap();
        // 新增一个物品（手机、书桌均不变）
        data.items.push(Item {
            name: "充电器".into(),
            view: "desk".into(),
            layer: 1,
            pos: [10.0, 10.0],
            size: 8.0,
            shape: None,
            desc: None,
            attrs: Default::default(),
        });
        save(&path, &data).unwrap();

        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("# 文件头部注释"), "文件头部注释应保留\n---\n{text}");
        assert!(text.contains("# 手机这一条是重点物品"), "未变条目的前缀注释应保留\n---\n{text}");
        assert!(text.contains("# 行尾注释"), "未变条目的行尾注释应保留\n---\n{text}");
        assert!(text.contains("充电器"), "新增条目应写入");
    }

    #[test]
    fn load_rejects_broken_toml() {
        let dir = std::env::temp_dir().join("inv-core-test-broken");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("broken.toml");
        fs::write(&path, "[[item]\nname = ").unwrap();
        assert!(load(&path).is_err());
    }
}
