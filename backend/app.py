"""
backend/app.py
物品管理系统 API 服务 - Flask 实现
"""

from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
import database
import json
import os
import sys
from datetime import datetime

# 修复 Windows 控制台编码问题
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# 获取项目根目录
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = BASE_DIR

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')
CORS(app)  # 允许跨域请求

API_VERSION = '1.2.0'


def auto_import_backups():
    """自动导入 data/imports 文件夹中的备份文件"""
    imports_dir = os.path.join(BASE_DIR, 'data', 'imports')
    exports_dir = os.path.join(BASE_DIR, 'data', 'exports')
    
    # 确保目录存在
    os.makedirs(imports_dir, exist_ok=True)
    os.makedirs(exports_dir, exist_ok=True)
    
    # 查找 JSON 备份文件
    if not os.path.exists(imports_dir):
        return None
    
    backup_files = [f for f in os.listdir(imports_dir) if f.endswith('.json')]
    
    if not backup_files:
        return None
    
    # 按修改时间排序，取最新的
    backup_files.sort(key=lambda f: os.path.getmtime(os.path.join(imports_dir, f)), reverse=True)
    latest_backup = backup_files[0]
    backup_path = os.path.join(imports_dir, latest_backup)
    
    # 检查是否已经导入过（通过元数据判断）
    last_imported = database.get_metadata('last_imported_file')
    if last_imported == latest_backup:
        return f"已跳过（上次已导入）: {latest_backup}"
    
    try:
        with open(backup_path, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
        
        # 导入数据
        if database.import_all_data(backup_data):
            # 记录已导入的文件
            database.set_metadata('last_imported_file', latest_backup)
            
            # 将备份文件移到 exports 目录（已处理）
            try:
                exported_path = os.path.join(exports_dir, latest_backup)
                if backup_path != exported_path:
                    import shutil
                    shutil.move(backup_path, exported_path)
                return f"成功导入并归档: {latest_backup}（物品: {len(backup_data.get('items', []))}件）"
            except Exception as move_err:
                return f"成功导入: {latest_backup}（物品: {len(backup_data.get('items', []))}件）"
        else:
            return f"导入失败: {latest_backup}"
    except Exception as e:
        return f"读取失败: {latest_backup} - {str(e)}"


# 启动时自动导入
import_warn = auto_import_backups()
if import_warn:
    print(f"📁 {import_warn}")


# ==================== 根路由 ====================

@app.route('/')
def index():
    """返回前端页面"""
    return send_from_directory(STATIC_DIR, 'index.html')


@app.route('/api/status')
def status():
    """API 状态"""
    return jsonify({
        'service': '物品管理系统 API',
        'version': API_VERSION,
        'status': 'running',
        'database': database.get_db_path(),
        'mode': 'backend'
    })


# ==================== 物品 API ====================

@app.route('/api/items', methods=['GET'])
def get_items():
    """获取所有物品"""
    items = database.get_all_items()
    return jsonify(items)


@app.route('/api/items/<int:item_id>', methods=['GET'])
def get_item(item_id):
    """获取单个物品"""
    item = database.get_item(item_id)
    if item:
        return jsonify(item)
    return jsonify({'error': '物品不存在'}), 404


@app.route('/api/items', methods=['POST'])
def create_item():
    """添加物品"""
    data = request.json
    if not data or not data.get('name'):
        return jsonify({'error': '物品名称不能为空'}), 400
    
    item_id = database.add_item(data)
    item = database.get_item(item_id)
    return jsonify(item), 201


@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    """更新物品"""
    data = request.json
    if database.update_item(item_id, data):
        item = database.get_item(item_id)
        return jsonify(item)
    return jsonify({'error': '物品不存在'}), 404


@app.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    """删除物品"""
    if database.delete_item(item_id):
        return jsonify({'success': True})
    return jsonify({'error': '物品不存在'}), 404


@app.route('/api/items/by-view-layer/<view_id>/<layer_id>', methods=['GET'])
def get_items_by_view_layer(view_id, layer_id):
    """获取指定视图和层的物品"""
    items = database.get_items_by_view_layer(view_id, layer_id)
    return jsonify(items)


@app.route('/api/items/<int:item_id>/block', methods=['POST'])
def set_block(item_id):
    """设置物品色块"""
    data = request.json
    block_data = {
        'appearance': data.get('appearance'),
        'position': data.get('position')
    }
    database.update_item(item_id, {
        'hasBlock': True,
        'block': block_data
    })
    item = database.get_item(item_id)
    return jsonify(item)


@app.route('/api/items/<int:item_id>/block', methods=['DELETE'])
def delete_block(item_id):
    """删除物品色块"""
    database.update_item(item_id, {
        'hasBlock': False,
        'block': None
    })
    item = database.get_item(item_id)
    return jsonify(item)


@app.route('/api/items/<int:item_id>/move-to-layer', methods=['POST'])
def move_to_layer(item_id):
    """移动物品到指定层"""
    data = request.json
    new_layer_id = data.get('layerId')
    if not new_layer_id:
        return jsonify({'error': '层 ID 不能为空'}), 400
    
    if database.update_item(item_id, {'layerId': new_layer_id}):
        item = database.get_item(item_id)
        return jsonify(item)
    return jsonify({'error': '物品不存在'}), 404


# ==================== 层 API ====================

@app.route('/api/layers', methods=['GET'])
def get_layers():
    """获取所有层"""
    layers = database.get_all_layers()
    return jsonify(layers)


@app.route('/api/layers/by-view/<view_id>', methods=['GET'])
def get_layers_by_view(view_id):
    """获取指定视图的层"""
    layers = database.get_layers_by_view(view_id)
    return jsonify(layers)


@app.route('/api/layers', methods=['POST'])
def create_layer():
    """添加层"""
    data = request.json
    if not data or not data.get('name') or not data.get('viewId'):
        return jsonify({'error': '层名称和视图 ID 不能为空'}), 400
    
    layer_id = database.add_layer(data)
    return jsonify({'id': layer_id, 'success': True}), 201


@app.route('/api/layers/<layer_id>', methods=['PUT'])
def update_layer(layer_id):
    """更新层"""
    data = request.json
    if database.update_layer(layer_id, data):
        return jsonify({'success': True})
    return jsonify({'error': '层不存在'}), 404


@app.route('/api/layers/<layer_id>', methods=['DELETE'])
def delete_layer(layer_id):
    """删除层"""
    # 检查层是否有物品
    layers = database.get_all_layers()
    layer = next((l for l in layers if l['id'] == layer_id), None)
    
    if layer:
        items = database.get_items_by_view_layer(layer['viewId'], layer_id)
        if items:
            return jsonify({
                'error': '该层还有物品，请先移动或删除物品',
                'itemCount': len(items)
            }), 400
    
    if database.delete_layer(layer_id):
        return jsonify({'success': True})
    return jsonify({'error': '层不存在'}), 404


# ==================== 视图 API ====================

@app.route('/api/views', methods=['GET'])
def get_views():
    """获取所有视图"""
    views = database.get_all_views()
    return jsonify(views)


@app.route('/api/views', methods=['POST'])
def create_view():
    """添加视图"""
    data = request.json
    if not data or not data.get('name'):
        return jsonify({'error': '视图名称不能为空'}), 400
    
    view_id = database.add_view(data)
    return jsonify({'id': view_id, 'success': True}), 201


@app.route('/api/views/<view_id>', methods=['PUT'])
def update_view(view_id):
    """更新视图"""
    data = request.json
    if database.update_view(view_id, data):
        return jsonify({'success': True})
    return jsonify({'error': '视图不存在'}), 404


# ==================== 分类 API ====================

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """获取所有分类"""
    categories = database.get_all_categories()
    return jsonify(categories)


@app.route('/api/categories', methods=['POST'])
def add_category():
    """添加分类"""
    data = request.json
    name = data.get('name') if isinstance(data, dict) else data
    if not name:
        return jsonify({'success': False, 'message': '分类名称不能为空'}), 400
    
    if database.add_category(name):
        return jsonify({'success': True, 'message': '添加成功'})
    return jsonify({'success': False, 'message': '分类已存在'}), 400


@app.route('/api/categories/rename', methods=['POST'])
def rename_category():
    """重命名分类"""
    data = request.json
    old_name = data.get('oldName')
    new_name = data.get('newName')
    
    if not old_name or not new_name:
        return jsonify({'success': False, 'message': '参数不完整'}), 400
    
    # 检查新名称是否已存在
    categories = database.get_all_categories()
    if new_name in categories:
        return jsonify({'success': False, 'message': '新分类名已存在'}), 400
    
    if database.rename_category(old_name, new_name):
        return jsonify({'success': True, 'message': '重命名成功'})
    return jsonify({'success': False, 'message': '分类不存在'}), 404


@app.route('/api/categories/<name>', methods=['DELETE'])
def delete_category(name):
    """删除分类"""
    # 检查是否有物品使用该分类
    items = database.get_all_items()
    items_in_category = [i for i in items if i.get('category') == name]
    
    if items_in_category:
        return jsonify({
            'success': False,
            'message': f'该分类下还有{len(items_in_category)}件物品',
            'itemCount': len(items_in_category)
        }), 400
    
    if database.delete_category(name):
        return jsonify({'success': True, 'message': '删除成功'})
    return jsonify({'success': False, 'message': '分类不存在'}), 404


# ==================== 借用 API ====================

@app.route('/api/borrows', methods=['GET'])
def get_borrows():
    """获取所有借用记录"""
    borrows = database.get_all_borrows()
    return jsonify(borrows)


@app.route('/api/borrows', methods=['POST'])
def create_borrow():
    """添加借用记录"""
    data = request.json
    if not data or not data.get('itemId') or not data.get('borrowerName'):
        return jsonify({'error': '物品 ID 和借用人不能为空'}), 400
    
    borrow_id = database.add_borrow(data)
    
    # 更新物品状态为借出
    database.update_item(data['itemId'], {'status': '借出'})
    
    return jsonify({'id': borrow_id, 'success': True}), 201


@app.route('/api/borrows/<int:item_id>', methods=['DELETE'])
def return_item(item_id):
    """归还物品"""
    if database.delete_borrow(item_id):
        database.update_item(item_id, {'status': '在位'})
        return jsonify({'success': True})
    return jsonify({'error': '借用记录不存在'}), 404


# ==================== 备份 API ====================

@app.route('/api/backup', methods=['GET'])
def export_backup():
    """导出备份"""
    data = database.export_all_data()
    return jsonify(data)


@app.route('/api/backup/save', methods=['POST'])
def save_backup():
    """保存备份到 data/exports 目录"""
    data = request.json
    if not data:
        return jsonify({'success': False, 'message': '无数据'}), 400
    
    # 生成文件名
    filename = f"物品备份_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.json"
    exports_dir = os.path.join(BASE_DIR, 'data', 'exports')
    os.makedirs(exports_dir, exist_ok=True)
    
    filepath = os.path.join(exports_dir, filename)
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({
            'success': True, 
            'message': f'备份已保存: {filename}',
            'filename': filename
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'保存失败: {str(e)}'}), 500


@app.route('/api/backup/list', methods=['GET'])
def list_backups():
    """获取 exports 目录中的备份列表"""
    exports_dir = os.path.join(BASE_DIR, 'data', 'exports')
    os.makedirs(exports_dir, exist_ok=True)
    
    backup_files = [f for f in os.listdir(exports_dir) if f.endswith('.json')]
    # 按修改时间排序（最新的在前）
    backup_files.sort(key=lambda f: os.path.getmtime(os.path.join(exports_dir, f)), reverse=True)
    
    backups = []
    for filename in backup_files:
        filepath = os.path.join(exports_dir, filename)
        backups.append({
            'filename': filename,
            'size': os.path.getsize(filepath),
            'modified': datetime.fromtimestamp(os.path.getmtime(filepath)).strftime('%Y-%m-%d %H:%M:%S')
        })
    
    return jsonify({
        'success': True,
        'backups': backups,
        'latest': backups[0]['filename'] if backups else None
    })


@app.route('/api/backup/load-latest', methods=['GET'])
def load_latest_backup():
    """自动读取 exports 目录中的最新备份"""
    exports_dir = os.path.join(BASE_DIR, 'data', 'exports')
    os.makedirs(exports_dir, exist_ok=True)
    
    backup_files = [f for f in os.listdir(exports_dir) if f.endswith('.json')]
    if not backup_files:
        return jsonify({'success': False, 'message': '没有找到备份文件'}), 404
    
    # 按修改时间排序，取最新的
    backup_files.sort(key=lambda f: os.path.getmtime(os.path.join(exports_dir, f)), reverse=True)
    latest_backup = backup_files[0]
    filepath = os.path.join(exports_dir, latest_backup)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
        
        # 导入到数据库
        if database.import_all_data(backup_data):
            return jsonify({
                'success': True, 
                'message': f'已加载最新备份: {latest_backup}',
                'filename': latest_backup,
                'data': backup_data
            })
        return jsonify({'success': False, 'message': '导入数据库失败'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': f'读取失败: {str(e)}'}), 500


@app.route('/api/backup/latest', methods=['GET'])
def get_latest_backup():
    """获取最新备份内容（不导入，仅查看）"""
    exports_dir = os.path.join(BASE_DIR, 'data', 'exports')
    os.makedirs(exports_dir, exist_ok=True)
    
    backup_files = [f for f in os.listdir(exports_dir) if f.endswith('.json')]
    if not backup_files:
        return jsonify({'success': False, 'message': '没有找到备份文件'}), 404
    
    # 按修改时间排序，取最新的
    backup_files.sort(key=lambda f: os.path.getmtime(os.path.join(exports_dir, f)), reverse=True)
    latest_backup = backup_files[0]
    filepath = os.path.join(exports_dir, latest_backup)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
        return jsonify({
            'success': True,
            'filename': latest_backup,
            'data': backup_data
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'读取失败: {str(e)}'}), 500


@app.route('/api/backup', methods=['POST'])
def import_backup():
    """导入备份"""
    data = request.json
    if database.import_all_data(data):
        return jsonify({'success': True, 'message': '导入成功'})
    return jsonify({'success': False, 'message': '导入失败'}), 400


@app.route('/api/backup/download', methods=['GET'])
def download_backup():
    """下载备份文件"""
    data = database.export_all_data()
    filename = f"物品备份_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    from io import BytesIO
    buffer = BytesIO()
    buffer.write(json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8'))
    buffer.seek(0)
    
    from flask import make_response
    response = make_response(buffer.getvalue())
    response.headers['Content-Type'] = 'application/json; charset=utf-8'
    response.headers['Content-Disposition'] = f'attachment; filename={filename}'
    return response


# ==================== 统计 API ====================

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """获取统计数据"""
    stats = database.get_stats()
    return jsonify(stats)


@app.route('/api/metadata', methods=['GET'])
def get_metadata():
    """获取元数据"""
    version = database.get_metadata('version') or '1.0'
    last_update = database.get_metadata('last_update')
    return jsonify({
        'version': version,
        'lastUpdate': last_update
    })


# ==================== 重置 API ====================

@app.route('/api/reset', methods=['POST'])
def reset_all():
    """重置所有数据"""
    database.reset_database()
    return jsonify({'success': True, 'message': '数据已重置'})


# ==================== 启动 ====================

if __name__ == '__main__':
    print(f"""
╔══════════════════════════════════════════════════════════╗
║              物品管理系统 API 服务                       ║
║              Version {API_VERSION}                            ║
╠══════════════════════════════════════════════════════════╣
║  启动地址: http://localhost:8888                          ║
║  数据库: {database.get_db_path()}
║  静态文件: {STATIC_DIR}
╚══════════════════════════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=8888, debug=True)
