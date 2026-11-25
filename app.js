const store = require('./utils/store');
const service = require('./utils/service');

App({
    globalData: {
        appName: '生活手记',
        ready: false,
    },

    onLaunch() {
        store.init()
            .catch(() => {})
            .then(() => service.ensureDefaults())
            .then(() => {
                this.globalData.ready = true;
                if (this.readyCallback) this.readyCallback();
            })
            .catch(() => {
                this.globalData.ready = true;
                if (this.readyCallback) this.readyCallback();
            });
    },

    onReady(callback) {
        if (this.globalData.ready) {
            callback();
        } else {
            this.readyCallback = callback;
        }
    },
});
