// js/search.js
// 搜索系统 - 全异步适配

const Search = {
    filters: {
        searchQuery: '',
        category: '',
        status: ''
    },

    init() {
        this.bindEvents();
        Render.updateCategoryFilter();
    },

    bindEvents() {
        document.getElementById('searchBox').addEventListener('input', (e) => {
            this.filters.searchQuery = e.target.value.trim().toLowerCase();
            this.applyFilters();
        });

        document.getElementById('categoryFilter').addEventListener('change', (e) => {
            this.filters.category = e.target.value;
            this.applyFilters();
        });

        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.applyFilters();
        });
    },

    async applyFilters() {
        await Render.renderView(Layer.currentViewId, Layer.currentLayerId);
        await this.renderItemList();
    },

    async renderItemList() {
        const container = document.getElementById('itemList');
        if (!container) return;

        const items = await Storage.loadItems();
        const filtered = this.filterItems(items);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-tertiary);">
                    没有找到匹配的物品
                </div>
            `;
            return;
        }

        const grouped = this.groupByCategory(filtered);

        container.innerHTML = Object.keys(grouped).map(category => `
            <div class="category-group" style="margin-bottom: 20px;">
                <h4 style="color: var(--accent-violet); margin-bottom: 10px; font-family: var(--font-mono); font-size: 12px; font-weight: 510;">
                    ${category} (${grouped[category].length})
                </h4>
                ${grouped[category].map(item => this.renderItemCard(item)).join('')}
            </div>
        `).join('');
    },

    filterItems(items) {
        return items.filter(item => {
            const matchSearch = !this.filters.searchQuery ||
                item.name.toLowerCase().includes(this.filters.searchQuery) ||
                (item.description && item.description.toLowerCase().includes(this.filters.searchQuery)) ||
                (item.note && item.note.toLowerCase().includes(this.filters.searchQuery));

            const matchCategory = !this.filters.category || item.category === this.filters.category;
            const matchStatus = !this.filters.status || item.status === this.filters.status;

            return matchSearch && matchCategory && matchStatus;
        });
    },

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

    renderItemCard(item) {
        const view = VIEW_CONFIG.find(v => v.id === item.viewId);
        const layer = item.layerId ? { name: '第一层' } : null; // 简化显示
        const viewName = view ? view.name : '-';
        const layerName = layer ? layer.name : '-';

        const statusColor = item.status === '在位' ? '#10b981' : item.status === '带走' ? '#f59e0b' : '#ef4444';

        return `
            <div class="item-card" data-item-id="${item.id}">
                <div class="item-info">
                    <h4>
                        ${item.name}
                        ${item.hasBlock ? '<span style="color: var(--accent-violet); margin-left: 5px;">●</span>' : ''}
                    </h4>
                    <div class="item-meta">
                        ${item.category} · ${viewName} → ${layerName}
                    </div>
                    <div class="item-meta" style="color: ${statusColor};">
                        ${item.status}
                    </div>
                    ${item.description ? `<div class="item-meta" style="margin-top: 5px; color: var(--text-tertiary);">${item.description}</div>` : ''}
                </div>
                <div class="item-actions">
                    <button class="btn btn-small btn-secondary" onclick="CRUD.editItem(${item.id})">编辑</button>
                    ${item.hasBlock 
                        ? `<button class="btn btn-small btn-danger" onclick="CRUD.deleteBlock(${item.id})">删除色块</button>` 
                        : `<button class="btn btn-small btn-secondary" onclick="CRUD.openBlockModal(${item.id})">添加色块</button>`
                    }
                    <button class="btn btn-small btn-secondary" onclick="Borrow.openRecordModal(${item.id})">借用</button>
                </div>
            </div>
        `;
    },

    // ==================== 快速搜索 ====================

    async searchByName(query) {
        const items = await Storage.loadItems();
        return items.filter(item =>
            item.name.toLowerCase().includes(query.toLowerCase())
        );
    },

    async searchByLocation(viewId, layerId) {
        return await Storage.getItemsByViewAndLayer(viewId, layerId);
    },

    async searchByCategory(category) {
        const items = await Storage.loadItems();
        return items.filter(item => item.category === category);
    },

    async searchByStatus(status) {
        const items = await Storage.loadItems();
        return items.filter(item => item.status === status);
    },

    // ==================== 高亮匹配 ====================

    async highlightSearchResult(itemId) {
        const item = await Storage.getItem(itemId);
        if (!item) return;

        Layer.switchView(item.viewId);

        setTimeout(async () => {
            const layers = await Storage.getLayersByView(item.viewId);
            const targetLayer = layers.find(l => l.id === item.layerId);
            if (targetLayer) {
                Layer.switchLayer(targetLayer.id);
            }

            setTimeout(() => {
                const blockEl = document.querySelector(`.item-block[data-item-id="${itemId}"]`);
                if (blockEl) {
                    blockEl.style.boxShadow = '0 0 20px var(--accent-violet)';
                    blockEl.style.transform = 'scale(1.1)';
                    setTimeout(() => {
                        blockEl.style.boxShadow = '';
                        blockEl.style.transform = '';
                    }, 2000);
                }
            }, 100);
        }, 100);
    }
};
