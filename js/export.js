/**
 * 导出模块 - 浏览器端预览与下载
 * 实际截图由 Playwright 完成（export_screenshot.py）
 */

function downloadPNG(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename || 'wechat_chat.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function exportAsJSON(config) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = (config.title || 'chat_config') + '.json';
  link.href = URL.createObjectURL(blob);
  link.click();
}

function loadJSONFile(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        callback(JSON.parse(ev.target.result));
      } catch (err) {
        alert('JSON解析失败: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

window.WXExport = { downloadPNG, exportAsJSON, loadJSONFile };
