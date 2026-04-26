// js/main.js
// 应用主入口 - 全异步初始化

const App = {
    version: '1.2.0',

    async init() {
        console.log(`🚀 个人物品管理系统 v${this.version} 启动中...`);

        try {
            // 1. 初始化存储系统
            const backendConnected = await Storage.init();
            console.log(`✅ 存储系统初始化完成 (模式: ${Storage.getMode()})`);

            // 2. 初始化视图和分类
            await initViews();
            await initCategories();
            console.log(`✅ 视图和分类配置加载完成`);

            // 3. 初始化各模块
            await Layer.init();
            console.log('✅ 视图和层系统初始化完成');

            Render.init();
            Interaction.init();
            CRUD.init();
            Search.init();
            Borrow.init();
            console.log('✅ 核心模块初始化完成');

            // 4. 初始化 UI
            this.initUI();

            // 5. 更新统计数据
            await Render.updateStats();
            console.log('✅ 统计数据更新完成');

            // 6. 渲染物品清单
            await Search.renderItemList();
            console.log('✅ 物品清单渲染完成');

            // 7. 检查借用
            await Borrow.checkOverdue();

            console.log('🎉 应用启动完成！');

            // 打印欢迎信息
            const stats = await Storage.getStats();
            console.log(`
╔══════════════════════════════════════════════════╗
║       个人物品管理系统 v${this.version}                    ║
╠══════════════════════════════════════════════════╣
║  总物品数：${String(stats.total).padEnd(20)}║
║  有色块：${String(stats.withBlock).padEnd(22)}║
║  在位：${String(stats.inPlace).padEnd(24)}║
║  带走：${String(stats.taken).padEnd(24)}║
║  借出：${String(stats.borrowed).padEnd(24)}║
╠══════════════════════════════════════════════════╣
║  存储模式：${Storage.getMode().padEnd(22)}║
║  最后更新：${Storage.getLastUpdate().substring(0, 19).padEnd(19)}║
╚══════════════════════════════════════════════════╝
            `);

        } catch (error) {
            console.error('❌ 应用启动失败:', error);
        }
    },

    initUI() {
        // 弹窗关闭按钮
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.close;
                document.getElementById(modalId)?.classList.remove('active');
            });
        });

        // 点击弹窗外关闭
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // ESC 键关闭弹窗
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
        });

        // 右键菜单关闭
        document.addEventListener('click', () => {
            document.querySelectorAll('#layerContextMenu, #blockContextMenu, #viewContextMenu').forEach(menu => {
                if (menu) menu.remove();
            });
        });
    }
};

// 页面加载完成后启动
document.addEventListener('DOMContentLoaded', async () => {
    await App.init();
});

// 暴露全局方法
window.App = App;
window.Storage = Storage;
window.Layer = Layer;
window.Render = Render;
window.Interaction = Interaction;
window.CRUD = CRUD;
window.Search = Search;
window.Borrow = Borrow;

// 控制台帮助
console.log(`
╔═══════════════════════════════════════════════════╗
║  开发者控制台命令                              ║
╠═══════════════════════════════════════════════════╣
║  App.init()          - 重新初始化应用           ║
║  Storage.loadItems() - 加载所有物品             ║
║  Storage.exportData() - 导出数据               ║
║  Search.searchByName('关键词') - 搜索物品      ║
╚═══════════════════════════════════════════════════╝
`);
