// js/main.js

// 应用主入口
const App = {
    // 应用版本
    version: '1.0.0',

    // 初始化应用
    init() {
        console.log(`🚀 个人物品管理系统 v${this.version} 启动中...`);

        try {
            // 1. 初始化存储（加载数据）
            Storage.init();
            console.log('✅ 存储系统初始化完成');

            // ✅ 初始化视图和分类配置（必须在 Storage.init() 之后，只调用一次）
            initViews();
            initCategories();
            console.log('✅ 视图和分类配置初始化完成');
            console.log('   视图数量:', VIEW_CONFIG.length);
            console.log('   分类数量:', CATEGORIES.length);

            // 2. 初始化各模块
            Layer.init();
            console.log('✅ 层系统初始化完成');

            Render.init();
            console.log('✅ 渲染系统初始化完成');

            Interaction.init();
            console.log('✅ 交互系统初始化完成');

            CRUD.init();
            console.log('✅ CRUD 系统初始化完成');

            Search.init();  // 这里会调用 Render.updateCategoryFilter()
            console.log('✅ 搜索系统初始化完成');

            Borrow.init();
            console.log('✅ 借用系统初始化完成');

            // 3. 初始化 UI 组件
            this.initUI();
            console.log('✅ UI 组件初始化完成');

            // 4. 更新统计
            Render.updateStats();
            console.log('✅ 统计数据更新完成');

            // ✅ Search.init() 已经调用了 Render.updateCategoryFilter()，不需要重复调用

            // 5. 渲染物品清单
            Search.renderItemList();
            console.log('✅ 物品清单渲染完成');

            // 6. 检查超期借用
            Borrow.checkOverdue();
            console.log('✅ 借用检查完成');

            console.log('🎉 应用启动完成！');
            console.log(`📊 当前物品总数：${Storage.getStats().total}`);
            console.log(`📍 有色块物品：${Storage.getStats().withBlock}`);
            console.log(`📅 最后更新：${Storage.getLastUpdate()}`);
        } catch (error) {
            console.error('❌ 应用启动失败:', error);
            console.error('请检查控制台错误信息，或尝试清除数据后重新加载');
        }
    },

    // 初始化 UI 组件
    initUI() {
        // 弹窗关闭按钮
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.close;
                document.getElementById(modalId).classList.remove('active');
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

        // 右键菜单关闭（✅ 添加 #viewContextMenu）
        document.addEventListener('click', () => {
            document.querySelectorAll('#layerContextMenu, #blockContextMenu, #viewContextMenu').forEach(menu => {
                if (menu) menu.remove();
            });
        });
    },

    // 显示欢迎消息
    showWelcome() {
        const lastUpdate = Storage.getLastUpdate();
        const stats = Storage.getStats();

        const welcomeMsg = `
╔═══════════════════════════════════════════════════╗
║       个人物品管理系统 v${this.version}                    ║
╠═══════════════════════════════════════════════════╣
║  总物品数：${stats.total}                              ║
║  有色块：${stats.withBlock}                                ║
║  在位：${stats.inPlace}                                  ║
║  带走：${stats.taken}                                  ║
║  借出：${stats.borrowed}                                  ║
╠═══════════════════════════════════════════════════╣
║  最后更新：${lastUpdate}                    ║
║  数据位置：浏览器本地存储                          ║
║  建议：定期导出备份防止数据丢失                    ║
╚═══════════════════════════════════════════════════╝
`;
        console.log(welcomeMsg);
    },

    // 检查数据完整性（添加自动修复）
    checkDataIntegrity() {
        const items = Storage.loadItems();
        const layers = Storage.loadLayers();
        let hasChanges = false;

        // 检查物品是否有无效的视图 ID
        const invalidViewItems = items.filter(item => {
            return !VIEW_CONFIG.find(v => v.id === item.viewId);
        });

        if (invalidViewItems.length > 0) {
            console.warn(`⚠️ 发现${invalidViewItems.length}件物品的视图 ID 无效`);
            // ✅ 自动修复 viewId
            hasChanges = this.fixInvalidViewIds(items);
        }

        // 检查物品是否有无效的层 ID
        const invalidLayerItems = items.filter(item => {
            if (!item.layerId) return false;
            const layersForView = Storage.getLayersByView(item.viewId);
            return !layersForView.find(l => l.id === item.layerId);
        });

        if (invalidLayerItems.length > 0) {
            console.warn(`⚠️ 发现${invalidLayerItems.length}件物品的层 ID 无效`);
        }

        // 检查有色块但缺少块数据的物品
        const incompleteBlockItems = items.filter(item => {
            return item.hasBlock && !item.block;
        });

        if (incompleteBlockItems.length > 0) {
            console.warn(`⚠️ 发现${incompleteBlockItems.length}件物品有色块标记但缺少块数据`);
            // ✅ 自动修复 hasBlock 与 block 不同步
            hasChanges = this.fixIncompleteBlocks(items) || hasChanges;
        }

        // ✅ 如果有修复，保存数据
        if (hasChanges) {
            Storage.saveItems(items);
            console.log('✅ 数据修复完成，已保存');
        }

        return {
            totalItems: items.length,
            totalLayers: layers.length,
            invalidViewItems: invalidViewItems.length,
            invalidLayerItems: invalidLayerItems.length,
            incompleteBlockItems: incompleteBlockItems.length
        };
    },

    // ✅ 新增方法：自动修复无效的 viewId
    fixInvalidViewIds(items) {
        const validIds = VIEW_CONFIG.map(v => v.id);
        let fixed = 0;

        // 映射规则：旧版 ID → 新版 ID
        const fixMap = {
            'bed_view': 'bed',
            'desk_view': 'desk',
            'drawer_view': 'drawer',
            'cabinet1_view': 'cabinet1',
            'cabinet2_view': 'cabinet2',
            'wardrobe_top_view': 'wardrobe_top',
            'wardrobe_bottom_view': 'wardrobe_bottom',
            'shelf_top_view': 'shelf_top',
            'shelf_middle_view': 'shelf_middle',
            'shelf_bottom_view': 'shelf_bottom',
            'underbed_view': 'underbed',
        };

        items.forEach(item => {
            if (!validIds.includes(item.viewId)) {
                // 尝试从 fixMap 中查找映射
                if (fixMap[item.viewId]) {
                    console.log(`  修复 viewId: ${item.viewId} → ${fixMap[item.viewId]} (${item.name})`);
                    item.viewId = fixMap[item.viewId];
                    item.updatedAt = Date.now();
                    fixed++;
                } else {
                    // 无法映射，默认放到 bed 视图
                    console.log(`  无法映射 viewId: ${item.viewId}，默认放到 bed (${item.name})`);
                    item.viewId = 'bed';
                    item.updatedAt = Date.now();
                    fixed++;
                }
            }
        });

        if (fixed > 0) {
            console.log(`✅ 成功修复${fixed}件物品的 viewId`);
            return true;
        }
        return false;
    },

    // ✅ 新增方法：自动修复 hasBlock 与 block 不同步
    fixIncompleteBlocks(items) {
        let fixed = 0;

        items.forEach(item => {
            // 情况 1：hasBlock=true 但 block=null 或 block 不完整
            if (item.hasBlock && (!item.block || !item.block.appearance || !item.block.position)) {
                console.log(`  修复色块数据不完整：${item.name}`);
                item.hasBlock = false;
                item.block = null;
                item.updatedAt = Date.now();
                fixed++;
            }
            // 情况 2：hasBlock=false 但 block 有数据
            if (!item.hasBlock && item.block) {
                console.log(`  修复 hasBlock 标记缺失：${item.name}`);
                item.hasBlock = true;
                item.updatedAt = Date.now();
                fixed++;
            }
        });

        if (fixed > 0) {
            console.log(`✅ 成功修复${fixed}件物品的色块数据同步问题`);
            return true;
        }
        return false;
    },

    // 清除所有数据（开发用）
    clearAllData() {
        if (confirm('⚠️ 警告：此操作将清空所有数据且不可恢复！\n\n确定要清除所有数据吗？')) {
            if (confirm('再次确认：所有物品、层、借用记录都将被删除！')) {
                localStorage.clear();
                location.reload();
            }
        }
    },

    // 导出当前状态到控制台（调试用）
    exportToConsole() {
        const data = {
            version: this.version,
            exportTime: new Date().toISOString(),
            items: Storage.loadItems(),
            layers: Storage.loadLayers(),
            borrows: Storage.loadBorrows(),
            views: VIEW_CONFIG,
            categories: CATEGORIES,
            stats: Storage.getStats()
        };
        console.log('📦 完整数据导出:', data);
        return data;
    }
};

// 页面加载完成后启动应用
document.addEventListener('DOMContentLoaded', () => {
    App.init();
    App.showWelcome();
    App.checkDataIntegrity();
});

// 暴露全局方法供调试使用
window.App = App;
window.Storage = Storage;
window.Layer = Layer;
window.Render = Render;
window.Interaction = Interaction;
window.CRUD = CRUD;
window.Search = Search;
window.Borrow = Borrow;

// 控制台帮助信息
console.log(`╔═══════════════════════════════════════════════════╗
║  开发者控制台快捷命令                          ║
╠═══════════════════════════════════════════════════╣
║  App.exportToConsole() - 导出完整数据             ║
║  App.checkDataIntegrity() - 检查数据完整性        ║
║  App.clearAllData() - 清除所有数据                ║
║  Storage.loadItems() - 加载所有物品               ║
║  Storage.loadLayers() - 加载所有层                ║
║  Storage.loadBorrows() - 加载所有借用记录         ║
║  Search.searchByName('关键词') - 按名称搜索        ║
║  Search.searchByCategory('电子类') - 按分类搜索    ║
╚═══════════════════════════════════════════════════╝`);