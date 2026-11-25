const store = require('../../utils/store');
const service = require('../../utils/service');
const dateUtil = require('../../utils/date');
const C = store.COLLECTIONS;

const WEEK_START = 0; // 周日为第一列

Page({
    data: {
        year: 0,
        month: 0,
        monthLabel: '',
        weekLabels: [],
        cells: [],
        selectedDate: '',
        selectedLabel: '',
        selectedWeekday: '',
        dayEvents: [],
        allEvents: [],
        tags: [],
        tagMap: {},
        checkins: [],
        colors: [],
        loading: true,
    },

    onLoad() {
        const now = new Date();
        this.setData({
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            weekLabels: dateUtil.weekLabels(WEEK_START),
        });
    },

    onShow() {
        this.loadData();
    },

    async loadData() {
        this.setData({ loading: true });
        try {
            const [events, tags, checkins] = await Promise.all([
                store.list(C.EVENTS),
                store.list(C.TAGS),
                store.list(C.CHECKINS),
            ]);
            const tagMap = service.getTagMap(tags);
            const selected = this.data.selectedDate || dateUtil.today();
            this.setData({
                allEvents: events,
                tags: tags,
                tagMap: tagMap,
                checkins: checkins,
                selectedDate: selected,
            });
            this.refreshCalendar();
            this.refreshDayList();
            this.setData({ loading: false });
        } catch (e) {
            this.setData({ loading: false });
            wx.showToast({ title: '加载失败', icon: 'none' });
        }
    },

    refreshCalendar() {
        const { year, month, allEvents, tagMap, selectedDate } = this.data;
        const rawCells = dateUtil.buildMonthGrid(year, month, WEEK_START);
        const todayStr = dateUtil.today();
        const byDate = {};
        allEvents.forEach((e) => {
            if (!byDate[e.date]) byDate[e.date] = [];
            byDate[e.date].push(e);
        });

        const cells = rawCells.map((cell) => {
            if (!cell.date) return Object.assign({ dots: [] }, cell);
            const list = byDate[cell.date] || [];
            const seen = {};
            const dots = [];
            for (let i = 0; i < list.length && dots.length < 3; i++) {
                const ids = list[i].tagIds || [];
                for (let j = 0; j < ids.length; j++) {
                    const t = tagMap[ids[j]];
                    if (t && !seen[t._id]) {
                        seen[t._id] = true;
                        dots.push(t.color);
                        if (dots.length >= 3) break;
                    }
                }
            }
            return Object.assign({}, cell, {
                dots: dots,
                isToday: cell.date === todayStr,
                isSelected: cell.date === selectedDate,
                hasEvent: list.length > 0,
            });
        });

        this.setData({
            cells: cells,
            monthLabel: year + '年' + month + '月',
        });
    },

    refreshDayList() {
        const selected = this.data.selectedDate;
        if (!selected) return;
        const list = this.data.allEvents.filter((e) => e.date === selected);
        const decorated = service.sortByTime(service.decorateEvents(list, this.data.tags), true);
        this.setData({
            dayEvents: decorated,
            selectedLabel: dateUtil.friendly(selected),
            selectedWeekday: dateUtil.weekdayName(selected),
        });
    },

    prevMonth() {
        let { year, month } = this.data;
        month -= 1;
        if (month < 1) { month = 12; year -= 1; }
        this.setData({ year, month }, () => this.refreshCalendar());
    },

    nextMonth() {
        let { year, month } = this.data;
        month += 1;
        if (month > 12) { month = 1; year += 1; }
        this.setData({ year, month }, () => this.refreshCalendar());
    },

    goToday() {
        const now = new Date();
        const todayStr = dateUtil.today();
        this.setData(
            {
                year: now.getFullYear(),
                month: now.getMonth() + 1,
                selectedDate: todayStr,
            },
            () => {
                this.refreshCalendar();
                this.refreshDayList();
            }
        );
    },

    onDateTap(e) {
        const date = e.currentTarget.dataset.date;
        if (!date) return;
        this.setData({ selectedDate: date }, () => {
            this.refreshCalendar();
            this.refreshDayList();
        });
    },

    goToSearch() {
        wx.navigateTo({ url: '/pages/search/search' });
    },

    goToRecordEdit() {
        wx.navigateTo({
            url: '/pages/record-edit/record-edit?date=' + this.data.selectedDate,
        });
    },

    onEventTap(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: '/pages/record-edit/record-edit?id=' + id });
    },

    onQuickCheckin(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: '/pages/checkin/checkin?itemId=' + id + '&date=' + this.data.selectedDate,
        });
    },
});
