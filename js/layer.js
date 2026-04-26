// js/layer.js
// 视图和层管理 - 全异步适配

const Layer = {
    currentViewId: 'bed',
    currentLayerId: null,

    async init() {
        await this.renderViewTabs();
        this.bindEvents();
        await this.switchView('bed');
    },

    async renderViewTabs() {
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
        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('tab') && e.target.dataset.view) {
                await this.switchView(e.target.dataset.view);
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

        const layerForm = document.getElementById('layerForm');
        if (layerForm) layerForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitAddLayer(); });

        const viewForm = document.getElementById('viewForm');
        if (viewForm) viewForm.addEventListener('submit', (e) => { e.preventDefault(); this.submitAddView(); });
    },

    async switchView(viewId) {
        this.currentViewId = viewId;
        const view = VIEW_CONFIG.find(v => v.id === viewId);
        if (!view) return;

        await this.renderViewTabs();

        const zoneLabel = document.getElementById('zoneLabel');
        if (zoneLabel) zoneLabel.textContent = view.name;

        const layers = await Storage.getLayersByView(viewId);
        if (layers.length === 0) {
            const defaultLayer = await Storage.addLayer({ name: '第一层', viewId, order: 0 });
            this.currentLayerId = defaultLayer.id;
        } else {
            this.currentLayerId = layers[0].id;
        }

        await this.renderLayerTabs(layers);
        await Render.renderView(viewId, this.currentLayerId);
        await Search.renderItemList();
    },

    async renderLayerTabs(layers) {
        const container = document.getElementById('layerTabs');
        if (!container) return;

        container.innerHTML = layers.map(layer => {
            const isActive = layer.id === this.currentLayerId;
            return `<div class="layer-tab ${isActive ? 'active' : ''}" data-layer-id="${layer.id}">${layer.name}</div>`;
        }).join('') + `<div class="layer-add">+ 添加层</div>`;
    },

    openAddLayerModal() {
        document.getElementById('layerViewId').value = this.currentViewId;
        document.getElementById('layerName').value = '';
        document.getElementById('layerModal').classList.add('active');
    },

    async submitAddLayer() {
        const viewId = document.getElementById('layerViewId').value;
        const name = document.getElementById('layerName').value.trim();
        if (!name) { alert('请输入层名称'); return; }

        await Storage.addLayer({ name, viewId, order: 0 });
        document.getElementById('layerModal').classList.remove('active');
        await this.switchView(viewId);
    },

    async switchLayer(layerId) {
        this.currentLayerId = layerId;
        const layers = await Storage.getLayersByView(this.currentViewId);
        await this.renderLayerTabs(layers);
        await Render.renderView(this.currentViewId, layerId);
    },

    showLayerContextMenu(e) {
        const layerId = e.target.dataset.layerId;
        const menu = document.createElement('div');
        menu.id = 'layerContextMenu';
        menu.style.cssText = `
            position: fixed;
            left: ${e.pageX}px;
            top: ${e.pageY}px;
            background: var(--bg-surface);
            border: 1px solid var(--border-secondary);
            border-radius: var(--radius-small);
            padding: 5px 0;
            z-index: 2000;
        `;
        menu.innerHTML = `
            <div class="context-menu-item" style="padding: 8px 15px; cursor: pointer;" onclick="Layer.renameLayer('${layerId}')">重命名</div>
            <div class="context-menu-item" style="padding: 8px 15px; cursor: pointer; color: #E74C3C;" onclick="Layer.deleteLayer('${layerId}')">删除</div>
        `;
        document.body.appendChild(menu);

        const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
        setTimeout(() => document.addEventListener('click', closeMenu), 100);
    },

    async renameLayer(layerId) {
        const layers = await Storage.getLayersByView(this.currentViewId);
        const layer = layers.find(l => l.id === layerId);
        if (!layer) return;

        const newName = prompt('请输入新名称:', layer.name);
        if (newName && newName.trim()) {
            await Storage.updateLayer(layerId, { name: newName.trim() });
            await this.switchView(this.currentViewId);
        }
    },

    async deleteLayer(layerId) {
        if (await Storage.deleteLayer(layerId)) {
            await this.switchView(this.currentViewId);
        }
    },

    showViewContextMenu(e, viewId) {
        const menu = document.createElement('div');
        menu.id = 'viewContextMenu';
        menu.style.cssText = `
            position: fixed;
            left: ${e.pageX}px;
            top: ${e.pageY}px;
            background: var(--bg-surface);
            border: 1px solid var(--border-secondary);
            border-radius: var(--radius-small);
            padding: 5px 0;
            z-index: 2000;
        `;
        menu.innerHTML = `
            <div class="context-menu-item" style="padding: 8px 15px; cursor: pointer;" onclick="Layer.renameView('${viewId}')">重命名</div>
            <div class="context-menu-item" style="padding: 8px 15px; cursor: pointer;" onclick="Layer.resizeView('${viewId}')">调整尺寸</div>
        `;
        document.body.appendChild(menu);

        const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
        setTimeout(() => document.addEventListener('click', closeMenu), 100);
    },

    async renameView(viewId) {
        const view = VIEW_CONFIG.find(v => v.id === viewId);
        if (!view) return;

        const newName = prompt('请输入新名称:', view.name);
        if (newName && newName.trim()) {
            await Storage.updateView(viewId, { name: newName.trim() });
            await this.switchView(viewId);
        }
    },

    async resizeView(viewId) {
        const view = VIEW_CONFIG.find(v => v.id === viewId);
        if (!view) return;

        const width = prompt('请输入视图宽度:', view.width);
        const height = prompt('请输入视图高度:', view.height);
        if (width && height && !isNaN(width) && !isNaN(height)) {
            const newWidth = parseInt(width);
            const newHeight = parseInt(height);
            if (newWidth > 0 && newHeight > 0) {
                await Storage.updateView(viewId, { width: newWidth, height: newHeight });
                await this.switchView(viewId);
            }
        }
    },

    openAddViewModal() {
        document.getElementById('viewName').value = '';
        document.getElementById('viewWidth').value = '100';
        document.getElementById('viewHeight').value = '80';
        document.getElementById('viewModal').classList.add('active');
    },

    async submitAddView() {
        const name = document.getElementById('viewName').value.trim();
        const width = parseInt(document.getElementById('viewWidth').value);
        const height = parseInt(document.getElementById('viewHeight').value);

        if (!name) { alert('请输入视图名称'); return; }
        if (!width || !height || width <= 0 || height <= 0) { alert('请输入有效的尺寸'); return; }

        const view = await Storage.addView({ name, width, height, group: 'custom' });
        document.getElementById('viewModal').classList.remove('active');
        await this.switchView(view.id);
    },

    async handleDropToLayer(itemId, targetLayerId) {
        if (itemId && targetLayerId) {
            await Storage.moveItemToLayer(itemId, targetLayerId);
            await Render.renderView(this.currentViewId, this.currentLayerId);
            await Search.renderItemList();
            return true;
        }
        return false;
    }
};
