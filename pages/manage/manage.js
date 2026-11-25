const store = require('../../utils/store');
const C = store.COLLECTIONS;

Page({
    data: {
        tags: [],
        checkins: [],
        exportStart: '',
        exportEnd: '',
    },

    onShow() {
        this.loadData();
    },

    async loadData() {
        const [tags, checkins] = await Promise.all([
            store.list(C.TAGS),
            store.list(C.CHECKINS),
        ]);
        this.setData({ tags, checkins });
    },

    goTagManage() {
        wx.navigateTo({ url: '/pages/tag-manage/tag-manage' });
    },

    goCheckinManage() {
        wx.navigateTo({ url: '/pages/checkin-manage/checkin-manage' });
    },

    onStartChange(e) {
        this.setData({ exportStart: e.detail.value });
    },

    onEndChange(e) {
        this.setData({ exportEnd: e.detail.value });
    },

    // 按日期范围导出 ICS
    exportByDate() {
        const { exportStart, exportEnd } = this.data;
        if (!exportStart || !exportEnd) {
            wx.showToast({ title: '请选择起止日期', icon: 'none' });
            return;
        }
        if (exportStart > exportEnd) {
            wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
            return;
        }
        wx.navigateTo({
            url:
                '/pages/export/export?start=' +
                exportStart +
                '&end=' +
                exportEnd,
        });
    },

    // 导出全部
    exportAll() {
        wx.navigateTo({ url: '/pages/export/export' });
    },

    goImport() {
        wx.navigateTo({ url: '/pages/import/import' });
    },

    goConfigGuide() {
        wx.showModal({
            title: '云开发配置',
            content:
                '当前为本地存储模式。打开 config.js，将 useCloud 改为 true 并填入你的云环境 ID，在云开发控制台新建 tags、checkins、events 三个集合即可切换到云端。',
            showCancel: false,
        });
    },
});
