/**
 * 微信聊天界面渲染引擎
 * 支持：文字、图片、语音、转账、红包、时间戳、系统消息
 * 支持：多手机型号、长图模式
 */

const DEVICES = {
  'iphone-14pro': { name: 'iPhone 14 Pro', width: 393, height: 852, cls: 'device-iphone-14pro', statusBar: 54 },
  'iphone-15': { name: 'iPhone 15', width: 393, height: 852, cls: 'device-iphone-15', statusBar: 54 },
  'iphone-se': { name: 'iPhone SE', width: 375, height: 667, cls: 'device-iphone-se', statusBar: 20 },
  'huawei-mate60': { name: '华为 Mate 60 Pro', width: 393, height: 852, cls: 'device-huawei-mate60', statusBar: 50 },
  'huawei-p60': { name: '华为 P60', width: 390, height: 844, cls: 'device-huawei-p60', statusBar: 50 },
  'honor-magic6': { name: '荣耀 Magic6 Pro', width: 393, height: 852, cls: 'device-honor-magic6', statusBar: 50 },
  'honor-90': { name: '荣耀 90', width: 388, height: 840, cls: 'device-honor-90', statusBar: 50 },
  'xiaomi-14pro': { name: '小米 14 Pro', width: 402, height: 874, cls: 'device-xiaomi-14pro', statusBar: 50 },
  'xiaomi-k70': { name: 'Redmi K70', width: 393, height: 852, cls: 'device-xiaomi-k70', statusBar: 50 },
  'oppo-findx7': { name: 'OPPO Find X7', width: 393, height: 868, cls: 'device-oppo-findx7', statusBar: 50 },
  'vivo-x100': { name: 'vivo X100', width: 393, height: 873, cls: 'device-vivo-x100', statusBar: 50 }
};

const DEFAULT_CONFIG = {
  device: 'iphone-14pro',
  statusBarTime: '9:12',
  opponent: { name: '李主任', avatar: 'avatars/real/male_01_mid_business.png' },
  me: { name: '我', avatar: 'avatars/scenery/scene_01_mountain.png' },
  messages: []
};

/**
 * 渲染完整手机界面
 */
function renderPhone(config, container) {
  const cfg = Object.assign({}, DEFAULT_CONFIG, config);
  const device = DEVICES[cfg.device] || DEVICES['iphone-14pro'];

  container.innerHTML = '';
  container.className = 'phone-frame ' + device.cls + (cfg.longMode ? ' long-screenshot' : '');
  container.style.width = device.width + 'px';
  if (!cfg.longMode) container.style.height = device.height + 'px';

  // 状态栏
  const statusBar = document.createElement('div');
  statusBar.className = 'status-bar';
  statusBar.innerHTML = `
    <div class="time">${cfg.statusBarTime || '9:12'}</div>
    <div class="status-icons">
      <div class="signal-icon"><span></span><span></span><span></span><span></span></div>
      <div class="wifi-icon">📶</div>
      <div class="battery-icon">🔋</div>
    </div>
  `;
  container.appendChild(statusBar);

  // 导航栏
  const navBar = document.createElement('div');
  navBar.className = 'nav-bar';
  navBar.innerHTML = `
    <div class="nav-back">‹</div>
    <div class="nav-title">${escapeHtml(cfg.opponent.name)}</div>
    <div class="nav-more">···</div>
  `;
  container.appendChild(navBar);

  // 聊天区
  const chatArea = document.createElement('div');
  chatArea.className = 'chat-area';
  chatArea.id = 'chatArea';

  cfg.messages.forEach(msg => {
    const el = renderMessage(msg, cfg);
    if (el) chatArea.appendChild(el);
  });

  container.appendChild(chatArea);

  // 底部输入栏
  const inputBar = document.createElement('div');
  inputBar.className = 'input-bar';
  inputBar.innerHTML = `
    <div class="voice-btn">🎤</div>
    <div class="input-field">输入消息</div>
    <div class="emoji-btn">😊</div>
    <div class="plus-btn">＋</div>
  `;
  container.appendChild(inputBar);

  // 滚动到底部（截图时由外部控制）
  if (!cfg.longMode && !cfg.noScroll) {
    requestAnimationFrame(() => {
      chatArea.scrollTop = chatArea.scrollHeight;
    });
  }

  return container;
}

/**
 * 渲染单条消息
 */
function renderMessage(msg, cfg) {
  if (msg.type === 'time') {
    const el = document.createElement('div');
    el.className = 'time-stamp';
    el.textContent = msg.text;
    return el;
  }

  if (msg.type === 'system') {
    const el = document.createElement('div');
    el.className = 'time-stamp';
    el.textContent = msg.text;
    return el;
  }

  const isMine = msg.from === 'me';
  const row = document.createElement('div');
  row.className = 'msg-row ' + (isMine ? 'mine' : 'other');

  // 头像
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  const avatarSrc = isMine ? cfg.me.avatar : cfg.opponent.avatar;
  avatar.innerHTML = `<img src="${avatarSrc}" alt="">`;
  row.appendChild(avatar);

  // 内容
  let content;
  switch (msg.type) {
    case 'image':
      content = document.createElement('div');
      content.className = 'msg-image';
      content.innerHTML = `<img src="${msg.image}" alt="">`;
      break;

    case 'voice':
      content = document.createElement('div');
      content.className = 'msg-bubble msg-voice';
      content.innerHTML = `<span>🔊</span><span class="voice-duration">${msg.duration || 3}″</span>`;
      break;

    case 'transfer':
      content = document.createElement('div');
      content.className = 'msg-transfer';
      content.innerHTML = `
        <div class="transfer-header">
          <div class="transfer-icon">¥</div>
          <div>转账</div>
        </div>
        <div class="transfer-body">¥${msg.amount}</div>
        <div class="transfer-note">${msg.note || '转账'}</div>
      `;
      break;

    case 'redpacket':
      content = document.createElement('div');
      content.className = 'msg-redpacket';
      content.innerHTML = `
        <div class="rp-title">🧧 ${msg.title || '恭喜发财，大吉大利'}</div>
        <div class="rp-subtitle">${msg.note || '微信红包'}</div>
      `;
      break;

    default: // text
      content = document.createElement('div');
      content.className = 'msg-bubble';
      content.textContent = msg.text || '';
  }

  row.appendChild(content);
  return row;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/**
 * 获取所有可用头像列表
 */
function getAvatarList() {
  return [
    // 真人
    { path: 'avatars/real/male_01_mid_business.png', label: '男-商务' },
    { path: 'avatars/real/male_02_young_officer.png', label: '男-干部' },
    { path: 'avatars/real/male_03_worker.png', label: '男-工人' },
    { path: 'avatars/real/female_01_admin.png', label: '女-行政' },
    { path: 'avatars/real/female_02_young.png', label: '女-年轻' },
    // 风景
    { path: 'avatars/scenery/scene_01_mountain.png', label: '山景' },
    { path: 'avatars/scenery/scene_02_city.png', label: '城市' },
    { path: 'avatars/scenery/scene_03_lake.png', label: '湖泊' },
    { path: 'avatars/scenery/scene_04_forest.png', label: '森林' },
    { path: 'avatars/scenery/scene_05_snow.png', label: '雪景' },
    { path: 'avatars/scenery/scene_06_sea.png', label: '海景' },
    { path: 'avatars/scenery/scene_07_grass.png', label: '草原' },
    { path: 'avatars/scenery/scene_08_desert.png', label: '沙漠' },
    { path: 'avatars/scenery/scene_09_town.png', label: '古镇' },
    // 卡通
    { path: 'avatars/cartoon/cartoon_01_cat.png', label: '猫' },
    { path: 'avatars/cartoon/cartoon_02_dog.png', label: '狗' },
    { path: 'avatars/cartoon/cartoon_03_fox.png', label: '狐狸' },
    { path: 'avatars/cartoon/cartoon_04_panda.png', label: '熊猫' },
    { path: 'avatars/cartoon/cartoon_05_penguin.png', label: '企鹅' },
    { path: 'avatars/cartoon/cartoon_06_duck.png', label: '小鸭' },
    // 抽象
    { path: 'avatars/abstract/abstract_01_geo.png', label: '几何' },
    { path: 'avatars/abstract/abstract_02_letter.png', label: '字母' }
  ];
}

window.WXRenderer = { renderPhone, DEVICES, DEFAULT_CONFIG, getAvatarList };
