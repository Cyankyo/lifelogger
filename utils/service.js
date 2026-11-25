// 业务服务层：标签自动匹配、记录查询、打卡、ICS 导出
const store = require('./store');
const dateUtil = require('./date');
const C = store.COLLECTIONS;

const DEFAULT_TAGS = [
  { name: '健康', color: '#E8615B', keywords: ['生病', '感冒', '发烧', '体温', '吃药', '药', '咳嗽', '疼', '医院', '看病'] },
  { name: '家务', color: '#3B8BE8', keywords: ['家务', '打扫', '拖地', '洗碗', '洗衣', '收拾', '做饭', '清洁'] },
  { name: '购物', color: '#E89A3B', keywords: ['买了', '购入', '购物', '下单', '快递', '新增', '洗衣液'] },
  { name: '饮食', color: '#3EAE8C', keywords: ['吃', '喝', '外卖', '做饭', '餐厅', '早餐', '午餐', '晚餐'] },
  { name: '心情', color: '#9B6DD6', keywords: ['开心', '难过', '心情', '累', '烦', '焦虑', '放松'] },
  { name: '运动', color: '#E4689A', keywords: ['运动', '跑步', '健身', '走路', '瑜伽', '游泳', '骑行'] },
];

// fields：该打卡项要填写的自定义属性名，可在打卡项管理里增删改
const DEFAULT_CHECKINS = [
  { name: '运动', color: '#E4689A', icon: '🏃', fields: ['时长', '项目', '卡路里'] },
  { name: '喝水', color: '#3B8BE8', icon: '💧', fields: ['容量'] },
  { name: '早睡', color: '#9B6DD6', icon: '🌙', fields: [] },
  { name: '读书', color: '#3EAE8C', icon: '📖', fields: ['页数'] },
];

// 若数据为空则灌入默认标签与打卡项
async function ensureDefaults() {
  const [tags, checkins] = await Promise.all([store.list(C.TAGS), store.list(C.CHECKINS)]);
  if (tags.length === 0) await store.insertMany(C.TAGS, DEFAULT_TAGS);
  if (checkins.length === 0) await store.insertMany(C.CHECKINS, DEFAULT_CHECKINS);
}

// 根据文本自动匹配标签（返回标签 id 数组）
function autoMatchTagIds(text, tags) {
  if (!text) return [];
  const lower = String(text).toLowerCase();
  const ids = [];
  tags.forEach((tag) => {
    const kws = tag.keywords || [];
    for (let i = 0; i < kws.length; i++) {
      const kw = String(kws[i]).toLowerCase();
      if (kw && lower.indexOf(kw) !== -1) {
        ids.push(tag._id);
        break;
      }
    }
  });
  return ids;
}

// 建记录时把自动匹配的标签并入手动标签（去重）
function mergeTagIds(manualIds, autoIds) {
  const set = {};
  (manualIds || []).concat(autoIds || []).forEach((id) => {
    if (id) set[id] = true;
  });
  return Object.keys(set);
}

function getTagMap(tags) {
  const map = {};
  tags.forEach((t) => {
    map[t._id] = t;
  });
  return map;
}

// 把记录的自定义属性转成展示文本数组，如 ['体温：37.5°C', '吃药：是']
function fieldsToText(customFields) {
  return (customFields || [])
    .filter((f) => f && f.key)
    .map((f) => (f.value ? f.key + '：' + f.value : f.key));
}

// 把记录里的 tagIds 展开为带 name/color 的对象，方便 WXML 渲染
function decorateEvents(events, tags) {
  const map = getTagMap(tags);
  return events.map((e) => {
    const tagList = (e.tagIds || [])
      .map((id) => map[id])
      .filter((t) => !!t)
      .map((t) => ({ _id: t._id, name: t.name, color: t.color }));
    const fieldList = fieldsToText(e.customFields);
    // 旧记录没有 time，不显示时间（避免误认为 00:00）
    const timeText = e.time ? dateUtil.normalizeTime(e.time) : '';
    return Object.assign({}, e, {
      tagList: tagList,
      fieldList: fieldList,
      timeText: timeText,
      timeKey: dateUtil.dateTimeKey(e),
    });
  });
}

// 按日期+时间排序：asc=true 从早到晚，asc=false 从晚到早
function sortByTime(events, asc) {
  const list = (events || []).slice();
  list.sort((a, b) => {
    const ka = dateUtil.dateTimeKey(a);
    const kb = dateUtil.dateTimeKey(b);
    if (ka === kb) return (b.createdAt || 0) - (a.createdAt || 0);
    if (asc === false) return ka < kb ? 1 : -1;
    return ka < kb ? -1 : 1;
  });
  return list;
}

// 关键词搜索：匹配标题、内容、打卡项目、时间、自定义属性
function searchEvents(events, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return events;
  return events.filter((e) => {
    const fieldText = fieldsToText(e.customFields).join(' ');
    const hay = [e.title, e.content, e.project, e.note, e.extra, e.time, fieldText]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.indexOf(kw) !== -1;
  });
}

// ---------- ICS 导出 ----------
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function escapeICS(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// 生成 ICS 字符串（有 time 用精确时刻，无 time 用全天事件）
function buildICS(events, tagMap, calName) {
  const stamp = new Date();
  const utcStamp =
    stamp.getUTCFullYear() +
    pad(stamp.getUTCMonth() + 1) +
    pad(stamp.getUTCDate()) +
    'T' +
    pad(stamp.getUTCHours()) +
    pad(stamp.getUTCMinutes()) +
    pad(stamp.getUTCSeconds()) +
    'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WorkBuddy//LifeLogger//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + escapeICS(calName || '生活手记'),
  ];

  (events || []).forEach((e) => {
    const d = dateUtil.parseDate(e.date);
    const dayStart = d.getFullYear() + '' + pad(d.getMonth() + 1) + '' + pad(d.getDate());
    const next = new Date(d.getTime() + 24 * 3600 * 1000);
    const dayEnd = next.getFullYear() + '' + pad(next.getMonth() + 1) + '' + pad(next.getDate());

    // 有时间则导出精确时刻（浮动本地时间，兼容各日历）；旧数据无 time 仍用全天事件
    let startLine = 'DTSTART;VALUE=DATE:' + dayStart;
    let endLine = 'DTEND;VALUE=DATE:' + dayEnd;
    if (e.time) {
      const tp = dateUtil.normalizeTime(e.time).split(':').map(Number);
      startLine = 'DTSTART:' + dayStart + 'T' + pad(tp[0]) + pad(tp[1]) + pad(tp[2]);
      // 打卡属性里填了「时长」就按时长结束，兼容旧字段，否则默认 1 小时
      let minutes = 60;
      let dur = e.duration;
      if (!dur && e.customFields) {
        const f = e.customFields.find((x) => x.key && x.key.indexOf('时长') >= 0);
        if (f) dur = String(f.value).replace(/[^\d.]/g, '');
      }
      if (e.type === 'checkin' && dur) minutes = Number(dur) || 60;
      const endDt = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        tp[0],
        tp[1] + minutes,
        tp[2]
      );
      endLine =
        'DTEND:' +
        endDt.getFullYear() +
        '' +
        pad(endDt.getMonth() + 1) +
        '' +
        pad(endDt.getDate()) +
        'T' +
        pad(endDt.getHours()) +
        pad(endDt.getMinutes()) +
        pad(endDt.getSeconds());
    }

    const tagNames = (e.tagIds || [])
      .map((id) => (tagMap[id] ? tagMap[id].name : null))
      .filter(Boolean);

    let desc = e.content || '';
    const fieldText = fieldsToText(e.customFields);
    // 旧打卡字段仅在还没有自定义属性时写入，避免重复
    if (e.type === 'checkin' && fieldText.length === 0) {
      const parts = [];
      if (e.duration) parts.push('时长 ' + e.duration + ' 分钟');
      if (e.project) parts.push('项目 ' + e.project);
      if (e.calories) parts.push('消耗 ' + e.calories + ' 千卡');
      if (parts.length) desc += (desc ? '；' : '') + parts.join('，');
    }
    if (fieldText.length) desc += (desc ? '；' : '') + fieldText.join('，');
    if (tagNames.length) desc += (desc ? '；' : '') + '标签：' + tagNames.join('/');

    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + (e._id || genId()) + '@life-logger');
    lines.push('DTSTAMP:' + utcStamp);
    lines.push(startLine);
    lines.push(endLine);
    lines.push('SUMMARY:' + escapeICS(e.title || '生活记录'));
    lines.push('DESCRIPTION:' + escapeICS(desc || e.title || '生活记录'));
    // 扩展属性：导入时精确还原类型/标签/自定义属性（不影响其它日历读取）
    lines.push('X-LIFELOGGER-TYPE:' + (e.type === 'checkin' ? 'checkin' : 'note'));
    if (fieldText.length) {
      lines.push('X-LIFELOGGER-FIELDS:' + encodeURIComponent(JSON.stringify(e.customFields)));
    }
    if (tagNames.length) {
      lines.push('X-LIFELOGGER-TAGS:' + encodeURIComponent(JSON.stringify(tagNames)));
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  DEFAULT_TAGS,
  DEFAULT_CHECKINS,
  ensureDefaults,
  autoMatchTagIds,
  mergeTagIds,
  getTagMap,
  fieldsToText,
  decorateEvents,
  sortByTime,
  searchEvents,
  buildICS,
};
