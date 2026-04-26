# -*- coding: utf-8 -*-
"""
测试数据库导入功能
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

print("=" * 50)
print("测试数据库导入功能")
print("=" * 50)

# 1. 测试数据库连接
print("\n[1] 测试数据库连接...")
try:
    import database
    print("    [OK] 数据库模块加载成功")
except Exception as e:
    print(f"    [ERROR] 数据库加载失败: {e}")
    sys.exit(1)

# 2. 获取当前数据
print("\n[2] 获取当前数据...")
items = database.get_all_items()
print(f"    当前物品数量: {len(items)}")

# 3. 创建测试数据
print("\n[3] 创建测试数据...")
test_data = {
    "version": "1.0",
    "exportDate": "2026-04-26T12:00:00.000Z",
    "items": [
        {
            "id": 9999,
            "name": "测试物品",
            "category": "测试分类",
            "status": "在位",
            "viewId": "test",
            "layerId": "layer_test",
            "description": "这是测试数据",
            "note": "",
            "hasBlock": True,
            "block": {"test": True},
            "labelEnabled": False,
            "createdAt": "2026-04-26T12:00:00",
            "updatedAt": "2026-04-26T12:00:00"
        }
    ],
    "layers": [],
    "borrows": [],
    "views": [],
    "categories": ["测试分类"]
}

# 4. 导入测试数据
print("\n[4] 导入测试数据...")
try:
    success = database.import_all_data(test_data)
    if success:
        print("    [OK] 导入成功")
    else:
        print("    [ERROR] 导入失败")
except Exception as e:
    print(f"    [ERROR] 导入异常: {e}")
    import traceback
    traceback.print_exc()

# 5. 验证导入结果
print("\n[5] 验证导入结果...")
items = database.get_all_items()
print(f"    物品数量: {len(items)}")

# 查找测试物品
test_item = next((i for i in items if i['name'] == '测试物品'), None)
if test_item:
    print(f"    [OK] 找到测试物品: {test_item['name']}")
    print(f"         分类: {test_item['category']}")
    print(f"         状态: {test_item['status']}")
else:
    print("    [WARNING] 未找到测试物品")

# 6. 获取统计数据
print("\n[6] 获取统计数据...")
stats = database.get_stats()
print(f"    总数: {stats['total']}")
print(f"    在位: {stats['inPlace']}")
print(f"    借出: {stats['borrowed']}")
print(f"    带走: {stats['taken']}")

# 7. 多次写入测试（模拟并发）
print("\n[7] 多次写入测试（3次循环）...")
for i in range(3):
    try:
        update_data = {"name": f"测试物品_{i+1}"}
        result = database.update_item(9999, update_data)
        print(f"    第{i+1}次更新: {'成功' if result else '失败'}")
    except Exception as e:
        print(f"    第{i+1}次更新异常: {e}")
    time.sleep(0.5)

# 8. 清理测试数据
print("\n[8] 清理测试数据...")
try:
    database.delete_item(9999)
    print("    [OK] 测试数据已清理")
except Exception as e:
    print(f"    [WARNING] 清理失败: {e}")

print("\n" + "=" * 50)
print("测试完成！")
print("=" * 50)
