// js/crud.js
// CRUD 操作 - 全异步适配

const CRUD = {
    currentItemId: null,

    init() {
        this.bindEvents();
        this.initCategorySelect();
        this.initViewSelect();
    },

    bindEvents() {
        document.getElementById('btnAdd').addEventListener('click', () => {
            this.openAddItemModal();
        });

        document.getElementById('itemForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitItemForm();
        });

        document.querySelectorAll('.shape-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        document.getElementById('blockColor').addEventListener('input', (e) => {
            document.getElementById('blockColorHex').value = e.target.value;
        });

        document.getElementById('blockColorHex').addEventListener('input', (e) => {
            const color = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                document.getElementById('blockColor').value = color;
            }
        });

        document.getElementById('btnPlaceBlock').addEventListener('click', async () => {
            await this.confirmBlockPlace();
        });

        document.getElementById('btnManage').addEventListener('click', () => {
            this.openManageModal();
        });

        document.getElementById('viewForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await Layer.submitAddView();
        });

        document.getElementById('btnAddCategory').addEventListener('click', async () => {
            await this.addCategory();
        });

        document.getElementById('btnBorrow').addEventListener('click', () => {
            Borrow.openBorrowModal();
        });

        document.getElementById('btnExport').addEventListener('click', () => {
            Storage.exportData();
        });

        document.getElementById('btnImport').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        document.getElementById('importFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                Storage.importData(file, (success, msg) => {
                    alert(msg);
                    if (success) location.reload();
                });
            }
        });

        document.getElementById('borrowForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await Borrow.submitBorrowForm();
        });

        document.getElementById('btnEditFromDetail').addEventListener('click', () => {
            if (this.currentItemId) this.editItem(this.currentItemId);
        });

        document.getElementById('btnDeleteFromDetail').addEventListener('click', () => {
            if (this.currentItemId) this.deleteItem(this.currentItemId);
        });

        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.close;
                document.getElementById(modalId).classList.remove('active');
            });
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });
        });
    },

    // ==================== 初始化 ====================

    initCategorySelect() {
        const select = document.getElementById('itemCategory');
        if (!select) return;
        select.innerHTML = CATEGORIES.map(cat =>
            `<option value="${cat}">${cat}</option>`
        ).join('');
    },

    initViewSelect() {
        const select = document.getElementById('itemView');
        if (!select) return;

        select.innerHTML = VIEW_CONFIG.map(view =>
            `<option value="${view.id}">${view.name}</option>`
        ).join('');

        select.addEventListener('change', () => {
            this.updateLayerSelect(select.value);
        });
    },

    async updateLayerSelect(viewId) {
        const layerSelect = document.getElementById('itemLayer');
        if (!layerSelect) return;

        const layers = await Storage.getLayersByView(viewId);
        layerSelect.innerHTML = layers.map(layer =>
            `<option value="${layer.id}">${layer.name}</option>`
        ).join('');
    },

    // ==================== 物品管理 ====================

    openAddItemModal() {
        this.currentItemId = null;
        document.getElementById('modalTitle').textContent = '添加物品';
        document.getElementById('itemForm').reset();
        document.getElementById('itemId').value = '';
        this.updateLayerSelect(document.getElementById('itemView').value);
        document.getElementById('itemModal').classList.add('active');
    },

    async editItem(id) {
        const item = await Storage.getItem(id);
        if (!item) return;

        this.currentItemId = id;
        document.getElementById('modalTitle').textContent = '编辑物品';
        document.getElementById('itemId').value = item.id;
        document.getElementById('itemName').value = item.name;
        document.getElementById('itemCategory').value = item.category;
        document.getElementById('itemStatus').value = item.status;
        document.getElementById('itemView').value = item.viewId;
        await this.updateLayerSelect(item.viewId);
        document.getElementById('itemLayer').value = item.layerId || '';
        document.getElementById('itemDescription').value = item.description || '';
        document.getElementById('itemNote').value = item.note || '';
        
        // 先关闭详情弹窗，再打开编辑弹窗
        document.getElementById('detailModal').classList.remove('active');
        setTimeout(() => {
            document.getElementById('itemModal').classList.add('active');
        }, 50);
    },

    async submitItemForm() {
        const itemId = document.getElementById('itemId').value;
        const itemData = {
            name: document.getElementById('itemName').value.trim(),
            category: document.getElementById('itemCategory').value,
            status: document.getElementById('itemStatus').value,
            viewId: document.getElementById('itemView').value,
            layerId: document.getElementById('itemLayer').value,
            description: document.getElementById('itemDescription').value.trim(),
            note: document.getElementById('itemNote').value.trim()
        };

        if (!itemData.name) {
            alert('请输入物品名称');
            return;
        }

        if (itemId) {
            await Storage.updateItem(parseInt(itemId), itemData);
        } else {
            const newItem = await Storage.addItem({
                ...itemData,
                hasBlock: false,
                block: null
            });
            this.currentItemId = newItem.id;
        }

        document.getElementById('itemModal').classList.remove('active');
        await Render.updateStats();
        await Search.renderItemList();

        if (!itemId) {
            setTimeout(() => {
                if (confirm('物品已创建，是否添加位置色块？')) {
                    this.openBlockModal(this.currentItemId);
                }
            }, 100);
        }
    },

    async deleteItem(id) {
        const item = await Storage.getItem(id);
        if (!item) return;

        let confirmMsg = `确定删除"${item.name}"吗？`;
        if (item.hasBlock) {
            confirmMsg += '\n\n该物品有色块，将一并删除。';
        }

        if (confirm(confirmMsg)) {
            await Storage.deleteItem(id);
            document.getElementById('detailModal').classList.remove('active');
            await Render.renderView(Layer.currentViewId, Layer.currentLayerId);
            await Render.updateStats();
            await Search.renderItemList();
        }
    },

    // ==================== 色块管理 ====================

    async openBlockModal(itemId) {
        const item = await Storage.getItem(itemId);
        if (!item) return;

        this.currentItemId = itemId;
        document.getElementById('blockItemId').value = itemId;

        if (item.hasBlock && item.block) {
            const shapeBtn = document.querySelector(`.shape-btn[data-shape="${item.block.appearance.shape}"]`);
            if (shapeBtn) shapeBtn.click();
            document.getElementById('blockColor').value = item.block.appearance.color;
            document.getElementById('blockColorHex').value = item.block.appearance.color;
        } else {
            document.querySelector('.shape-btn[data-shape="rectangle"]').click();
            document.getElementById('blockColor').value = '#4A90E2';
            document.getElementById('blockColorHex').value = '#4A90E2';
        }

        document.getElementById('blockModal').classList.add('active');
    },

    async confirmBlockPlace() {
        const itemId = this.currentItemId;
        if (!itemId) return;

        const shape = document.querySelector('.shape-btn.active').dataset.shape;
        const color = document.getElementById('blockColor').value;
        const sizeConfig = { width: 60, height: 45 };

        const view = VIEW_CONFIG.find(v => v.id === Layer.currentViewId);
        const layers = await Storage.getLayersByView(Layer.currentViewId);
        const layerId = layers[0]?.id;

        if (!view || !layerId) {
            alert('当前视图或层无效');
            return;
        }

        const viewWidth = view.width * 5;
        const viewHeight = view.height * 5;
        const centerX = Math.max(0, (viewWidth / 2) - (sizeConfig.width / 2));
        const centerY = Math.max(0, (viewHeight / 2) - (sizeConfig.height / 2));

        await Storage.setBlock(itemId, {
            appearance: {
                shape: shape,
                color: color,
                size: sizeConfig
            },
            position: { x: centerX, y: centerY }
        });

        await Storage.updateItem(itemId, {
            viewId: Layer.currentViewId,
            layerId: layerId
        });

        document.getElementById('blockModal').classList.remove('active');
        await Render.renderView(Layer.currentViewId, Layer.currentLayerId);
        await Render.updateStats();
        await Search.renderItemList();

        alert('色块已添加！请拖拽到目标位置，拖动边缘可缩放');
    },

    async deleteBlock(itemId) {
        const item = await Storage.getItem(itemId);
        if (!item) return;

        if (confirm(`确定删除"${item.name}"的位置色块吗？`)) {
            await Storage.deleteBlock(itemId);
            await Render.renderView(Layer.currentViewId, Layer.currentLayerId);
            await Render.updateStats();
            await Search.renderItemList();
        }
    },

    // ==================== 配置管理 ====================

    openManageModal() {
        this.renderCategoryList();
        document.getElementById('categoryModal').classList.add('active');
    },

    renderCategoryList() {
        const container = document.getElementById('categoryList');
        if (!container) return;

        container.innerHTML = CATEGORIES.map(cat => `
            <div class="category-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-primary);">
                <span>${cat}</span>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-small btn-secondary" onclick="CRUD.renameCategory('${cat}')">重命名</button>
                    <button class="btn btn-small btn-danger" onclick="CRUD.deleteCategory('${cat}')">删除</button>
                </div>
            </div>
        `).join('');
    },

    async addCategory() {
        const name = document.getElementById('newCategoryName').value.trim();
        if (!name) {
            alert('请输入分类名称');
            return;
        }

        const result = await Storage.addCategory(name);
        if (result.success) {
            document.getElementById('newCategoryName').value = '';
            CATEGORIES = await Storage.loadCategories();
            Render.updateCategoryFilter();
            this.initCategorySelect();
            this.renderCategoryList();
            alert('添加成功');
        } else {
            alert(result.message);
        }
    },

    async renameCategory(oldName) {
        const newName = prompt('请输入新名称:', oldName);
        if (newName && newName.trim() && newName !== oldName) {
            const result = await Storage.renameCategory(oldName, newName.trim());
            if (result.success) {
                CATEGORIES = await Storage.loadCategories();
                Render.updateCategoryFilter();
                this.initCategorySelect();
                this.renderCategoryList();
            }
            alert(result.message);
        }
    },

    async deleteCategory(name) {
        const result = await Storage.deleteCategory(name);
        if (result.success) {
            CATEGORIES = await Storage.loadCategories();
            Render.updateCategoryFilter();
            this.initCategorySelect();
            this.renderCategoryList();
        }
        alert(result.message);
    },

    // ==================== 物品详情 ====================

    async showItemDetail(id) {
        const item = await Storage.getItem(id);
        if (!item) return;

        this.currentItemId = id;
        const view = VIEW_CONFIG.find(v => v.id === item.viewId);
        const layer = item.layerId ? { name: '第一层' } : null;

        const statusColor = item.status === '在位' ? '#10b981' : item.status === '带走' ? '#f59e0b' : '#ef4444';

        document.getElementById('detailTitle').textContent = item.name;
        document.getElementById('detailContent').innerHTML = `
            <div style="display: grid; gap: 12px;">
                <div><strong style="color: var(--accent-violet);">分类：</strong> ${item.category}</div>
                <div><strong style="color: var(--accent-violet);">状态：</strong> <span style="color: ${statusColor};">${item.status}</span></div>
                <div><strong style="color: var(--accent-violet);">位置：</strong> ${view ? view.name : '-'} → ${layer ? layer.name : '-'}</div>
                <div><strong style="color: var(--accent-violet);">简介：</strong> ${item.description || '无'}</div>
                <div><strong style="color: var(--accent-violet);">备注：</strong> ${item.note || '无'}</div>
                <div><strong style="color: var(--accent-violet);">色块：</strong> ${item.hasBlock ? '已设置' : '未设置'}</div>
                
                <div style="margin-top: 8px; padding-top: 12px; border-top: 1px solid var(--border-primary);">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="chkLabelEnabled" ${item.labelEnabled ? 'checked' : ''} 
                            onchange="CRUD.toggleLabel(this.checked)" style="width: 16px; height: 16px; accent-color: var(--brand-indigo);">
                        <span style="color: var(--text-secondary);">显示引线标注</span>
                    </label>
                    <div id="labelOptions" style="margin-top: 8px; display: ${item.labelEnabled ? 'flex' : 'none'}; gap: 8px; flex-wrap: wrap;">
                        <span style="color: var(--text-tertiary); font-size: 12px; align-self: center;">锚点：</span>
                        <button class="btn btn-small ${(item.labelPosition?.anchor === 'right' || !item.labelPosition) ? 'btn-primary' : 'btn-secondary'}" 
                            onclick="CRUD.setLabelAnchor('right')">右</button>
                        <button class="btn btn-small ${item.labelPosition?.anchor === 'bottom' ? 'btn-primary' : 'btn-secondary'}" 
                            onclick="CRUD.setLabelAnchor('bottom')">下</button>
                        <button class="btn btn-small ${item.labelPosition?.anchor === 'left' ? 'btn-primary' : 'btn-secondary'}" 
                            onclick="CRUD.setLabelAnchor('left')">左</button>
                        <button class="btn btn-small ${item.labelPosition?.anchor === 'top' ? 'btn-primary' : 'btn-secondary'}" 
                            onclick="CRUD.setLabelAnchor('top')">上</button>
                        ${item.hasBlock ? '' : '<span style="color: var(--text-muted); font-size: 11px; align-self: center;">（无色块时显示在视图中心）</span>'}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('detailModal').classList.add('active');
    },

    // ==================== 引线标注控制 ====================

    async toggleLabel(enabled) {
        const itemId = this.currentItemId;
        if (!itemId) return;

        const item = await Storage.getItem(itemId);
        if (!item) return;

        item.labelEnabled = enabled;
        if (enabled && !item.labelPosition) {
            item.labelPosition = { anchor: 'right', offsetX: 0, offsetY: 0 };
        }

        await Storage.updateItem(itemId, { 
            labelEnabled: enabled,
            labelPosition: item.labelPosition 
        });

        // 切换选项显示
        const optionsDiv = document.getElementById('labelOptions');
        if (optionsDiv) {
            optionsDiv.style.display = enabled ? 'flex' : 'none';
        }

        // 重新渲染视图
        await Render.renderView(Layer.currentViewId, Layer.currentLayerId);
    },

    async setLabelAnchor(anchor) {
        const itemId = this.currentItemId;
        if (!itemId) return;

        const item = await Storage.getItem(itemId);
        if (!item) return;

        item.labelPosition = item.labelPosition || { anchor: 'right', offsetX: 0, offsetY: 0 };
        item.labelPosition.anchor = anchor;

        await Storage.updateItem(itemId, { labelPosition: item.labelPosition });

        // 更新按钮样式
        const btns = document.querySelectorAll('#labelOptions .btn-small');
        btns.forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        });
        event.target.classList.remove('btn-secondary');
        event.target.classList.add('btn-primary');

        // 重新渲染视图
        await Render.renderView(Layer.currentViewId, Layer.currentLayerId);
    }
};
