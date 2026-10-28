/**
 * 微信聊天截图 - Canvas 渲染器 v2
 * 特性：
 *  - 单聊 / 群聊（群成员各自头像、昵称显示在气泡上方）
 *  - 微信真实时间戳规则（今天只显示时间、昨天、星期X、X月X日、X年X月X日）
 *  - 每 5 分钟自动插入时间戳（与真实微信一致）
 *  - 支持按消息索引滚动截取（一张截图可横跨两天）
 *  - 纯浏览器端，无外部依赖
 */
(function () {
  'use strict';

  /**
   * 字体栈（按机型切换）
   * 真机字体：iPhone=苹方(PingFang SC) / 华为荣耀=HarmonyOS Sans / 小米=MiSans
   * 由于商用字体无法分发，本项目用 Noto Sans SC 三档字重近似：
   *   - 苹方：字重偏细 (300)，字形略窄
   *   - 鸿蒙：字重中等 (500)，字形方正
   *   - MiSans：字重中等偏粗 (500)，字形略宽
   */
  let FONT = '"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';
  const FONT_STACKS = {
    pingfang: '"PFX-PingFang","Noto SC Bold","Microsoft YaHei",sans-serif',
    harmony: '"PFX-Harmony","Noto SC Medium","Microsoft YaHei",sans-serif',
    misans: '"PFX-MiSans","Noto SC Medium","Microsoft YaHei",sans-serif',
    system: '"Noto SC Medium","Microsoft YaHei",sans-serif'
  };

  async function ensureFonts() {
    if (window.__fontsReady) return;
    const defs = [
      { family: 'PFX-PingFang', url: 'fonts/NotoSC-300.ttf', weight: '100 900' },
      { family: 'PFX-Harmony', url: 'fonts/NotoSC-500.ttf', weight: '100 900' },
      { family: 'PFX-MiSans', url: 'fonts/NotoSC-500.ttf', weight: '100 900' },
      { family: 'Noto SC Bold', url: 'fonts/NotoSC-700.ttf', weight: '100 900' },
      { family: 'Noto SC Medium', url: 'fonts/NotoSC-500.ttf', weight: '100 900' }
    ];
    await Promise.all(defs.map(async d => {
      try {
        const face = new FontFace(d.family, 'url("' + d.url + '")', { weight: d.weight });
        await face.load();
        document.fonts.add(face);
      } catch (e) {
        console.warn('font load failed:', d.url, e.message);
      }
    }));
    window.__fontsReady = true;
  }

  function applyDeviceFont(device) {
    const key = device && device.font ? device.font : 'system';
    if (key === 'PingFang') FONT = FONT_STACKS.pingfang;
    else if (key === 'HarmonyOS') FONT = FONT_STACKS.harmony;
    else if (key === 'MiSans') FONT = FONT_STACKS.misans;
    else FONT = FONT_STACKS.system;
    L.fontFamily = FONT;
  }

  const L = {
    padX: 10,
    avatar: 40,
    avatarR: 4,
    gapAvatar: 10,
    bubblePadX: 14,
    bubblePadY: 10,
    bubbleR: 8,
    maxBubbleRatio: 0.65,
    rowGap: 16,
    contentPadTop: 15,
    contentPadBottom: 15,
    fontSize: 17,
    lineHeight: 17 * 1.4,
    timeSize: 12,
    timeMarginY: 10,
    nickSize: 12,
    nickH: 19,
    navH: 44,
    inputH: 56
  };

  /**
   * 设备规格
   * w/h       = CSS 逻辑尺寸（微信 UI 按此排版）
   * pxW/pxH   = 真机物理像素（导出时按此对齐）
   * status    = 状态栏高度/顶部内边距
   * cutout    = 屏幕开孔类型: island(灵动岛) / punch(挖孔) / notch(刘海) / none
   * cutoutW/H = 开孔尺寸
   * homeBar   = 底部横条高度（0=无）
   */
  const DEVICES = {
    'iphone-14pro': {
      name: 'iPhone 14 Pro', w: 393, h: 852, pxW: 1179, pxH: 2556,
      status: { h: 54, pad: 18 }, cutout: 'island', cutoutW: 110, cutoutH: 33,
      homeBar: 34, radius: 55, font: 'PingFang'
    },
    'iphone-15': {
      name: 'iPhone 15', w: 393, h: 852, pxW: 1179, pxH: 2556,
      status: { h: 54, pad: 18 }, cutout: 'island', cutoutW: 110, cutoutH: 33,
      homeBar: 34, radius: 55, font: 'PingFang'
    },
    'iphone-se': {
      name: 'iPhone SE', w: 375, h: 667, pxW: 750, pxH: 1334,
      status: { h: 20, pad: 0 }, cutout: 'none', cutoutW: 0, cutoutH: 0,
      homeBar: 0, radius: 0, font: 'PingFang'
    },
    'huawei-mate60': {
      name: '华为 Mate 60 Pro', w: 420, h: 907, pxW: 1260, pxH: 2720,
      status: { h: 48, pad: 12 }, cutout: 'punch', cutoutW: 10, cutoutH: 10,
      homeBar: 0, radius: 60, font: 'HarmonyOS'
    },
    'huawei-p60': {
      name: '华为 P60', w: 407, h: 900, pxW: 1220, pxH: 2700,
      status: { h: 48, pad: 12 }, cutout: 'punch', cutoutW: 10, cutoutH: 10,
      homeBar: 0, radius: 58, font: 'HarmonyOS'
    },
    'honor-magic6': {
      name: '荣耀 Magic6 Pro', w: 427, h: 924, pxW: 1280, pxH: 2772,
      status: { h: 48, pad: 12 }, cutout: 'punch', cutoutW: 18, cutoutH: 18,
      homeBar: 0, radius: 60, font: 'HarmonyOS'
    },
    'honor-90': {
      name: '荣耀 90', w: 400, h: 888, pxW: 1200, pxH: 2664,
      status: { h: 46, pad: 11 }, cutout: 'punch', cutoutW: 18, cutoutH: 18,
      homeBar: 0, radius: 56, font: 'HarmonyOS'
    },
    'xiaomi-14pro': {
      name: '小米 14 Pro', w: 480, h: 1067, pxW: 1440, pxH: 3200,
      status: { h: 44, pad: 10 }, cutout: 'punch-center', cutoutW: 10, cutoutH: 10,
      homeBar: 0, radius: 60, font: 'MiSans'
    },
    'xiaomi-k70': {
      name: 'Redmi K70', w: 480, h: 1067, pxW: 1440, pxH: 3200,
      status: { h: 44, pad: 10 }, cutout: 'punch-center', cutoutW: 10, cutoutH: 10,
      homeBar: 0, radius: 58, font: 'MiSans'
    },
    'oppo-findx7': {
      name: 'OPPO Find X7', w: 421, h: 928, pxW: 1264, pxH: 2784,
      status: { h: 46, pad: 11 }, cutout: 'punch-center', cutoutW: 10, cutoutH: 10,
      homeBar: 0, radius: 58, font: 'HarmonyOS'
    },
    'vivo-x100': {
      name: 'vivo X100', w: 420, h: 933, pxW: 1260, pxH: 2800,
      status: { h: 46, pad: 11 }, cutout: 'punch-center', cutoutW: 10, cutoutH: 10,
      homeBar: 0, radius: 58, font: 'HarmonyOS'
    }
  };

  const STATUS = {};
  const SIZES = {};
  Object.keys(DEVICES).forEach(k => {
    STATUS[k] = DEVICES[k].status;
    SIZES[k] = [DEVICES[k].w, DEVICES[k].h];
  });

  // ---------- 工具 ----------
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loadImage(src) {
    return new Promise(resolve => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function tokenize(text) {
    const tokens = [];
    let buf = '';
    for (const ch of text) {
      if (/[A-Za-z0-9\-._\/:%+#@]/.test(ch)) {
        buf += ch;
      } else {
        if (buf) { tokens.push(buf); buf = ''; }
        tokens.push(ch);
      }
    }
    if (buf) tokens.push(buf);
    return tokens;
  }

  function wrapText(ctx, text, maxW) {
    const NO_START = '，。、；：？！）》」』】,.;:?!)]}%';
    const NO_END = '（《「『【([{';
    const lines = [];

    String(text || '').split('\n').forEach(para => {
      if (para === '') { lines.push(''); return; }
      const tokens = tokenize(para);
      let line = '';
      for (const tk of tokens) {
        const test = line + tk;
        if (ctx.measureText(test).width > maxW && line !== '') {
          if (NO_START.indexOf(tk) >= 0) {
            const chars = Array.from(line);
            const last = chars.pop();
            lines.push(chars.join(''));
            line = last + tk;
          } else {
            lines.push(line);
            line = tk;
          }
        } else {
          line = test;
        }
      }
      while (line && NO_END.indexOf(line[line.length - 1]) >= 0) {
        const ch = line[line.length - 1];
        line = line.slice(0, -1);
        lines.push(line);
        line = ch;
      }
      lines.push(line);
    });
    return lines.length ? lines : [''];
  }

  // ---------- 微信时间格式 ----------
  const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  function periodOf(h) {
    if (h < 6) return '凌晨';
    if (h < 12) return '上午';
    if (h < 13) return '中午';
    if (h < 18) return '下午';
    return '晚上';
  }

  function clockText(d) {
    let hh = d.getHours() % 12;
    if (hh === 0) hh = 12;
    return periodOf(d.getHours()) + ' ' + hh + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /**
   * 与真实微信一致的时间戳显示：
   * 当天 → “上午 9:12”
   * 昨天 → “昨天 上午 9:12”
   * 一周内 → “星期三 上午 9:12”
   * 今年内 → “8月14日 上午 9:12”
   * 往年 → “2024年8月14日 上午 9:12”
   */
  function wechatTime(iso, captureDate) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    const cap = captureDate ? new Date(captureDate) : new Date();
    if (isNaN(cap.getTime())) return String(iso || '');

    const t = clockText(d);
    const dayOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((dayOf(cap) - dayOf(d)) / 86400000);

    if (diff === 0) return t;
    if (diff === 1) return '昨天 ' + t;
    if (diff > 1 && diff < 7) return WEEK[d.getDay()] + ' ' + t;
    if (d.getFullYear() === cap.getFullYear()) {
      return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + t;
    }
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + t;
  }

  // ---------- 参与者 ----------
  function normalizeParticipants(config) {
    const map = {};
    const list = [];

    if (config.group && config.group.enabled && Array.isArray(config.group.members)) {
      config.group.members.forEach(m => {
        const id = m.id || m.name;
        map[id] = { id: id, name: m.name || '', avatar: m.avatar || '', isMe: !!m.isMe };
        list.push(map[id]);
      });
    }

    if (!list.length) {
      const opp = config.opponent || {};
      const me = config.me || {};
      map['other'] = { id: 'other', name: opp.name || '对方', avatar: opp.avatar || '', isMe: false };
      map['me'] = { id: 'me', name: me.name || '我', avatar: me.avatar || '', isMe: true };
      list.push(map['other'], map['me']);
    }

    // 确保有"我"
    let meId = null;
    list.forEach(p => { if (p.isMe) meId = p.id; });
    if (!meId) {
      if (map['me']) meId = 'me';
      else if (list.length) { list[list.length - 1].isMe = true; meId = list[list.length - 1].id; }
    }

    return { map: map, list: list, meId: meId || 'me' };
  }

  function resolveSender(msg, parts) {
    let id = msg.from;
    if (msg.fromId) id = msg.fromId;
    if (id === 'me') id = parts.meId;
    if (id === 'other') {
      const first = parts.list.find(p => !p.isMe);
      return first || { id: 'other', name: '对方', avatar: '', isMe: false };
    }
    return parts.map[id] || { id: id, name: '', avatar: '', isMe: false };
  }

  // ---------- 布局 ----------
  async function buildLayout(config) {
    const deviceKey = config.device || 'iphone-14pro';
    const deviceDef = DEVICES[deviceKey] || DEVICES['iphone-14pro'];
    applyDeviceFont(deviceDef);
    const [W, H] = SIZES[deviceKey] || SIZES['iphone-14pro'];
    const sb = STATUS[deviceKey] || { h: 44, pad: 8 };

    const chatW = W - L.padX * 2;
    const maxBubbleW = chatW * L.maxBubbleRatio;
    const maxTextW = maxBubbleW - L.bubblePadX * 2 - 2;

    const parts = normalizeParticipants(config);
    const isGroup = !!(config.group && config.group.enabled);

    // 预载头像
    const avatarMap = {};
    for (const p of parts.list) {
      avatarMap[p.id] = await loadImage(p.avatar);
    }

    const mctx = document.createElement('canvas').getContext('2d');
    mctx.font = L.fontSize + 'px ' + FONT;

    const msgs = config.messages || [];
    const threshold = (config.timeThresholdMin == null ? 5 : config.timeThresholdMin) * 60000;
    const capture = config.captureDate;

    const blocks = [];
    let y = L.contentPadTop;
    let lastTime = null;

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];

      // 显式时间块（兼容旧配置）
      if (msg.type === 'time' || msg.type === 'system') {
        const text = msg.text || (msg.time ? wechatTime(msg.time, capture) : '');
        const h = L.timeSize * 1.2 + L.timeMarginY * 2;
        blocks.push({ kind: 'time', text: text, y: y, h: h, mi: i });
        y += h;
        continue;
      }

      // 自动插入时间戳（间隔 > 阈值 或首条）
      if (msg.time) {
        const t = new Date(msg.time).getTime();
        if (!isNaN(t)) {
          if (lastTime === null || t - lastTime > threshold) {
            const h = L.timeSize * 1.2 + L.timeMarginY * 2;
            blocks.push({
              kind: 'time', text: wechatTime(msg.time, capture),
              y: y, h: h, mi: i
            });
            y += h;
          }
          lastTime = t;
        }
      }

      const sender = resolveSender(msg, parts);
      const isMine = sender.isMe;
      const avatarImg = avatarMap[sender.id] || null;

      // 群聊中对方显示昵称
      const showNick = isGroup && !isMine && !!sender.name;
      const nickOffset = showNick ? L.nickH : 0;

      let lines = [], bubbleW = 0, bubbleH = 0, imgEl = null;

      if (msg.type === 'image') {
        imgEl = await loadImage(msg.image);
        let iw = 200, ih = 150;
        if (imgEl && imgEl.naturalWidth) {
          const s = Math.min(200 / imgEl.naturalWidth, 260 / imgEl.naturalHeight, 1);
          iw = Math.max(80, imgEl.naturalWidth * s);
          ih = Math.max(60, imgEl.naturalHeight * s);
        }
        bubbleW = iw;
        bubbleH = ih;
      } else if (msg.type === 'voice') {
        bubbleW = 96 + Math.min((msg.duration || 3) * 4, 64);
        bubbleH = L.lineHeight + L.bubblePadY * 2;
      } else if (msg.type === 'transfer') {
        bubbleW = 230;
        bubbleH = 130;
      } else if (msg.type === 'redpacket') {
        bubbleW = 208;
        bubbleH = 74;
      } else if (msg.type === 'file') {
        bubbleW = 210;
        bubbleH = 82;
      } else if (msg.type === 'link') {
        bubbleW = 220;
        bubbleH = 76;
      } else {
        lines = wrapText(mctx, msg.text, maxTextW);
        let textW = 0;
        lines.forEach(l => { textW = Math.max(textW, mctx.measureText(l).width); });
        bubbleW = Math.min(maxBubbleW, Math.ceil(textW) + L.bubblePadX * 2);
        bubbleH = lines.length * L.lineHeight + L.bubblePadY * 2;
      }

      const rowH = Math.max(L.avatar, nickOffset + bubbleH);
      blocks.push({
        kind: 'row', msg: msg, mi: i, sender: sender, isMine: isMine,
        avatarImg: avatarImg, showNick: showNick, nickOffset: nickOffset,
        lines: lines, bubbleW: bubbleW, bubbleH: bubbleH,
        imgEl: imgEl, y: y, h: rowH
      });
      y += rowH + L.rowGap;
    }

    const contentH = y + L.contentPadBottom;
    const longMode = !!config.longMode;
    const totalH = longMode ? (sb.h + L.navH + contentH + L.inputH) : H;
    const availH = totalH - sb.h - L.navH - L.inputH;

    // 计算滚动偏移
    let offset;
    if (longMode) {
      offset = 0;
    } else if (config.scrollToMsg != null) {
      // 把指定消息（含其上方时间戳）对齐到可视区顶部
      const idx = Number(config.scrollToMsg);
      let anchor = null;
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        if (b.mi === idx && (b.kind === 'time' || b.kind === 'row')) anchor = b;
      }
      // 若该消息上方紧邻时间块，优先以时间块为锚点
      if (anchor && anchor.kind === 'row') {
        const pos = blocks.indexOf(anchor);
        const prev = blocks[pos - 1];
        if (prev && prev.kind === 'time' && prev.mi === idx) anchor = prev;
      }
      const raw = anchor ? anchor.y - 8 : contentH - availH;
      offset = Math.max(0, Math.min(raw, Math.max(0, contentH - availH)));
    } else {
      offset = Math.max(0, contentH - availH);
    }

    // 状态栏时间：未显式指定时，自动取最后一条消息时间（避免"时间倒流"破绽）
    let statusTime = config.statusBarTime;
    if (!statusTime || statusTime === 'auto') {
      let lastTs = null;
      for (const m of msgs) {
        if (m.time) {
          const t = new Date(m.time).getTime();
          if (!isNaN(t)) lastTs = t;
        }
      }
      if (lastTs) {
        const d = new Date(lastTs);
        let hh = d.getHours();
        const mm = String(d.getMinutes()).padStart(2, '0');
        statusTime = hh + ':' + mm;
      } else {
        statusTime = '9:12';
      }
    }

    return {
      W: W, H: totalH, sb: sb, contentH: contentH,
      offset: offset, longMode: longMode, blocks: blocks,
      parts: parts, isGroup: isGroup, statusTime: statusTime
    };
  }

  // ---------- 绘制：状态栏 ----------
  /**
   * 绘制状态栏
   * 支持差异化：
   *   - 信号格数 signalBars (1-4)
   *   - 网络类型 network: 'wifi' | '5g' | '4g' | 'none'
   *   - 电量 battery (0-100)，自动判断是否充电/低电量变红
   *   - 静音 mute: true 时显示静音图标
   *   - 闹钟 alarm: true 时显示闹钟图标
   *   - 定位 location: true 时显示定位箭头
   */
  function drawStatusBar(ctx, lay, config) {
    const W = lay.W, sb = lay.sb;
    ctx.fillStyle = '#ededed';
    ctx.fillRect(0, 0, W, sb.h);

    const cy = sb.pad + (sb.h - sb.pad) / 2;
    ctx.textBaseline = 'middle';

    const st = config.status || {};
    const signalBars = st.signalBars == null ? 4 : st.signalBars;
    const network = st.network || 'wifi';
    const battery = st.battery == null ? 78 : st.battery;
    const charging = !!st.charging;
    const mute = !!st.mute;
    const alarm = !!st.alarm;
    const location = !!st.location;

    // ── 左侧：时间 ──
    ctx.fillStyle = '#000';
    ctx.font = '600 14px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(lay.statusTime || '9:12', 20, cy + 1);

    // ── 右侧：从右往左排布 ──
    let rx = W - 20;

    // 电池
    const bw = 22, bh = 11;
    const bx = rx - bw;
    const by = cy - bh / 2;
    ctx.strokeStyle = battery <= 20 ? '#e53935' : 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1;
    rr(ctx, bx, by, bw, bh, 3);
    ctx.stroke();
    // 电池正极
    ctx.fillStyle = battery <= 20 ? '#e53935' : 'rgba(0,0,0,0.75)';
    rr(ctx, bx + bw + 0.5, by + 3.5, 1.6, 4, 0.8);
    ctx.fill();
    // 电量填充
    const innerW = bw - 3.2;
    const fillW = Math.max(1.5, innerW * Math.min(100, Math.max(0, battery)) / 100);
    ctx.fillStyle = battery <= 20 ? '#e53935' : (charging ? '#34c759' : '#000');
    rr(ctx, bx + 1.6, by + 1.6, fillW, bh - 3.2, 1.4);
    ctx.fill();
    // 充电闪电
    if (charging) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(bx + 9, by + 2.2);
      ctx.lineTo(bx + 6.6, by + 5.6);
      ctx.lineTo(bx + 8.4, by + 5.6);
      ctx.lineTo(bx + 7.2, by + 8.6);
      ctx.lineTo(bx + 11, by + 4.6);
      ctx.lineTo(bx + 9.2, by + 4.6);
      ctx.closePath();
      ctx.fill();
    }
    rx = bx - 6;

    // 网络：WiFi 或 5G/4G
    if (network === 'wifi') {
      const wx = rx - 15, wy = cy + 5;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'round';
      [8.5, 5.5, 2.8].forEach(r => {
        ctx.beginPath();
        ctx.arc(wx, wy, r, Math.PI * 1.22, Math.PI * 1.78);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.arc(wx, wy, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      rx = wx - 10;
    } else if (network === '5g' || network === '4g') {
      ctx.fillStyle = '#000';
      ctx.font = '600 12px ' + FONT;
      ctx.textAlign = 'right';
      const label = network === '5g' ? '5G' : '4G';
      ctx.fillText(label, rx, cy + 1);
      rx = rx - ctx.measureText(label).width - 6;
    }

    // 信号格
    if (signalBars > 0) {
      const barW = 3, gap = 1.6, maxH = 13;
      const totalW = 4 * barW + 3 * gap;
      const sx = rx - totalW;
      for (let i = 0; i < 4; i++) {
        const h = (maxH / 4) * (i + 1) + 1.5;
        const x = sx + i * (barW + gap);
        const y = cy + maxH / 2 - h;
        const active = i < signalBars;
        ctx.fillStyle = active ? '#000' : 'rgba(0,0,0,0.22)';
        rr(ctx, x, y, barW, h, 1);
        ctx.fill();
      }
      rx = sx - 8;
    }

    // 静音 / 闹钟 / 定位（在信号左侧）
    for (const kind of ['location', 'alarm', 'mute']) {
      const on = (kind === 'location' && location) ||
                 (kind === 'alarm' && alarm) ||
                 (kind === 'mute' && mute);
      if (!on) continue;
      const ix = rx - 8;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      if (kind === 'mute') {
        // 小铃铛 + 斜杠
        ctx.beginPath();
        ctx.moveTo(ix - 3.5, cy - 2.5);
        ctx.quadraticCurveTo(ix - 3.5, cy - 8, ix, cy - 8);
        ctx.quadraticCurveTo(ix + 3.5, cy - 8, ix + 3.5, cy - 2.5);
        ctx.lineTo(ix + 4.5, cy + 1);
        ctx.lineTo(ix - 4.5, cy + 1);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ix, cy + 3, 1.4, 0, Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(ix - 6, cy + 5);
        ctx.lineTo(ix + 6, cy - 7);
        ctx.stroke();
      } else if (kind === 'alarm') {
        // 时钟
        ctx.beginPath();
        ctx.arc(ix, cy, 5.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ix, cy - 2.6);
        ctx.lineTo(ix, cy + 0.6);
        ctx.lineTo(ix + 2.2, cy + 0.6);
        ctx.stroke();
      } else if (kind === 'location') {
        // 定位箭头
        ctx.beginPath();
        ctx.moveTo(ix, cy - 6);
        ctx.lineTo(ix + 4.6, cy + 5);
        ctx.lineTo(ix, cy + 2.2);
        ctx.lineTo(ix - 4.6, cy + 5);
        ctx.closePath();
        ctx.fill();
      }
      rx = ix - 8;
    }
  }

  // ---------- 绘制：导航栏 ----------
  function drawNavBar(ctx, lay, config) {
    const W = lay.W, top = lay.sb.h, h = L.navH;
    ctx.fillStyle = '#ededed';
    ctx.fillRect(0, top, W, h);
    ctx.fillStyle = '#d9d9d9';
    ctx.fillRect(0, top + h - 0.5, W, 0.5);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(23, top + 14);
    ctx.lineTo(15, top + 22);
    ctx.lineTo(23, top + 30);
    ctx.stroke();

    // 标题：群聊显示 “群名(人数)”
    let title = '';
    if (lay.isGroup) {
      const g = config.group || {};
      const n = (g.members || []).length || lay.parts.list.length;
      title = (g.name || '群聊') + '(' + n + ')';
    } else {
      const opp = lay.parts.list.find(p => !p.isMe);
      title = (opp && opp.name) || '';
    }

    ctx.fillStyle = '#000';
    ctx.font = '600 17px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxTitleW = W - 140;
    let t = title;
    if (ctx.measureText(t).width > maxTitleW) {
      while (t.length > 1 && ctx.measureText(t + '…').width > maxTitleW) t = t.slice(0, -1);
      t += '…';
    }
    ctx.fillText(t, W / 2, top + 22);

    ctx.fillStyle = '#000';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(W - 34 + i * 7, top + 22, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- 绘制：输入栏 ----------
  function drawInputBar(ctx, lay) {
    const W = lay.W, top = lay.H - L.inputH;
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, top, W, L.inputH);
    ctx.fillStyle = '#d9d9d9';
    ctx.fillRect(0, top, W, 0.5);

    const cy = top + L.inputH / 2;

    ctx.strokeStyle = '#666';
    ctx.fillStyle = '#666';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    rr(ctx, 22, cy - 9, 9, 14, 4.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(26.5, cy + 1, 6.5, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(26.5, cy + 7);
    ctx.lineTo(26.5, cy + 10);
    ctx.moveTo(23, cy + 10);
    ctx.lineTo(30, cy + 10);
    ctx.stroke();

    const fx = 44, fw = W - 44 - 92, fh = 36;
    ctx.fillStyle = '#fff';
    rr(ctx, fx, cy - fh / 2, fw, fh, 6);
    ctx.fill();
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = '#999';
    ctx.font = '15px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('输入消息', fx + 12, cy);

    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(W - 68, cy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(W - 71.5, cy - 3, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W - 64.5, cy - 3, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W - 68, cy + 2, 5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(W - 32, cy - 7);
    ctx.lineTo(W - 32, cy + 7);
    ctx.moveTo(W - 39, cy);
    ctx.lineTo(W - 25, cy);
    ctx.stroke();
  }

  // ---------- 绘制：消息 ----------
  function drawBlock(ctx, lay, block) {
    const W = lay.W;

    if (block.kind === 'time') {
      ctx.fillStyle = '#b2b2b2';
      ctx.font = L.timeSize + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.text, W / 2, block.y + block.h / 2);
      return;
    }

    const isMine = block.isMine;
    const avatarX = isMine ? (W - L.padX - L.avatar) : L.padX;
    const avatarY = block.y + (block.showNick ? 2 : 0);

    if (block.avatarImg) {
      ctx.save();
      rr(ctx, avatarX, avatarY, L.avatar, L.avatar, L.avatarR);
      ctx.clip();
      ctx.drawImage(block.avatarImg, avatarX, avatarY, L.avatar, L.avatar);
      ctx.restore();
    } else {
      ctx.fillStyle = '#d8d8d8';
      rr(ctx, avatarX, avatarY, L.avatar, L.avatar, L.avatarR);
      ctx.fill();
    }

    const bubbleX = isMine
      ? (avatarX - L.gapAvatar - block.bubbleW)
      : (avatarX + L.avatar + L.gapAvatar);
    const bubbleY = block.y + block.nickOffset;
    const bw = block.bubbleW, bh = block.bubbleH;
    const msg = block.msg;

    // 群聊昵称（对方）
    if (block.showNick) {
      ctx.fillStyle = '#7d7d7d';
      ctx.font = L.nickSize + 'px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.sender.name, bubbleX + 2, block.y + L.nickH / 2);
    }

    if (msg.type === 'image') {
      if (block.imgEl) {
        ctx.drawImage(block.imgEl, bubbleX, bubbleY, bw, bh);
      } else {
        ctx.fillStyle = '#ddd';
        rr(ctx, bubbleX, bubbleY, bw, bh, 6);
        ctx.fill();
        ctx.fillStyle = '#999';
        ctx.font = '14px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('图片', bubbleX + bw / 2, bubbleY + bh / 2);
      }
      return;
    }

    if (msg.type === 'file') {
      // 文件消息卡片
      ctx.fillStyle = '#fff';
      rr(ctx, bubbleX, bubbleY, bw, bh, L.bubbleR);
      ctx.fill();
      // 文件图标
      const fx = bubbleX + 16, fy = bubbleY + 22;
      ctx.fillStyle = '#e8f0fe';
      rr(ctx, fx - 10, fy - 14, 28, 36, 4);
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.4;
      rr(ctx, fx - 10, fy - 14, 28, 36, 4);
      ctx.stroke();
      // 折角
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(fx + 8, fy - 14);
      ctx.lineTo(fx + 18, fy - 4);
      ctx.lineTo(fx + 8, fy - 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(fx + 8, fy - 14);
      ctx.lineTo(fx + 18, fy - 4);
      ctx.lineTo(fx + 8, fy - 4);
      ctx.closePath();
      ctx.stroke();
      // 文件名
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '14px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const fname = msg.name || '文件';
      let show = fname;
      const maxW = bw - 62;
      while (ctx.measureText(show).width > maxW && show.length > 4) {
        show = show.slice(0, -1);
      }
      if (show !== fname) show = show.slice(0, -1) + '…';
      ctx.fillText(show, bubbleX + 46, bubbleY + 26);
      // 文件大小
      ctx.fillStyle = '#999';
      ctx.font = '12px ' + FONT;
      ctx.fillText(msg.size || '', bubbleX + 46, bubbleY + 50);
      // 分隔线
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(bubbleX + 12, bubbleY + bh - 22, bw - 24, 1);
      ctx.fillStyle = '#999';
      ctx.font = '11px ' + FONT;
      ctx.fillText('微信电脑版', bubbleX + 14, bubbleY + bh - 11);
      return;
    }

    if (msg.type === 'link') {
      // 链接/文章卡片
      ctx.fillStyle = '#fff';
      rr(ctx, bubbleX, bubbleY, bw, bh, L.bubbleR);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '14px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const title = msg.title || '链接';
      let t = title;
      const mw = bw - 112;
      while (ctx.measureText(t).width > mw && t.length > 3) t = t.slice(0, -1);
      if (t !== title) t = t.slice(0, -1) + '…';
      ctx.fillText(t, bubbleX + 14, bubbleY + 22);
      ctx.fillStyle = '#999';
      ctx.font = '12px ' + FONT;
      ctx.fillText(msg.desc || '', bubbleX + 14, bubbleY + 46);
      // 右侧缩略图
      ctx.fillStyle = '#e5e7eb';
      rr(ctx, bubbleX + bw - 72, bubbleY + 8, 64, 64, 4);
      ctx.fill();
      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('链接', bubbleX + bw - 40, bubbleY + 40);
      return;
    }

    if (msg.type === 'transfer') {
      ctx.fillStyle = '#fff';
      rr(ctx, bubbleX, bubbleY, bw, bh, L.bubbleR);
      ctx.fill();
      ctx.fillStyle = '#e64340';
      ctx.beginPath();
      ctx.arc(bubbleX + 26, bubbleY + 26, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '600 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('¥', bubbleX + 26, bubbleY + 27);
      ctx.fillStyle = '#333';
      ctx.font = '14px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText('转账', bubbleX + 48, bubbleY + 27);
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(bubbleX + 12, bubbleY + 48, bw - 24, 1);
      ctx.fillStyle = '#e64340';
      ctx.font = '600 20px ' + FONT;
      ctx.fillText('¥' + (msg.amount || '0.00'), bubbleX + 14, bubbleY + 74);
      ctx.fillStyle = '#999';
      ctx.font = '12px ' + FONT;
      ctx.fillText(msg.note || '转账', bubbleX + 14, bubbleY + 106);
      return;
    }

    if (msg.type === 'redpacket') {
      const g = ctx.createLinearGradient(bubbleX, bubbleY, bubbleX + bw, bubbleY + bh);
      g.addColorStop(0, '#f9d3a3');
      g.addColorStop(1, '#e95f35');
      ctx.fillStyle = g;
      rr(ctx, bubbleX, bubbleY, bw, bh, L.bubbleR);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '600 15px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧧 ' + (msg.title || '恭喜发财，大吉大利'), bubbleX + 14, bubbleY + 26);
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(msg.note || '微信红包', bubbleX + 14, bubbleY + 50);
      return;
    }

    const bg = isMine ? '#95ec69' : '#ffffff';
    ctx.fillStyle = bg;
    rr(ctx, bubbleX, bubbleY, bw, bh, L.bubbleR);
    ctx.fill();

    ctx.beginPath();
    if (isMine) {
      ctx.moveTo(bubbleX + bw, bubbleY + 14);
      ctx.lineTo(bubbleX + bw + 6, bubbleY + 19);
      ctx.lineTo(bubbleX + bw, bubbleY + 24);
    } else {
      ctx.moveTo(bubbleX, bubbleY + 14);
      ctx.lineTo(bubbleX - 6, bubbleY + 19);
      ctx.lineTo(bubbleX, bubbleY + 24);
    }
    ctx.closePath();
    ctx.fill();

    if (msg.type === 'voice') {
      const ix = bubbleX + 12, iy = bubbleY + bh / 2;
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.moveTo(ix, iy - 3);
      ctx.lineTo(ix + 5, iy - 3);
      ctx.lineTo(ix + 11, iy - 9);
      ctx.lineTo(ix + 11, iy + 9);
      ctx.lineTo(ix + 5, iy + 3);
      ctx.lineTo(ix, iy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(ix + 12, iy, 5, -Math.PI * 0.32, Math.PI * 0.32);
      ctx.stroke();
      ctx.fillStyle = '#555';
      ctx.font = '14px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText((msg.duration || 3) + '″', bubbleX + bw - 32, iy);
    } else {
      ctx.fillStyle = '#000';
      ctx.font = L.fontSize + 'px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      block.lines.forEach((line, i) => {
        ctx.fillText(line, bubbleX + L.bubblePadX,
          bubbleY + L.bubblePadY + i * L.lineHeight + L.lineHeight / 2);
      });
    }
  }

  // ---------- 屏幕特征绘制 ----------
  function drawCutout(ctx, lay, device) {
    const W = lay.W;
    const sb = lay.sb;
    const cx = W / 2;

    if (device.cutout === 'island') {
      // iPhone 灵动岛：黑色圆角胶囊
      const w = device.cutoutW, h = device.cutoutH;
      const x = cx - w / 2, y = sb.pad + 3;
      ctx.fillStyle = '#000';
      rr(ctx, x, y, w, h, h / 2);
      ctx.fill();
    } else if (device.cutout === 'punch' || device.cutout === 'punch-center') {
      // 安卓居中挖孔：黑色圆形
      const d = device.cutoutW;
      const y = sb.pad + (sb.h - sb.pad) / 2;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx, y, d / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (device.cutout === 'notch') {
      // 传统刘海
      const w = 156, h = 28;
      const x = cx - w / 2;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + w, 0);
      ctx.lineTo(x + w, h - 8);
      ctx.quadraticCurveTo(x + w, h, x + w - 10, h);
      ctx.lineTo(x + 10, h);
      ctx.quadraticCurveTo(x, h, x, h - 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawHomeBar(ctx, lay, device) {
    if (!device.homeBar) return;
    const W = lay.W, H = lay.H;
    const bw = 134, bh = 5;
    const x = (W - bw) / 2;
    const y = H - 9;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    rr(ctx, x, y, bw, bh, bh / 2);
    ctx.fill();
  }

  // ---------- 主渲染 ----------
  async function render(config, scale) {
    await ensureFonts();
    const lay = await buildLayout(config);
    const dev = DEVICES[config.device] || DEVICES['iphone-14pro'];

    // 按真机物理像素输出；scale 参数仅用于预览缩放
    const outW = dev.pxW;
    const outH = lay.longMode
      ? Math.round(dev.pxW * (lay.H / dev.w))
      : dev.pxH;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext('2d');
    // 将逻辑坐标映射到物理像素
    const sx = outW / lay.W;
    const sy = outH / lay.H;
    ctx.scale(sx, sy);

    ctx.fillStyle = '#ededed';
    ctx.fillRect(0, 0, lay.W, lay.H);

    const areaTop = lay.sb.h + L.navH;
    const areaH = lay.H - areaTop - L.inputH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, areaTop, lay.W, areaH);
    ctx.clip();
    ctx.translate(0, areaTop - lay.offset);
    lay.blocks.forEach(b => drawBlock(ctx, lay, b));
    ctx.restore();

    drawStatusBar(ctx, lay, config);
    drawNavBar(ctx, lay, config);
    drawInputBar(ctx, lay);

    // 屏幕特征（最后画，覆盖在最上层）
    drawCutout(ctx, lay, dev);
    drawHomeBar(ctx, lay, dev);

    canvas.__dev = dev;
    return canvas;
  }

  /**
   * 导出为 JPEG（质量 0.92）——模拟真机截图经微信保存后的压缩痕迹：
   *  - 无 alpha 通道（真机截图不含透明）
   *  - 有轻微压缩噪点（AI 生图检测器不会因此判为 AI，但更像真实截图）
   */
  function canvasToBlob(canvas, format, quality) {
    format = format || 'image/jpeg';
    quality = quality == null ? 0.92 : quality;
    return new Promise(resolve => {
      if (format === 'image/png') {
        canvas.toBlob(resolve, 'image/png');
        return;
      }
      // 先铺白底去掉 alpha
      const c2 = document.createElement('canvas');
      c2.width = canvas.width;
      c2.height = canvas.height;
      const ctx2 = c2.getContext('2d');
      ctx2.fillStyle = '#ffffff';
      ctx2.fillRect(0, 0, c2.width, c2.height);
      ctx2.drawImage(canvas, 0, 0);
      c2.toBlob(resolve, 'image/jpeg', quality);
    });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function download(config, filename, scale, format) {
    const canvas = await render(config, scale);
    const fmt = format || config.exportFormat || 'image/jpeg';
    const blob = await canvasToBlob(canvas, fmt, config.exportQuality);
    const ext = fmt === 'image/png' ? '.png' : '.jpg';
    let name = filename || (config.title || '聊天截图');
    name = name.replace(/\.(png|jpg|jpeg)$/i, '') + ext;
    triggerDownload(blob, name);
    return { width: canvas.width, height: canvas.height, filename: name };
  }

  /** 把消息按时间跨度分成若干"截图窗口"，每张可跨天 */
  function planShots(config, count) {
    const msgs = (config.messages || []).filter(m => m.type !== 'time' && m.type !== 'system');
    const n = msgs.length;
    if (!n) return [0];
    count = count || 5;
    if (count >= n) return msgs.map((_, i) => i);

    const anchors = [];
    for (let i = 0; i < count; i++) {
      const start = Math.round((n - 1) * (i / count));
      anchors.push(Math.min(n - 1, Math.max(0, start)));
    }
    return anchors;
  }

  window.WXCanvas = {
    render: render,
    download: download,
    planShots: planShots,
    wechatTime: wechatTime,
    normalizeParticipants: normalizeParticipants,
    DEVICES: DEVICES,
    ensureFonts: ensureFonts,
    STATUS: STATUS,
    SIZES: SIZES
  };
})();
