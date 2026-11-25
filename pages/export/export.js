const store = require('../../utils/store');
const service = require('../../utils/service');
const icsExport = require('../../utils/ics-export');
const C = store.COLLECTIONS;

Page({
    data: {
        start: '',
        end: '',
        rangeLabel: '',
        events: [],
        count: 0,
        loading: true,
        content: '',
    },

    async onLoad(options) {
        const start = options.start || '';
        const end = options.end || '';
        const rangeLabel = start && end ? start + ' 至 ' + end : '全部记录';
        this.setData({ start, end, rangeLabel });
        await this.build();
    },

    async build() {
        this.setData({ loading: true });
        const [events, tags] = await Promise.all([
            store.list(C.EVENTS),
            store.list(C.TAGS),
        ]);
        const { start, end } = this.data;
        let filtered = events.filter((e) => {
            if (start && e.date < start) return false;
            if (end && e.date > end) return false;
            return true;
        });
        const decorated = service.sortByTime(service.decorateEvents(filtered, tags), true);
        const tagMap = service.getTagMap(tags);
        const content = service.buildICS(decorated, tagMap, '生活手记');
        this.setData({
            events: decorated,
            count: decorated.length,
            content,
            loading: false,
        });
    },

    async shareICS() {
        if (this.data.count === 0) {
            wx.showToast({ title: '没有可导出的记录', icon: 'none' });
            return;
        }
        wx.showLoading({ title: '生成文件' });
        try {
            const filePath = await icsExport.writeICSFile(this.data.content);
            wx.hideLoading();
            const shared = await icsExport.shareFile(filePath);
            if (!shared) {
                wx.showModal({
                    title: '导出方式',
                    content: '当前环境不支持直接分享文件，是否复制 ICS 内容到剪贴板？',
                    success: (r) => {
                        if (r.confirm) {
                            icsExport.copyText(this.data.content).then((ok) => {
                                wx.showToast({ title: ok ? '已复制' : '复制失败', icon: 'none' });
                            });
                        }
                    },
                });
            }
        } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '导出失败', icon: 'none' });
        }
    },

    async copyICS() {
        const ok = await icsExport.copyText(this.data.content);
        wx.showToast({ title: ok ? '已复制到剪贴板' : '复制失败', icon: 'none' });
    },
});
