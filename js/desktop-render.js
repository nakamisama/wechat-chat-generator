// 电脑端微信渲染器 v2 —— 只显示聊天窗口（参照真实截图）
(function () {
  'use strict';

  const DL = {
    winW: 820,
    winH: 700,
    titleBarH: 46,
    inputH: 92,
    avatarSize: 38,
    bubblePadX: 12,
    bubblePadY: 9,
    bubbleR: 6,
    fontSize: 14,
    lineH: 20,
    rowGap: 16,
    timeSize: 13,
    padX: 24
  };

  let FONT = '"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

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
      lines.push(line);
    });
    return lines.length ? lines : [''];
  }

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

  function fileIconStyle(name) {
    const n = String(name || '').toLowerCase();
    if (n.endsWith('.docx') || n.endsWith('.doc')) return { color: '#2b579a', label: 'W' };
    if (n.endsWith('.xlsx') || n.endsWith('.xls')) return { color: '#217346', label: 'X' };
    if (n.endsWith('.pptx') || n.endsWith('.ppt')) return { color: '#d24726', label: 'P' };
    if (n.endsWith('.pdf')) return { color: '#c0392b', label: 'P' };
    if (n.endsWith('.zip') || n.endsWith('.rar')) return { color: '#f39c12', label: 'Z' };
    return { color: '#4a90d9', label: 'F' };
  }

  async function buildLayout(config) {
    const W = DL.winW, H = DL.winH;
    const parts = normalizeParticipants(config);
    const isGroup = !!(config.group && config.group.enabled);

    const avatarMap = {};
    for (const p of parts.list) {
      avatarMap[p.id] = await loadImage(p.avatar);
    }

    const areaW = W - DL.padX * 2;
    const maxBubbleW = areaW * 0.62;
    const maxTextW = maxBubbleW - DL.bubblePadX * 2 - 2;

    const mctx = document.createElement('canvas').getContext('2d');
    mctx.font = DL.fontSize + 'px ' + FONT;

    const msgs = config.messages || [];
    const threshold = (config.timeThresholdMin == null ? 10 : config.timeThresholdMin) * 60000;
    const capture = config.captureDate;

    const blocks = [];
    let y = 18;
    let lastTime = null;

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];

      if (msg.type === 'time' || msg.type === 'system') {
        const text = msg.text || (msg.time ? wechatTime(msg.time, capture) : '');
        blocks.push({ kind: 'time', text: text, y: y, h: 30, mi: i });
        y += 30;
        continue;
      }

      if (msg.time) {
        const t = new Date(msg.time).getTime();
        if (!isNaN(t)) {
          if (lastTime === null || t - lastTime > threshold) {
            blocks.push({ kind: 'time', text: wechatTime(msg.time, capture), y: y, h: 30, mi: i });
            y += 30;
          }
          lastTime = t;
        }
      }

      const sender = resolveSender(msg, parts);
      const isMine = sender.isMe;
      const avatarImg = avatarMap[sender.id] || null;
      const showNick = isGroup && !isMine && !!sender.name;

      let lines = [], bubbleW = 0, bubbleH = 0, imgEl = null;

      if (msg.type === 'image') {
        imgEl = await loadImage(msg.image);
        let iw = 180, ih = 130;
        if (imgEl && imgEl.naturalWidth) {
          const sc = Math.min(170 / imgEl.naturalWidth, 200 / imgEl.naturalHeight, 1);
          iw = Math.max(90, imgEl.naturalWidth * sc);
          ih = Math.max(70, imgEl.naturalHeight * sc);
        }
        bubbleW = iw; bubbleH = ih;
      } else if (msg.type === 'voice') {
        bubbleW = 90 + Math.min((msg.duration || 3) * 3, 50);
        bubbleH = DL.lineH + DL.bubblePadY * 2;
      } else if (msg.type === 'transfer') {
        bubbleW = 230; bubbleH = 120;
      } else if (msg.type === 'redpacket') {
        bubbleW = 210; bubbleH = 72;
      } else if (msg.type === 'file') {
        bubbleW = 268; bubbleH = 92;
      } else if (msg.type === 'link') {
        bubbleW = 280; bubbleH = 80;
      } else {
        lines = wrapText(mctx, msg.text, maxTextW);
        let textW = 0;
        lines.forEach(l => { textW = Math.max(textW, mctx.measureText(l).width); });
        bubbleW = Math.min(maxBubbleW, Math.ceil(textW) + DL.bubblePadX * 2);
        bubbleH = lines.length * DL.lineH + DL.bubblePadY * 2;
      }

      const nickH = showNick ? 18 : 0;
      const rowH = Math.max(DL.avatarSize, nickH + bubbleH);
      blocks.push({
        kind: 'row', msg: msg, mi: i, sender: sender, isMine: isMine,
        avatarImg: avatarImg, showNick: showNick, nickH: nickH,
        lines: lines, bubbleW: bubbleW, bubbleH: bubbleH,
        imgEl: imgEl, y: y, h: rowH
      });
      y += rowH + DL.rowGap;
    }

    const contentH = y + 18;
    const areaTop = DL.titleBarH;
    const availH = H - areaTop - DL.inputH;

    let offset;
    if (config.scrollToMsg != null) {
      const idx = Number(config.scrollToMsg);
      let anchor = null;
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].mi === idx) anchor = blocks[i];
      }
      if (anchor && anchor.kind === 'row') {
        const pos = blocks.indexOf(anchor);
        const prev = blocks[pos - 1];
        if (prev && prev.kind === 'time' && prev.mi === idx) anchor = prev;
      }
      const raw = anchor ? anchor.y - 12 : contentH - availH;
      offset = Math.max(0, Math.min(raw, Math.max(0, contentH - availH)));
    } else {
      offset = Math.max(0, contentH - availH);
    }

    return {
      W: W, H: H, blocks: blocks, offset: offset, contentH: contentH,
      parts: parts, isGroup: isGroup, avatarMap: avatarMap,
      areaW: areaW
    };
  }

  function drawTitleBar(ctx, lay, config) {
    const W = lay.W;
    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(0, 0, W, DL.titleBarH);
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(0, DL.titleBarH - 1, W, 1);

    const opp = lay.parts.list.find(p => !p.isMe);
    let title = lay.isGroup
      ? ((config.group && config.group.name) || '群聊')
      : (opp ? opp.name : '');
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '16px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let t = title;
    while (ctx.measureText(t).width > W - 260 && t.length > 4) t = t.slice(0, -1);
    ctx.fillText(t, 22, DL.titleBarH / 2);

    const cy = DL.titleBarH / 2;
    let bx = W - 28;

    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx - 5, cy - 5);
    ctx.lineTo(bx + 5, cy + 5);
    ctx.moveTo(bx + 5, cy - 5);
    ctx.lineTo(bx - 5, cy + 5);
    ctx.stroke();
    bx -= 44;

    ctx.strokeRect(bx - 5, cy - 5, 10, 10);
    bx -= 44;

    ctx.beginPath();
    ctx.moveTo(bx - 5, cy);
    ctx.lineTo(bx + 5, cy);
    ctx.stroke();
    bx -= 44;

    // 置顶图钉
    ctx.beginPath();
    ctx.moveTo(bx - 4, cy - 6);
    ctx.lineTo(bx + 4, cy - 6);
    ctx.lineTo(bx + 3, cy - 1);
    ctx.lineTo(bx + 5, cy + 1);
    ctx.lineTo(bx - 5, cy + 1);
    ctx.lineTo(bx - 3, cy - 1);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, cy + 1);
    ctx.lineTo(bx, cy + 6);
    ctx.stroke();
  }

  function drawFloatButtons(ctx, lay) {
    const W = lay.W;
    const by = DL.titleBarH + 26;
    ctx.fillStyle = '#8a8a8a';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(W - 50 + i * 7, by, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#8a8a8a';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W - 26, by - 3);
    ctx.lineTo(W - 21, by + 3);
    ctx.lineTo(W - 16, by - 3);
    ctx.stroke();
  }

  function drawInputBar(ctx, lay) {
    const W = lay.W, H = lay.H;
    const top = H - DL.inputH;

    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, top, W, DL.inputH);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, top, W, 1);

    // 工具栏
    const iy = top + 18;
    const tools = ['😊', '📁', '📷', '✂️', '🎤'];
    tools.forEach((t, i) => {
      ctx.fillStyle = '#666';
      ctx.font = '16px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, 26 + i * 32, iy);
    });

    // 输入框
    ctx.fillStyle = '#fff';
    rr(ctx, 20, top + 32, W - 40, 40, 3);
    ctx.fill();
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 发送按钮（右下，小尺寸灰色）
    ctx.fillStyle = '#e8e8e8';
    rr(ctx, W - 76, top + 54, 56, 22, 3);
    ctx.fill();
    ctx.fillStyle = '#999';
    ctx.font = '12px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('发送(S)', W - 48, top + 65);
  }

  function drawBlock(ctx, lay, block) {
    const W = lay.W;
    const leftEdge = DL.padX;
    const rightEdge = W - DL.padX;

    if (block.kind === 'time') {
      ctx.fillStyle = '#999';
      ctx.font = DL.timeSize + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.text, W / 2, block.y + block.h / 2);
      return;
    }

    const isMine = block.isMine;
    const av = DL.avatarSize;
    const avatarX = isMine ? (rightEdge - av) : leftEdge;
    const avatarY = block.y + (block.showNick ? 2 : 0);

    if (block.avatarImg) {
      ctx.save();
      rr(ctx, avatarX, avatarY, av, av, 4);
      ctx.clip();
      ctx.drawImage(block.avatarImg, avatarX, avatarY, av, av);
      ctx.restore();
    } else {
      ctx.fillStyle = '#d8d8d8';
      rr(ctx, avatarX, avatarY, av, av, 4);
      ctx.fill();
    }

    const gap = 10;
    const bubbleX = isMine
      ? (avatarX - gap - block.bubbleW)
      : (avatarX + av + gap);
    const bubbleY = block.y + block.nickH;
    const bw = block.bubbleW, bh = block.bubbleH;
    const msg = block.msg;

    if (block.showNick) {
      ctx.fillStyle = '#999';
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.sender.name, bubbleX + 2, block.y + block.nickH / 2);
    }

    if (msg.type === 'image') {
      if (block.imgEl) {
        ctx.save();
        rr(ctx, bubbleX, bubbleY, bw, bh, 4);
        ctx.clip();
        ctx.drawImage(block.imgEl, bubbleX, bubbleY, bw, bh);
        ctx.restore();
      } else {
        ctx.fillStyle = '#ddd';
        rr(ctx, bubbleX, bubbleY, bw, bh, 4);
        ctx.fill();
        ctx.fillStyle = '#999';
        ctx.font = '13px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('图片', bubbleX + bw / 2, bubbleY + bh / 2);
      }
      return;
    }

    // ── 文件卡片（真实微信电脑版样式）──
    if (msg.type === 'file') {
      const cardW = bw, cardH = bh;
      const iconStyle = fileIconStyle(msg.name);

      ctx.fillStyle = '#fff';
      rr(ctx, bubbleX, bubbleY, cardW, cardH, 6);
      ctx.fill();
      ctx.strokeStyle = '#ebebeb';
      ctx.lineWidth = 1;
      rr(ctx, bubbleX, bubbleY, cardW, cardH, 6);
      ctx.stroke();

      const iconSize = 40;
      const iconX = bubbleX + cardW - iconSize - 14;
      const iconY = bubbleY + 14;

      // 文件名
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '15px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let fname = msg.name || '文件';
      const nameMaxW = cardW - iconSize - 50;
      let disp = fname;
      while (ctx.measureText(disp).width > nameMaxW && disp.length > 6) disp = disp.slice(0, -1);
      if (disp !== fname) disp = disp.slice(0, -1) + '…';
      ctx.fillText(disp, bubbleX + 16, iconY + 11);

      // 文件大小
      ctx.fillStyle = '#999';
      ctx.font = '13px ' + FONT;
      ctx.fillText(msg.size || '', bubbleX + 16, iconY + 33);

      // 右侧彩色图标（圆角方块 + 白色字母）
      ctx.fillStyle = iconStyle.color;
      rr(ctx, iconX, iconY, iconSize, iconSize, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(iconStyle.label, iconX + iconSize / 2, iconY + iconSize / 2 + 1);

      // 底部分隔线
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(bubbleX + 1, bubbleY + cardH - 27, cardW - 2, 1);

      // 底部：微信小图标 + "微信电脑版"
      const fy = bubbleY + cardH - 13;
      ctx.fillStyle = '#07c160';
      rr(ctx, bubbleX + 16, fy - 6, 12, 12, 3);
      ctx.fill();
      // 微信图标中的两个小白点
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(bubbleX + 20, fy - 1.5, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bubbleX + 24.5, fy - 1.5, 1.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#999';
      ctx.font = '11px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('微信电脑版', bubbleX + 34, fy);
      return;
    }

    if (msg.type === 'link') {
      ctx.fillStyle = '#fff';
      rr(ctx, bubbleX, bubbleY, bw, bh, 6);
      ctx.fill();
      ctx.strokeStyle = '#ebebeb';
      ctx.lineWidth = 1;
      rr(ctx, bubbleX, bubbleY, bw, bh, 6);
      ctx.stroke();

      ctx.fillStyle = '#1a1a1a';
      ctx.font = '14px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let tt = msg.title || '链接';
      while (ctx.measureText(tt).width > bw - 100 && tt.length > 4) tt = tt.slice(0, -1);
      ctx.fillText(tt, bubbleX + 12, bubbleY + 24);

      ctx.fillStyle = '#999';
      ctx.font = '12px ' + FONT;
      ctx.fillText(msg.desc || '', bubbleX + 12, bubbleY + 48);

      ctx.fillStyle = '#eef0f2';
      rr(ctx, bubbleX + bw - 68, bubbleY + 10, 58, 58, 4);
      ctx.fill();
      return;
    }

    const bubbleBg = isMine ? '#95ec69' : '#ffffff';
    ctx.fillStyle = bubbleBg;
    rr(ctx, bubbleX, bubbleY, bw, bh, DL.bubbleR);
    ctx.fill();

    ctx.beginPath();
    if (isMine) {
      ctx.moveTo(bubbleX + bw, bubbleY + 13);
      ctx.lineTo(bubbleX + bw + 5, bubbleY + 18);
      ctx.lineTo(bubbleX + bw, bubbleY + 23);
    } else {
      ctx.moveTo(bubbleX, bubbleY + 13);
      ctx.lineTo(bubbleX - 5, bubbleY + 18);
      ctx.lineTo(bubbleX, bubbleY + 23);
    }
    ctx.closePath();
    ctx.fill();

    if (msg.type === 'voice') {
      const ix = bubbleX + 12, iy = bubbleY + bh / 2;
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.moveTo(ix, iy - 3);
      ctx.lineTo(ix + 4, iy - 3);
      ctx.lineTo(ix + 9, iy - 8);
      ctx.lineTo(ix + 9, iy + 8);
      ctx.lineTo(ix + 4, iy + 3);
      ctx.lineTo(ix, iy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ix + 10, iy, 4.5, -Math.PI * 0.32, Math.PI * 0.32);
      ctx.stroke();
      ctx.fillStyle = '#555';
      ctx.font = '13px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText((msg.duration || 3) + '″', bubbleX + bw - 30, iy);
    } else if (msg.type === 'transfer') {
      ctx.fillStyle = '#e64340';
      ctx.beginPath();
      ctx.arc(bubbleX + 24, bubbleY + 24, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '600 14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('¥', bubbleX + 24, bubbleY + 25);
      ctx.fillStyle = '#333';
      ctx.font = '13px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText('转账', bubbleX + 44, bubbleY + 25);
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(bubbleX + 12, bubbleY + 44, bw - 24, 1);
      ctx.fillStyle = '#e64340';
      ctx.font = '600 18px ' + FONT;
      ctx.fillText('¥' + (msg.amount || '0.00'), bubbleX + 14, bubbleY + 68);
      ctx.fillStyle = '#999';
      ctx.font = '11px ' + FONT;
      ctx.fillText(msg.note || '转账', bubbleX + 14, bubbleY + 96);
    } else if (msg.type === 'redpacket') {
      const g = ctx.createLinearGradient(bubbleX, bubbleY, bubbleX + bw, bubbleY + bh);
      g.addColorStop(0, '#f9d3a3');
      g.addColorStop(1, '#e95f35');
      ctx.fillStyle = g;
      rr(ctx, bubbleX, bubbleY, bw, bh, DL.bubbleR);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '600 14px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧧 ' + (msg.title || '恭喜发财'), bubbleX + 12, bubbleY + 24);
      ctx.font = '11px ' + FONT;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(msg.note || '微信红包', bubbleX + 12, bubbleY + 46);
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = DL.fontSize + 'px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      block.lines.forEach((line, i) => {
        ctx.fillText(line, bubbleX + DL.bubblePadX,
          bubbleY + DL.bubblePadY + i * DL.lineH + DL.lineH / 2);
      });
    }
  }

  async function renderDesktop(config) {
    if (window.WXCanvas && window.WXCanvas.ensureFonts) {
      await window.WXCanvas.ensureFonts();
    }
    const lay = await buildLayout(config);

    const canvas = document.createElement('canvas');
    canvas.width = DL.winW * 2;
    canvas.height = DL.winH * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, DL.winW, DL.winH);

    const areaTop = DL.titleBarH;
    const areaH = DL.winH - areaTop - DL.inputH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, areaTop, DL.winW, areaH);
    ctx.clip();
    ctx.translate(0, areaTop - lay.offset);
    lay.blocks.forEach(b => drawBlock(ctx, lay, b));
    ctx.restore();

    drawTitleBar(ctx, lay, config);
    drawFloatButtons(ctx, lay);
    drawInputBar(ctx, lay);

    return canvas;
  }

  window.WXDesktop = {
    render: renderDesktop,
    DL: DL
  };
})();
