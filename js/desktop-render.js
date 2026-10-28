// 电脑端微信渲染器（独立文件，挂载到 WXCanvas）
(function () {
  'use strict';

  const DL = {
    winW: 1100,
    winH: 720,
    titleBarH: 36,
    sidebarW: 60,
    chatListW: 250,
    inputH: 132,
    avatarSize: 36,
    bubblePadX: 12,
    bubblePadY: 9,
    bubbleR: 6,
    fontSize: 14,
    lineH: 20,
    rowGap: 14,
    timeSize: 12
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

  async function buildLayout(config) {
    const W = DL.winW, H = DL.winH;
    const parts = normalizeParticipants(config);
    const isGroup = !!(config.group && config.group.enabled);

    const avatarMap = {};
    for (const p of parts.list) {
      avatarMap[p.id] = await loadImage(p.avatar);
    }

    const chatW = W - DL.sidebarW - DL.chatListW;
    const padX = 26;
    const maxBubbleW = chatW * 0.55;
    const maxTextW = maxBubbleW - DL.bubblePadX * 2 - 2;

    const mctx = document.createElement('canvas').getContext('2d');
    mctx.font = DL.fontSize + 'px ' + FONT;

    const msgs = config.messages || [];
    const threshold = (config.timeThresholdMin == null ? 10 : config.timeThresholdMin) * 60000;
    const capture = config.captureDate;

    const blocks = [];
    let y = 16;
    let lastTime = null;

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];

      if (msg.type === 'time' || msg.type === 'system') {
        const text = msg.text || (msg.time ? wechatTime(msg.time, capture) : '');
        blocks.push({ kind: 'time', text: text, y: y, h: 26, mi: i });
        y += 26;
        continue;
      }

      if (msg.time) {
        const t = new Date(msg.time).getTime();
        if (!isNaN(t)) {
          if (lastTime === null || t - lastTime > threshold) {
            blocks.push({ kind: 'time', text: wechatTime(msg.time, capture), y: y, h: 26, mi: i });
            y += 26;
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
          const sc = Math.min(200 / imgEl.naturalWidth, 240 / imgEl.naturalHeight, 1);
          iw = Math.max(80, imgEl.naturalWidth * sc);
          ih = Math.max(60, imgEl.naturalHeight * sc);
        }
        bubbleW = iw; bubbleH = ih;
      } else if (msg.type === 'voice') {
        bubbleW = 90 + Math.min((msg.duration || 3) * 3, 50);
        bubbleH = DL.lineH + DL.bubblePadY * 2;
      } else if (msg.type === 'transfer') {
        bubbleW = 220; bubbleH = 120;
      } else if (msg.type === 'redpacket') {
        bubbleW = 200; bubbleH = 70;
      } else if (msg.type === 'file') {
        bubbleW = 240; bubbleH = 76;
      } else if (msg.type === 'link') {
        bubbleW = 250; bubbleH = 76;
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

    const contentH = y + 16;
    const areaTop = DL.titleBarH + 50;
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
      const raw = anchor ? anchor.y - 10 : contentH - availH;
      offset = Math.max(0, Math.min(raw, Math.max(0, contentH - availH)));
    } else {
      offset = Math.max(0, contentH - availH);
    }

    return {
      W: W, H: H, blocks: blocks, offset: offset, contentH: contentH,
      parts: parts, isGroup: isGroup, avatarMap: avatarMap,
      chatW: chatW, padX: padX
    };
  }

  function drawFrame(ctx, lay, config) {
    const W = lay.W, H = lay.H;
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, W, H);

    // 标题栏
    ctx.fillStyle = '#ededed';
    ctx.fillRect(0, 0, W, DL.titleBarH);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(0, DL.titleBarH - 1, W, 1);

    const btnY = DL.titleBarH / 2;
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(W - 88, btnY);
    ctx.lineTo(W - 78, btnY);
    ctx.stroke();
    ctx.strokeRect(W - 62, btnY - 5, 10, 10);
    ctx.beginPath();
    ctx.moveTo(W - 34, btnY - 5);
    ctx.lineTo(W - 24, btnY + 5);
    ctx.moveTo(W - 24, btnY - 5);
    ctx.lineTo(W - 34, btnY + 5);
    ctx.stroke();

    ctx.fillStyle = '#333';
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('微信', W / 2, btnY);

    // 左侧图标栏
    ctx.fillStyle = '#2e2e2e';
    ctx.fillRect(0, DL.titleBarH, DL.sidebarW, H - DL.titleBarH);

    const iconY0 = DL.titleBarH + 30;
    const icons = ['💬', '👤', '⭐', '📁', '🕐'];
    icons.forEach((ic, i) => {
      const iy = iconY0 + i * 52;
      ctx.fillStyle = i === 0 ? '#07c160' : '#8a8a8a';
      ctx.font = '20px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ic, DL.sidebarW / 2, iy);
    });

    // 会话列表
    const listX = DL.sidebarW;
    const listW = DL.chatListW;
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(listX, DL.titleBarH, listW, H - DL.titleBarH);
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(listX + listW - 1, DL.titleBarH, 1, H - DL.titleBarH);

    ctx.fillStyle = '#e8e8e8';
    rr(ctx, listX + 12, DL.titleBarH + 12, listW - 24, 28, 4);
    ctx.fill();
    ctx.fillStyle = '#999';
    ctx.font = '12px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔍 搜索', listX + 22, DL.titleBarH + 26);

    const itemY = DL.titleBarH + 52;
    ctx.fillStyle = '#e2e2e2';
    ctx.fillRect(listX, itemY, listW - 1, 62);

    const opp = lay.parts.list.find(p => !p.isMe);
    const oppAvatar = opp ? lay.avatarMap[opp.id] : null;
    if (oppAvatar) {
      ctx.save();
      rr(ctx, listX + 12, itemY + 13, 36, 36, 4);
      ctx.clip();
      ctx.drawImage(oppAvatar, listX + 12, itemY + 13, 36, 36);
      ctx.restore();
    } else {
      ctx.fillStyle = '#ccc';
      rr(ctx, listX + 12, itemY + 13, 36, 36, 4);
      ctx.fill();
    }

    let chatName = lay.isGroup
      ? (((config.group && config.group.name) || '群聊') + '(' + (config.group.members || []).length + ')')
      : (opp ? opp.name : '对方');

    ctx.fillStyle = '#1a1a1a';
    ctx.font = '14px ' + FONT;
    ctx.textAlign = 'left';
    let cn = chatName;
    while (ctx.measureText(cn).width > listW - 70 && cn.length > 4) cn = cn.slice(0, -1);
    ctx.fillText(cn, listX + 56, itemY + 26);

    // 会话列表显示最新一条（微信列表规则）
    const dataMsgs = (config.messages || []).filter(m => m.type !== 'time' && m.type !== 'system');
    const lastMsg = dataMsgs[dataMsgs.length - 1];
    if (lastMsg) {
      ctx.fillStyle = '#999';
      ctx.font = '12px ' + FONT;
      let prev = lastMsg.text || '';
      if (!prev) {
        if (lastMsg.type === 'file') prev = '[文件]';
        else if (lastMsg.type === 'image') prev = '[图片]';
        else if (lastMsg.type === 'voice') prev = '[语音]';
        else prev = '[消息]';
      }
      if (lay.isGroup && lastMsg.fromId) prev = lastMsg.fromId + '：' + prev;
      let pv = prev;
      while (ctx.measureText(pv).width > listW - 74 && pv.length > 4) pv = pv.slice(0, -1);
      if (pv !== prev) pv = pv.slice(0, -1) + '…';
      ctx.fillText(pv, listX + 56, itemY + 44);
    }

    // 聊天区背景
    const chatX = listX + listW;
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(chatX, DL.titleBarH, lay.chatW, H - DL.titleBarH);

    // 顶部标题栏
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(chatX, DL.titleBarH, lay.chatW, 50);
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(chatX, DL.titleBarH + 49, lay.chatW, 1);

    ctx.fillStyle = '#1a1a1a';
    ctx.font = '600 15px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(chatName, chatX + 20, DL.titleBarH + 25);

    ctx.fillStyle = '#666';
    ctx.font = '16px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('⋯', chatX + lay.chatW - 24, DL.titleBarH + 25);

    // 输入区
    drawInputBar(ctx, lay);
  }

  function drawInputBar(ctx, lay) {
    const H = lay.H;
    const chatX = DL.sidebarW + DL.chatListW;
    const inputY = H - DL.inputH;

    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(chatX, inputY, lay.chatW, DL.inputH);
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(chatX, inputY, lay.chatW, 1);

    const tools = ['😊', '📁', '📷', '✂️', '🎤'];
    tools.forEach((t, i) => {
      ctx.fillStyle = '#666';
      ctx.font = '17px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, chatX + 28 + i * 34, inputY + 22);
    });

    ctx.fillStyle = '#fff';
    rr(ctx, chatX + 20, inputY + 36, lay.chatW - 40, 56, 4);
    ctx.fill();
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#07c160';
    rr(ctx, chatX + lay.chatW - 96, inputY + 98, 72, 26, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('发送(S)', chatX + lay.chatW - 60, inputY + 111);
  }

  function drawBlock(ctx, lay, block) {
    const chatX = DL.sidebarW + DL.chatListW;
    const padX = lay.padX;
    const leftEdge = chatX + padX;
    const rightEdge = chatX + lay.chatW - padX;

    if (block.kind === 'time') {
      ctx.fillStyle = '#b2b2b2';
      ctx.font = DL.timeSize + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.text, chatX + lay.chatW / 2, block.y + block.h / 2);
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
        ctx.drawImage(block.imgEl, bubbleX, bubbleY, bw, bh);
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bubbleX, bubbleY, bw, bh);
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

    if (msg.type === 'file' || msg.type === 'link') {
      ctx.fillStyle = '#fff';
      rr(ctx, bubbleX, bubbleY, bw, bh, DL.bubbleR);
      ctx.fill();
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = 1;
      rr(ctx, bubbleX, bubbleY, bw, bh, DL.bubbleR);
      ctx.stroke();

      if (msg.type === 'file') {
        const fx = bubbleX + 14, fy = bubbleY + 14;
        ctx.fillStyle = '#e8f0fe';
        rr(ctx, fx, fy, 30, 38, 4);
        ctx.fill();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.2;
        rr(ctx, fx, fy, 30, 38, 4);
        ctx.stroke();
        ctx.fillStyle = '#3b82f6';
        ctx.font = '600 8px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FILE', fx + 15, fy + 30);

        ctx.fillStyle = '#1a1a1a';
        ctx.font = '13px ' + FONT;
        ctx.textAlign = 'left';
        ctx.fillText(msg.name || '文件', bubbleX + 54, bubbleY + 24);
        ctx.fillStyle = '#999';
        ctx.font = '11px ' + FONT;
        ctx.fillText(msg.size || '', bubbleX + 54, bubbleY + 46);
      } else {
        ctx.fillStyle = '#e5e7eb';
        rr(ctx, bubbleX + bw - 74, bubbleY + 8, 66, 60, 4);
        ctx.fill();
        ctx.fillStyle = '#9ca3af';
        ctx.font = '11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('预览', bubbleX + bw - 41, bubbleY + 38);

        ctx.fillStyle = '#1a1a1a';
        ctx.font = '13px ' + FONT;
        ctx.textAlign = 'left';
        let t = msg.title || '链接';
        while (ctx.measureText(t).width > bw - 100 && t.length > 4) t = t.slice(0, -1);
        ctx.fillText(t, bubbleX + 12, bubbleY + 26);
        ctx.fillStyle = '#999';
        ctx.font = '11px ' + FONT;
        ctx.fillText(msg.desc || '', bubbleX + 12, bubbleY + 50);
      }
      return;
    }

    const bubbleBg = isMine ? '#95ec69' : '#ffffff';
    ctx.fillStyle = bubbleBg;
    rr(ctx, bubbleX, bubbleY, bw, bh, DL.bubbleR);
    ctx.fill();

    ctx.beginPath();
    if (isMine) {
      ctx.moveTo(bubbleX + bw, bubbleY + 12);
      ctx.lineTo(bubbleX + bw + 5, bubbleY + 17);
      ctx.lineTo(bubbleX + bw, bubbleY + 22);
    } else {
      ctx.moveTo(bubbleX, bubbleY + 12);
      ctx.lineTo(bubbleX - 5, bubbleY + 17);
      ctx.lineTo(bubbleX, bubbleY + 22);
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
      ctx.fillStyle = '#000';
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

    drawFrame(ctx, lay, config);

    // 聊天内容（裁剪滚动）
    const chatX = DL.sidebarW + DL.chatListW;
    const areaTop = DL.titleBarH + 50;
    const areaH = DL.winH - areaTop - DL.inputH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(chatX, areaTop, lay.chatW, areaH);
    ctx.clip();
    ctx.translate(0, areaTop - lay.offset);
    lay.blocks.forEach(b => drawBlock(ctx, lay, b));
    ctx.restore();

    // 顶部遮罩
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(chatX, DL.titleBarH, lay.chatW, 50);
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(chatX, DL.titleBarH + 49, lay.chatW, 1);

    const chatName = lay.isGroup
      ? (((config.group && config.group.name) || '群聊') + '(' + (config.group.members || []).length + ')')
      : ((lay.parts.list.find(p => !p.isMe) || {}).name || '');
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '600 15px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(chatName, chatX + 20, DL.titleBarH + 25);
    ctx.fillStyle = '#666';
    ctx.font = '16px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('⋯', chatX + lay.chatW - 24, DL.titleBarH + 25);

    // 底部遮罩
    drawInputBar(ctx, lay);

    return canvas;
  }

  window.WXDesktop = {
    render: renderDesktop,
    DL: DL
  };
})();
