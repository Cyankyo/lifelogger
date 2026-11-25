const store = require('../../utils/store');
const C = store.COLLECTIONS;

const COLORS = ['#E8615B', '#3B8BE8', '#E89A3B', '#3EAE8C', '#9B6DD6', '#E4689A', '#5A6675', '#0FA3A3'];
const ICONS = ['🏃', '💧', '🌙', '📖', '🧘', '🚴', '🏋️', '🥗', '🧹', '💊', '😴', '☀️', '🎯', '✍️', '🎨', '🚶'];

Page({
    data: {
        items: [],
        colors: COLORS,
        icons: ICONS,
        showForm: false,
        editId: '',
        name: '',
        color: COLORS[0],
        icon: ICONS[0],
        fields: [], // 该打卡项打卡时要填写的自定义属性名
        deleteId: '',
        showDeleteConfirm: false,
    },

    onShow() {
        this.loadData();
    },

    async loadData() {
        const items = await store.list(C.CHECKINS);
        this.setData({
            items: items.map((it) =>
                Object.assign({}, it, { fieldsText: (it.fields || []).join('、') })
            ),
        });
    },

    openAdd() {
        this.setData({
            showForm: true,
            editId: '',
            name: '',
            color: COLORS[0],
            icon: ICONS[0],
            fields: [],
        });
    },

    openEdit(e) {
        const item = e.currentTarget.dataset.item;
        this.setData({
            showForm: true,
            editId: item._id,
            name: item.name,
            color: item.color || COLORS[0],
            icon: item.icon || ICONS[0],
            fields: (item.fields || []).slice(),
        });
    },

    closeForm() {
        this.setData({ showForm: false });
    },

    onNameInput(e) {
        this.setData({ name: e.detail.value });
    },

    pickColor(e) {
        this.setData({ color: e.currentTarget.dataset.color });
    },

    pickIcon(e) {
        this.setData({ icon: e.currentTarget.dataset.icon });
    },

    // ---- 自定义属性定义 ----
    addField() {
        this.setData({ fields: this.data.fields.concat(['']) });
    },

    removeField(e) {
        const idx = Number(e.currentTarget.dataset.index);
        const fields = this.data.fields.slice();
        fields.splice(idx, 1);
        this.setData({ fields });
    },

    onFieldInput(e) {
        const idx = Number(e.currentTarget.dataset.index);
        const fields = this.data.fields.slice();
        fields[idx] = e.detail.value;
        this.setData({ fields });
    },

    async saveItem() {
        const name = this.data.name.trim();
        if (!name) {
            wx.showToast({ title: '请输入打卡项名称', icon: 'none' });
            return;
        }
        // 属性名去空、去重
        const seen = {};
        const fields = [];
        this.data.fields.forEach((raw) => {
            const key = String(raw == null ? '' : raw).trim();
            if (key && !seen[key]) {
                seen[key] = true;
                fields.push(key);
            }
        });
        const payload = { name, color: this.data.color, icon: this.data.icon, fields };
        try {
            if (this.data.editId) {
                await store.update(C.CHECKINS, this.data.editId, payload);
            } else {
                await store.create(C.CHECKINS, payload);
            }
            wx.showToast({ title: '已保存', icon: 'success' });
            this.setData({ showForm: false });
            this.loadData();
        } catch (e) {
            wx.showToast({ title: '保存失败', icon: 'none' });
        }
    },

    deleteItem(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) {
            wx.showToast({ title: '无法识别该项', icon: 'none' });
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
            await store.remove(C.CHECKINS, id);
            this.setData({ showDeleteConfirm: false, deleteId: '' });
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadData();
        } catch (e) {
            this.setData({ showDeleteConfirm: false, deleteId: '' });
            wx.showToast({ title: '删除失败', icon: 'none' });
        }
    },

    goCheckin() {
        wx.navigateBack();
    },
});
