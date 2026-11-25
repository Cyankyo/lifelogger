// 日期工具函数（统一使用 YYYY-MM-DD 字符串作为日期主键）

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// Date -> 'YYYY-MM-DD'
function formatDate(date) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return y + '-' + m + '-' + d;
}

// 'YYYY-MM-DD' -> Date（本地时区，避免 UTC 偏差）
function parseDate(str) {
  const parts = String(str).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

// 今天
function today() {
  return formatDate(new Date());
}

// 在日期字符串上加减天数
function addDays(dateStr, delta) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

// 某月天数
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// 生成月历网格：返回 6 行 x 7 列，每格 { date, day, current, weekday }
// weekStart: 0 表示周日为第一列，1 表示周一为第一列
function buildMonthGrid(year, month, weekStart) {
  weekStart = weekStart || 0;
  const first = new Date(year, month - 1, 1);
  const firstWeekday = first.getDay();
  const offset = (firstWeekday - weekStart + 7) % 7;
  const total = daysInMonth(year, month);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - offset + 1;
    if (dayNum < 1 || dayNum > total) {
      cells.push({ date: '', day: '', current: false });
    } else {
      cells.push({
        date: year + '-' + pad(month) + '-' + pad(dayNum),
        day: dayNum,
        current: true,
      });
    }
  }
  return cells;
}

const WEEK_LABELS_SUN = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_LABELS_MON = ['一', '二', '三', '四', '五', '六', '日'];

function weekLabels(weekStart) {
  return weekStart === 1 ? WEEK_LABELS_MON : WEEK_LABELS_SUN;
}

// 'YYYY-MM-DD' -> 'M月D日'
function friendly(dateStr) {
  const d = parseDate(dateStr);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// 星期中文
function weekdayName(dateStr) {
  const names = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return names[parseDate(dateStr).getDay()];
}

// ---------- 时间（精确到秒） ----------

// 两位数字数组，如 ['00','01',...]
function range2(start, end) {
  const arr = [];
  for (let i = start; i <= end; i++) arr.push(pad(i));
  return arr;
}

// 三列选择器的数据源：时 / 分 / 秒
const TIME_PARTS = [range2(0, 23), range2(0, 59), range2(0, 59)];

// 当前时分，秒固定为 00：'HH:mm:00'
function nowTime() {
  const d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
}

// 规范化为 'HH:mm:ss'；无效值返回 '00:00:00'
function normalizeTime(t) {
  const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(String(t == null ? '' : t));
  if (!m) return '00:00:00';
  return (
    pad(Math.min(23, Number(m[1]))) +
    ':' +
    pad(Math.min(59, Number(m[2]))) +
    ':' +
    pad(Math.min(59, Number(m[3] || 0)))
  );
}

// 'HH:mm:ss' -> [时, 分, 秒]（数字索引，与 TIME_PARTS 对应）
function timeToIndex(t) {
  return normalizeTime(t)
    .split(':')
    .map(Number);
}

// [时, 分, 秒] -> 'HH:mm:ss'
function indexToTime(arr) {
  const v = Array.isArray(arr) ? arr : [0, 0, 0];
  return (
    pad(Number(v[0]) || 0) + ':' + pad(Number(v[1]) || 0) + ':' + pad(Number(v[2]) || 0)
  );
}

// 记录排序键：'YYYY-MM-DD HH:mm:ss'，无 time 视为 00:00:00
function dateTimeKey(e) {
  return String((e && e.date) || '') + ' ' + normalizeTime(e && e.time);
}

module.exports = {
  pad,
  formatDate,
  parseDate,
  today,
  addDays,
  daysInMonth,
  buildMonthGrid,
  weekLabels,
  friendly,
  weekdayName,
  TIME_PARTS,
  nowTime,
  normalizeTime,
  timeToIndex,
  indexToTime,
  dateTimeKey,
};
