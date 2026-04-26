// js/interaction.js
// 交互系统 - 拖拽和缩放

const Interaction = {
    isDragging: false,
    isResizing: false,
    currentBlock: null,
    currentItem: null,
    resizeHandle: null,

    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    startWidth: 0,
    startHeight: 0,

    init() {
        this.bindEvents();
    },

    bindEvents() {
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));

        document.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            this.onMouseUp({});
        });

        document.addEventListener('dragover', (e) => this.onDragOver(e));
        document.addEventListener('drop', (e) => this.onDrop(e));
    },

    startDrag(e, blockEl, item) {
        this.isDragging = true;
        this.currentBlock = blockEl;
        this.currentItem = item;

        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startLeft = blockEl.offsetLeft;
        this.startTop = blockEl.offsetTop;

        blockEl.style.zIndex = 1000;
        blockEl.style.cursor = 'grabbing';
    },

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

    onMouseMove(e) {
        if (this.isDragging) {
            this.handleDragMove(e);
        } else if (this.isResizing) {
            this.handleResizeMove(e);
        }
    },

    onMouseUp(e) {
        if (this.isDragging) {
            this.handleDragEnd(e);
        } else if (this.isResizing) {
            this.handleResizeEnd(e);
        }
    },

    handleDragMove(e) {
        if (!this.currentBlock) return;

        const dx = e.clientX - this.startX;
        const dy = e.clientY - this.startY;

        let newLeft = this.startLeft + dx;
        let newTop = this.startTop + dy;

        const container = this.currentBlock.parentElement;
        const maxLeft = container.offsetWidth - this.currentBlock.offsetWidth;
        const maxTop = container.offsetHeight - this.currentBlock.offsetHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        this.currentBlock.style.left = `${newLeft}px`;
        this.currentBlock.style.top = `${newTop}px`;
    },

    async handleDragEnd(e) {
        if (!this.currentBlock || !this.currentItem) return;

        const newLeft = parseInt(this.currentBlock.style.left) || 0;
        const newTop = parseInt(this.currentBlock.style.top) || 0;

        const currentBlock = this.currentItem.block || {};
        await Storage.updateItem(this.currentItem.id, {
            block: {
                ...currentBlock,
                appearance: currentBlock.appearance || {},
                position: { x: newLeft, y: newTop }
            }
        });

        this.currentBlock.style.zIndex = '';
        this.currentBlock.style.cursor = 'move';
        this.isDragging = false;
        this.currentBlock = null;
        this.currentItem = null;
    },

    handleResizeMove(e) {
        if (!this.currentBlock || !this.resizeHandle) return;

        const dx = e.clientX - this.startX;
        const dy = e.clientY - this.startY;

        const currentBlock = this.currentItem.block || {};
        const shape = currentBlock.appearance?.shape || 'rectangle';

        let newWidth = this.startWidth;
        let newHeight = this.startHeight;
        let newLeft = this.startLeft;
        let newTop = this.startTop;

        switch (this.resizeHandle) {
            case 'n':
                newHeight = Math.max(30, this.startHeight - dy);
                newTop = this.startTop + (this.startHeight - newHeight);
                break;
            case 's':
                newHeight = Math.max(30, this.startHeight + dy);
                break;
            case 'e':
                newWidth = Math.max(30, this.startWidth + dx);
                break;
            case 'w':
                newWidth = Math.max(30, this.startWidth - dx);
                newLeft = this.startLeft + (this.startWidth - newWidth);
                break;
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

        if (shape === 'circle') {
            const newSize = Math.max(newWidth, newHeight);
            newWidth = newSize;
            newHeight = newSize;
        }

        this.currentBlock.style.width = `${newWidth}px`;
        this.currentBlock.style.height = `${newHeight}px`;
        this.currentBlock.style.left = `${newLeft}px`;
        this.currentBlock.style.top = `${newTop}px`;
    },

    async handleResizeEnd(e) {
        if (!this.currentBlock || !this.currentItem) return;

        const newWidth = this.currentBlock.offsetWidth;
        const newHeight = this.currentBlock.offsetHeight;
        const newLeft = this.currentBlock.offsetLeft;
        const newTop = this.currentBlock.offsetTop;

        const currentBlock = this.currentItem.block || {};
        const currentAppearance = currentBlock.appearance || {};

        await Storage.updateItem(this.currentItem.id, {
            block: {
                ...currentBlock,
                position: { x: newLeft, y: newTop },
                appearance: {
                    ...currentAppearance,
                    size: { width: newWidth, height: newHeight }
                }
            }
        });

        this.isResizing = false;
        this.currentBlock = null;
        this.currentItem = null;
        this.resizeHandle = null;
    },

    onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    },

    async onDrop(e) {
        e.preventDefault();

        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;

        try {
            const dragData = JSON.parse(data);

            if (dragData.type === 'item') {
                const layerTab = e.target.closest('.layer-tab');
                if (layerTab && layerTab.dataset.layerId) {
                    const targetLayerId = layerTab.dataset.layerId;
                    if (targetLayerId !== dragData.layerId) {
                        await Layer.handleDropToLayer(dragData.itemId, targetLayerId);
                    }
                }
            }
        } catch (err) {
            console.error('拖拽数据解析失败:', err);
        }
    }
};
