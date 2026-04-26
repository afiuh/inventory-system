// js/borrow.js
// 借用管理 - 全异步适配

const Borrow = {
    currentItemId: null,

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // 表单提交在 crud.js 中绑定
    },

    async openRecordModal(itemId) {
        const item = await Storage.getItem(itemId);
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

    async submitBorrowForm() {
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

        await Storage.addBorrow(borrowData);
        document.getElementById('borrowRecordModal').classList.remove('active');
        await Render.updateStats();
        await Search.renderItemList();

        const item = await Storage.getItem(itemId);
        alert(`"${item ? item.name : '物品'}"已记录为借出状态`);
    },

    async openBorrowModal() {
        const container = document.getElementById('borrowList');
        if (!container) return;

        const borrows = await Storage.getBorrowsWithItems();

        if (borrows.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-tertiary);">
                    暂无借用记录
                </div>
            `;
        } else {
            container.innerHTML = borrows.map(borrow => `
                <div class="borrow-item" style="padding: 15px; border-bottom: 1px solid var(--border-primary);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <strong>${borrow.itemName}</strong>
                        <span style="color: var(--accent-violet);">${borrow.borrowerName}</span>
                    </div>
                    <div style="color: var(--text-tertiary); font-size: 13px;">
                        借用：${borrow.borrowDate || '-'} | 归还：${borrow.returnDate || '-'}
                    </div>
                    ${borrow.note ? `<div style="color: var(--text-tertiary); font-size: 13px; margin-top: 4px;">备注：${borrow.note}</div>` : ''}
                    <div style="margin-top: 10px; display: flex; gap: 8px;">
                        <button class="btn btn-small btn-success" onclick="Borrow.returnItem(${borrow.itemId})">归还</button>
                    </div>
                </div>
            `).join('');
        }

        document.getElementById('borrowModal').classList.add('active');
    },

    async returnItem(itemId) {
        const item = await Storage.getItem(itemId);
        if (!item) return;

        if (confirm(`确定归还"${item.name}"吗？`)) {
            await Storage.returnItem(itemId);
            await this.openBorrowModal();
            await Render.updateStats();
            await Search.renderItemList();
        }
    },

    async checkOverdue() {
        const borrows = await Storage.loadBorrows();
        const today = new Date().toISOString().split('T')[0];
        const overdue = borrows.filter(b => b.returnDate && b.returnDate < today);

        if (overdue.length > 0) {
            console.warn(`有${overdue.length}件物品超期未还`);
        }
        return overdue;
    }
};
