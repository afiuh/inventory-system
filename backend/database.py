"""
backend/database.py
物品管理系统数据库模块 - SQLite 实现
"""

import sqlite3
import json
from datetime import datetime
from contextlib import contextmanager
import os

# 数据库文件路径
DB_PATH = os.path.join(os.path.dirname(__file__), 'inventory.db')


def get_db_path():
    """获取数据库文件路径"""
    return DB_PATH


@contextmanager
def get_connection():
    """数据库连接上下文管理器"""
    conn = sqlite3.connect(DB_PATH, timeout=60, isolation_level='DEFERRED')
    conn.row_factory = sqlite3.Row
    # 启用 WAL 模式，提高并发性能
    conn.execute('PRAGMA journal_mode=WAL')
    # 增加 busy_timeout，等待锁释放
    conn.execute('PRAGMA busy_timeout=60000')
    try:
        yield conn
        conn.commit()
    except sqlite3.OperationalError as e:
        if 'locked' in str(e).lower():
            conn.rollback()
            # 等待后重试
            import time
            for attempt in range(3):
                time.sleep(1)
                try:
                    conn.execute('PRAGMA busy_timeout=60000')
                    conn.commit()
                    return
                except:
                    pass
        conn.rollback()
        raise e
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def init_database():
    """初始化数据库表结构"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # 物品表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT DEFAULT '其他',
                status TEXT DEFAULT '在位',
                view_id TEXT,
                layer_id TEXT,
                description TEXT DEFAULT '',
                note TEXT DEFAULT '',
                has_block INTEGER DEFAULT 0,
                block_data TEXT,
                label_enabled INTEGER DEFAULT 0,
                label_position TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        ''')
        
        # 尝试添加新字段（兼容旧数据库）
        try:
            cursor.execute('ALTER TABLE items ADD COLUMN label_enabled INTEGER DEFAULT 0')
        except:
            pass
        try:
            cursor.execute('ALTER TABLE items ADD COLUMN label_position TEXT')
        except:
            pass
        
        # 层表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS layers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                view_id TEXT NOT NULL,
                order_index INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        ''')
        
        # 借用记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS borrows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                borrower_name TEXT NOT NULL,
                borrow_date TEXT,
                return_date TEXT,
                note TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
            )
        ''')
        
        # 视图配置表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS views (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                group_name TEXT DEFAULT '',
                width REAL DEFAULT 100,
                height REAL DEFAULT 100,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        ''')
        
        # 分类表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                name TEXT PRIMARY KEY
            )
        ''')
        
        # 元数据表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        ''')
        
        print("数据库初始化完成")


# ==================== 物品 CRUD ====================

def get_all_items():
    """获取所有物品"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM items ORDER BY id DESC')
        rows = cursor.fetchall()
        return [_row_to_dict(row) for row in rows]


def get_item(item_id):
    """获取单个物品"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM items WHERE id = ?', (item_id,))
        row = cursor.fetchone()
        return _row_to_dict(row) if row else None


def add_item(item_data):
    """添加物品"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO items (name, category, status, view_id, layer_id, 
                             description, note, has_block, block_data,
                             label_enabled, label_position)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            item_data.get('name'),
            item_data.get('category', '其他'),
            item_data.get('status', '在位'),
            item_data.get('viewId'),
            item_data.get('layerId'),
            item_data.get('description', ''),
            item_data.get('note', ''),
            1 if item_data.get('hasBlock') else 0,
            json.dumps(item_data.get('block')) if item_data.get('block') else None,
            1 if item_data.get('labelEnabled') else 0,
            json.dumps(item_data.get('labelPosition')) if item_data.get('labelPosition') else None
        ))
        return cursor.lastrowid


def update_item(item_id, updates):
    """更新物品"""
    fields = []
    values = []
    
    mapping = {
        'name': 'name',
        'category': 'category',
        'status': 'status',
        'viewId': 'view_id',
        'layerId': 'layer_id',
        'description': 'description',
        'note': 'note',
        'hasBlock': 'has_block',
        'block': 'block_data',
        'labelEnabled': 'label_enabled',
        'labelPosition': 'label_position'
    }
    
    for key, db_key in mapping.items():
        if key in updates:
            if key == 'hasBlock':
                values.append(1 if updates[key] else 0)
            elif key == 'labelEnabled':
                values.append(1 if updates[key] else 0)
            elif key == 'block':
                values.append(json.dumps(updates[key]) if updates[key] else None)
            elif key == 'labelPosition':
                values.append(json.dumps(updates[key]) if updates[key] else None)
            else:
                values.append(updates[key])
            fields.append(f"{db_key} = ?")
    
    fields.append("updated_at = datetime('now', 'localtime')")
    values.append(item_id)
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE items SET {', '.join(fields)} WHERE id = ?",
            values
        )
        return cursor.rowcount > 0


def delete_item(item_id):
    """删除物品"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM items WHERE id = ?', (item_id,))
        return cursor.rowcount > 0


def get_items_by_view_layer(view_id, layer_id):
    """获取指定视图和层的物品"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM items 
            WHERE view_id = ? AND layer_id = ? AND has_block = 1
        ''', (view_id, layer_id))
        rows = cursor.fetchall()
        return [_row_to_dict(row) for row in rows]


# ==================== 层管理 ====================

def get_all_layers():
    """获取所有层"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM layers ORDER BY view_id, order_index')
        rows = cursor.fetchall()
        return [_row_to_dict(row) for row in rows]


def get_layers_by_view(view_id):
    """获取指定视图的层"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM layers WHERE view_id = ? ORDER BY order_index', (view_id,))
        rows = cursor.fetchall()
        return [_row_to_dict(row) for row in rows]


def add_layer(layer_data):
    """添加层"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO layers (id, name, view_id, order_index)
            VALUES (?, ?, ?, ?)
        ''', (
            layer_data['id'],
            layer_data['name'],
            layer_data['viewId'],
            layer_data.get('order', 0)
        ))
        return layer_data['id']


def update_layer(layer_id, updates):
    """更新层"""
    fields = []
    values = []
    
    for key, db_key in [('name', 'name'), ('viewId', 'view_id'), ('order', 'order_index')]:
        if key in updates:
            values.append(updates[key])
            fields.append(f"{db_key} = ?")
    
    if fields:
        values.append(layer_id)
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"UPDATE layers SET {', '.join(fields)} WHERE id = ?",
                values
            )
            return cursor.rowcount > 0
    return False


def delete_layer(layer_id):
    """删除层"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM layers WHERE id = ?', (layer_id,))
        return cursor.rowcount > 0


# ==================== 借用记录 ====================

def get_all_borrows():
    """获取所有借用记录"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT b.*, i.name as item_name 
            FROM borrows b 
            LEFT JOIN items i ON b.item_id = i.id 
            ORDER BY b.id DESC
        ''')
        rows = cursor.fetchall()
        return [_row_to_dict(row) for row in rows]


def add_borrow(borrow_data):
    """添加借用记录"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO borrows (item_id, borrower_name, borrow_date, note)
            VALUES (?, ?, ?, ?)
        ''', (
            borrow_data['itemId'],
            borrow_data['borrowerName'],
            borrow_data.get('borrowDate'),
            borrow_data.get('note', '')
        ))
        return cursor.lastrowid


def delete_borrow(item_id):
    """删除借用记录（归还物品）"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM borrows WHERE item_id = ?', (item_id,))
        return cursor.rowcount > 0


# ==================== 视图配置 ====================

def get_all_views():
    """获取所有视图"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM views ORDER BY id')
        rows = cursor.fetchall()
        return [_row_to_dict(row) for row in rows]


def add_view(view_data):
    """添加视图"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO views (id, name, group_name, width, height)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            view_data['id'],
            view_data['name'],
            view_data.get('group', ''),
            view_data.get('width', 100),
            view_data.get('height', 100)
        ))
        return view_data['id']


def update_view(view_id, updates):
    """更新视图"""
    fields = []
    values = []
    
    for key, db_key in [('name', 'name'), ('group', 'group_name'), 
                        ('width', 'width'), ('height', 'height')]:
        if key in updates:
            values.append(updates[key])
            fields.append(f"{db_key} = ?")
    
    if fields:
        fields.append("updated_at = datetime('now', 'localtime')")
        values.append(view_id)
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"UPDATE views SET {', '.join(fields)} WHERE id = ?",
                values
            )
            return cursor.rowcount > 0
    return False


# ==================== 分类管理 ====================

def get_all_categories():
    """获取所有分类"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT name FROM categories ORDER BY name')
        rows = cursor.fetchall()
        return [row['name'] for row in rows]


def add_category(name):
    """添加分类"""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('INSERT INTO categories (name) VALUES (?)', (name,))
            return True
    except sqlite3.IntegrityError:
        return False


def delete_category(name):
    """删除分类"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM categories WHERE name = ?', (name,))
        return cursor.rowcount > 0


def rename_category(old_name, new_name):
    """重命名分类"""
    with get_connection() as conn:
        cursor = conn.cursor()
        # 更新分类表
        cursor.execute('UPDATE categories SET name = ? WHERE name = ?', (new_name, old_name))
        # 更新物品表中的分类
        cursor.execute('UPDATE items SET category = ? WHERE category = ?', (new_name, old_name))
        return cursor.rowcount > 0


# ==================== 元数据 ====================

def get_metadata(key):
    """获取元数据"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT value FROM metadata WHERE key = ?', (key,))
        row = cursor.fetchone()
        return row['value'] if row else None


def set_metadata(key, value):
    """设置元数据"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)
        ''', (key, value))


# ==================== 备份与恢复 ====================

def export_all_data():
    """导出所有数据"""
    return {
        'version': get_metadata('version') or '1.0',
        'exportDate': datetime.now().isoformat(),
        'items': get_all_items(),
        'layers': get_all_layers(),
        'borrows': get_all_borrows(),
        'views': get_all_views(),
        'categories': get_all_categories()
    }


def import_all_data(data):
    """导入所有数据"""
    # 先在连接外部设置 PRAGMA
    conn = sqlite3.connect(DB_PATH, timeout=60)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA busy_timeout=60000')
    conn.row_factory = sqlite3.Row
    
    try:
        cursor = conn.cursor()
        
        # 清空现有数据
        cursor.execute('DELETE FROM items')
        cursor.execute('DELETE FROM layers')
        cursor.execute('DELETE FROM borrows')
        cursor.execute('DELETE FROM views')
        cursor.execute('DELETE FROM categories')
        
        # 使用 executemany 进行批量插入
        # 导入物品
        if 'items' in data:
            items_data = [
                (
                    item.get('id'),
                    item.get('name'),
                    item.get('category', '其他'),
                    item.get('status', '在位'),
                    item.get('viewId'),
                    item.get('layerId'),
                    item.get('description', ''),
                    item.get('note', ''),
                    1 if item.get('hasBlock') else 0,
                    json.dumps(item.get('block')) if item.get('block') else None,
                    1 if item.get('labelEnabled') else 0,
                    json.dumps(item.get('labelPosition')) if item.get('labelPosition') else None,
                    item.get('createdAt'),
                    item.get('updatedAt')
                )
                for item in data['items']
            ]
            cursor.executemany('''
                INSERT INTO items (id, name, category, status, view_id, layer_id,
                                 description, note, has_block, block_data,
                                 label_enabled, label_position, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', items_data)
        
        # 导入层
        if 'layers' in data:
            layers_data = [
                (
                    layer.get('id'),
                    layer.get('name'),
                    layer.get('viewId'),
                    layer.get('order', 0),
                    layer.get('createdAt')
                )
                for layer in data['layers']
            ]
            cursor.executemany('''
                INSERT INTO layers (id, name, view_id, order_index, created_at)
                VALUES (?, ?, ?, ?, ?)
            ''', layers_data)
        
        # 导入借用记录
        if 'borrows' in data:
            borrows_data = [
                (
                    borrow.get('id'),
                    borrow.get('itemId'),
                    borrow.get('borrowerName'),
                    borrow.get('borrowDate'),
                    borrow.get('note', ''),
                    borrow.get('createdAt')
                )
                for borrow in data['borrows']
            ]
            cursor.executemany('''
                INSERT INTO borrows (id, item_id, borrower_name, borrow_date, note, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', borrows_data)
        
        # 导入视图
        if 'views' in data:
            views_data = [
                (
                    view.get('id'),
                    view.get('name'),
                    view.get('group', ''),
                    view.get('width', 100),
                    view.get('height', 100),
                    view.get('createdAt'),
                    view.get('updatedAt')
                )
                for view in data['views']
            ]
            cursor.executemany('''
                INSERT INTO views (id, name, group_name, width, height, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', views_data)
        
        # 导入分类
        if 'categories' in data:
            cursor.executemany('INSERT INTO categories (name) VALUES (?)',
                              [(cat,) for cat in data['categories']])
        
        # 更新版本
        if 'version' in data:
            cursor.execute('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
                          ('version', data['version']))
        
        conn.commit()
        return True
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def reset_database():
    """重置数据库"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM items')
        cursor.execute('DELETE FROM layers')
        cursor.execute('DELETE FROM borrows')
        cursor.execute('DELETE FROM views')
        cursor.execute('DELETE FROM categories')


# ==================== 统计 ====================

def get_stats():
    """获取统计数据"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) as total FROM items')
        total = cursor.fetchone()['total']
        
        cursor.execute('SELECT COUNT(*) as count FROM items WHERE has_block = 1')
        with_block = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM items WHERE status = '在位'")
        in_place = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM items WHERE status = '带走'")
        taken = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) as count FROM items WHERE status = '借出'")
        borrowed = cursor.fetchone()['count']
        
        return {
            'total': total,
            'withBlock': with_block,
            'inPlace': in_place,
            'taken': taken,
            'borrowed': borrowed
        }


# ==================== 辅助函数 ====================

def _row_to_dict(row):
    """将数据库行转换为字典"""
    if not row:
        return None
    
    d = dict(row)
    
    # 转换字段名：下划线 -> 驼峰
    result = {}
    for key, value in d.items():
        if key == 'view_id':
            result['viewId'] = value
        elif key == 'layer_id':
            result['layerId'] = value
        elif key == 'has_block':
            result['hasBlock'] = bool(value)
        elif key == 'block_data':
            result['block'] = json.loads(value) if value else None
        elif key == 'group_name':
            result['group'] = value
        elif key == 'order_index':
            result['order'] = value
        elif key == 'item_name':
            result['itemName'] = value
        elif key == 'item_id':
            result['itemId'] = value
        elif key == 'borrower_name':
            result['borrowerName'] = value
        elif key == 'borrow_date':
            result['borrowDate'] = value
        elif key == 'return_date':
            result['returnDate'] = value
        elif key == 'created_at':
            result['createdAt'] = value
        elif key == 'updated_at':
            result['updatedAt'] = value
        elif key == 'label_enabled':
            result['labelEnabled'] = bool(value) if value is not None else False
        elif key == 'label_position':
            result['labelPosition'] = json.loads(value) if value else None
        else:
            result[key] = value
    
    return result


# ==================== 元数据管理 ====================

def get_metadata(key):
    """获取元数据"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT value FROM metadata WHERE key = ?', (key,))
        row = cursor.fetchone()
        return row['value'] if row else None


def set_metadata(key, value):
    """设置元数据"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)
        ''', (key, value))


# 初始化数据库
init_database()
