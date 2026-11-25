const store = require('../../utils/store');
const C = store.COLLECTIONS;

const COLORS = ['#E8615B', '#3B8BE8', '#E89A3B', '#3EAE8C', '#9B6DD6', '#E4689A', '#5A6675', '#0FA3A3'];

Page({
    data: {
        tags: [],
        colors: COLORS,
        showForm: false,
        editId: '',
        name: '',
        color: COLORS[0],
        keywordsText: '',
        deleteId: '',
        showDeleteConfirm: false,
    },

    onShow() {
        this.loadData();
    },

    async loadData() {
        const tags = await store.list(C.TAGS);
        this.setData({ tags });
    },

    openAdd() {
        this.setData({
            showForm: true,
            editId: '',
            name: '',
            color: COLORS[0],
            keywordsText: '',
        });
    },

    openEdit(e) {
        const tag = e.currentTarget.dataset.tag;
        this.setData({
            showForm: true,
            editId: tag._id,
            name: tag.name,
            color: tag.color,
            keywordsText: (tag.keywords || []).join(' '),
        });
    },

    closeForm() {
        this.setData({ showForm: false });
    },

    onNameInput(e) {
        this.setData({ name: e.detail.value });
    },

    onKeywordsInput(e) {
        this.setData({ keywordsText: e.detail.value });
    },

    pickColor(e) {
        this.setData({ color: e.currentTarget.dataset.color });
    },

    async saveTag() {
        const name = this.data.name.trim();
        if (!name) {
            wx.showToast({ title: '请输入标签名称', icon: 'none' });
            return;
        }
        const keywords = this.data.keywordsText
            .split(/[\s,，、]+/)
            .map((k) => k.trim())
            .filter(Boolean);
        const payload = { name, color: this.data.color, keywords };
        try {
            if (this.data.editId) {
                await store.update(C.TAGS, this.data.editId, payload);
            } else {
                await store.create(C.TAGS, payload);
            }
            wx.showToast({ title: '已保存', icon: 'success' });
            this.setData({ showForm: false });
            this.loadData();
        } catch (e) {
            wx.showToast({ title: '保存失败', icon: 'none' });
        }
    },

    deleteTag(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) {
            wx.showToast({ title: '无法识别该标签', icon: 'none' });
            return;
        }
        this.setData({ deleteId: id, showDeleteConfirm: true });
    },

    cancelDelete() {
        this.setData({ showDeleteConfirm: false, deleteId: '' });
    },

    async confirmDelete() {
        const id = this.data.deleteId;
        if (!id) return;
        try {
            // 从所有记录中移除该标签
            const events = await store.list(C.EVENTS);
            for (let i = 0; i < events.length; i++) {
                const ids = (events[i].tagIds || []).filter((x) => x !== id);
                if (ids.length !== (events[i].tagIds || []).length) {
                    await store.update(C.EVENTS, events[i]._id, { tagIds: ids });
                }
            }
            await store.remove(C.TAGS, id);
            this.setData({ showDeleteConfirm: false, deleteId: '' });
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadData();
        } catch (e) {
            this.setData({ showDeleteConfirm: false, deleteId: '' });
            wx.showToast({ title: '删除失败', icon: 'none' });
        }
    },
});
