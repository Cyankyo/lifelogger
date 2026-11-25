const store = require('../../utils/store');
const service = require('../../utils/service');
const dateUtil = require('../../utils/date');
const C = store.COLLECTIONS;

Page({
    data: {
        editId: '',
        type: 'note', // note | checkin
        date: '',
        time: '00:00:00', // 精确到秒，秒默认 00
        timeParts: dateUtil.TIME_PARTS,
        timeIndex: [0, 0, 0],
        title: '',
        content: '',
        // 属性值：日常记录由用户添加；打卡记录按所选打卡项定义的属性预填
        customFields: [],
        checkinFieldDefs: [], // 当前打卡项定义的属性名
        checkinItemId: '',
        checkinItemName: '',
        checkinItemIndex: 0,
        checkinItems: [],
        // 标签
        tags: [],
        selectedTagIds: [], // 手动选中
        autoTagIds: [], // 自动识别命中
        rejectedAutoIds: [], // 用户手动否决的自动标签
        activeTagIds: [], // 最终生效（手动 ∪ 自动 - 否决），用于渲染选中态
        tagViewList: [], // 标签渲染数据：真机 WXML 不支持 indexOf，样式/状态在 JS 里算好
        autoTagNames: '',
        // 其它
        loading: false,
        showDeleteConfirm: false,
    },

    async onLoad(options) {
        const tags = await store.list(C.TAGS);
        const checkinItems = await store.list(C.CHECKINS);
        this.setData({ tags, checkinItems });

        if (options.id) {
            // 编辑模式
            const all = await store.list(C.EVENTS);
            const rec = all.find((x) => x._id === options.id);
            if (rec) {
                let customFields = rec.customFields || [];
                // 兼容旧数据：旧固定字段平移为自定义属性（日常记录的体温/吃药，打卡的时长/项目/卡路里）
                if (!rec.customFields) {
                    customFields = [];
                    if (rec.temperature != null) {
                        customFields.push({ key: '体温', value: String(rec.temperature) + '°C' });
                    }
                    if (rec.medicine) {
                        customFields.push({ key: '吃药', value: '是' });
                    }
                    if (rec.duration != null) {
                        customFields.push({ key: '时长', value: String(rec.duration) });
                    }
                    if (rec.project) {
                        customFields.push({ key: '项目', value: rec.project });
                    }
                    if (rec.calories != null) {
                        customFields.push({ key: '卡路里', value: String(rec.calories) });
                    }
                }
                // 旧记录没有 time 时，默认取当前时分、秒为 00
                const time = rec.time ? dateUtil.normalizeTime(rec.time) : dateUtil.nowTime();
                this.setData({
                    editId: rec._id,
                    type: rec.type || 'note',
                    date: rec.date,
                    time: time,
                    timeIndex: dateUtil.timeToIndex(time),
                    title: rec.title || '',
                    content: rec.content || '',
                    customFields: customFields,
                    checkinItemId: rec.checkinItemId || '',
                    selectedTagIds: rec.tagIds || [],
                });
                this.syncCheckinItem(true);
                this.refreshAutoTags();
                wx.setNavigationBarTitle({ title: '编辑记录' });
                return;
            }
        }
        // 新增模式：标签默认不勾选，属性默认不展示
        const date = options.date || dateUtil.today();
        const checkinItemId = options.checkinItemId || '';
        const type = checkinItemId ? 'checkin' : 'note';
        const time = dateUtil.nowTime(); // 秒默认 00
        this.setData(
            {
                date,
                time,
                timeIndex: dateUtil.timeToIndex(time),
                type,
                checkinItemId,
                customFields: [],
                selectedTagIds: [],
                autoTagIds: [],
                autoTagNames: '',
            },
            () => {
                this.syncCheckinItem();
                this.refreshAutoTags();
            }
        );
    },

    // 选中打卡项后，按打卡项定义的属性重建填写区（保留同名旧值）
    syncCheckinItem(preserveValues) {
        const { checkinItemId, checkinItems, type } = this.data;
        const idx = checkinItems.findIndex((x) => x._id === checkinItemId);
        const item = idx < 0 ? null : checkinItems[idx];
        const base = {
            checkinItemIndex: idx < 0 ? 0 : idx,
            checkinItemName: item ? item.name : '',
        };
        if (type !== 'checkin') {
            this.setData(base);
            return;
        }
        const defs = (item && item.fields) || [];
        const old = preserveValues ? this.data.customFields : [];
        const next = defs.map((key) => {
            const found = old.find((f) => f.key === key);
            return { key: key, value: found ? found.value : '' };
        });
        this.setData(
            Object.assign(base, { checkinFieldDefs: defs, customFields: next })
        );
    },

    setType(e) {
        const type = e.currentTarget.dataset.type;
        this.setData({ type }, () => {
            if (type === 'checkin') this.syncCheckinItem(true);
            else this.setData({ checkinFieldDefs: [] });
        });
    },

    onDateChange(e) {
        this.setData({ date: e.detail.value });
    },

    onTimeChange(e) {
        const idx = e.detail.value || [0, 0, 0];
        this.setData({ timeIndex: idx, time: dateUtil.indexToTime(idx) });
    },

    onTitleInput(e) {
        this.setData({ title: e.detail.value }, () => this.refreshAutoTags());
    },

    onContentInput(e) {
        this.setData({ content: e.detail.value }, () => this.refreshAutoTags());
    },

    // 真机 WXML 不支持 indexOf 等方法调用，把每个标签的选中态和内联样式在 JS 里算好
    buildTagView(tags, activeIds, selectedIds, autoIds) {
        const active = activeIds || [];
        const selected = selectedIds || [];
        const auto = autoIds || [];
        return (tags || []).map((t) => {
            const isActive = active.indexOf(t._id) !== -1;
            const isAutoOnly = auto.indexOf(t._id) !== -1 && selected.indexOf(t._id) === -1;
            return {
                _id: t._id,
                name: t.name,
                color: t.color,
                active: isActive,
                autoOnly: isAutoOnly,
                style: isActive
                    ? 'background:' + t.color + ';border-color:' + t.color + ';color:#ffffff'
                    : 'background:#ffffff;border-color:' + t.color + ';color:' + t.color,
            };
        });
    },

    // 根据标题+内容实时识别标签；用户否决过的不再自动加回
    refreshAutoTags() {
        const d = this.data;
        const text = (d.title || '') + ' ' + (d.content || '');
        const autoIds = service
            .autoMatchTagIds(text, d.tags)
            .filter((id) => d.rejectedAutoIds.indexOf(id) === -1);
        const autoNames = autoIds
            .map((id) => {
                const t = d.tags.find((x) => x._id === id);
                return t ? t.name : '';
            })
            .filter(Boolean)
            .join('、');
        // 生效标签 = 手动选中 ∪ 自动命中，用于按钮高亮与保存
        const activeIds = service.mergeTagIds(d.selectedTagIds, autoIds);
        this.setData({
            autoTagIds: autoIds,
            autoTagNames: autoNames,
            activeTagIds: activeIds,
            tagViewList: this.buildTagView(d.tags, activeIds, d.selectedTagIds, autoIds),
        });
    },

    // ---- 自定义属性 ----
    addCustomField() {
        const fields = this.data.customFields.slice();
        fields.push({ key: '', value: '' });
        this.setData({ customFields: fields });
    },

    removeCustomField(e) {
        const idx = Number(e.currentTarget.dataset.index);
        const fields = this.data.customFields.slice();
        fields.splice(idx, 1);
        this.setData({ customFields: fields });
    },

    onCustomKeyInput(e) {
        const idx = Number(e.currentTarget.dataset.index);
        const fields = this.data.customFields.slice();
        fields[idx] = Object.assign({}, fields[idx], { key: e.detail.value });
        this.setData({ customFields: fields });
    },

    onCustomValueInput(e) {
        const idx = Number(e.currentTarget.dataset.index);
        const fields = this.data.customFields.slice();
        fields[idx] = Object.assign({}, fields[idx], { value: e.detail.value });
        this.setData({ customFields: fields });
    },

    onCheckinItemChange(e) {
        const idx = Number(e.detail.value);
        const item = this.data.checkinItems[idx];
        this.setData({ checkinItemId: item ? item._id : '' }, () => {
            this.syncCheckinItem(true);
        });
    },

    goTagManage() {
        wx.navigateTo({ url: '/pages/tag-manage/tag-manage' });
    },

    toggleTag(e) {
        const id = e.currentTarget.dataset.id;
        const d = this.data;
        const selected = d.selectedTagIds.slice();
        const rejected = d.rejectedAutoIds.slice();
        const wasActive = d.activeTagIds.indexOf(id) !== -1;
        const wasAutoOnly = d.autoTagIds.indexOf(id) !== -1 && selected.indexOf(id) === -1;

        if (wasActive) {
            // 取消：移出手动选中；若是自动命中的，记下否决避免再被加回
            const idx = selected.indexOf(id);
            if (idx !== -1) selected.splice(idx, 1);
            if (wasAutoOnly && rejected.indexOf(id) === -1) rejected.push(id);
        } else {
            // 选中：移出否决列表并加入手动选中
            const rIdx = rejected.indexOf(id);
            if (rIdx !== -1) rejected.splice(rIdx, 1);
            if (selected.indexOf(id) === -1) selected.push(id);
        }
        this.setData({ selectedTagIds: selected, rejectedAutoIds: rejected }, () =>
            this.refreshAutoTags()
        );
    },

    async save() {
        const d = this.data;
        if (!d.title.trim()) {
            wx.showToast({ title: '请填写标题', icon: 'none' });
            return;
        }
        if (!d.date) {
            wx.showToast({ title: '请选择日期', icon: 'none' });
            return;
        }
        this.setData({ loading: true });

        const tagIds = d.activeTagIds.slice();
        const payload = {
            type: d.type,
            date: d.date,
            time: dateUtil.normalizeTime(d.time),
            title: d.title.trim(),
            content: d.content.trim(),
            tagIds: tagIds,
        };

        if (d.type === 'checkin' && !d.checkinItemId) {
            wx.showToast({ title: '请选择打卡项', icon: 'none' });
            this.setData({ loading: false });
            return;
        }
        // 日常记录和打卡统一用自定义属性保存（打卡的属性由打卡项定义）
        payload.customFields = d.customFields
            .map((f) => ({ key: (f.key || '').trim(), value: (f.value || '').trim() }))
            .filter((f) => f.key);
        if (d.type === 'checkin') {
            payload.checkinItemId = d.checkinItemId;
        }

        try {
            if (d.editId) {
                await store.update(C.EVENTS, d.editId, payload);
            } else {
                await store.create(C.EVENTS, payload);
            }
            wx.showToast({ title: '已保存', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 500);
        } catch (e) {
            this.setData({ loading: false });
            wx.showToast({ title: '保存失败', icon: 'none' });
        }
    },

    deleteRecord() {
        if (!this.data.editId) return;
        this.setData({ showDeleteConfirm: true });
    },

    cancelDelete() {
        this.setData({ showDeleteConfirm: false });
    },

    async confirmDelete() {
        try {
            await store.remove(C.EVENTS, this.data.editId);
            this.setData({ showDeleteConfirm: false });
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 500);
        } catch (e) {
            this.setData({ showDeleteConfirm: false });
            wx.showToast({ title: '删除失败', icon: 'none' });
        }
    },
});
