const store = require('../../utils/store');
const service = require('../../utils/service');
const dateUtil = require('../../utils/date');
const C = store.COLLECTIONS;

Page({
    data: {
        date: '',
        checkinItems: [],
        records: [],
        presetItemId: '',
    },

    async onLoad(options) {
        const date = options.date || dateUtil.today();
        const presetItemId = options.itemId || '';
        this.setData({ date, presetItemId });
        if (presetItemId) {
            // 从日历快捷打卡进入，直接跳到填写页
            wx.redirectTo({
                url:
                    '/pages/record-edit/record-edit?checkinItemId=' +
                    presetItemId +
                    '&date=' +
                    date,
            });
            return;
        }
        this.loadData();
    },

    onShow() {
        if (!this.data.presetItemId) this.loadData();
    },

    async loadData() {
        const [items, events] = await Promise.all([
            store.list(C.CHECKINS),
            store.list(C.EVENTS),
        ]);
        const date = this.data.date;
        const records = events
            .filter((e) => e.type === 'checkin' && e.date === date)
            .map((e) => {
                const item = items.find((x) => x._id === e.checkinItemId);
                const fields = (e.customFields || [])
                    .filter((f) => f.key && f.value)
                    .map((f) => f.key + ' ' + f.value);
                const legacy = [];
                if (e.duration != null) legacy.push('时长 ' + e.duration);
                if (e.project) legacy.push(e.project);
                if (e.calories != null) legacy.push('卡路里 ' + e.calories);
                return Object.assign({}, e, {
                    itemName: item ? item.name : '打卡',
                    itemIcon: item ? item.icon : '✓',
                    timeText: e.time ? dateUtil.normalizeTime(e.time) : '',
                    detailText: fields.length ? fields.join('  ') : legacy.join('  '),
                });
            })
            .sort((a, b) => {
                const ka = dateUtil.dateTimeKey(a);
                const kb = dateUtil.dateTimeKey(b);
                return ka < kb ? -1 : ka > kb ? 1 : 0;
            });
        this.setData({ checkinItems: items, records: records });
    },

    onDateChange(e) {
        this.setData({ date: e.detail.value }, () => this.loadData());
    },

    goFill(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: '/pages/record-edit/record-edit?checkinItemId=' + id + '&date=' + this.data.date,
        });
    },

    // 一键打卡：创建仅含日期和打卡项的记录，无需填写其它字段
    async quickCheckin(e) {
        const id = e.currentTarget.dataset.id;
        const item = this.data.checkinItems.find((x) => x._id === id);
        try {
            await store.create(C.EVENTS, {
                type: 'checkin',
                date: this.data.date,
                time: dateUtil.nowTime(),
                title: item ? item.name : '打卡',
                content: '',
                tagIds: [],
                checkinItemId: id,
            });
            wx.showToast({ title: '打卡成功', icon: 'success' });
            this.loadData();
        } catch (err) {
            wx.showToast({ title: '打卡失败', icon: 'none' });
        }
    },

    goManage() {
        wx.navigateTo({ url: '/pages/checkin-manage/checkin-manage' });
    },
});
