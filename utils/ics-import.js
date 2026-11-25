// ICS 导入：解析日历文件 -> 生活手记记录
// 支持标准 ICS（VEVENT），并识别本应用导出的格式（UID 后缀、标签/属性段）
const store = require('./store');
const service = require('./service');
const dateUtil = require('./date');

const C = store.COLLECTIONS;
const MAX_IMPORT = 500;
const OWN_UID_SUFFIX = '@life-logger';

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// 反转义 ICS 文本：\n 换行、\, \; 与 \\ 还原
function unescapeICS(s) {
  return String(s == null ? '' : s).replace(/\\([\\,;nN])/g, (m, c) => {
    return c === 'n' || c === 'N' ? '\n' : c;
  });
}

// 处理 ICS 折行（以空格/制表符开头的行是上一行的延续）
function unfoldLines(text) {
  const raw = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');
  const lines = [];
  raw.forEach((line) => {
    if (/^[ \t]/.test(line) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.trim() !== '') {
      lines.push(line);
    }
  });
  return lines;
}

// 解析一行属性：NAME;PARAM=VALUE:content
function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(';');
  const name = parts.shift().toUpperCase();
  const params = {};
  parts.forEach((p) => {
    const eq = p.indexOf('=');
    if (eq > 0) {
      params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    }
  });
  return { name, params, value };
}

// 解析所有 VEVENT
function parseEvents(text) {
  const lines = unfoldLines(text);
  const events = [];
  let cur = null;
  lines.forEach((line) => {
    const prop = parseLine(line);
    if (!prop) return;
    if (prop.name === 'BEGIN' && prop.value.trim().toUpperCase() === 'VEVENT') {
      cur = {};
      return;
    }
    if (prop.name === 'END' && prop.value.trim().toUpperCase() === 'VEVENT') {
      if (cur) events.push(cur);
      cur = null;
      return;
    }
    if (cur) cur[prop.name] = prop;
  });
  return events;
}

// 解析时间值 -> { date:'YYYY-MM-DD', time:'HH:mm:ss'|'', allDay }
// 支持 YYYYMMDD / YYYYMMDDTHHMMSS / 末尾 Z（UTC 转本地）；TZID 参数按浮动本地处理
function parseTime(prop) {
  const v = String((prop && prop.value) || '').trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = m[1] + '-' + m[2] + '-' + m[3];
  if (!m[4]) return { date: date, time: '', allDay: true };
  let hh = Number(m[4]);
  let mm = Number(m[5] || 0);
  let ss = Number(m[6] || 0);
  if (m[7]) {
    const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm, ss));
    return {
      date: dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()),
      time: pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':' + pad(dt.getSeconds()),
      allDay: false,
    };
  }
  return {
    date: date,
    time: pad(hh) + ':' + pad(mm) + ':' + pad(ss),
    allDay: false,
  };
}

// 从描述文本里还原属性行（如「时长：30，项目：跑步」）
function parseFieldLine(line, out) {
  String(line || '')
    .split(/[；;]/)
    .forEach((seg) => {
      const idx = seg.indexOf('：');
      if (idx > 0) {
        const key = seg.slice(0, idx).trim();
        const value = seg.slice(idx + 1).trim();
        if (key && key.length <= 20 && value) out.push({ key: key, value: value });
      }
    });
}

// 解析 DESCRIPTION：还原内容、自定义属性、标签名
function parseDescription(raw, isOwn) {
  const text = unescapeICS(raw || '');
  const result = { content: '', customFields: [], tagNames: [] };
  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    // 本应用导出的多行格式：内容 / 属性段 / 标签段
    result.content = lines[0];
    lines.slice(1).forEach((ln) => {
      if (ln.indexOf('标签：') === 0) {
        result.tagNames = ln
          .slice(3)
          .split(/[\/、,，]/)
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        parseFieldLine(ln, result.customFields);
      }
    });
    return result;
  }

  // 通用/旧格式：整段当内容，末尾「标签：」单独提取
  let body = text;
  const tagMatch = body.match(/(?:^|[；;])\s*标签：([^\n；;]+)$/);
  if (tagMatch) {
    result.tagNames = tagMatch[1]
      .split(/[\/、,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    body = body.slice(0, tagMatch.index);
  }
  result.content = body;
  // 仅对本应用导出的旧格式还原属性，避免误读普通日历文本里的冒号
  if (isOwn) parseFieldLine(body, result.customFields);
  return result;
}

// 内部去重键
function recordKey(rec) {
  return rec.date + '|' + (rec.time || '') + '|' + rec.title;
}

// 一个 VEVENT -> 一条记录（返回 null 表示无效事件）
function eventToRecord(ev, ctx) {
  const start = parseTime(ev.DTSTART);
  if (!start) return null;

  const uid = unescapeICS(ev.UID ? ev.UID.value : '');
  const isOwn = uid.indexOf(OWN_UID_SUFFIX) === uid.length - OWN_UID_SUFFIX.length;
  const legacyId = isOwn ? uid.slice(0, -OWN_UID_SUFFIX.length) : '';

  const summary = (unescapeICS(ev.SUMMARY ? ev.SUMMARY.value : '') || '').trim() || '生活记录';
  const desc = parseDescription(ev.DESCRIPTION ? ev.DESCRIPTION.value : '', isOwn);

  // 打卡项：标题包含打卡项名称即匹配，或读取本应用导出的类型标记
  const matched = ctx.checkins.find((c) => c.name && summary.indexOf(c.name) !== -1);
  const typeAttr = ev['X-LIFELOGGER-TYPE'] ? String(ev['X-LIFELOGGER-TYPE'].value).trim() : '';
  const isCheckin = typeAttr === 'checkin' || !!matched;

  // 本应用导出的扩展属性：精确还原标签与自定义属性，避免重复打标签
  let tagNames = desc.tagNames;
  let customFields = desc.customFields;
  if (isOwn) {
    try {
      const tagProp = ev['X-LIFELOGGER-TAGS'];
      if (tagProp) {
        tagNames = JSON.parse(decodeURIComponent(tagProp.value)) || [];
      }
      const fieldProp = ev['X-LIFELOGGER-FIELDS'];
      if (fieldProp) {
        const parsed = JSON.parse(decodeURIComponent(fieldProp.value));
        if (Array.isArray(parsed)) {
          customFields = parsed;
          // 内容里去掉导出时附加的属性文本，避免重复
          const fieldText = service.fieldsToText(parsed).join('，');
          if (fieldText) {
            desc.content = desc.content
              .split('；' + fieldText)
              .join('')
              .replace(fieldText + '；', '');
          }
        }
      }
    } catch (e) {
      // 扩展属性解析失败时回退到 DESCRIPTION 解析结果
      tagNames = desc.tagNames;
    }
  }

  // 标签：先按名称还原；非本应用导出的再做关键词自动识别（去重合并）
  const tagByName = {};
  ctx.tags.forEach((t) => {
    tagByName[t.name] = t._id;
  });
  const tagIds = [];
  tagNames.forEach((name) => {
    const id = tagByName[name];
    if (id && tagIds.indexOf(id) === -1) tagIds.push(id);
  });
  if (!isOwn) {
    service.autoMatchTagIds(summary + ' ' + desc.content, ctx.tags).forEach((id) => {
      if (tagIds.indexOf(id) === -1) tagIds.push(id);
    });
  }
  // 打卡且有时长（DTEND - DTSTART）时补一条「时长」属性
  if (isCheckin && ev.DTEND && !start.allDay) {
    const end = parseTime(ev.DTEND);
    if (end && !end.allDay) {
      const s = new Date(start.date.replace(/-/g, '/') + ' ' + start.time);
      const e = new Date(end.date.replace(/-/g, '/') + ' ' + end.time);
      const minutes = Math.round((e.getTime() - s.getTime()) / 60000);
      const hasDuration = customFields.some((f) => f.key.indexOf('时长') >= 0);
      if (minutes > 0 && minutes < 1440 && !hasDuration) {
        customFields.push({ key: '时长', value: String(minutes) });
      }
    }
  }

  const rec = {
    date: start.date,
    time: start.time,
    type: isCheckin ? 'checkin' : 'note',
    title: summary,
    content: desc.content,
    checkinItemId: matched ? matched._id : '',
    customFields: customFields,
    tagIds: tagIds,
    source: 'ics',
    sourceUid: uid,
  };
  rec._key = recordKey(rec);
  rec._legacyId = legacyId;
  return rec;
}

// 预览解析结果（不写库）：返回 { total, records, skipped, truncated }
async function prepare(text) {
  const events = parseEvents(text);
  if (!events.length) {
    return { total: 0, records: [], skipped: 0, truncated: false, error: '未找到可导入的日程事件（VEVENT）' };
  }

  const [existing, tags, checkins] = await Promise.all([
    store.list(C.EVENTS),
    store.list(C.TAGS),
    store.list(C.CHECKINS),
  ]);
  const ctx = { tags: tags, checkins: checkins };
  const existingIds = {};
  const existingKeys = {};
  existing.forEach((e) => {
    existingIds[e._id] = true;
    existingKeys[recordKey(e)] = true;
  });

  const records = [];
  const seen = {};
  let skipped = 0;
  events.forEach((ev) => {
    const rec = eventToRecord(ev, ctx);
    if (!rec) {
      skipped++;
      return;
    }
    // 本应用导出的记录：已存在同一条则不重复导入
    if (rec._legacyId && existingIds[rec._legacyId]) {
      skipped++;
      return;
    }
    if (existingKeys[rec._key] || seen[rec._key]) {
      skipped++;
      return;
    }
    seen[rec._key] = true;
    records.push(rec);
  });

  const truncated = records.length > MAX_IMPORT;
  return {
    total: events.length,
    records: truncated ? records.slice(0, MAX_IMPORT) : records,
    skipped: skipped + (truncated ? records.length - MAX_IMPORT : 0),
    truncated: truncated,
  };
}

// 写入已预览的记录，返回实际导入条数
async function commit(prepared) {
  const records = (prepared && prepared.records) || [];
  if (!records.length) return 0;
  const docs = records.map((r) => {
    const d = Object.assign({}, r);
    delete d._key;
    delete d._legacyId;
    return d;
  });
  await store.insertMany(C.EVENTS, docs);
  return docs.length;
}

// 一步完成：解析 + 写入
async function importText(text) {
  const prepared = await prepare(text);
  if (prepared.error) return { total: 0, imported: 0, skipped: 0, error: prepared.error };
  const imported = await commit(prepared);
  return {
    total: prepared.total,
    imported: imported,
    skipped: prepared.skipped,
    truncated: prepared.truncated,
  };
}

module.exports = {
  parseEvents,
  parseTime,
  parseDescription,
  prepare,
  commit,
  importText,
};
