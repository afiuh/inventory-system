// js/data.js

// ✅ 视图配置（动态加载）
let VIEW_CONFIG = [];

// ✅ 确保函数在全局作用域
window.initViews = function() {
    const saved = localStorage.getItem('inventory_views');
    if (saved) {
        VIEW_CONFIG = JSON.parse(saved);
        if (VIEW_CONFIG.length === 0) {
            VIEW_CONFIG = getDefaultViews();
            Storage.saveViews(VIEW_CONFIG);
        }
    } else {
        VIEW_CONFIG = getDefaultViews();
        Storage.saveViews(VIEW_CONFIG);
    }
}

function getDefaultViews() {
    return [
        { id: 'bed', name: '床铺全景', group: 'bed', width: 90, height: 190 },
        { id: 'desk', name: '书桌桌面', group: 'desk', width: 120, height: 60 },
        { id: 'drawer', name: '抽屉', group: 'desk', width: 40, height: 30 },
        { id: 'cabinet1', name: '立柜 1', group: 'cabinet', width: 60, height: 180 },
        { id: 'cabinet2', name: '立柜 2', group: 'cabinet', width: 60, height: 180 },
        { id: 'wardrobe_top', name: '衣柜挂衣区', group: 'wardrobe', width: 120, height: 100 },
        { id: 'wardrobe_bottom', name: '衣柜下层', group: 'wardrobe', width: 120, height: 80 },
        { id: 'shelf_top', name: '书架上层', group: 'shelf', width: 100, height: 40 },
        { id: 'shelf_middle', name: '书架中层', group: 'shelf', width: 100, height: 40 },
        { id: 'shelf_bottom', name: '书架下层', group: 'shelf', width: 100, height: 40 },
        { id: 'underbed', name: '床下地面', group: 'bed', width: 90, height: 60 }
    ];
}

// ✅ 分类配置（动态加载）
let CATEGORIES = [];

// ✅ 确保函数在全局作用域
window.initCategories = function() {
    const saved = localStorage.getItem('inventory_categories');
    if (saved) {
        CATEGORIES = JSON.parse(saved);
        if (CATEGORIES.length === 0) {
            CATEGORIES = getDefaultCategories();
            Storage.saveCategories(CATEGORIES);
        }
    } else {
        CATEGORIES = getDefaultCategories();
        Storage.saveCategories(CATEGORIES);
    }
}

function getDefaultCategories() {
    return [
        '电子类',
        '书籍类',
        '衣物类',
        '食品类',
        '日用品',
        '药品类',
        '文具类',
        '清洁用品',
        '工具类',
        '其他'
    ];
}

// ... 其余代码不变