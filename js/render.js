// js/render.js
const Render = {
    // 初始化渲染系统
    init() {
        this.bindEvents();
    },

    // 绑定事件
    bindEvents() {
        // 窗口大小变化时重新渲染
        window.addEventListener('resize', () => {
            this.renderView(Layer.currentViewId, Layer.currentLayerId);
        });
    },

    // ==================== 视图渲染 ====================

    // 渲染视图
    renderView(viewId, layerId) {
        const view = VIEW_CONFIG.find(v => v.id === viewId);
        if (!view) return;

        const mapEl = document.getElementById('currentMap');
        if (!mapEl) return;

        // 清空现有内容（保留 zone-label）
        const labelEl = mapEl.querySelector('.zone-label');
        mapEl.innerHTML = '';
        if (labelEl) mapEl.appendChild(labelEl);

        // 设置视图尺寸比例
        mapEl.style.aspectRatio = `${view.width} / ${view.height}`;

        // 获取该层的所有物品
        const items = Storage.getItemsByViewAndLayer(viewId, layerId);

        // 渲染物品色块
        items.forEach(item => {
            if (item.hasBlock && item.block) {
                this.renderItemBlock(item, mapEl);
            }
        });

        // 渲染物品清单
        Search.renderItemList();
    },

    // ==================== 色块渲染 ====================

    // 渲染单个物品色块
    renderItemBlock(item, container) {
        // 守卫：检查色块数据完整性
        if (!item.block || !item.block.appearance || !item.block.position) {
            console.warn(`物品 ${item.id} 色块数据不完整，跳过渲染`, item);
            return;
        }

        const block = document.createElement('div');

        // 安全获取 shape，非法值回退到默认
        const shape = ['rectangle', 'square', 'circle', 'irregular'].includes(item.block.appearance.shape)
            ? item.block.appearance.shape
            : 'rectangle';
        block.className = `item-block ${shape}`;

        block.dataset.itemId = item.id;
        block.dataset.status = item.status;
        block.draggable = true;

        // 安全设置颜色，非法值回退到默认
        const color = /^#?[0-9A-Fa-f]{6}$/.test(item.block.appearance.color)
            ? item.block.appearance.color
            : '#4A90E2';
        block.style.backgroundColor = color;

        // 安全设置尺寸
        const size = item.block.appearance.size || { width: 60, height: 45 };
        block.style.width = `${size.width}px`;
        block.style.height = `${size.height}px`;

        // ✅ 修复：使用容器实际宽度计算边界，与拖拽逻辑保持一致
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
        const maxX = containerWidth - size.width;
        const maxY = containerHeight - size.height;

        // ✅ 修复：确保位置不为负值，且在边界内
        const x = Math.max(0, Math.min(item.block.position.x, maxX));
        const y = Math.max(0, Math.min(item.block.position.y, maxY));

        block.style.left = `${x}px`;
        block.style.top = `${y}px`;

        // 设置文字
        const textEl = document.createElement('span');
        textEl.className = 'item-block-text';
        textEl.textContent = item.name;
        block.appendChild(textEl);

        // 检查是否需要引线标注（色块太小）
        if (size.width < 50 || size.height < 40) {
            this.addLabelLine(block, item.name);
        }

        // 添加边界拖拽控制点
        this.addResizeHandles(block, shape);

        // 绑定事件
        this.bindBlockEvents(block, item);

        container.appendChild(block);
    },

    // 添加引线标注
    addLabelLine(blockEl, itemName) {
        const lineContainer = document.createElement('div');
        lineContainer.className = 'item-label-line';

        // 创建 SVG 引线
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100');
        svg.setAttribute('height', '50');
        svg.style.position = 'absolute';
        svg.style.left = '100%';
        svg.style.top = '0';

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '0');
        line.setAttribute('y1', '25');
        line.setAttribute('x2', '50');
        line.setAttribute('y2', '25');
        line.setAttribute('stroke', 'var(--accent-gold)');
        line.setAttribute('stroke-width', '1');

        svg.appendChild(line);
        lineContainer.appendChild(svg);

        // 创建文字标签
        const textEl = document.createElement('div');
        textEl.className = 'item-label-text';
        textEl.textContent = itemName;
        textEl.style.position = 'absolute';
        textEl.style.left = '55px';
        textEl.style.top = '15px';

        lineContainer.appendChild(textEl);
        blockEl.appendChild(lineContainer);
    },

    // 添加边界拖拽控制点
    addResizeHandles(blockEl, shape) {
        // 圆形形状只显示对角控制点
        if (shape === 'circle') {
            ['nw', 'ne', 'sw', 'se'].forEach(pos => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${pos}`;
                handle.dataset.handle = pos;
                blockEl.appendChild(handle);
            });
        } else {
            // 其他形状显示上下左右边界控制点
            ['n', 's', 'e', 'w'].forEach(pos => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${pos}`;
                handle.dataset.handle = pos;
                blockEl.appendChild(handle);
            });
        }
    },

    // ==================== 色块事件绑定 ====================

    // 绑定色块事件（修复：改为双击显示详情）
    bindBlockEvents(blockEl, item) {
        // ✅ 修复：双击显示详情（避免拖拽时误触发）
        blockEl.addEventListener('dblclick', (e) => {
            if (!e.target.classList.contains('resize-handle')) {
                CRUD.showItemDetail(item.id);
            }
        });

        // 鼠标按下开始拖拽（视图内移动）
        blockEl.addEventListener('mousedown', (e) => {
            if (!e.target.classList.contains('resize-handle')) {
                e.preventDefault();
                Interaction.startDrag(e, blockEl, item);
            }
        });

        // 拖拽移动（跨层拖拽）
        blockEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'item',
                itemId: item.id,
                viewId: item.viewId,
                layerId: item.layerId
            }));
            e.dataTransfer.effectAllowed = 'move';
        });

        // 边界拖拽调整大小
        const handles = blockEl.querySelectorAll('.resize-handle');
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                Interaction.startResize(e, blockEl, item, handle.dataset.handle);
            });
        });

        // 右键菜单
        blockEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showBlockContextMenu(e, item);
        });
    },

    // ==================== 右键菜单 ====================

    // 显示色块右键菜单
    showBlockContextMenu(e, item) {
        const menu = document.createElement('div');
        menu.id = 'blockContextMenu';
        menu.style.cssText = `
            position: fixed;
            left: ${e.pageX}px;
            top: ${e.pageY}px;
            background: var(--card-bg);
            border: 1px solid #333;
            border-radius: 4px;
            padding: 5px 0;
            z-index: 2000;
        `;

        menu.innerHTML = `
            <div style="padding: 8px 15px; cursor: pointer;" onclick="CRUD.deleteBlock(${item.id})">删除色块</div>
            <div style="padding: 8px 15px; cursor: pointer;" onclick="CRUD.showItemDetail(${item.id})">物品详情</div>
            <div style="padding: 8px 15px; cursor: pointer; color: #E74C3C;" onclick="CRUD.deleteItem(${item.id})">删除物品</div>
        `;

        document.body.appendChild(menu);

        // 点击其他地方关闭菜单
        const closeMenu = () => {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        };
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);
    },

    // ==================== 统计更新 ====================

    // 更新统计栏
    updateStats() {
        const stats = Storage.getStats();
        document.getElementById('totalItems').textContent = stats.total;
        document.getElementById('withBlockCount').textContent = stats.withBlock;
        document.getElementById('inPlaceCount').textContent = stats.inPlace;
        document.getElementById('takenCount').textContent = stats.taken;
        document.getElementById('borrowedCount').textContent = stats.borrowed;
    },

    // ==================== 分类筛选更新 ====================

    // 更新分类筛选选项
    updateCategoryFilter() {
        const select = document.getElementById('categoryFilter');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">全部分类</option>' +
            CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        select.value = currentValue;
    }
};