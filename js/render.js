// js/render.js
// 渲染系统 - 全异步适配

const Render = {
    init() {
        this.bindEvents();
        this.labelLayer = null;  // 引线层引用
        this.labelLines = {};    // 存储所有引线
    },

    bindEvents() {
        window.addEventListener('resize', () => {
            this.renderView(Layer.currentViewId, Layer.currentLayerId);
        });
    },

    // ==================== 视图渲染 ====================

    async renderView(viewId, layerId) {
        const view = VIEW_CONFIG.find(v => v.id === viewId);
        if (!view) return;

        const mapEl = document.getElementById('currentMap');
        if (!mapEl) return;

        // 保存区域标签
        const labelEl = mapEl.querySelector('.zone-label');
        mapEl.innerHTML = '';
        if (labelEl) mapEl.appendChild(labelEl);

        mapEl.style.aspectRatio = `${view.width} / ${view.height}`;

        // 创建引线层
        this.createLabelLayer(mapEl);

        // 异步获取该层物品
        const items = await Storage.getItemsByViewAndLayer(viewId, layerId);

        for (const item of items) {
            if (item.hasBlock && item.block) {
                this.renderItemBlock(item, mapEl);
            } else if (item.labelEnabled) {
                // 无色块但启用了引线标注的物品
                this.renderLabelOnly(item, mapEl);
            }
        }

        // 渲染所有引线标注
        this.renderAllLabels(items, mapEl);
    },

    // 创建独立的引线层
    createLabelLayer(container) {
        // 移除旧的引线层
        const oldLayer = container.querySelector('.item-label-layer');
        if (oldLayer) oldLayer.remove();

        // 创建新的SVG引线层
        this.labelLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.labelLayer.classList.add('item-label-layer');
        this.labelLayer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            overflow: visible;
            z-index: 100;
        `;
        container.appendChild(this.labelLayer);
        this.labelLines = {};
    },

    // 渲染所有引线标注
    renderAllLabels(items, container) {
        for (const item of items) {
            if (!item.labelEnabled) continue;

            const blockEl = container.querySelector(`[data-item-id="${item.id}"]`);
            if (!blockEl) continue;

            const labelPos = item.labelPosition || { anchor: 'right', offsetX: 0, offsetY: 0 };
            this.renderDynamicLabel(blockEl, item, labelPos, container);
        }
    },

    // 动态引线渲染
    renderDynamicLabel(blockEl, item, labelPos, container) {
        const itemId = item.id;

        // 移除旧的引线和标签
        const oldLine = this.labelLayer.querySelector(`[data-line-id="${itemId}"]`);
        const oldText = container.querySelector(`[data-label-id="${itemId}"]`);
        if (oldLine) oldLine.remove();
        if (oldText) oldText.remove();

        // 获取锚点配置
        const anchorConfig = this.getAnchorConfig(labelPos.anchor);

        // 获取色块位置
        const blockRect = blockEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const blockCenterX = blockRect.left - containerRect.left + blockRect.width / 2;
        const blockCenterY = blockRect.top - containerRect.top + blockRect.height / 2;

        // 计算起点（色块边缘）
        let startX = blockRect.left - containerRect.left;
        let startY = blockRect.top - containerRect.top + blockRect.height / 2;
        let endOffsetX = anchorConfig.endOffsetX;
        let endOffsetY = anchorConfig.endOffsetY;

        // 根据锚点调整起点和终点
        if (labelPos.anchor === 'right') {
            startX = blockRect.right - containerRect.left;
            startY = blockRect.top - containerRect.top + blockRect.height / 2;
            endOffsetX = 80;
            endOffsetY = 0;
        } else if (labelPos.anchor === 'left') {
            startX = blockRect.left - containerRect.left;
            startY = blockRect.top - containerRect.top + blockRect.height / 2;
            endOffsetX = -80;
            endOffsetY = 0;
        } else if (labelPos.anchor === 'top') {
            startX = blockRect.left - containerRect.left + blockRect.width / 2;
            startY = blockRect.top - containerRect.top;
            endOffsetX = 0;
            endOffsetY = -60;
        } else if (labelPos.anchor === 'bottom') {
            startX = blockRect.left - containerRect.left + blockRect.width / 2;
            startY = blockRect.bottom - containerRect.top;
            endOffsetX = 0;
            endOffsetY = 60;
        }

        // 应用保存的起点偏移
        const startOffsetX = item.labelPosition?.startOffsetX || 0;
        const startOffsetY = item.labelPosition?.startOffsetY || 0;
        startX = blockCenterX + startOffsetX;
        startY = blockCenterY + startOffsetY;

        // 应用用户拖拽的偏移
        let endX = startX + endOffsetX + (item.labelPosition?.offsetX || 0);
        let endY = startY + endOffsetY + (item.labelPosition?.offsetY || 0);

        // 创建文字标签
        const textEl = document.createElement('div');
        textEl.className = 'item-label-text';
        textEl.dataset.labelId = itemId;
        textEl.textContent = item.name;
        textEl.style.cssText = `
            position: absolute;
            left: ${endX}px;
            top: ${endY}px;
            background: #191a1b;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 510;
            white-space: nowrap;
            border: 1px solid rgba(255,255,255,0.08);
            color: #f7f8f8;
            font-family: var(--font-mono);
            cursor: grab;
            user-select: none;
            z-index: 101;
            transform: translateX(-50%) translateY(-50%);
        `;
        container.appendChild(textEl);

        // 创建SVG折线
        const lineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        lineGroup.dataset.lineId = itemId;

        // 计算折线中点
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;

        // 绘制折线路径（L型）
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d;
        if (labelPos.anchor === 'right' || labelPos.anchor === 'left') {
            d = `M ${startX} ${startY} L ${endX} ${startY} L ${endX} ${endY}`;
        } else {
            d = `M ${startX} ${startY} L ${startX} ${endY} L ${endX} ${endY}`;
        }
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#7170ff');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        lineGroup.appendChild(path);

        // 添加起点圆点（可拖动）
        const startDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        startDot.setAttribute('cx', startX);
        startDot.setAttribute('cy', startY);
        startDot.setAttribute('r', '4');
        startDot.setAttribute('fill', '#7170ff');
        startDot.setAttribute('stroke', '#fff');
        startDot.setAttribute('stroke-width', '1');
        startDot.style.cssText = `
            cursor: grab;
            pointer-events: all;
        `;
        startDot.classList.add('draggable-start-dot');
        lineGroup.appendChild(startDot);

        this.labelLayer.appendChild(lineGroup);

        // 使起点圆点可拖拽
        this.makeStartDotDraggable(startDot, textEl, lineGroup, item, blockEl, container, labelPos.anchor);

        // 使文字标签可拖拽
        this.makeLabelDraggable(textEl, item, lineGroup, startX, startY, labelPos.anchor, blockEl, container);
    },

    // 获取锚点配置
    getAnchorConfig(anchor) {
        const configs = {
            'right': { endOffsetX: 80, endOffsetY: 0 },
            'left': { endOffsetX: -80, endOffsetY: 0 },
            'top': { endOffsetX: 0, endOffsetY: -60 },
            'bottom': { endOffsetX: 0, endOffsetY: 60 }
        };
        return configs[anchor] || configs['right'];
    },

    // 引线起点可拖拽
    makeStartDotDraggable(startDot, textEl, lineGroup, item, blockEl, container, anchor) {
        let isDragging = false;
        let startMouseX, startMouseY;
        let currentStartX, currentStartY;
        const path = lineGroup.querySelector('path');
        const blockRect = blockEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // 获取色块边界
        const blockLeft = blockRect.left - containerRect.left;
        const blockRight = blockRect.right - containerRect.left;
        const blockTop = blockRect.top - containerRect.top;
        const blockBottom = blockRect.bottom - containerRect.top;
        const blockCenterX = blockLeft + blockRect.width / 2;
        const blockCenterY = blockTop + blockRect.height / 2;

        startDot.addEventListener('mousedown', (e) => {
            isDragging = true;
            startMouseX = e.clientX;
            startMouseY = e.clientY;
            currentStartX = parseFloat(startDot.getAttribute('cx'));
            currentStartY = parseFloat(startDot.getAttribute('cy'));
            startDot.style.cursor = 'grabbing';
            startDot.setAttribute('r', '5');
            e.stopPropagation();
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startMouseX;
            const dy = e.clientY - startMouseY;
            let newX = currentStartX + dx;
            let newY = currentStartY + dy;

            // 限制起点在色块边缘（可选）- 暂时允许自由拖动
            // 如果启用了限制，可以添加边界检查

            // 更新起点位置
            startDot.setAttribute('cx', newX);
            startDot.setAttribute('cy', newY);

            // 获取标签位置
            const labelX = parseFloat(textEl.style.left);
            const labelY = parseFloat(textEl.style.top);

            // 更新引线路径（L型折线）
            let d;
            if (anchor === 'right' || anchor === 'left') {
                d = `M ${newX} ${newY} L ${labelX} ${newY} L ${labelX} ${labelY}`;
            } else {
                d = `M ${newX} ${newY} L ${newX} ${labelY} L ${labelX} ${labelY}`;
            }
            path.setAttribute('d', d);
        });

        document.addEventListener('mouseup', async () => {
            if (!isDragging) return;
            isDragging = false;
            startDot.style.cursor = 'grab';
            startDot.setAttribute('r', '4');

            // 保存起点偏移（相对于色块中心）
            const finalX = parseFloat(startDot.getAttribute('cx'));
            const finalY = parseFloat(startDot.getAttribute('cy'));
            await Storage.updateItem(item.id, {
                labelPosition: {
                    ...item.labelPosition,
                    startOffsetX: finalX - blockCenterX,
                    startOffsetY: finalY - blockCenterY
                }
            });
        });
    },

    // 引线标注可拖拽
    makeLabelDraggable(textEl, item, lineGroup, startX, startY, anchor, blockEl, container) {
        let isDragging = false;
        let startMouseX, startMouseY;
        let startLeft, startTop;
        const baseOffsetX = (item.labelPosition?.offsetX || 0);
        const baseOffsetY = (item.labelPosition?.offsetY || 0);

        textEl.addEventListener('mousedown', (e) => {
            isDragging = true;
            startMouseX = e.clientX;
            startMouseY = e.clientY;
            startLeft = parseFloat(textEl.style.left) || startX;
            startTop = parseFloat(textEl.style.top) || startY;
            textEl.classList.add('dragging');
            textEl.style.cursor = 'grabbing';
            e.stopPropagation();
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startMouseX;
            const dy = e.clientY - startMouseY;
            const newLeft = startLeft + dx;
            const newTop = startTop + dy;

            textEl.style.left = `${newLeft}px`;
            textEl.style.top = `${newTop}px`;

            // 更新引线路径 - 获取当前起点位置
            const path = lineGroup.querySelector('path');
            const startDot = lineGroup.querySelector('circle');
            const currentStartX = parseFloat(startDot.getAttribute('cx'));
            const currentStartY = parseFloat(startDot.getAttribute('cy'));

            let d;
            if (anchor === 'right' || anchor === 'left') {
                d = `M ${currentStartX} ${currentStartY} L ${newLeft} ${currentStartY} L ${newLeft} ${newTop}`;
            } else {
                d = `M ${currentStartX} ${currentStartY} L ${currentStartX} ${newTop} L ${newLeft} ${newTop}`;
            }
            path.setAttribute('d', d);
        });

        document.addEventListener('mouseup', async () => {
            if (!isDragging) return;
            isDragging = false;
            textEl.classList.remove('dragging');
            textEl.style.cursor = 'grab';

            // 保存相对偏移位置（相对于起点）
            const startDot = lineGroup.querySelector('circle');
            const currentStartX = parseFloat(startDot.getAttribute('cx'));
            const currentStartY = parseFloat(startDot.getAttribute('cy'));
            const endLeft = parseFloat(textEl.style.left) || startX;
            const endTop = parseFloat(textEl.style.top) || startY;
            await Storage.updateItem(item.id, {
                labelPosition: {
                    anchor: anchor,
                    offsetX: endLeft - startX,
                    offsetY: endTop - startY,
                    startOffsetX: item.labelPosition?.startOffsetX,
                    startOffsetY: item.labelPosition?.startOffsetY
                }
            });
        });
    },

    // ==================== 仅引线标注（无色块） ====================

    renderLabelOnly(item, container) {
        // 创建一个透明的定位锚点
        const anchor = document.createElement('div');
        anchor.className = 'item-label-anchor';
        anchor.dataset.itemId = item.id;
        anchor.style.position = 'absolute';
        anchor.style.left = '50%';
        anchor.style.top = '50%';
        anchor.style.pointerEvents = 'none';
        container.appendChild(anchor);
    },

    // ==================== 色块渲染 ====================

    renderItemBlock(item, container) {
        if (!item.block || !item.block.appearance || !item.block.position) {
            console.warn(`物品 ${item.id} 色块数据不完整`);
            return;
        }

        const block = document.createElement('div');
        const shape = ['rectangle', 'square', 'circle', 'irregular'].includes(item.block.appearance.shape)
            ? item.block.appearance.shape
            : 'rectangle';
        block.className = `item-block ${shape}`;

        block.dataset.itemId = item.id;
        block.dataset.status = item.status;
        block.draggable = true;

        const color = /^#?[0-9A-Fa-f]{6}$/.test(item.block.appearance.color)
            ? item.block.appearance.color
            : '#4A90E2';
        block.style.backgroundColor = color;

        const size = item.block.appearance.size || { width: 60, height: 45 };
        block.style.width = `${size.width}px`;
        block.style.height = `${size.height}px`;

        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
        const maxX = containerWidth - size.width;
        const maxY = containerHeight - size.height;

        const x = Math.max(0, Math.min(item.block.position.x, maxX));
        const y = Math.max(0, Math.min(item.block.position.y, maxY));

        block.style.left = `${x}px`;
        block.style.top = `${y}px`;

        const textEl = document.createElement('span');
        textEl.className = 'item-block-text';
        textEl.textContent = item.name;
        block.appendChild(textEl);

        // 根据设置决定是否显示引线标注
        if (item.labelEnabled) {
            // 引线将在 renderAllLabels 中统一渲染
        } else if (size.width < 30 || size.height < 25) {
            // 色块太小时，缩小文字字号显示
            textEl.style.fontSize = '9px';
            textEl.style.whiteSpace = 'nowrap';
            textEl.style.overflow = 'hidden';
            textEl.style.textOverflow = 'ellipsis';
        } else if (size.width < 50 || size.height < 40) {
            // 色块较小时，使用较小字号
            textEl.style.fontSize = '10px';
        }

        this.addResizeHandles(block, shape);
        this.bindBlockEvents(block, item);

        container.appendChild(block);
    },

    addResizeHandles(blockEl, shape) {
        if (shape === 'circle') {
            ['nw', 'ne', 'sw', 'se'].forEach(pos => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${pos}`;
                handle.dataset.handle = pos;
                blockEl.appendChild(handle);
            });
        } else {
            ['n', 's', 'e', 'w'].forEach(pos => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${pos}`;
                handle.dataset.handle = pos;
                blockEl.appendChild(handle);
            });
        }
    },

    // ==================== 色块事件绑定 ====================

    bindBlockEvents(blockEl, item) {
        blockEl.addEventListener('dblclick', (e) => {
            if (!e.target.classList.contains('resize-handle')) {
                CRUD.showItemDetail(item.id);
            }
        });

        blockEl.addEventListener('mousedown', (e) => {
            if (!e.target.classList.contains('resize-handle')) {
                e.preventDefault();
                Interaction.startDrag(e, blockEl, item);
            }
        });

        blockEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'item',
                itemId: item.id,
                viewId: item.viewId,
                layerId: item.layerId
            }));
            e.dataTransfer.effectAllowed = 'move';
        });

        const handles = blockEl.querySelectorAll('.resize-handle');
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                Interaction.startResize(e, blockEl, item, handle.dataset.handle);
            });
        });

        blockEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showBlockContextMenu(e, item);
        });
    },

    showBlockContextMenu(e, item) {
        const menu = document.createElement('div');
        menu.id = 'blockContextMenu';
        menu.style.cssText = `
            position: fixed;
            left: ${e.pageX}px;
            top: ${e.pageY}px;
            background: var(--bg-surface);
            border: 1px solid var(--border-secondary);
            border-radius: var(--radius-small);
            padding: 5px 0;
            z-index: 2000;
            min-width: 120px;
        `;

        const createMenuItem = (text, onclick, color = '') => {
            return `<div class="context-menu-item" style="padding: 8px 15px; cursor: pointer; ${color}" onclick="${onclick}">${text}</div>`;
        };

        menu.innerHTML = `
            ${createMenuItem('物品详情', `CRUD.showItemDetail(${item.id})`)}
            ${createMenuItem('删除色块', `CRUD.deleteBlock(${item.id})`, 'color: #E74C3C;')}
        `;

        document.body.appendChild(menu);

        const closeMenu = () => {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        };
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);
    },

    // ==================== 统计更新 ====================

    async updateStats() {
        const stats = await Storage.getStats();
        document.getElementById('totalItems').textContent = stats.total;
        document.getElementById('withBlockCount').textContent = stats.withBlock;
        document.getElementById('inPlaceCount').textContent = stats.inPlace;
        document.getElementById('takenCount').textContent = stats.taken;
        document.getElementById('borrowedCount').textContent = stats.borrowed;
    },

    updateCategoryFilter() {
        const select = document.getElementById('categoryFilter');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">全部分类</option>' +
            CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        if (CATEGORIES.includes(currentValue)) {
            select.value = currentValue;
        }
    }
};
