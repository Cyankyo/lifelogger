const store = require('../../utils/store');
const service = require('../../utils/service');
const icsExport = require('../../utils/ics-export');
const C = store.COLLECTIONS;

Page({
    data: {
        keyword: '',
        tagFilterId: '',
        tags: [],
        results: [],
        hasSearched: false,
        loading: false,
        allEvents: [],
        tagMap: {},
    },

    async onLoad() {
        const tags = await store.list(C.TAGS);
        this.setData({ tags, tagMap: service.getTagMap(tags) });
    },

    onShow() {
        this.loadAll();
    },

    async loadAll() {
        const events = await store.list(C.EVENTS);
        const tags = await store.list(C.TAGS);
        this.setData({
            allEvents: events,
            tags: tags,
            tagMap: service.getTagMap(tags),
        });
        if (this.data.hasSearched) this.doSearch();
    },

    onKeywordInput(e) {
        this.setData({ keyword: e.detail.value });
    },

    onTagFilter(e) {
        this.setData({ tagFilterId: e.currentTarget.dataset.id || '' });
    },

    doSearch() {
        const { keyword, tagFilterId, allEvents, tags } = this.data;
        let list = service.searchEvents(allEvents, keyword);
        if (tagFilterId) {
            list = list.filter((e) => (e.tagIds || []).indexOf(tagFilterId) !== -1);
        }
        const decorated = service.sortByTime(service.decorateEvents(list, tags), false);
        this.setData({ results: decorated, hasSearched: true });
    },

    clearSearch() {
        this.setData({ keyword: '', tagFilterId: '', results: [], hasSearched: false });
    },

    onEventTap(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: '/pages/record-edit/record-edit?id=' + id });
    },

    // 导出当前搜索结果为 ICS
    async exportICS() {
        if (this.data.results.length === 0) {
            wx.showToast({ title: '没有可导出的结果', icon: 'none' });
            return;
        }
        const content = service.buildICS(this.data.results, this.data.tagMap, '生活手记-搜索结果');
        await this.saveAndShareICS(content);
    },

    async saveAndShareICS(content) {
        wx.showLoading({ title: '生成文件' });
        try {
            const filePath = await icsExport.writeICSFile(content);
            wx.hideLoading();
            const shared = await icsExport.shareFile(filePath);
            if (!shared) {
                wx.showModal({
                    title: '导出方式',
                    content: '当前环境不支持直接分享文件，是否复制 ICS 内容到剪贴板？',
                    success: (r) => {
                        if (r.confirm) {
                            icsExport.copyText(content).then((ok) => {
                                wx.showToast({
                                    title: ok ? '已复制到剪贴板' : '复制失败',
                                    icon: 'none',
                                });
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
});
