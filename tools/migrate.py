#!/usr/bin/env python3
"""数据迁移：原系统 JSON → 新格式 data.toml

坐标重建：原数据像素坐标（乱）→ 按视图包围盒归一化 → 映射到视图真实 cm 范围。
"""
import json
import sys
from collections import defaultdict

SRC = '/mnt/data/AI自由工作区/inventory-system/物品备份/物品备份_2026-03-25.json'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/mnt/data/AI自由工作区/inventory/data.toml'

MARGIN_CM = 3.0  # 视图边缘留白

SHAPE_MAP = {'rectangle': 'box', 'circle': 'round', 'irregular': 'blob'}

d = json.load(open(SRC))
views, items, layers = d['views'], d['items'], d['layers']

# layerId → 层号（用 layers 表里的 order，解析 id 不可靠——存在时间戳格式的脏数据）
layer_no = {l['id']: l.get('order', 0) + 1 for l in layers}

by_view = defaultdict(list)
for it in items:
    if it.get('hasBlock') and it.get('block'):
        by_view[it['viewId']].append(it)

L = []
L.append('# 物品管理系统 · 数据文件')
L.append('# 说明：cm 坐标（物品 pos 为中心点）；形状自带比例，size 为长边')
L.append('# 迁移自：物品备份_2026-03-25.json（原系统 v1.0）')
L.append('')
L.append('[meta]')
L.append('version = 2')
L.append('')

# ── 维度定义 ──
L.append('# ═══ 维度定义（驱动 TUI 列与校验）═══')
L.append('')
L.append('[[dimension]]')
L.append('key = "location"')
L.append('name = "位置"')
L.append('kind = "tree"')
L.append('')
L.append('[[dimension]]')
L.append('key = "category"')
L.append('name = "分类"')
L.append('kind = "enum"')
cats = d['categories']
L.append('values = [' + ', '.join(f'"{c}"' for c in cats) + ']')
L.append('')
L.append('[[dimension]]')
L.append('key = "status"')
L.append('name = "去向"')
L.append('kind = "enum"')
L.append('values = ["在位", "带走", "借出"]')
L.append('')
L.append('[[dimension]]')
L.append('key = "condition"')
L.append('name = "状态"')
L.append('kind = "enum"')
L.append('values = ["正常", "待补充", "待维护"]')
L.append('')

# ── 视图 ──
L.append('# ═══ 视图 ═══')
L.append('')
for v in views:
    L.append('[[view]]')
    L.append(f'id = "{v["id"]}"')
    L.append(f'name = "{v["name"]}"')
    L.append(f'size = [{float(v["width"])}, {float(v["height"])}]')
    L.append('')

# ── 物品 ──
L.append('# ═══ 物品 ═══')
L.append('')

stats = defaultdict(int)
for v in views:
    vitems = by_view.get(v['id'], [])
    if not vitems:
        continue
    L.append(f'# ── {v["name"]}（{len(vitems)} 件）──')
    L.append('')

    # 包围盒 → 等比映射到视图 cm 范围
    xs, ys, xe, ye = [], [], [], []
    for it in vitems:
        b = it['block']
        px, py = b['position']['x'], b['position']['y']
        w, h = b['appearance']['size']['width'], b['appearance']['size']['height']
        xs.append(px); ys.append(py); xe.append(px + w); ye.append(py + h)
    minx, maxx = min(xs), max(xe)
    miny, maxy = min(ys), max(ye)
    bw, bh = max(maxx - minx, 1), max(maxy - miny, 1)
    vw, vh = float(v['width']), float(v['height'])
    avail_w, avail_h = vw - 2 * MARGIN_CM, vh - 2 * MARGIN_CM
    k = min(avail_w / bw, avail_h / bh)
    off_x = MARGIN_CM + (avail_w - bw * k) / 2
    off_y = MARGIN_CM + (avail_h - bh * k) / 2

    for it in vitems:
        b = it['block']
        px, py = b['position']['x'], b['position']['y']
        w, h = b['appearance']['size']['width'], b['appearance']['size']['height']
        # 中心点（cm）
        cx = off_x + (px + w / 2 - minx) * k
        cy = off_y + (py + h / 2 - miny) * k
        size = max(max(w, h) * k, 1.5)
        shape = SHAPE_MAP.get(b['appearance']['shape'], 'box')
        layer = layer_no.get(it.get('layerId', ''), 1)
        desc_parts = [x for x in [it.get('description', ''), it.get('note', '')] if x]
        desc = ' / '.join(desc_parts)

        L.append('[[item]]')
        L.append(f'name = "{it["name"]}"')
        L.append(f'view = "{v["id"]}"')
        L.append(f'layer = {layer}')
        L.append(f'pos = [{cx:.1f}, {cy:.1f}]')
        L.append(f'size = {size:.1f}')
        L.append(f'shape = "{shape}"')
        if desc:
            L.append(f'desc = "{desc}"')
        L.append(f'category = "{it["category"]}"')
        L.append(f'status = "{it["status"]}"')
        L.append('condition = "正常"')
        L.append('')
        stats[v['name']] += 1

open(OUT, 'w').write('\n'.join(L))
n_items = sum(stats.values())
print(f'输出: {OUT}')
print(f'物品: {n_items} 件 · 视图: {len(views)} 个 · 行数: {len(L)}')
for k, n in stats.items():
    print(f'  {k}: {n}')
