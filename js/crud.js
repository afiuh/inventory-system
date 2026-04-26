// js/crud.js

const CRUD = {
    // 当前编辑的物品 ID
    currentItemId: null,

    // 初始化 CRUD 系统
    init() {
        this.bindEvents();
        this.initCategorySelect();
        this.initViewSelect();
    },

    // 绑定事件
    bindEvents() {
        // 添加物品按钮
        document.getElementById('btnAdd').addEventListener('click', () => {
            this.openAddItemModal();
        });

        // 物品表单提交
        document.getElementById('itemForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitItemForm();
        });

        // 色块表单 - 形状选择
        document.querySelectorAll('.shape-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                // ✅ 删除：this.updateBlockPreview();
            });
        });

        // ✅ 删除：大小选择事件绑定（已移除大小选择器）

        // 色块表单 - 颜色选择
        document.getElementById('blockColor').addEventListener('input', (e) => {
            document.getElementById('blockColorHex').value = e.target.value;
            // ✅ 删除：this.updateBlockPreview();
        });

        document.getElementById('blockColorHex').addEventListener('input', (e) => {
            const color = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                document.getElementById('blockColor').value = color;
                // ✅ 删除：this.updateBlockPreview();
            }
        });

        // 确认放置色块
        document.getElementById('btnPlaceBlock').addEventListener('click', () => {
            this.confirmBlockPlace();
        });

        // ✅ 新增：配置管理按钮
        const btnManage = document.getElementById('btnManage');
        if (btnManage) {
            btnManage.addEventListener('click', () => {
                this.openManageModal();
            });
        }

        // ✅ 新增：视图表单提交
        const viewForm = document.getElementById('viewForm');
        if (viewForm) {
            viewForm.addEventListener('submit', (e) => {
                e.preventDefault();
                Layer.submitAddView();
            });
        }

        // ✅ 新增：添加分类按钮
        const btnAddCategory = document.getElementById('btnAddCategory');
        if (btnAddCategory) {
            btnAddCategory.addEventListener('click', () => {
                this.addCategory();
            });
        }

        // 借用清单按钮
        document.getElementById('btnBorrow').addEventListener('click', () => {
            Borrow.openBorrowModal();
        });

        // 导出备份
        document.getElementById('btnExport').addEventListener('click', () => {
            Storage.exportData();
        });

        // 导入备份
        document.getElementById('btnImport').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        document.getElementById('importFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                Storage.importData(file, (success, msg) => {
                    alert(msg);
                    if (success) {
                        location.reload();
                    }
                });
            }
        });

        // 借用表单提交
        document.getElementById('borrowForm').addEventListener('submit', (e) => {
            e.preventDefault();
            Borrow.submitBorrowForm();
        });

        // 详情弹窗 - 编辑按钮
        document.getElementById('btnEditFromDetail').addEventListener('click', () => {
            if (this.currentItemId) {
                this.editItem(this.currentItemId);
            }
        });

        // 详情弹窗 - 删除按钮
        document.getElementById('btnDeleteFromDetail').addEventListener('click', () => {
            if (this.currentItemId) {
                this.deleteItem(this.currentItemId);
            }
        });

        // ✅ 修复：删除 Interaction.endPlaceMode() 调用
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.close;
                document.getElementById(modalId).classList.remove('active');
                // ✅ 删除：Interaction.endPlaceMode();
            });
        });

        // ✅ 修复：删除 Interaction.endPlaceMode() 调用
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    // ✅ 删除：Interaction.endPlaceMode();
                }
            });
        });
    },

    // ==================== 初始化选择器 ====================

    // 初始化分类选择器
    initCategorySelect() {
        const select = document.getElementById('itemCategory');
        if (!select) return;

        select.innerHTML = CATEGORIES.map(cat =>
            `<option value="${cat}">${cat}</option>`
        ).join('');
    },

    // 初始化视图选择器
    initViewSelect() {
        const select = document.getElementById('itemView');
        if (!select) return;

        select.innerHTML = VIEW_CONFIG.map(view =>
            `<option value="${view.id}">${view.name}</option>`
        ).join('');

        // 视图变化时更新层选项
        select.addEventListener('change', () => {
            this.updateLayerSelect(select.value);
        });
    },

    // 更新层选择器
    updateLayerSelect(viewId) {
        const layerSelect = document.getElementById('itemLayer');
        if (!layerSelect) return;

        const layers = Storage.getLayersByView(viewId);
        layerSelect.innerHTML = layers.map(layer =>
            `<option value="${layer.id}">${layer.name}</option>`
        ).join('');
    },

    // ==================== 物品管理 ====================

    // 打开添加物品弹窗
    openAddItemModal() {
        this.currentItemId = null;
        document.getElementById('modalTitle').textContent = '添加物品';
        document.getElementById('itemForm').reset();
        document.getElementById('itemId').value = '';
        this.updateLayerSelect(document.getElementById('itemView').value);
        document.getElementById('itemModal').classList.add('active');
    },

    // 编辑物品
    editItem(id) {
        const item = Storage.getItem(id);
        if (!item) return;

        this.currentItemId = id;
        document.getElementById('modalTitle').textContent = '编辑物品';
        document.getElementById('itemId').value = item.id;
        document.getElementById('itemName').value = item.name;
        document.getElementById('itemCategory').value = item.category;
        document.getElementById('itemStatus').value = item.status;
        document.getElementById('itemView').value = item.viewId;
        this.updateLayerSelect(item.viewId);
        document.getElementById('itemLayer').value = item.layerId || '';
        document.getElementById('itemDescription').value = item.description || '';
        document.getElementById('itemNote').value = item.note || '';
        document.getElementById('itemModal').classList.add('active');
    },

    // 提交物品表单
    submitItemForm() {
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
            // 编辑
            Storage.updateItem(parseInt(itemId), itemData);
        } else {
            // 新增
            const newItem = Storage.addItem({
                ...itemData,
                hasBlock: false,
                block: null
            });
            this.currentItemId = newItem.id;
        }

        document.getElementById('itemModal').classList.remove('active');
        Render.updateStats();
        Search.renderItemList();

        // 询问是否添加色块
        if (!itemId) {
            setTimeout(() => {
                if (confirm('物品已创建，是否添加位置色块？')) {
                    this.openBlockModal(this.currentItemId);
                }
            }, 100);
        }
    },

    // 删除物品
    deleteItem(id) {
        const item = Storage.getItem(id);
        if (!item) return;

        let confirmMsg = `确定删除"${item.name}"吗？`;
        if (item.hasBlock) {
            confirmMsg += '\n\n该物品有色块，将一并删除。';
        }

        if (confirm(confirmMsg)) {
            Storage.deleteItem(id);
            document.getElementById('detailModal').classList.remove('active');
            Render.renderView(Layer.currentViewId, Layer.currentLayerId);
            Render.updateStats();
            Search.renderItemList();
        }
    },

    // ==================== 色块管理 ====================

    // 打开色块编辑弹窗
// js/crud.js 的 openBlockModal 方法

openBlockModal(itemId) {
    const item = Storage.getItem(itemId);
    if (!item) return;

    this.currentItemId = itemId;
    document.getElementById('blockItemId').value = itemId;

    // 如果已有色块，加载现有配置
    if (item.hasBlock && item.block) {
        const shapeBtn = document.querySelector(`.shape-btn[data-shape="${item.block.appearance.shape}"]`);
        if (shapeBtn) shapeBtn.click();
        document.getElementById('blockColor').value = item.block.appearance.color;
        document.getElementById('blockColorHex').value = item.block.appearance.color;
    } else {
        // ✅ 修复：添加容错处理
        let defaultColor = '#4A90E2';  // 默认蓝色

        if (typeof CATEGORY_COLORS !== 'undefined') {
            defaultColor = CATEGORY_COLORS[item.category] || '#4A90E2';
        } else if (window.CATEGORY_COLORS) {
            defaultColor = window.CATEGORY_COLORS[item.category] || '#4A90E2';
        }

        document.querySelector('.shape-btn[data-shape="rectangle"]').click();
        document.getElementById('blockColor').value = defaultColor;
        document.getElementById('blockColorHex').value = defaultColor;
    }

    document.getElementById('blockModal').classList.add('active');
},

    // 编辑色块（从右键菜单）- 改为删除后重新添加
    editBlock(itemId) {
        const item = Storage.getItem(itemId);
        if (!item) return;

        if (confirm('编辑色块需要先删除现有色块，确定继续吗？')) {
            Storage.deleteBlock(itemId);
            this.openBlockModal(itemId);
        }
    },

    // 删除色块（保留物品）
    deleteBlock(itemId) {
        const item = Storage.getItem(itemId);
        if (!item) return;

        if (confirm(`确定删除"${item.name}"的位置色块吗？\n\n物品信息将保留，只是不再在视图中显示。`)) {
            Storage.deleteBlock(itemId);
            Render.renderView(Layer.currentViewId, Layer.currentLayerId);
            Render.updateStats();
            Search.renderItemList();
        }
    },

    // ✅ 删除：getSizeKey() 方法（不再需要）
    // ✅ 删除：updateBlockPreview() 方法（不再需要）

    // 确认放置色块（在当前视图中心生成）
    confirmBlockPlace() {
        const itemId = this.currentItemId;
        if (!itemId) return;

        const shape = document.querySelector('.shape-btn.active').dataset.shape;
        const color = document.getElementById('blockColor').value;
        // ✅ 使用默认大小 M（60x45）
        const sizeConfig = { width: 60, height: 45 };

        // 获取当前视图和层
        const view = VIEW_CONFIG.find(v => v.id === Layer.currentViewId);
        const layers = Storage.getLayersByView(Layer.currentViewId);
        const layerId = layers[0]?.id;

        if (!view || !layerId) {
            alert('当前视图或层无效');
            return;
        }

        // 计算视图中心位置
        const viewWidth = view.width * 5;
        const viewHeight = view.height * 5;
        const centerX = Math.max(0, (viewWidth / 2) - (sizeConfig.width / 2));
        const centerY = Math.max(0, (viewHeight / 2) - (sizeConfig.height / 2));

        // 保存色块配置
        Storage.setBlock(itemId, {
            appearance: {
                shape: shape,
                color: color,
                size: sizeConfig
            },
            position: { x: centerX, y: centerY }
        });

        // 更新物品所在视图和层
        Storage.updateItem(itemId, {
            viewId: Layer.currentViewId,
            layerId: layerId
        });

        // 关闭弹窗
        document.getElementById('blockModal').classList.remove('active');

        // 刷新视图
        Render.renderView(Layer.currentViewId, Layer.currentLayerId);
        Render.updateStats();
        Search.renderItemList();

        alert('色块已添加！请拖拽到目标位置，拖动边缘可缩放');
    },

    // ✅ 删除：openPlaceModal() 方法（不再需要）

// ==================== 配置管理（新增）====================

// 打开配置管理弹窗
openManageModal() {
    this.renderCategoryList();
    document.getElementById('categoryModal').classList.add('active');
},

// 渲染分类列表
renderCategoryList() {
    const container = document.getElementById('categoryList');
    if (!container) return;

    container.innerHTML = CATEGORIES.map(cat => `
        <div class="category-item" data-category="${cat}">
            <span>${cat}</span>
            <div class="category-actions">
                <button class="btn btn-small btn-secondary" onclick="CRUD.renameCategory('${cat}')">重命名</button>
                <button class="btn btn-small" style="background: #E74C3C;" onclick="CRUD.deleteCategory('${cat}')">删除</button>
            </div>
        </div>
    `).join('');
},

// 添加分类
addCategory() {
    const name = document.getElementById('newCategoryName').value.trim();
    if (!name) {
        alert('请输入分类名称');
        return;
    }

    const result = Storage.addCategory(name);
    if (result.success) {
        document.getElementById('newCategoryName').value = '';
        this.renderCategoryList();
        Render.updateCategoryFilter();  // ✅ 更新搜索筛选
        this.initCategorySelect();      // ✅ 更新物品表单分类下拉框
        alert('添加成功');
    } else {
        alert(result.message);
    }
},

// 重命名分类
renameCategory(oldName) {
    const newName = prompt('请输入新名称:', oldName);
    if (newName && newName.trim() && newName !== oldName) {
        const result = Storage.renameCategory(oldName, newName.trim());
        if (result.success) {
            this.renderCategoryList();
            Render.updateCategoryFilter();  // ✅ 更新搜索筛选
            this.initCategorySelect();      // ✅ 更新物品表单分类下拉框
            alert(result.message);
        } else {
            alert(result.message);
        }
    }
},

// 删除分类
deleteCategory(name) {
    const result = Storage.deleteCategory(name);
    if (result.success) {
        this.renderCategoryList();
        Render.updateCategoryFilter();  // ✅ 更新搜索筛选
        this.initCategorySelect();      // ✅ 更新物品表单分类下拉框
        alert('删除成功');
    } else {
        alert(result.message);
    }
},

    // ==================== 物品详情 ====================

    // 显示物品详情
    showItemDetail(id) {
        const item = Storage.getItem(id);
        if (!item) return;

        this.currentItemId = id;
        const view = VIEW_CONFIG.find(v => v.id === item.viewId);
        const layers = Storage.getLayersByView(item.viewId);
        const layer = layers.find(l => l.id === item.layerId);

        document.getElementById('detailTitle').textContent = item.name;
        document.getElementById('detailContent').innerHTML = `
            <div style="margin-bottom: 15px;">
                <strong style="color: var(--accent-gold);">分类：</strong> ${item.category}
            </div>
            <div style="margin-bottom: 15px;">
                <strong style="color: var(--accent-gold);">状态：</strong> 
                <span style="color: ${item.status === '在位' ? '#2d5016' : item.status === '带走' ? '#8b7508' : '#8b3a3a'};">
                    ${item.status}
                </span>
            </div>
            <div style="margin-bottom: 15px;">
                <strong style="color: var(--accent-gold);">位置：</strong> ${view ? view.name : '-'} → ${layer ? layer.name : '-'}
            </div>
            <div style="margin-bottom: 15px;">
                <strong style="color: var(--accent-gold);">简介：</strong> ${item.description || '无'}
            </div>
            <div style="margin-bottom: 15px;">
                <strong style="color: var(--accent-gold);">备注：</strong> ${item.note || '无'}
            </div>
            <div style="margin-bottom: 15px;">
                <strong style="color: var(--accent-gold);">色块：</strong> ${item.hasBlock ? '已设置' : '未设置'}
            </div>
        `;

        document.getElementById('detailModal').classList.add('active');
    },

    // ==================== 状态切换 ====================

    // 切换物品状态
    toggleItemStatus(id, newStatus) {
        Storage.updateItem(id, { status: newStatus });
        Render.renderView(Layer.currentViewId, Layer.currentLayerId);
        Render.updateStats();
        Search.renderItemList();
    }
};