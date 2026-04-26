// js/interaction.js

const Interaction = {
    // 拖拽状态
    isDragging: false,
    isResizing: false,
    // ✅ 删除：isPlacing: false,

    // 当前操作元素
    currentBlock: null,
    currentItem: null,
    resizeHandle: null,

    // 初始状态
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    startWidth: 0,
    startHeight: 0,

    // 初始化交互系统
    init() {
        this.bindEvents();
    },

    // 绑定全局事件
    bindEvents() {
        // 鼠标移动
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));

        // 触摸移动（移动端支持）
        document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this.onTouchEnd(e));

        // 拖拽放置（跨层拖拽）
        document.addEventListener('dragover', (e) => this.onDragOver(e));
        document.addEventListener('drop', (e) => this.onDrop(e));

        // ✅ 删除：放置视图点击事件绑定
        // const placeView = document.getElementById('placeView');
        // if (placeView) {
        //     placeView.addEventListener('click', (e) => this.onPlaceViewClick(e));
        // }
    },

    // ==================== 色块移动 ====================

    // 开始拖拽移动
    startDrag(e, blockEl, item) {
        this.isDragging = true;
        this.currentBlock = blockEl;
        this.currentItem = item;

        const rect = blockEl.parentElement.getBoundingClientRect();
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startLeft = blockEl.offsetLeft;
        this.startTop = blockEl.offsetTop;

        blockEl.style.zIndex = 1000;
        blockEl.style.cursor = 'grabbing';
    },

    // ==================== 色块缩放 ====================

    // 开始调整大小
    startResize(e, blockEl, item, handle) {
        this.isResizing = true;
        this.currentBlock = blockEl;
        this.currentItem = item;
        this.resizeHandle = handle;

        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startWidth = blockEl.offsetWidth;
        this.startHeight = blockEl.offsetHeight;
        this.startLeft = blockEl.offsetLeft;
        this.startTop = blockEl.offsetTop;

        e.preventDefault();
    },

    // 处理鼠标移动
    onMouseMove(e) {
        if (this.isDragging) {
            this.handleDragMove(e);
        } else if (this.isResizing) {
            this.handleResizeMove(e);
        }
    },

    // 处理鼠标释放
    onMouseUp(e) {
        if (this.isDragging) {
            this.handleDragEnd(e);
        } else if (this.isResizing) {
            this.handleResizeEnd(e);
        }
    },

    // ==================== 触摸事件 ====================

    onTouchMove(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const mockEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => e.preventDefault()
            };
            this.onMouseMove(mockEvent);
        }
    },

    onTouchEnd(e) {
        const mockEvent = {
            clientX: 0,
            clientY: 0
        };
        this.onMouseUp(mockEvent);
    },

    // ==================== 拖拽移动处理 ====================

    // 处理拖拽移动
    handleDragMove(e) {
        if (!this.currentBlock) return;

        const dx = e.clientX - this.startX;
        const dy = e.clientY - this.startY;

        let newLeft = this.startLeft + dx;
        let newTop = this.startTop + dy;

        // 边界限制
        const container = this.currentBlock.parentElement;
        const maxLeft = container.offsetWidth - this.currentBlock.offsetWidth;
        const maxTop = container.offsetHeight - this.currentBlock.offsetHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        this.currentBlock.style.left = `${newLeft}px`;
        this.currentBlock.style.top = `${newTop}px`;
    },

    // 处理拖拽结束
    handleDragEnd(e) {
        if (!this.currentBlock || !this.currentItem) return;

        const newLeft = parseInt(this.currentBlock.style.left) || 0;
        const newTop = parseInt(this.currentBlock.style.top) || 0;

        // ✅ 修复：空值保护
        const currentBlock = this.currentItem.block || {};
        // 更新物品位置
        Storage.updateItem(this.currentItem.id, {
            block: {
                ...currentBlock,
                appearance: currentBlock.appearance || {},  // ✅ 保护 appearance
                position: { x: newLeft, y: newTop }
            }
        });

        // 重置状态
        this.currentBlock.style.zIndex = '';
        this.currentBlock.style.cursor = 'move';
        this.isDragging = false;
        this.currentBlock = null;
        this.currentItem = null;
    },

    // ==================== 缩放调整处理 ====================

    // 处理缩放移动
    handleResizeMove(e) {
        if (!this.currentBlock || !this.resizeHandle) return;

        const dx = e.clientX - this.startX;
        const dy = e.clientY - this.startY;

        // ✅ 修复：空值保护
        const currentBlock = this.currentItem.block || {};
        const currentAppearance = currentBlock.appearance || {};
        const shape = currentAppearance.shape || 'rectangle';

        let newWidth = this.startWidth;
        let newHeight = this.startHeight;
        let newLeft = this.startLeft;
        let newTop = this.startTop;

        // 根据拖拽方向调整
        switch (this.resizeHandle) {
            case 'n': // 上边界
                newHeight = Math.max(30, this.startHeight - dy);
                newTop = this.startTop + (this.startHeight - newHeight);
                break;
            case 's': // 下边界
                newHeight = Math.max(30, this.startHeight + dy);
                break;
            case 'e': // 右边界
                newWidth = Math.max(30, this.startWidth + dx);
                break;
            case 'w': // 左边界
                newWidth = Math.max(30, this.startWidth - dx);
                newLeft = this.startLeft + (this.startWidth - newWidth);
                break;
            // 圆形/不规则形状的对角拖拽
            case 'nw':
                newWidth = Math.max(30, this.startWidth - dx);
                newHeight = Math.max(30, this.startHeight - dy);
                newLeft = this.startLeft + (this.startWidth - newWidth);
                newTop = this.startTop + (this.startHeight - newHeight);
                break;
            case 'ne':
                newWidth = Math.max(30, this.startWidth + dx);
                newHeight = Math.max(30, this.startHeight - dy);
                newTop = this.startTop + (this.startHeight - newHeight);
                break;
            case 'sw':
                newWidth = Math.max(30, this.startWidth - dx);
                newHeight = Math.max(30, this.startHeight + dy);
                newLeft = this.startLeft + (this.startWidth - newWidth);
                break;
            case 'se':
                newWidth = Math.max(30, this.startWidth + dx);
                newHeight = Math.max(30, this.startHeight + dy);
                break;
        }

        // 圆形保持宽高相等
        if (shape === 'circle') {
            const newSize = Math.max(newWidth, newHeight);
            newWidth = newSize;
            newHeight = newSize;
        }

        // 应用新尺寸
        this.currentBlock.style.width = `${newWidth}px`;
        this.currentBlock.style.height = `${newHeight}px`;
        this.currentBlock.style.left = `${newLeft}px`;
        this.currentBlock.style.top = `${newTop}px`;
    },

    // 处理缩放结束
    handleResizeEnd(e) {
        if (!this.currentBlock || !this.currentItem) return;

        const newWidth = this.currentBlock.offsetWidth;
        const newHeight = this.currentBlock.offsetHeight;
        const newLeft = this.currentBlock.offsetLeft;
        const newTop = this.currentBlock.offsetTop;

        // ✅ 修复：空值保护
        const currentBlock = this.currentItem.block || {};
        const currentAppearance = currentBlock.appearance || {};

        // 更新物品色块数据
        Storage.updateItem(this.currentItem.id, {
            block: {
                ...currentBlock,
                position: { x: newLeft, y: newTop },
                appearance: {
                    ...currentAppearance,
                    size: { width: newWidth, height: newHeight }
                }
            }
        });

        // 重置状态
        this.isResizing = false;
        this.currentBlock = null;
        this.currentItem = null;
        this.resizeHandle = null;
    },

    // ==================== 拖拽放置处理（跨层拖拽）====================

    // 处理拖拽经过
    onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // 检查是否拖到层标签上
        const layerTab = e.target.closest('.layer-tab');
        if (layerTab && layerTab.dataset.layerId) {
            layerTab.style.background = 'var(--accent-red)';
        }
    },

    // 处理放置
    onDrop(e) {
        e.preventDefault();

        // 恢复层标签样式
        document.querySelectorAll('.layer-tab').forEach(tab => {
            tab.style.background = '';
        });

        // 解析拖拽数据
        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;

        try {
            const dragData = JSON.parse(data);

            if (dragData.type === 'item') {
                // 检查是否放到层标签上
                const layerTab = e.target.closest('.layer-tab');
                if (layerTab && layerTab.dataset.layerId) {
                    const targetLayerId = layerTab.dataset.layerId;
                    if (targetLayerId !== dragData.layerId) {
                        Layer.handleDropToLayer(dragData.itemId, targetLayerId);
                    }
                }
            }
        } catch (err) {
            console.error('拖拽数据解析失败:', err);
        }
    },

    // ✅ 删除：放置模式处理方法
    // onPlaceViewClick() - 删除
    // startPlaceMode() - 删除
    // endPlaceMode() - 删除
};