// ICS 文件写入与分享（小程序端）
const dateUtil = require('./date');

// 生成临时文件路径并写入 ICS 内容
function writeICSFile(content) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    const fileName = 'life-logger-' + Date.now() + '.ics';
    const filePath = wx.env.USER_DATA_PATH + '/' + fileName;
    fs.writeFile({
      filePath: filePath,
      data: content,
      encoding: 'utf8',
      success: () => resolve(filePath),
      fail: (err) => reject(err),
    });
  });
}

// 用系统分享能力把 ics 文件转发出去（可保存到手机/发给自己/其它 App）
function shareFile(filePath) {
  return new Promise((resolve) => {
    if (wx.shareFileMessage) {
      wx.shareFileMessage({
        filePath: filePath,
        fileName: '生活手记.ics',
        success: () => resolve(true),
        fail: () => resolve(false),
      });
    } else {
      resolve(false);
    }
  });
}

// 复制 ICS 文本到剪贴板（兜底方案）
function copyText(content) {
  return new Promise((resolve) => {
    wx.setClipboardData({
      data: content,
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
}

module.exports = { writeICSFile, shareFile, copyText };
