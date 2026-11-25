// 统一数据存储层
// 页面只调用本模块的方法；底层根据 config.useCloud 在「微信云开发」与「本地存储」间切换。
// 所有方法均为 Promise，解析值为纯数据对象，失败时 reject(Error)。

const config = require('../config');

const COLLECTIONS = {
  TAGS: 'tags',
  CHECKINS: 'checkins',
  EVENTS: 'events',
};

let cloudReady = false;
let db = null;

function isCloud() {
  return !!(config.useCloud && typeof wx !== 'undefined' && wx.cloud);
}

// 在 app.js onLaunch 中调用
function init() {
  if (!isCloud()) return Promise.resolve(false);
  if (cloudReady) return Promise.resolve(true);
  try {
    wx.cloud.init({ env: config.env, traceUser: true });
    db = wx.cloud.database();
    cloudReady = true;
    return Promise.resolve(true);
  } catch (e) {
    return Promise.reject(e);
  }
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- 本地存储实现 ----------
const LOCAL_KEY_PREFIX = 'life_logger_';

function localRead(name) {
  try {
    const value = wx.getStorageSync(LOCAL_KEY_PREFIX + name);
    return value || [];
  } catch (e) {
    return [];
  }
}

function localWrite(name, list) {
  try {
    wx.setStorageSync(LOCAL_KEY_PREFIX + name, list);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- 云开发实现：分页拉全量 ----------
function cloudListAll(name) {
  return new Promise((resolve, reject) => {
    const MAX = 20;
    const collect = (all) => {
      db.collection(name)
        .skip(all.length)
        .limit(MAX)
        .get()
        .then((res) => {
          const next = all.concat(res.data || []);
          if ((res.data || []).length < MAX) {
            resolve(next);
          } else {
            collect(next);
          }
        })
        .catch(reject);
    };
    collect([]);
  });
}

// ---------- 统一接口 ----------
function list(name) {
  if (isCloud()) {
    if (!cloudReady) return Promise.reject(new Error('云开发尚未初始化'));
    return cloudListAll(name);
  }
  return Promise.resolve(localRead(name));
}

function create(name, data) {
  const now = Date.now();
  if (isCloud()) {
    const doc = Object.assign({}, data, { createdAt: now, updatedAt: now });
    return db.collection(name).add({ data: doc }).then((res) => {
      return Object.assign({ _id: res._id }, doc);
    });
  }
  const doc = Object.assign({ _id: genId(), createdAt: now, updatedAt: now }, data);
  const all = localRead(name);
  all.unshift(doc);
  if (!localWrite(name, all)) return Promise.reject(new Error('本地存储空间不足'));
  return Promise.resolve(doc);
}

function update(name, id, patch) {
  const changes = Object.assign({}, patch, { updatedAt: Date.now() });
  if (isCloud()) {
    return db.collection(name).doc(id).update({ data: changes }).then(() => {
      return Object.assign({ _id: id }, changes);
    });
  }
  const all = localRead(name);
  const idx = all.findIndex((x) => x._id === id);
  if (idx === -1) return Promise.reject(new Error('记录不存在'));
  all[idx] = Object.assign({}, all[idx], changes);
  if (!localWrite(name, all)) return Promise.reject(new Error('本地存储空间不足'));
  return Promise.resolve(all[idx]);
}

function remove(name, id) {
  if (isCloud()) {
    return db.collection(name).doc(id).remove().then(() => ({ _id: id }));
  }
  const all = localRead(name);
  const next = all.filter((x) => x._id !== id);
  if (!localWrite(name, next)) return Promise.reject(new Error('本地存储写入失败'));
  return Promise.resolve({ _id: id });
}

// 批量写入（本地模式用于一次性灌入多条；云模式逐条 add）
function insertMany(name, docs) {
  if (isCloud()) {
    const now = Date.now();
    const jobs = docs.map((d) =>
      db.collection(name).add({ data: Object.assign({}, d, { createdAt: now, updatedAt: now }) })
    );
    return Promise.all(jobs);
  }
  const existing = localRead(name);
  const now = Date.now();
  const additions = docs.map((d) =>
    Object.assign({ _id: genId(), createdAt: now, updatedAt: now }, d)
  );
  const next = additions.concat(existing);
  if (!localWrite(name, next)) return Promise.reject(new Error('本地存储空间不足'));
  return Promise.resolve(additions);
}

module.exports = {
  COLLECTIONS,
  isCloud,
  init,
  list,
  create,
  update,
  remove,
  insertMany,
};
