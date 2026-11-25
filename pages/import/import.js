const icsImport = require('../../utils/ics-import');

Page({
    data: {
        content: '', // ICS 文本内容
        preview: null, // { total, records, skipped, truncated, error }
        importing: false,
        result: null, // { imported, skipped } 导入完成结果
    },

    onContentInput(e) {
        this.setData({ content: e.detail.value, preview: null, result: null });
    },

    // 从微信聊天会话里选择 .ics 文件
    chooseFile() {
        const that = this;
        if (!wx.chooseMessageFile) {
            wx.showToast({ title: '当前环境不支持选文件，请粘贴内容', icon: 'none' });
            return;
        }
        wx.chooseMessageFile({
            count: 1,
            type: 'file',
            extension: ['ics'],
            success(res) {
                const file = res.tempFiles && res.tempFiles[0];
                if (!file) return;
                wx.showLoading({ title: '读取文件' });
                try {
                    const fs = wx.getFileSystemManager();
                    const text = fs.readFileSync(file.path, 'utf8');
                    wx.hideLoading();
                    that.setData({ content: text, preview: null, result: null });
                } catch (e) {
                    wx.hideLoading();
                    wx.showToast({ title: '文件读取失败', icon: 'none' });
                }
            },
            fail() {
                // 用户取消不提示
            },
        });
    },

    // 粘贴剪贴板内容
    async pasteContent() {
        try {
            const res = await new Promise((resolve, reject) => {
                wx.getClipboardData({
                    success: resolve,
                    fail: reject,
                });
            });
            if (res.data) {
                this.setData({ content: res.data, preview: null, result: null });
            } else {
                wx.showToast({ title: '剪贴板为空', icon: 'none' });
            }
        } catch (e) {
            wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
        }
    },

    clearContent() {
        this.setData({ content: '', preview: null, result: null });
    },

    // 解析预览
    async doPreview() {
        const content = this.data.content;
        if (!content || !content.trim()) {
            wx.showToast({ title: '请先选择文件或粘贴 ICS 内容', icon: 'none' });
            return;
        }
        wx.showLoading({ title: '解析中' });
        try {
            const preview = await icsImport.prepare(content);
            wx.hideLoading();
            this.setData({ preview: preview, result: null });
            if (preview.error) {
                wx.showToast({ title: preview.error, icon: 'none' });
            } else if (preview.records.length === 0) {
                wx.showToast({ title: '没有可导入的新日程', icon: 'none' });
            }
        } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '解析失败，请检查 ICS 内容', icon: 'none' });
        }
    },

    // 确认导入（用自定义确认层，不依赖原生弹窗）
    askImport() {
        const p = this.data.preview;
        if (!p || !p.records.length) return;
        this.setData({ showConfirm: true });
    },

    cancelImport() {
        this.setData({ showConfirm: false });
    },

    async confirmImport() {
        if (this.data.importing) return;
        this.setData({ importing: true, showConfirm: false });
        wx.showLoading({ title: '导入中' });
        try {
            const count = await icsImport.commit(this.data.preview);
            wx.hideLoading();
            this.setData({
                importing: false,
                result: { imported: count, skipped: this.data.preview.skipped },
                content: '',
                preview: null,
            });
            wx.showToast({ title: '导入成功', icon: 'success' });
        } catch (e) {
            wx.hideLoading();
            this.setData({ importing: false });
            wx.showToast({ title: '导入失败', icon: 'none' });
        }
    },

    goCalendar() {
        wx.switchTab({ url: '/pages/index/index' });
    },
});
