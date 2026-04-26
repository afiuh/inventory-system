# -*- coding: utf-8 -*-
"""
测试备份文件导入
"""
import sys
import os
import json
import time

# 添加 Python 路径
SITE_PACKAGES = r'C:\Users\c3458\AppData\Local\Programs\Python\Python312\Lib\site-packages'
if SITE_PACKAGES not in sys.path:
    sys.path.insert(0, SITE_PACKAGES)

# 添加 backend 目录
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
sys.path.insert(0, backend_dir)

print("=" * 60)
print("测试备份文件导入")
print("=" * 60)

# 1. 读取备份文件
print("\n[1] 读取备份文件...")
imports_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'imports')
backup_path = os.path.join(imports_dir, '物品备份_2026-03-25.json')

if not os.path.exists(backup_path):
    print(f"    [ERROR] 备份文件不存在: {backup_path}")
    sys.exit(1)

try:
    with open(backup_path, 'r', encoding='utf-8') as f:
        backup_data = json.load(f)
    print(f"    [OK] 备份文件读取成功")
    print(f"         物品数量: {len(backup_data.get('items', []))}")
    print(f"         分类数量: {len(backup_data.get('categories', []))}")
    print(f"         视图数量: {len(backup_data.get('views', []))}")
    print(f"         借用记录: {len(backup_data.get('borrows', []))}")
except Exception as e:
    print(f"    [ERROR] 读取失败: {e}")
    sys.exit(1)

# 2. 导入数据库
print("\n[2] 导入数据库...")
import database

try:
    start_time = time.time()
    success = database.import_all_data(backup_data)
    elapsed = time.time() - start_time
    
    if success:
        print(f"    [OK] 导入成功！耗时: {elapsed:.2f}秒")
    else:
        print(f"    [ERROR] 导入失败")
        sys.exit(1)
except Exception as e:
    print(f"    [ERROR] 导入异常: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 3. 验证导入结果
print("\n[3] 验证导入结果...")
items = database.get_all_items()
categories = database.get_all_categories()
views = database.get_all_views()
stats = database.get_stats()

print(f"    物品总数: {stats['total']}")
print(f"    在位: {stats['inPlace']}")
print(f"    借出: {stats['borrowed']}")
print(f"    带走: {stats['taken']}")
print(f"    分类数: {len(categories)}")
print(f"    视图数: {len(views)}")

# 4. 显示部分物品
print("\n[4] 部分物品列表 (前5个):")
for i, item in enumerate(items[:5]):
    print(f"    {i+1}. {item['name']} - {item['category']} - {item['status']}")

print("\n" + "=" * 60)
print("测试完成！备份文件导入成功！")
print("=" * 60)
