const store = require('../../utils/store');
const C = store.COLLECTIONS;

Page({
    data: {
        totalCount: 0,
        noteCount: 0,
        checkinCount: 0,
        tagStats: [],
        checkinStats: [],
        maxTagCount: 1,
        // 近 30 天热力
        heatDays: [],
        monthLabel: '',
        rangeMode: 'all', // all | 30 | 90
    },

    onShow() {
        this.loadData();
    },

    async loadData() {
        const [events, tags, checkins] = await Promise.all([
            store.list(C.EVENTS),
            store.list(C.TAGS),
            store.list(C.CHECKINS),
        ]);

        const noteCount = events.filter((e) => e.type !== 'checkin').length;
        const checkinCount = events.filter((e) => e.type === 'checkin').length;

        // 按标签统计
        const tagCount = {};
        tags.forEach((t) => (tagCount[t._id] = 0));
        events.forEach((e) => {
            (e.tagIds || []).forEach((id) => {
                if (tagCount[id] != null) tagCount[id] += 1;
            });
        });
        let tagStats = tags
            .map((t) => ({
                _id: t._id,
                name: t.name,
                color: t.color,
                count: tagCount[t._id] || 0,
            }))
            .sort((a, b) => b.count - a.count);
        const maxTagCount = tagStats.length ? Math.max(1, tagStats[0].count) : 1;
        tagStats.forEach((t) => {
            t.percent = Math.round((t.count / maxTagCount) * 100);
        });

        // 按打卡项统计
        const itemCount = {};
        events.forEach((e) => {
            if (e.type === 'checkin' && e.checkinItemId) {
                itemCount[e.checkinItemId] = (itemCount[e.checkinItemId] || 0) + 1;
            }
        });
        const checkinStats = checkins
            .map((c) => ({
                name: c.name,
                icon: c.icon,
                count: itemCount[c._id] || 0,
            }))
            .sort((a, b) => b.count - a.count);

        // 近 35 天热力（5 周）
        const heatDays = this.buildHeat(events);

        this.setData({
            totalCount: events.length,
            noteCount,
            checkinCount,
            tagStats,
            checkinStats,
            maxTagCount,
            heatDays,
        });
    },

    buildHeat(events) {
        const dayCount = {};
        events.forEach((e) => {
            dayCount[e.date] = (dayCount[e.date] || 0) + 1;
        });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = [];
        for (let i = 34; i >= 0; i--) {
            const d = new Date(today.getTime() - i * 86400000);
            const ds =
                d.getFullYear() +
                '-' +
                (d.getMonth() + 1 < 10 ? '0' : '') +
                (d.getMonth() + 1) +
                '-' +
                (d.getDate() < 10 ? '0' : '') +
                d.getDate();
            const c = dayCount[ds] || 0;
            days.push({
                date: ds,
                level: c === 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : 3,
            });
        }
        return days;
    },
});
