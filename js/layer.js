// js/layer.js
const Layer = {
    currentViewId: 'bed',
    currentLayerId: null,

    init() {
        // ✅ 关键：先渲染视图标签页
        this.renderViewTabs();
        this.bindEvents();
        this.switchView('bed');
    },

    // ✅ 关键：渲染视图标签页（动态生成）
    renderViewTabs() {
        const container = document.getElementById('viewTabs');
        if (!container) return;
        const addButton = container.querySelector('.view-add');
        container.innerHTML = '';
        VIEW_CONFIG.forEach(view => {
            const tab = document.createElement('button');
            tab.className = `tab ${view.id === this.currentViewId ? 'active' : ''}`;
            tab.dataset.view = view.id;
            tab.textContent = view.name;
            container.appendChild(tab);
        });
        if (addButton) container.appendChild(addButton);
    },

    bindEvents() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab') && e.target.dataset.view) {
                this.switchView(e.target.dataset.view);
            }
            if (e.target.classList.contains('layer-add')) this.openAddLayerModal();
            if (e.target.classList.contains('layer-tab')) this.switchLayer(e.target.dataset.layerId);
            if (e.target.classList.contains('view-add')) this.openAddViewModal();
        });
        document.addEventListener('contextmenu', (e) => {
            if (e.target.classList.contains('layer-tab')) {
                e.preventDefault();
                this.showLayerContextMenu(e);
            }
            if (e.target.classList.contains('tab') && e.target.dataset.view) {
                e.preventDefault();
                this.showViewContextMenu(e, e.target.dataset.view);
            }
        });
        document.addEventListener('click', () => {
            document.getElementById('layerContextMenu')?.remove();
            document.getElementById('viewContextMenu')?.remove();
        });
        const layerForm = document.getElementById('layerForm');
        if (layerForm) layerForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitAddLayer(); });
        const viewForm = document.getElementById('viewForm');
        if (viewForm) viewForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitAddView(); });
    },

    switchView(viewId) {
        this.currentViewId = viewId;
        const view = VIEW_CONFIG.find(v => v.id === viewId);
        if (!view) return;
        // ✅ 关键：重新渲染标签页
        this.renderViewTabs();
        const zoneLabel = document.getElementById('zoneLabel');
        if (zoneLabel) zoneLabel.textContent = view.name;
        const layers = Storage.getLayersByView(viewId);
        if (layers.length === 0) {
            const defaultLayer = Storage.addLayer({ name: '第一层', viewId, order: 0 });
            this.currentLayerId = defaultLayer.id;
        } else {
            this.currentLayerId = layers[0].id;
        }
        this.renderLayerTabs(layers);
        Render.renderView(viewId, this.currentLayerId);
        Search.renderItemList();
    },

    renderLayerTabs(layers) {
        const container = document.getElementById('layerTabs');
        if (!container) return;
        container.innerHTML = layers.map(layer => {
            const itemCount = Storage.getItemsByViewAndLayer(this.currentViewId, layer.id).length;
            const isActive = layer.id === this.currentLayerId;
            return `<div class="layer-tab ${isActive ? 'active' : ''}" data-layer-id="${layer.id}">${layer.name}<span class="count">(${itemCount})</span></div>`;
        }).join('') + `<div class="layer-add">+ 添加层</div>`;
    },

    openAddLayerModal() {
        const layerModal = document.getElementById('layerModal');
        if (layerModal) {
            document.getElementById('layerViewId').value = this.currentViewId;
            document.getElementById('layerName').value = '';
            layerModal.classList.add('active');
        }
    },

    submitAddLayer() {
        const viewId = document.getElementById('layerViewId').value;
        const name = document.getElementById('layerName').value.trim();
        if (!name) { alert('请输入层名称'); return; }
        const layers = Storage.getLayersByView(viewId);
        Storage.addLayer({ name, viewId, order: layers.length });
        document.getElementById('layerModal').classList.remove('active');
        this.switchView(viewId);
    },

    switchLayer(layerId) {
        this.currentLayerId = layerId;
        this.renderLayerTabs(Storage.getLayersByView(this.currentViewId));
        Render.renderView(this.currentViewId, layerId);
    },

    showLayerContextMenu(e) {
        const layerId = e.target.dataset.layerId;
        const layers = Storage.getLayersByView(this.currentViewId);
        const canDelete = layers.length > 1;
        const menu = document.createElement('div');
        menu.id = 'layerContextMenu';
        menu.style.cssText = `position:fixed;left:${e.pageX}px;top:${e.pageY}px;background:var(--card-bg);border:1px solid #333;border-radius:4px;padding:5px 0;z-index:2000;`;
        menu.innerHTML = `<div style="padding:8px 15px;cursor:pointer;" onclick="Layer.renameLayer('${layerId}')">重命名</div>${canDelete ? `<div style="padding:8px 15px;cursor:pointer;color:#E74C3C;" onclick="Layer.deleteLayer('${layerId}')">删除</div>` : ''}`;
        document.body.appendChild(menu);
    },

    renameLayer(layerId) {
        const layer = Storage.getLayersByView(this.currentViewId).find(l => l.id === layerId);
        if (!layer) return;
        const newName = prompt('请输入新名称:', layer.name);
        if (newName && newName.trim()) {
            Storage.updateLayer(layerId, { name: newName.trim() });
            this.switchView(this.currentViewId);
        }
    },

    deleteLayer(layerId) {
        if (Storage.deleteLayer(layerId)) this.switchView(this.currentViewId);
    },

    showViewContextMenu(e, viewId) {
        const view = VIEW_CONFIG.find(v => v.id === viewId);
        if (!view) return;
        const menu = document.createElement('div');
        menu.id = 'viewContextMenu';
        menu.style.cssText = `position:fixed;left:${e.pageX}px;top:${e.pageY}px;background:var(--card-bg);border:1px solid #333;border-radius:4px;padding:5px 0;z-index:2000;`;
        menu.innerHTML = `<div style="padding:8px 15px;cursor:pointer;" onclick="Layer.renameView('${viewId}')">重命名</div><div style="padding:8px 15px;cursor:pointer;" onclick="Layer.resizeView('${viewId}')">调整尺寸</div>`;
        document.body.appendChild(menu);
    },

    renameView(viewId) {
        const view = VIEW_CONFIG.find(v => v.id === viewId);
        if (!view) return;
        const newName = prompt('请输入新名称:', view.name);
        if (newName && newName.trim()) {
            Storage.updateView(viewId, { name: newName.trim() });
            // ✅ 关键：重新渲染标签页
            this.renderViewTabs();
            this.switchView(viewId);
        }
    },

    resizeView(viewId) {
        const view = VIEW_CONFIG.find(v => v.id === viewId);
        if (!view) return;
        const width = prompt('请输入视图宽度 (当前:' + view.width + '):', view.width);
        const height = prompt('请输入视图高度 (当前:' + view.height + '):', view.height);
        if (width && height && !isNaN(width) && !isNaN(height)) {
            const newWidth = parseInt(width);
            const newHeight = parseInt(height);
            if (newWidth > 0 && newHeight > 0) {
                Storage.updateView(viewId, { width: newWidth, height: newHeight });
                // ✅ 关键：重新渲染标签页
                this.renderViewTabs();
                this.switchView(viewId);
            }
        }
    },

    openAddViewModal() {
        const viewModal = document.getElementById('viewModal');
        if (viewModal) {
            document.getElementById('viewName').value = '';
            document.getElementById('viewWidth').value = '100';
            document.getElementById('viewHeight').value = '80';
            viewModal.classList.add('active');
        }
    },

    submitAddView() {
        const name = document.getElementById('viewName').value.trim();
        const width = parseInt(document.getElementById('viewWidth').value);
        const height = parseInt(document.getElementById('viewHeight').value);
        if (!name) { alert('请输入视图名称'); return; }
        if (!width || !height || width <= 0 || height <= 0) { alert('请输入有效的尺寸'); return; }
        const view = Storage.addView({ name, width, height, group: 'custom' });
        document.getElementById('viewModal').classList.remove('active');
        // ✅ 关键：切换到新视图（会自动渲染新标签）
        this.switchView(view.id);
    },

    handleDropToLayer(itemId, targetLayerId) {
        if (itemId && targetLayerId) {
            Storage.moveItemToLayer(itemId, targetLayerId);
            Render.renderView(this.currentViewId, this.currentLayerId);
            Search.renderItemList();
            return true;
        }
        return false;
    }
};