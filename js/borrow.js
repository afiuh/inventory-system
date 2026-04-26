// js/borrow.js

const Borrow = {
    // 当前借用物品 ID
    currentItemId: null,

    // 初始化借用系统
    init() {
        this.bindEvents();
    },

    // 绑定事件
    bindEvents() {
        // 借用表单提交已在 crud.js 中绑定
    },

    // ==================== 借用记录 ====================

    // 打开借用记录弹窗
    openRecordModal(itemId) {
        const item = Storage.getItem(itemId);
        if (!item) return;

        this.currentItemId = itemId;
        document.getElementById('borrowItemId').value = itemId;
        document.getElementById('borrowItemName').value = item.name;
        document.getElementById('borrowerName').value = '';
        document.getElementById('borrowDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('returnDate').value = '';
        document.getElementById('borrowNote').value = '';
        document.getElementById('borrowRecordModal').classList.add('active');
    },

    // 提交借用表单
    submitBorrowForm() {
        const itemId = parseInt(document.getElementById('borrowItemId').value);
        const borrowData = {
            itemId: itemId,
            borrowerName: document.getElementById('borrowerName').value.trim(),
            borrowDate: document.getElementById('borrowDate').value,
            returnDate: document.getElementById('returnDate').value,
            note: document.getElementById('borrowNote').value.trim()
        };

        if (!borrowData.borrowerName) {
            alert('请输入借用人姓名');
            return;
        }

        Storage.addBorrow(borrowData);
        document.getElementById('borrowRecordModal').classList.remove('active');
        Render.updateStats();
        Search.renderItemList();

        alert(`"${Storage.getItem(itemId).name}"已记录为借出状态`);
    },

    // ==================== 借用清单 ====================

    // 打开借用清单弹窗
    openBorrowModal() {
        const container = document.getElementById('borrowList');
        if (!container) return;

        const borrows = Storage.getBorrowsWithItems();

        if (borrows.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-sub);">
                    暂无借用记录
                </div>
            `;
        } else {
            container.innerHTML = borrows.map(borrow => `
                <div class="borrow-item">
                    <div class="borrow-header">
                        <strong>${borrow.itemName}</strong>
                        <span style="color: var(--accent-gold);">${borrow.borrowerName}</span>
                    </div>
                    <div class="borrow-info">
                        借用日期：${borrow.borrowDate || '-'} | 
                        预计归还：${borrow.returnDate || '-'}
                    </div>
                    ${borrow.note ? `<div class="borrow-info">备注：${borrow.note}</div>` : ''}
                    <div style="margin-top: 10px; display: flex; gap: 10px;">
                        <button class="btn btn-small" onclick="Borrow.returnItem(${borrow.itemId})">归还</button>
                        <button class="btn btn-small btn-secondary" onclick="Borrow.editBorrow(${borrow.itemId})">编辑</button>
                    </div>
                </div>
            `).join('');
        }

        document.getElementById('borrowModal').classList.add('active');
    },

    // 归还物品
    returnItem(itemId) {
        const item = Storage.getItem(itemId);
        if (!item) return;

        if (confirm(`确定归还"${item.name}"吗？\n\n物品状态将恢复为"在位"。`)) {
            Storage.returnItem(itemId);
            this.openBorrowModal(); // 刷新清单
            Render.updateStats();
            Search.renderItemList();
        }
    },

    // 编辑借用记录
    editBorrow(itemId) {
        const borrows = Storage.loadBorrows();
        const borrow = borrows.find(b => b.itemId === itemId);
        if (!borrow) return;

        this.currentItemId = itemId;
        document.getElementById('borrowItemId').value = itemId;
        document.getElementById('borrowItemName').value = Storage.getItem(itemId).name;
        document.getElementById('borrowerName').value = borrow.borrowerName;
        document.getElementById('borrowDate').value = borrow.borrowDate || '';
        document.getElementById('returnDate').value = borrow.returnDate || '';
        document.getElementById('borrowNote').value = borrow.note || '';

        document.getElementById('borrowRecordModal').classList.add('active');
    },

    // ==================== 借用统计 ====================

    // 获取借用统计
    getBorrowStats() {
        const borrows = Storage.loadBorrows();
        const items = Storage.loadItems();

        return {
            total: borrows.length,
            active: borrows.length, // 当前借出数量
            overdue: borrows.filter(b => {
                if (!b.returnDate) return false;
                return new Date(b.returnDate) < new Date();
            }).length,
            byBorrower: borrows.reduce((stats, b) => {
                stats[b.borrowerName] = (stats[b.borrowerName] || 0) + 1;
                return stats;
            }, {})
        };
    },

    // 获取某人的借用记录
    getBorrowsByPerson(borrowerName) {
        const borrows = Storage.loadBorrows();
        return borrows.filter(b => b.borrowerName === borrowerName);
    },

    // 获取超期未还记录
    getOverdueBorrows() {
        const borrows = Storage.loadBorrows();
        const today = new Date().toISOString().split('T')[0];
        return borrows.filter(b => b.returnDate && b.returnDate < today);
    },

    // ==================== 借用提醒 ====================

    // 检查超期借用
    checkOverdue() {
        const overdue = this.getOverdueBorrows();
        if (overdue.length > 0) {
            const names = overdue.map(b => Storage.getItem(b.itemId)?.name || '未知物品').join('、');
            console.warn(`有${overdue.length}件物品超期未还：${names}`);
        }
        return overdue;
    },

    // 获取即将到期记录（3 天内）
    getUpcomingReturns() {
        const borrows = Storage.loadBorrows();
        const today = new Date();
        const threeDaysLater = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

        return borrows.filter(b => {
            if (!b.returnDate) return false;
            const returnDate = new Date(b.returnDate);
            return returnDate >= today && returnDate <= threeDaysLater;
        });
    }
};