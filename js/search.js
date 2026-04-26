// js/search.js

const Search = {
    // 当前筛选条件
    filters: {
        searchQuery: '',
        category: '',
        status: ''
    },

    // 初始化搜索系统
    init() {
        this.bindEvents();
        Render.updateCategoryFilter();  // ✅ 新增：初始化分类筛选选项
    },

    // 绑定事件
    bindEvents() {
        // 搜索框输入
        document.getElementById('searchBox').addEventListener('input', (e) => {
            this.filters.searchQuery = e.target.value.trim().toLowerCase();
            this.applyFilters();
        });

        // 分类筛选
        document.getElementById('categoryFilter').addEventListener('change', (e) => {
            this.filters.category = e.target.value;
            this.applyFilters();
        });

        // 状态筛选
        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.applyFilters();
        });
    },

    // ==================== 搜索筛选 ====================

    // 应用筛选条件
    applyFilters() {
        // 重新渲染当前视图
        Render.renderView(Layer.currentViewId, Layer.currentLayerId);
        // 重新渲染物品清单
        this.renderItemList();
    },

    // 渲染物品清单
    renderItemList() {
        const container = document.getElementById('itemList');
        if (!container) return;

        const items = Storage.loadItems();
        const filtered = this.filterItems(items);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-sub);">
                    没有找到匹配的物品
                </div>
            `;
            return;
        }

        // 按分类分组显示
        const grouped = this.groupByCategory(filtered);

        container.innerHTML = Object.keys(grouped).map(category => `
            <div class="category-group" style="margin-bottom: 20px;">
                <h4 style="color: var(--accent-gold); margin-bottom: 10px; font-family: var(--font-mono);">
                    ${category} (${grouped[category].length})
                </h4>
                ${grouped[category].map(item => this.renderItemCard(item)).join('')}
            </div>
        `).join('');
    },

    // 筛选物品
    filterItems(items) {
        return items.filter(item => {
            // 搜索查询匹配（名称/简介/备注）
            const matchSearch = !this.filters.searchQuery ||
                item.name.toLowerCase().includes(this.filters.searchQuery) ||
                (item.description && item.description.toLowerCase().includes(this.filters.searchQuery)) ||
                (item.note && item.note.toLowerCase().includes(this.filters.searchQuery));

            // 分类匹配
            const matchCategory = !this.filters.category || item.category === this.filters.category;

            // 状态匹配
            const matchStatus = !this.filters.status || item.status === this.filters.status;

            return matchSearch && matchCategory && matchStatus;
        });
    },

    // 按分类分组
    groupByCategory(items) {
        return items.reduce((groups, item) => {
            const category = item.category;
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(item);
            return groups;
        }, {});
    },

    // 渲染单个物品卡片（简化：只有一个色块按钮）
    renderItemCard(item) {
        const view = VIEW_CONFIG.find(v => v.id === item.viewId);
        const layers = Storage.getLayersByView(item.viewId);
        const layer = layers.find(l => l.id === item.layerId);
        const viewName = view ? view.name : '-';
        const layerName = layer ? layer.name : '-';

        return `
            <div class="item-card" data-item-id="${item.id}">
                <div class="item-info">
                    <h4>
                        ${item.name}
                        ${item.hasBlock ? '<span style="color: var(--accent-gold); margin-left: 5px;">📍</span>' : ''}
                    </h4>
                    <div class="item-meta">
                        ${item.category} | ${viewName} → ${layerName} | 
                        <span style="color: ${item.status === '在位' ? '#2d5016' : item.status === '带走' ? '#8b7508' : '#8b3a3a'};">
                            ${item.status}
                        </span>
                    </div>
                    ${item.description ? `<div class="item-meta" style="margin-top: 5px;">${item.description}</div>` : ''}
                </div>
                <div class="item-actions">
                    <button class="btn btn-small btn-secondary" onclick="CRUD.editItem(${item.id})">编辑</button>
                    ${item.hasBlock 
                        ? `<button class="btn btn-small" style="background: #E74C3C; border-color: #E74C3C;" onclick="CRUD.deleteBlock(${item.id})">删除色块</button>` 
                        : `<button class="btn btn-small" onclick="CRUD.openBlockModal(${item.id})">添加色块</button>`
                    }
                    <button class="btn btn-small btn-secondary" onclick="Borrow.openRecordModal(${item.id})">借用</button>
                    <button class="btn btn-small btn-secondary" onclick="CRUD.showItemDetail(${item.id})">详情</button>
                </div>
            </div>
        `;
    },

    // ==================== 快速搜索 ====================

    // 按名称搜索
    searchByName(query) {
        const items = Storage.loadItems();
        return items.filter(item =>
            item.name.toLowerCase().includes(query.toLowerCase())
        );
    },

    // 按位置搜索
    searchByLocation(viewId, layerId) {
        return Storage.getItemsByViewAndLayer(viewId, layerId);
    },

    // 按分类搜索
    searchByCategory(category) {
        const items = Storage.loadItems();
        return items.filter(item => item.category === category);
    },

    // 按状态搜索
    searchByStatus(status) {
        const items = Storage.loadItems();
        return items.filter(item => item.status === status);
    },

    // 搜索有色块的物品
    searchWithBlock() {
        return Storage.getItemsWithBlock();
    },

    // 搜索无色块的物品
    searchWithoutBlock() {
        const items = Storage.loadItems();
        return items.filter(item => !item.hasBlock);
    },

    // ==================== 高亮匹配 ====================

    // 高亮搜索结果
    highlightSearchResult(itemId) {
        const item = Storage.getItem(itemId);
        if (!item) return;

        // 切换到对应视图
        Layer.switchView(item.viewId);

        // 找到对应层
        const layers = Storage.getLayersByView(item.viewId);
        const targetLayer = layers.find(l => l.id === item.layerId);
        if (targetLayer) {
            Layer.switchLayer(targetLayer.id);
        }

        // 高亮色块
        setTimeout(() => {
            const blockEl = document.querySelector(`.item-block[data-item-id="${itemId}"]`);
            if (blockEl) {
                blockEl.style.boxShadow = '0 0 20px var(--accent-gold)';
                blockEl.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    blockEl.style.boxShadow = '';
                    blockEl.style.transform = '';
                }, 2000);
            }
        }, 100);
    },

    // ==================== 统计更新 ====================

    // 获取筛选后的统计
    getFilteredStats() {
        const items = Storage.loadItems();
        const filtered = this.filterItems(items);
        return {
            total: filtered.length,
            withBlock: filtered.filter(i => i.hasBlock).length,
            inPlace: filtered.filter(i => i.status === '在位').length,
            taken: filtered.filter(i => i.status === '带走').length,
            borrowed: filtered.filter(i => i.status === '借出').length
        };
    }
};
