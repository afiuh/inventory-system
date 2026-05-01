// js/storage.js
// 物品管理系统存储模块 - 统一异步 API
// 支持 localStorage 和后端 API 自动切换

const API_BASE = '/api';

// 默认数据
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

    // 存储模式
    _mode: 'localStorage', // 'localStorage' | 'backend'

    // 初始化
    async init() {
        try {
            const status = await this._request('GET', '/status');
            console.log('已连接到后端 API:', status);
            this._mode = 'backend';
            await this._syncFromBackend();
            return true;
        } catch (e) {
            console.log('后端不可用，使用本地存储模式');
            this._mode = 'localStorage';
            this._initLocalStorage();
            return false;
        }
    },

    // 获取当前模式
    getMode() {
        return this._mode;
    },

    // HTTP 请求
    async _request(method, path, data = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (data) {
            options.body = JSON.stringify(data);
        }
        const response = await fetch(API_BASE + path, options);
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || result.message || '请求失败');
        }
        return result;
    },

    // 从后端同步数据
    async _syncFromBackend() {
        try {
            const [items, layers, views, categories, borrows] = await Promise.all([
                this._request('GET', '/items'),
                this._request('GET', '/layers'),
                this._request('GET', '/views'),
                this._request('GET', '/categories'),
                this._request('GET', '/borrows')
            ]);

            localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));
            localStorage.setItem(this.KEYS.LAYERS, JSON.stringify(layers));
            localStorage.setItem(this.KEYS.VIEWS, JSON.stringify(views));
            localStorage.setItem(this.KEYS.CATEGORIES, JSON.stringify(categories));
            localStorage.setItem(this.KEYS.BORROWS, JSON.stringify(borrows));
            this._saveLastUpdate();

            VIEW_CONFIG = views;
            CATEGORIES = categories;
            console.log('数据同步完成');
        } catch (e) {
            console.error('数据同步失败:', e);
        }
    },

    // 初始化本地存储
    _initLocalStorage() {
        if (!localStorage.getItem(this.KEYS.ITEMS)) {
            localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(INITIAL_ITEMS));
        }
        if (!localStorage.getItem(this.KEYS.LAYERS)) {
            localStorage.setItem(this.KEYS.LAYERS, JSON.stringify([]));
        }
        if (!localStorage.getItem(this.KEYS.BORROWS)) {
            localStorage.setItem(this.KEYS.BORROWS, JSON.stringify(INITIAL_BORROWS));
        }
        localStorage.setItem(this.KEYS.VERSION, '1.1');
        this._saveLastUpdate();
    },

    _saveLastUpdate() {
        localStorage.setItem(this.KEYS.LAST_UPDATE, Date.now().toString());
    },

    getLastUpdate() {
        const timestamp = localStorage.getItem(this.KEYS.LAST_UPDATE);
        return timestamp ? new Date(parseInt(timestamp)).toLocaleString() : '-';
    },

    // ==================== 物品管理 ====================

    async loadItems() {
        if (this._mode === 'backend') {
            try {
                const items = await this._request('GET', '/items');
                localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));
                return items;
            } catch (e) {
                // 回退到本地缓存
            }
        }
        const data = localStorage.getItem(this.KEYS.ITEMS);
        return data ? JSON.parse(data) : [];
    },

    async getItem(id) {
        if (this._mode === 'backend') {
            try {
                return await this._request('GET', `/items/${id}`);
            } catch (e) {}
        }
        const items = await this.loadItems();
        return items.find(item => item.id == id);
    },

    async addItem(item) {
        if (this._mode === 'backend') {
            const newItem = await this._request('POST', '/items', item);
            await this.loadItems();
            return newItem;
        }
        const items = await this.loadItems();
        item.id = Date.now();
        item.createdAt = Date.now();
        item.updatedAt = Date.now();
        items.push(item);
        localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));
        this._saveLastUpdate();
        return item;
    },

    async updateItem(id, updates) {
        if (this._mode === 'backend') {
            const updated = await this._request('PUT', `/items/${id}`, updates);
            await this.loadItems();
            return updated;
        }
        const items = await this.loadItems();
        const index = items.findIndex(item => item.id == id);
        if (index !== -1) {
            items[index] = {
                ...items[index],
                ...updates,
                block: updates.block ? JSON.parse(JSON.stringify(updates.block)) : items[index].block,
                updatedAt: Date.now()
            };
            localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));
            this._saveLastUpdate();
            return items[index];
        }
        return null;
    },

    async deleteItem(id) {
        if (this._mode === 'backend') {
            await this._request('DELETE', `/items/${id}`);
            await this.loadItems();
            return true;
        }
        const items = await this.loadItems();
        const newItems = items.filter(item => item.id != id);
        localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(newItems));
        this._saveLastUpdate();
        return newItems.length < items.length;
    },

    async setBlock(itemId, blockData) {
        if (!blockData || !blockData.appearance || !blockData.position) {
            return null;
        }
        if (this._mode === 'backend') {
            const item = await this._request('POST', `/items/${itemId}/block`, blockData);
            await this.loadItems();
            return item;
        }
        const items = await this.loadItems();
        const index = items.findIndex(item => item.id == itemId);
        if (index !== -1) {
            items[index].hasBlock = true;
            items[index].block = JSON.parse(JSON.stringify(blockData));
            items[index].updatedAt = Date.now();
            localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));
            this._saveLastUpdate();
            return items[index];
        }
        return null;
    },

    async deleteBlock(itemId) {
        if (this._mode === 'backend') {
            await this._request('DELETE', `/items/${itemId}/block`);
            await this.loadItems();
            return true;
        }
        const items = await this.loadItems();
        const index = items.findIndex(item => item.id == itemId);
        if (index !== -1) {
            items[index].hasBlock = false;
            items[index].block = null;
            items[index].updatedAt = Date.now();
            localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));
            this._saveLastUpdate();
            // 重新加载确保内存和 localStorage 同步
            await this.loadItems();
            return items[index];
        }
        return null;
    },

    async getItemsByViewAndLayer(viewId, layerId) {
        if (this._mode === 'backend') {
            try {
                return await this._request('GET', `/items/by-view-layer/${viewId}/${layerId}`);
            } catch (e) {}
        }
        const items = await this.loadItems();
        return items.filter(item => {
            if (!item.viewId || !item.layerId) return false;
            if (!item.hasBlock || !item.block) return false;
            return item.viewId === viewId && item.layerId === layerId;
        });
    },

    async moveItemToLayer(itemId, newLayerId) {
        if (!newLayerId) return null;
        if (this._mode === 'backend') {
            return await this._request('POST', `/items/${itemId}/move-to-layer`, { layerId: newLayerId });
        }
        const items = await this.loadItems();
        const index = items.findIndex(item => item.id == itemId);
        if (index !== -1) {
            items[index].layerId = newLayerId;
            items[index].updatedAt = Date.now();
            localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));
            this._saveLastUpdate();
            return items[index];
        }
        return null;
    },

    // ==================== 层管理 ====================

    async loadLayers() {
        if (this._mode === 'backend') {
            try {
                const layers = await this._request('GET', '/layers');
                localStorage.setItem(this.KEYS.LAYERS, JSON.stringify(layers));
                return layers;
            } catch (e) {}
        }
        const data = localStorage.getItem(this.KEYS.LAYERS);
        return data ? JSON.parse(data) : [];
    },

    async getLayersByView(viewId) {
        if (this._mode === 'backend') {
            try {
                return await this._request('GET', `/layers/by-view/${viewId}`);
            } catch (e) {}
        }
        const layers = await this.loadLayers();
        return layers.filter(l => l.viewId === viewId).sort((a, b) => a.order - b.order);
    },

    async addLayer(layer) {
        if (this._mode === 'backend') {
            await this._request('POST', '/layers', layer);
            await this.loadLayers();
            return layer;
        }
        const layers = await this.loadLayers();
        layer.id = `layer_${Date.now()}`;
        layer.createdAt = Date.now();
        const viewLayers = await this.getLayersByView(layer.viewId);
        layer.order = viewLayers.length;
        layers.push(layer);
        localStorage.setItem(this.KEYS.LAYERS, JSON.stringify(layers));
        this._saveLastUpdate();
        return layer;
    },

    async updateLayer(id, updates) {
        if (this._mode === 'backend') {
            await this._request('PUT', `/layers/${id}`, updates);
            await this.loadLayers();
            return true;
        }
        const layers = await this.loadLayers();
        const index = layers.findIndex(l => l.id === id);
        if (index !== -1) {
            layers[index] = { ...layers[index], ...updates };
            localStorage.setItem(this.KEYS.LAYERS, JSON.stringify(layers));
            this._saveLastUpdate();
            return layers[index];
        }
        return null;
    },

    async deleteLayer(id) {
        if (this._mode === 'backend') {
            await this._request('DELETE', `/layers/${id}`);
            await this.loadLayers();
            return true;
        }
        const layers = await this.loadLayers();
        const items = await this.loadItems();
        const itemsInLayer = items.filter(i => i.layerId === id);
        if (itemsInLayer.length > 0) {
            alert('该层还有物品');
            return false;
        }
        const newLayers = layers.filter(l => l.id !== id);
        localStorage.setItem(this.KEYS.LAYERS, JSON.stringify(newLayers));
        this._saveLastUpdate();
        return true;
    },

    // ==================== 视图管理 ====================

    async loadViews() {
        if (this._mode === 'backend') {
            try {
                const views = await this._request('GET', '/views');
                localStorage.setItem(this.KEYS.VIEWS, JSON.stringify(views));
                VIEW_CONFIG = views;
                return views;
            } catch (e) {}
        }
        const data = localStorage.getItem(this.KEYS.VIEWS);
        const views = data ? JSON.parse(data) : VIEW_CONFIG;
        VIEW_CONFIG = views;
        return views;
    },

    async addView(view) {
        if (this._mode === 'backend') {
            await this._request('POST', '/views', view);
            await this.loadViews();
            return view;
        }
        const views = await this.loadViews();
        view.id = `view_${Date.now()}`;
        view.createdAt = Date.now();
        views.push(view);
        localStorage.setItem(this.KEYS.VIEWS, JSON.stringify(views));
        VIEW_CONFIG = views;
        this._saveLastUpdate();
        return view;
    },

    async updateView(id, updates) {
        if (this._mode === 'backend') {
            await this._request('PUT', `/views/${id}`, updates);
            await this.loadViews();
            return true;
        }
        const views = await this.loadViews();
        const index = views.findIndex(v => v.id === id);
        if (index !== -1) {
            views[index] = { ...views[index], ...JSON.parse(JSON.stringify(updates)), updatedAt: Date.now() };
            localStorage.setItem(this.KEYS.VIEWS, JSON.stringify(views));
            VIEW_CONFIG = views;
            this._saveLastUpdate();
            return views[index];
        }
        return null;
    },

    // ==================== 分类管理 ====================

    async loadCategories() {
        if (this._mode === 'backend') {
            try {
                const categories = await this._request('GET', '/categories');
                localStorage.setItem(this.KEYS.CATEGORIES, JSON.stringify(categories));
                CATEGORIES = categories;
                return categories;
            } catch (e) {}
        }
        const data = localStorage.getItem(this.KEYS.CATEGORIES);
        const categories = data ? JSON.parse(data) : CATEGORIES;
        CATEGORIES = categories;
        return categories;
    },

    async addCategory(name) {
        if (this._mode === 'backend') {
            try {
                await this._request('POST', '/categories', { name });
                await this.loadCategories();
                return { success: true };
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
        const categories = await this.loadCategories();
        if (categories.includes(name)) {
            return { success: false, message: '分类已存在' };
        }
        categories.push(name);
        localStorage.setItem(this.KEYS.CATEGORIES, JSON.stringify(categories));
        CATEGORIES = categories;
        this._saveLastUpdate();
        return { success: true };
    },

    async renameCategory(oldName, newName) {
        if (this._mode === 'backend') {
            try {
                await this._request('POST', '/categories/rename', { oldName, newName });
                await this.loadCategories();
                await this.loadItems();
                return { success: true };
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
        const categories = await this.loadCategories();
        const index = categories.indexOf(oldName);
        if (index === -1) return { success: false, message: '分类不存在' };
        if (categories.includes(newName)) return { success: false, message: '新分类名已存在' };

        const items = await this.loadItems();
        items.forEach(item => {
            if (item.category === oldName) {
                item.category = newName;
                item.updatedAt = Date.now();
            }
        });
        localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));

        categories[index] = newName;
        localStorage.setItem(this.KEYS.CATEGORIES, JSON.stringify(categories));
        CATEGORIES = categories;
        this._saveLastUpdate();
        return { success: true, message: '重命名成功' };
    },

    async deleteCategory(name) {
        if (this._mode === 'backend') {
            try {
                await this._request('DELETE', `/categories/${encodeURIComponent(name)}`);
                await this.loadCategories();
                return { success: true };
            } catch (e) {
                return { success: false, message: e.message };
            }
        }
        const categories = await this.loadCategories();
        const index = categories.indexOf(name);
        if (index === -1) return { success: false, message: '分类不存在' };

        const items = await this.loadItems();
        const itemsInCategory = items.filter(i => i.category === name);
        if (itemsInCategory.length > 0) {
            return { success: false, message: `该分类下还有${itemsInCategory.length}件物品` };
        }

        categories.splice(index, 1);
        localStorage.setItem(this.KEYS.CATEGORIES, JSON.stringify(categories));
        CATEGORIES = categories;
        this._saveLastUpdate();
        return { success: true };
    },

    // ==================== 借用管理 ====================

    async loadBorrows() {
        if (this._mode === 'backend') {
            try {
                const borrows = await this._request('GET', '/borrows');
                localStorage.setItem(this.KEYS.BORROWS, JSON.stringify(borrows));
                return borrows;
            } catch (e) {}
        }
        const data = localStorage.getItem(this.KEYS.BORROWS);
        return data ? JSON.parse(data) : [];
    },

    async addBorrow(borrow) {
        if (this._mode === 'backend') {
            const newBorrow = await this._request('POST', '/borrows', borrow);
            await this.loadBorrows();
            await this.loadItems();
            return newBorrow;
        }
        const borrows = await this.loadBorrows();
        borrow.id = Date.now();
        borrow.createdAt = Date.now();
        borrows.push(borrow);
        localStorage.setItem(this.KEYS.BORROWS, JSON.stringify(borrows));

        // 更新物品状态
        const items = await this.loadItems();
        const itemIndex = items.findIndex(i => i.id == borrow.itemId);
        if (itemIndex !== -1) {
            items[itemIndex].status = '借出';
            items[itemIndex].updatedAt = Date.now();
            localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));
        }
        this._saveLastUpdate();
        return borrow;
    },

    async returnItem(itemId) {
        if (this._mode === 'backend') {
            await this._request('DELETE', `/borrows/${itemId}`);
            await this.loadBorrows();
            await this.loadItems();
            return true;
        }
        const borrows = await this.loadBorrows();
        const newBorrows = borrows.filter(b => b.itemId != itemId);
        localStorage.setItem(this.KEYS.BORROWS, JSON.stringify(newBorrows));

        const items = await this.loadItems();
        const itemIndex = items.findIndex(i => i.id == itemId);
        if (itemIndex !== -1) {
            items[itemIndex].status = '在位';
            items[itemIndex].updatedAt = Date.now();
            localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(items));
        }
        this._saveLastUpdate();
        return true;
    },

    async getBorrowsWithItems() {
        const borrows = await this.loadBorrows();
        const items = await this.loadItems();
        return borrows.map(borrow => {
            const item = items.find(i => i.id == borrow.itemId);
            return { ...borrow, itemName: item ? item.name : '未知物品' };
        });
    },

    // ==================== 统计 ====================

    async getStats() {
        if (this._mode === 'backend') {
            try {
                return await this._request('GET', '/stats');
            } catch (e) {}
        }
        const items = await this.loadItems();
        return {
            total: items.length,
            withBlock: items.filter(i => i.hasBlock && i.block).length,
            inPlace: items.filter(i => i.status === '在位').length,
            taken: items.filter(i => i.status === '带走').length,
            borrowed: items.filter(i => i.status === '借出').length
        };
    },

    // ==================== 导出导入 ====================

    async exportData() {
        // 获取完整数据
        const backup = {
            version: '1.1',
            exportDate: new Date().toISOString(),
            items: await this.loadItems(),
            layers: await this.loadLayers(),
            borrows: await this.loadBorrows(),
            views: await this.loadViews(),
            categories: await this.loadCategories()
        };

        if (this._mode === 'backend') {
            try {
                // 保存到后端 data/exports 目录
                const result = await this._request('POST', '/backup/save', backup);
                return result;
            } catch (e) {
                alert('保存备份失败: ' + e.message);
                throw e;
            }
        }

        // 本地模式：下载文件
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `物品备份_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true, message: '备份已下载' };
    },

    // 获取 exports 目录中的备份列表
    async getBackupList() {
        if (this._mode !== 'backend') {
            return { success: false, backups: [], latest: null };
        }
        try {
            return await this._request('GET', '/backup/list');
        } catch (e) {
            console.error('获取备份列表失败:', e);
            return { success: false, backups: [], latest: null };
        }
    },

    // 加载最新备份
    async loadLatestBackup() {
        if (this._mode !== 'backend') {
            alert('本地模式不支持自动加载备份');
            return { success: false, message: '本地模式不支持此功能' };
        }
        try {
            const result = await this._request('GET', '/backup/load-latest');
            if (result.success) {
                await this._syncFromBackend();
            }
            return result;
        } catch (e) {
            return { success: false, message: e.message };
        }
    },

    // 查看最新备份（不导入）
    async previewLatestBackup() {
        if (this._mode !== 'backend') {
            return null;
        }
        try {
            return await this._request('GET', '/backup/latest');
        } catch (e) {
            return null;
        }
    },

    async importData(file, callback) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backup = JSON.parse(e.target.result);
                if (!backup.items || !Array.isArray(backup.items)) {
                    callback(false, '文件格式错误');
                    return;
                }

                if (this._mode === 'backend') {
                    try {
                        const result = await this._request('POST', '/backup', backup);
                        await this._syncFromBackend();
                        callback(true, '导入成功（已同步到数据库）');
                        return;
                    } catch (e) {
                        callback(false, '后端导入失败，将使用本地模式');
                    }
                }

                localStorage.setItem(this.KEYS.ITEMS, JSON.stringify(backup.items));
                if (backup.layers) localStorage.setItem(this.KEYS.LAYERS, JSON.stringify(backup.layers));
                if (backup.borrows) localStorage.setItem(this.KEYS.BORROWS, JSON.stringify(backup.borrows));
                if (backup.views) {
                    localStorage.setItem(this.KEYS.VIEWS, JSON.stringify(backup.views));
                    VIEW_CONFIG = backup.views;
                }
                if (backup.categories) {
                    localStorage.setItem(this.KEYS.CATEGORIES, JSON.stringify(backup.categories));
                    CATEGORIES = backup.categories;
                }
                this._saveLastUpdate();
                callback(true, '导入成功');
            } catch (err) {
                callback(false, '解析失败：' + err.message);
            }
        };
        reader.readAsText(file);
    },

    async resetAll() {
        if (confirm('确定清除所有数据？')) {
            if (confirm('再次确认：所有数据将被删除！')) {
                if (this._mode === 'backend') {
                    try {
                        await this._request('POST', '/reset');
                    } catch (e) {}
                }
                localStorage.clear();
                this._initLocalStorage();
                return true;
            }
        }
        return false;
    }
};

window.Storage = Storage;
