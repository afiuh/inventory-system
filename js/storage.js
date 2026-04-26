// js/storage.js

// ✅ 新增：初始数据常量（解决 ReferenceError）
const INITIAL_ITEMS = [];
const INITIAL_BORROWS = [];

const Storage = {
    // 存储键名
    KEYS: {
        ITEMS: 'inventory_items',
        LAYERS: 'inventory_layers',
        BORROWS: 'inventory_borrows',
        VERSION: 'inventory_version',
        LAST_UPDATE: 'inventory_last_update',
        VIEWS: 'inventory_views',
        CATEGORIES: 'inventory_categories'
    },

    // 初始化存储
    init() {
        // 首次使用时加载初始数据
        if (!localStorage.getItem(this.KEYS.ITEMS)) {
            this.saveItems(INITIAL_ITEMS);  // ✅ 现在有定义了
        }
        if (!localStorage.getItem(this.KEYS.LAYERS)) {
            this.saveLayers([]);  // ✅ 层由视图初始化时创建
        }
        if (!localStorage.getItem(this.KEYS.BORROWS)) {
            this.saveBorrows(INITIAL_BORROWS);  // ✅ 现在有定义了
        }
        // ✅ 视图和分类由 data.js 的 initViews() 和 initCategories() 初始化
        this.saveVersion('1.0');
        this.saveLastUpdate();
    },

    // 初始化默认层（每个视图默认 1 层）
    initDefaultLayers() {
        const defaultLayers = [];
        VIEW_CONFIG.forEach((view, index) => {
            defaultLayers.push({
                id: `layer_${view.id}_1`,
                name: '第一层',
                viewId: view.id,
                order: 0,
                createdAt: Date.now()
            });
        });
        return defaultLayers;
    },

    // ==================== 物品管理 ====================

    // 保存物品数据
    saveItems(items) {
        localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));
        this.saveLastUpdate();
    },

    // 加载物品数据
    loadItems() {
        const data = localStorage.getItem(this.KEYS.ITEMS);
        return data ? JSON.parse(data) : [];
    },

    // 获取单个物品
    getItem(id) {
        const items = this.loadItems();
        return items.find(item => item.id === id);
    },

    // 添加物品
    addItem(item) {
        const items = this.loadItems();
        item.id = Date.now();
        item.createdAt = Date.now();
        item.updatedAt = Date.now();
        items.push(item);
        this.saveItems(items);
        return item;
    },

    // 更新物品（深拷贝保护嵌套对象）
    updateItem(id, updates) {
        const items = this.loadItems();
        const index = items.findIndex(item => item.id === id);
        if (index !== -1) {
            items[index] = {
                ...items[index],
                ...updates,
                block: updates.block ? JSON.parse(JSON.stringify(updates.block)) : items[index].block,
                updatedAt: Date.now()
            };
            this.saveItems(items);
            return items[index];
        }
        console.error(`updateItem: 未找到物品 ${id}`);
        return null;
    },

    // 删除物品
    deleteItem(id) {
        const items = this.loadItems();
        const newItems = items.filter(item => item.id !== id);
        this.saveItems(newItems);
        return newItems.length < items.length;
    },

    // 添加/更新色块
    setBlock(itemId, blockData) {
        if (!blockData || !blockData.appearance || !blockData.position) {
            console.error(`setBlock: 无效的色块数据`, blockData);
            return null;
        }

        const items = this.loadItems();
        const index = items.findIndex(item => item.id === itemId);
        if (index !== -1) {
            items[index].hasBlock = true;
            items[index].block = JSON.parse(JSON.stringify(blockData));
            items[index].updatedAt = Date.now();
            this.saveItems(items);
            return items[index];
        }
        console.error(`setBlock: 未找到物品 ${itemId}`);
        return null;
    },

    // 删除色块（保留物品）
    deleteBlock(itemId) {
        const items = this.loadItems();
        const index = items.findIndex(item => item.id === itemId);
        if (index !== -1) {
            items[index].hasBlock = false;
            items[index].block = null;
            items[index].updatedAt = Date.now();
            this.saveItems(items);
            return items[index];
        }
        return null;
    },

    // 获取有色块的物品
    getItemsWithBlock() {
        const items = this.loadItems();
        return items.filter(item => item.hasBlock && item.block);
    },

    // 获取某视图某层的物品
    getItemsByViewAndLayer(viewId, layerId) {
        const items = this.loadItems();
        return items.filter(item => {
            if (!item.viewId || !item.layerId) return false;
            if (!item.hasBlock || !item.block) return false;
            return item.viewId === viewId && item.layerId === layerId;
        });
    },

    // ==================== 层管理 ====================

    // 保存层数据
    saveLayers(layers) {
        localStorage.setItem(this.KEYS.LAYERS, JSON.stringify(layers));
        this.saveLastUpdate();
    },

    // 加载层数据
    loadLayers() {
        const data = localStorage.getItem(this.KEYS.LAYERS);
        return data ? JSON.parse(data) : [];
    },

    // 获取某视图的所有层
    getLayersByView(viewId) {
        const layers = this.loadLayers();
        return layers.filter(layer => layer.viewId === viewId).sort((a, b) => a.order - b.order);
    },

    // 添加层
    addLayer(layer) {
        const layers = this.loadLayers();
        layer.id = `layer_${Date.now()}`;
        layer.createdAt = Date.now();

        const viewLayers = this.getLayersByView(layer.viewId);
        layer.order = viewLayers.length;

        layers.push(layer);
        this.saveLayers(layers);
        return layer;
    },

    // 更新层
    updateLayer(id, updates) {
        const layers = this.loadLayers();
        const index = layers.findIndex(layer => layer.id === id);
        if (index !== -1) {
            layers[index] = { ...layers[index], ...updates };
            this.saveLayers(layers);
            return layers[index];
        }
        return null;
    },

    // 删除层
    deleteLayer(id) {
        const layers = this.loadLayers();
        const layer = layers.find(l => l.id === id);
        if (!layer) return false;

        const items = this.loadItems();
        const itemsInLayer = items.filter(item => item.layerId === id);
        if (itemsInLayer.length > 0) {
            alert('该层还有物品，请先移动或删除物品');
            return false;
        }

        const newLayers = layers.filter(l => l.id !== id);
        this.saveLayers(newLayers);
        return true;
    },

    // 移动物品到另一层
    moveItemToLayer(itemId, newLayerId) {
        if (!newLayerId) {
            console.error('moveItemToLayer: 新层 ID 为空');
            return null;
        }

        const items = this.loadItems();
        const index = items.findIndex(item => item.id === itemId);
        if (index !== -1) {
            items[index].layerId = newLayerId;
            items[index].updatedAt = Date.now();
            this.saveItems(items);
            return items[index];
        }
        console.error(`moveItemToLayer: 未找到物品 ${itemId}`);
        return null;
    },

    // ==================== 视图配置管理（新增）====================

    // 保存视图配置
    saveViews(views) {
        localStorage.setItem(this.KEYS.VIEWS, JSON.stringify(views));
        VIEW_CONFIG = views;
        this.saveLastUpdate();
    },

    // 加载视图配置
    loadViews() {
        const data = localStorage.getItem(this.KEYS.VIEWS);
        return data ? JSON.parse(data) : VIEW_CONFIG;
    },

    // 添加视图
    addView(view) {
        const views = this.loadViews();
        view.id = `view_${Date.now()}`;
        view.createdAt = Date.now();
        views.push(view);
        this.saveViews(views);
        return view;
    },

    // 更新视图
    updateView(id, updates) {
        const views = this.loadViews();
        const index = views.findIndex(v => v.id === id);
        if (index !== -1) {
            views[index] = {
                ...views[index],
                ...JSON.parse(JSON.stringify(updates)),
                updatedAt: Date.now()
            };
            this.saveViews(views);
            return views[index];
        }
        console.error(`updateView: 未找到视图 ${id}`);
        return null;
    },

    // ❌ 不实现 deleteView() - 保护数据安全

    // ==================== 分类配置管理（新增）====================

    // 保存分类配置
    saveCategories(categories) {
        localStorage.setItem(this.KEYS.CATEGORIES, JSON.stringify(categories));
        CATEGORIES = categories;
        this.saveLastUpdate();
    },

    // 加载分类配置
    loadCategories() {
        const data = localStorage.getItem(this.KEYS.CATEGORIES);
        return data ? JSON.parse(data) : CATEGORIES;
    },

    // 添加分类
    addCategory(name) {
        const categories = this.loadCategories();
        if (categories.includes(name)) {
            return { success: false, message: '分类已存在' };
        }
        categories.push(name);
        this.saveCategories(categories);
        return { success: true, message: '添加成功' };
    },

    // 重命名分类
    renameCategory(oldName, newName) {
        const categories = this.loadCategories();
        const index = categories.indexOf(oldName);
        if (index === -1) {
            return { success: false, message: '分类不存在' };
        }
        if (categories.includes(newName)) {
            return { success: false, message: '新分类名已存在' };
        }

        // 更新所有使用该分类的物品
        const items = this.loadItems();
        let updated = 0;
        items.forEach(item => {
            if (item.category === oldName) {
                item.category = newName;
                item.updatedAt = Date.now();
                updated++;
            }
        });
        this.saveItems(items);

        // 更新分类配置
        categories[index] = newName;
        this.saveCategories(categories);

        return { success: true, message: `重命名成功，已更新${updated}件物品` };
    },

    // 删除分类
    deleteCategory(name) {
        const categories = this.loadCategories();
        const index = categories.indexOf(name);
        if (index === -1) {
            return { success: false, message: '分类不存在' };
        }

        // 检查是否有物品使用该分类
        const items = this.loadItems();
        const itemsInCategory = items.filter(item => item.category === name);

        if (itemsInCategory.length > 0) {
            return {
                success: false,
                message: `该分类下还有${itemsInCategory.length}件物品，请先修改物品分类`,
                itemCount: itemsInCategory.length
            };
        }

        categories.splice(index, 1);
        this.saveCategories(categories);

        return { success: true, message: '删除成功' };
    },

    // ==================== 借用管理 ====================

    // 保存借用记录
    saveBorrows(borrows) {
        localStorage.setItem(this.KEYS.BORROWS, JSON.stringify(borrows));
        this.saveLastUpdate();
    },

    // 加载借用记录
    loadBorrows() {
        const data = localStorage.getItem(this.KEYS.BORROWS);
        return data ? JSON.parse(data) : [];
    },

    // 添加借用记录
    addBorrow(borrow) {
        const borrows = this.loadBorrows();
        borrow.id = Date.now();
        borrow.createdAt = Date.now();
        borrows.push(borrow);
        this.saveBorrows(borrows);

        this.updateItem(borrow.itemId, { status: '借出' });

        return borrow;
    },

    // 归还物品
    returnItem(itemId) {
        const borrows = this.loadBorrows();
        const newBorrows = borrows.filter(b => b.itemId !== itemId);
        this.saveBorrows(newBorrows);

        this.updateItem(itemId, { status: '在位' });

        return true;
    },

    // 获取借用记录（带物品信息）
    getBorrowsWithItems() {
        const borrows = this.loadBorrows();
        const items = this.loadItems();
        return borrows.map(borrow => {
            const item = items.find(i => i.id === borrow.itemId);
            return { ...borrow, itemName: item ? item.name : '未知物品' };
        });
    },

    // ==================== 版本和备份 ====================

    // 保存版本号
    saveVersion(version) {
        localStorage.setItem(this.KEYS.VERSION, version);
    },

    // 获取版本号
    getVersion() {
        return localStorage.getItem(this.KEYS.VERSION) || '1.0';
    },

    // 保存最后更新时间
    saveLastUpdate() {
        localStorage.setItem(this.KEYS.LAST_UPDATE, Date.now().toString());
    },

    // 获取最后更新时间
    getLastUpdate() {
        const timestamp = localStorage.getItem(this.KEYS.LAST_UPDATE);
        return timestamp ? new Date(parseInt(timestamp)).toLocaleString() : '-';
    },

    // ==================== 导出导入 ====================

    // 导出完整备份
    exportData() {
        const backup = {
            version: this.getVersion(),
            exportDate: new Date().toISOString(),
            items: this.loadItems(),
            layers: this.loadLayers(),
            borrows: this.loadBorrows(),
            views: this.loadViews(),      // ✅ 新增
            categories: this.loadCategories()  // ✅ 新增
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `物品备份_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    // 导入备份
    importData(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const backup = JSON.parse(e.target.result);

                if (!backup.items || !Array.isArray(backup.items)) {
                    callback(false, '文件格式错误：缺少物品数据');
                    return;
                }

                this.saveItems(backup.items);
                if (backup.layers) {
                    this.saveLayers(backup.layers);
                }
                if (backup.borrows) {
                    this.saveBorrows(backup.borrows);
                }
                if (backup.views) {      // ✅ 新增
                    this.saveViews(backup.views);
                }
                if (backup.categories) {  // ✅ 新增
                    this.saveCategories(backup.categories);
                }
                if (backup.version) {
                    this.saveVersion(backup.version);
                }
                this.saveLastUpdate();

                callback(true, '导入成功');
            } catch (err) {
                callback(false, '文件解析失败：' + err.message);
            }
        };
        reader.onerror = () => {
            callback(false, '文件读取失败');
        };
        reader.readAsText(file);
    },

    // 清空所有数据（重置）
    resetAll() {
        if (confirm('⚠️ 警告：此操作将清空所有数据且不可恢复！\n\n确定要清除所有数据吗？')) {
            if (confirm('再次确认：所有物品、层、借用记录都将被删除！')) {
                localStorage.clear();
                this.init();
                return true;
            }
        }
        return false;
    },

    // ==================== 统计 ====================

    // 获取统计数据
    getStats() {
        const items = this.loadItems();
        return {
            total: items.length,
            withBlock: items.filter(i => i.hasBlock && i.block).length,
            inPlace: items.filter(i => i.status === '在位').length,
            taken: items.filter(i => i.status === '带走').length,
            borrowed: items.filter(i => i.status === '借出').length
        };
    }
};