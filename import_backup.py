"""
导入备份数据到数据库
"""
import requests
import json
import os

# 读取备份文件
backup_path = os.path.join(os.path.dirname(__file__), '物品备份', '物品备份_2026-03-25.json')

with open(backup_path, 'r', encoding='utf-8') as f:
    backup = json.load(f)

print(f"读取备份文件: {backup_path}")
print(f"物品数量: {len(backup.get('items', []))}")
print(f"分类数量: {len(backup.get('categories', []))}")
print(f"视图数量: {len(backup.get('views', []))}")
print(f"借用记录: {len(backup.get('borrows', []))}")

# 发送到后端 API
try:
    response = requests.post('http://localhost:5000/api/backup', json=backup, timeout=30)
    result = response.json()
    print(f"\n导入结果: {result}")
except Exception as e:
    print(f"\n导入失败: {e}")
    print("确保后端服务正在运行 (python start_server.py)")
