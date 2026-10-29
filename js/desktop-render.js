// 电脑端微信渲染器 v2 —— 只显示聊天窗口（参照真实截图）
(function () {
  'use strict';

  const DL = {
    winW: 1440,
    winH: 908,
    titleBarH: 60,
    inputH: 168,
    avatarSize: 42,
    bubblePadX: 12,
    bubblePadY: 10,
    bubbleR: 4,
    fontSize: 15,
    lineH: 22,
    rowGap: 22,
    timeSize: 12,
    padX: 26,
    gap: 16
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

  // Windows 微信电脑版时间显示：24 小时制，如 "14:40"
  function clockText(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function wechatTime(iso, captureDate) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    const cap = captureDate ? new Date(captureDate) : new Date();
    if (isNaN(cap.getTime())) return String(iso || '');
    const t = clockText(d);
    const dayOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((dayOf(cap) - dayOf(d)) / 86400000);
    // 电脑版：当天只显示时间；更早显示 月-日 + 时间
    if (diff === 0) return t;
    if (diff === 1) return '昨天 ' + t;
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
    const W = config.winW || DL.winW;
    const H = config.winH || DL.winH;
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
        // 卡片宽度按文件名自适应（单行放得下就单行），限制在合理区间
        const nmCtx = mctx;
        nmCtx.font = '15px ' + FONT;
        const nameW = nmCtx.measureText(msg.name || '文件').width;
        bubbleW = Math.max(230, Math.min(340, Math.ceil(nameW) + 46 + 14 + 34));
        bubbleH = 122;
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
    const inputH = config.hideInputBar ? 0 : DL.inputH;
    const availH = H - areaTop - inputH;

    let offset;
    if (config.forceOffset != null) {
      // 精确指定滚动位置（用于分屏截图，避免自动吸附漂移）
      offset = Math.max(0, Math.min(Number(config.forceOffset), Math.max(0, contentH - availH)));
    } else if (config.scrollToMsg != null) {
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
      const maxOffset = Math.max(0, contentH - availH);
      offset = Math.max(0, Math.min(raw, maxOffset));
      // 底部不切半条：若能完整容纳则下移；否则接受底部半条（真实聊天窗口就是这样连续滚动）
      const snapped = snapBottom(blocks, offset, availH, contentH);
      if (snapped !== offset && !topIsCut(blocks, snapped)) {
        offset = snapped;
      } else if (topIsCut(blocks, offset)) {
        // 顶部被切（锚点前有半条）→ 回退到顶部完整位置
        offset = Math.min(snapTop(blocks, offset), maxOffset);
      }
    } else {
      offset = Math.max(0, contentH - availH);
    }

    return {
      W: W, H: H, blocks: blocks, offset: offset, contentH: contentH,
      parts: parts, isGroup: isGroup, avatarMap: avatarMap,
      areaW: areaW, areaTop: areaTop, availH: availH
    };
  }

  // 若可视区顶部把某条消息切成半截，则上移分页边界
  function snapTop(blocks, offset) {
    if (offset <= 0) return 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === 'time') continue;
      if (b.y + b.h > offset && b.y < offset) {
        // 顶部切半条：上移到该条起点之前
        return Math.max(0, b.y - 8);
      }
      if (b.y >= offset) break;
    }
    return offset;
  }

  // 顶部裁切检查：若 offset 处仍切着某条消息，返回 true
  function topIsCut(blocks, offset) {
    if (offset <= 0) return false;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === 'time') continue;
      if (b.y + b.h > offset && b.y < offset) return true;
      if (b.y >= offset) break;
    }
    return false;
  }

  // 若可视区底部把某条消息切成半截，则下移分页边界，让整条消息完整露出
  // 前提：下移后不能切掉顶部消息（否则保留原 offset）
  function snapBottom(blocks, offset, availH, contentH) {
    const bottom = offset + availH;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === 'time') continue;
      if (b.y < bottom && b.y + b.h > bottom - 6) {
        const newOffset = Math.max(0, b.y + b.h + 12 - availH);
        if (newOffset <= offset) return offset;
        const capped = Math.min(newOffset, Math.max(0, contentH - availH));
        // 若下移会切掉顶部整条消息，则放弃下移
        if (topIsCut(blocks, capped)) return offset;
        return capped;
      }
    }
    return offset;
  }

  function drawTitleBar(ctx, lay, config) {
    const W = lay.W;
    // ── Windows 微信主窗口标题栏 ──
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, 0, W, DL.titleBarH);
    ctx.fillStyle = '#e9e9e9';
    ctx.fillRect(0, DL.titleBarH - 1, W, 1);

    // 左上角：联系人 / 群名称
    const opp = lay.parts.list.find(p => !p.isMe);
    let title = lay.isGroup
      ? ((config.group && config.group.name) || '群聊')
      : (opp ? opp.name : '');
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '17px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 22, 24);

    const cy = 22;

    // 右上角：窗口按钮（最小化 / 最大化 / 关闭）
    const closeCx = W - 26;
    ctx.strokeStyle = '#5f5f5f';
    ctx.lineWidth = 1.1;

    // 关闭 ×
    ctx.beginPath();
    ctx.moveTo(closeCx - 5.5, cy - 5.5);
    ctx.lineTo(closeCx + 5.5, cy + 5.5);
    ctx.moveTo(closeCx + 5.5, cy - 5.5);
    ctx.lineTo(closeCx - 5.5, cy + 5.5);
    ctx.stroke();

    // 最大化 □
    const maxCx = closeCx - 44;
    ctx.strokeRect(maxCx - 5.5, cy - 5.5, 11, 11);

    // 最小化 —
    const minCx = maxCx - 44;
    ctx.beginPath();
    ctx.moveTo(minCx - 6, cy + 1);
    ctx.lineTo(minCx + 6, cy + 1);
    ctx.stroke();

    // ── 第二行：语音 / 视频 / 更多（靠右），左上角窗口置顶图钉 ──
    const ry = 44;
    let bx = W - 150;

    // 更多 ……
    ctx.fillStyle = '#4d4d4d';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(bx - 4 + i * 7, ry, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    bx -= 46;

    // 视频通话
    ctx.strokeStyle = '#4d4d4d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx - 8, ry - 5);
    ctx.lineTo(bx + 2, ry - 5);
    ctx.lineTo(bx + 2, ry + 5);
    ctx.lineTo(bx - 8, ry + 5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + 2, ry - 1);
    ctx.lineTo(bx + 8, ry - 5);
    ctx.lineTo(bx + 8, ry + 5);
    ctx.lineTo(bx + 2, ry + 1);
    ctx.closePath();
    ctx.stroke();
    bx -= 44;

    // 语音通话（话筒）
    ctx.beginPath();
    ctx.moveTo(bx, ry - 6);
    ctx.quadraticCurveTo(bx + 4, ry - 6, bx + 4, ry - 2);
    ctx.lineTo(bx + 4, ry + 1);
    ctx.quadraticCurveTo(bx + 4, ry + 5, bx, ry + 5);
    ctx.quadraticCurveTo(bx - 4, ry + 5, bx - 4, ry + 1);
    ctx.lineTo(bx - 4, ry - 2);
    ctx.quadraticCurveTo(bx - 4, ry - 6, bx, ry - 6);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, ry + 5);
    ctx.lineTo(bx, ry + 9);
    ctx.moveTo(bx - 3.5, ry + 9);
    ctx.lineTo(bx + 3.5, ry + 9);
    ctx.stroke();

    // 左上角第二行：置顶图钉
    ctx.strokeStyle = '#8a8a8a';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    const px = 26, py = 46;
    // 图钉帽
    ctx.beginPath();
    ctx.moveTo(px - 7, py - 5);
    ctx.lineTo(px + 7, py - 5);
    ctx.lineTo(px + 2, py + 1);
    ctx.lineTo(px + 2, py + 6);
    ctx.lineTo(px - 2, py + 6);
    ctx.lineTo(px - 2, py + 1);
    ctx.closePath();
    ctx.stroke();
    // 针身
    ctx.beginPath();
    ctx.moveTo(px, py + 6);
    ctx.lineTo(px, py + 10);
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

    // Windows 微信：输入区整块白色，顶部一条分割线
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, top, W, DL.inputH);
    ctx.fillStyle = '#e9e9e9';
    ctx.fillRect(0, top, W, 1);

    // ── 工具栏图标行（表情 / 文件 / 文件夹 / 剪刀 / 语音）──
    const iy = top + 30;
    ctx.strokeStyle = '#4d4d4d';
    ctx.fillStyle = '#4d4d4d';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let ix = 32;

    // 表情：圆脸 + 双眼 + 微笑
    ctx.beginPath(); ctx.arc(ix, iy, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.arc(ix - 3.5, iy - 3, 1.2, 0, Math.PI * 2);
    ctx.arc(ix + 3.5, iy - 3, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); ctx.arc(ix, iy + 1, 5, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke();

    // 立方体（收藏/文件）
    ix += 62;
    ctx.beginPath();
    ctx.moveTo(ix, iy - 11); ctx.lineTo(ix + 10, iy - 5);
    ctx.lineTo(ix + 10, iy + 6); ctx.lineTo(ix, iy + 12);
    ctx.lineTo(ix - 10, iy + 6); ctx.lineTo(ix - 10, iy - 5);
    ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ix - 10, iy - 5); ctx.lineTo(ix, iy + 1); ctx.lineTo(ix + 10, iy - 5);
    ctx.moveTo(ix, iy + 1); ctx.lineTo(ix, iy + 12);
    ctx.stroke();

    // 文件夹
    ix += 62;
    ctx.beginPath();
    ctx.moveTo(ix - 11, iy - 7);
    ctx.lineTo(ix - 3, iy - 7);
    ctx.lineTo(ix - 1, iy - 4);
    ctx.lineTo(ix + 11, iy - 4);
    ctx.lineTo(ix + 11, iy + 8);
    ctx.lineTo(ix - 11, iy + 8);
    ctx.closePath(); ctx.stroke();

    // 剪刀
    ix += 62;
    ctx.beginPath();
    ctx.arc(ix - 5, iy + 6, 3.2, 0, Math.PI * 2);
    ctx.arc(ix + 5, iy + 6, 3.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ix - 3.5, iy + 4); ctx.lineTo(ix + 6, iy - 9);
    ctx.moveTo(ix + 3.5, iy + 4); ctx.lineTo(ix - 6, iy - 9);
    ctx.stroke();

    // 下拉小箭头
    ix += 26;
    ctx.beginPath();
    ctx.moveTo(ix - 4, iy + 1); ctx.lineTo(ix, iy + 5); ctx.lineTo(ix + 4, iy + 1);
    ctx.stroke();

    // ── 右下角：展开编辑器图标 + 发送(S) ──
    const sendY = H - 30;
    ctx.strokeStyle = '#9a9a9a';
    ctx.lineWidth = 1.6;
    const expandX = W - 170;
    ctx.beginPath();
    ctx.moveTo(expandX, sendY + 8); ctx.lineTo(expandX, sendY - 8); ctx.lineTo(expandX + 14, sendY - 8);
    ctx.moveTo(expandX + 24, sendY - 8); ctx.lineTo(expandX + 26, sendY - 8); ctx.lineTo(expandX + 26, sendY + 8);
    ctx.lineTo(expandX + 12, sendY + 8);
    ctx.stroke();

    // 发送按钮
    ctx.fillStyle = '#f2f2f2';
    rr(ctx, W - 140, sendY - 16, 104, 32, 4);
    ctx.fill();
    ctx.strokeStyle = '#e2e2e2';
    ctx.lineWidth = 1;
    rr(ctx, W - 140, sendY - 16, 104, 32, 4);
    ctx.stroke();
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '14px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('发送(S)', W - 88, sendY + 1);
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
      rr(ctx, bubbleX, bubbleY, cardW, cardH, 4);
      ctx.fill();
      ctx.strokeStyle = '#ededed';
      ctx.lineWidth = 1;
      rr(ctx, bubbleX, bubbleY, cardW, cardH, 4);
      ctx.stroke();

      const iconW = 46, iconH = 56;
      const iconX = bubbleX + cardW - iconW - 14;
      const iconY = bubbleY + 14;

      // 文件名（过长自动换行，最多两行）
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '15px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const nameMaxW = cardW - iconW - 44;
      const rawName = msg.name || '文件';
      const nm = wrapText(ctx, rawName, nameMaxW).slice(0, 2);
      nm.forEach((ln, i) => {
        ctx.fillText(ln, bubbleX + 16, bubbleY + 26 + i * 21);
      });

      // 文件大小
      ctx.fillStyle = '#9a9a9a';
      ctx.font = '13px ' + FONT;
      ctx.fillText(msg.size || '', bubbleX + 16, bubbleY + 26 + nm.length * 21 + 4);

      // 右侧文件类型图标（纸张形状 + 折角 + 类型标签）
      ctx.fillStyle = iconStyle.color;
      ctx.beginPath();
      ctx.moveTo(iconX, iconY);
      ctx.lineTo(iconX + iconW - 12, iconY);
      ctx.lineTo(iconX + iconW, iconY + 12);
      ctx.lineTo(iconX + iconW, iconY + iconH);
      ctx.lineTo(iconX, iconY + iconH);
      ctx.closePath();
      ctx.fill();
      // 折角
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(iconX + iconW - 12, iconY);
      ctx.lineTo(iconX + iconW, iconY + 12);
      ctx.lineTo(iconX + iconW - 12, iconY + 12);
      ctx.closePath();
      ctx.fill();
      // 类型文字
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = iconStyle.label === 'X' ? 'XLS' : iconStyle.label === 'W' ? 'DOC' : 'PDF';
      ctx.fillText(label, iconX + iconW / 2, iconY + iconH - 16);

      // 底部分隔线
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(bubbleX + 1, bubbleY + cardH - 32, cardW - 2, 1);

      // 底部：微信小图标 + "微信电脑版"
      const fy = bubbleY + cardH - 16;
      ctx.fillStyle = '#07c160';
      rr(ctx, bubbleX + 16, fy - 6, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(bubbleX + 20, fy - 1.5, 1.3, 0, Math.PI * 2);
      ctx.arc(bubbleX + 24, fy - 1.5, 1.0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#9a9a9a';
      ctx.font = '12px ' + FONT;
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
    const WW = lay.W, HH = lay.H;

    const canvas = document.createElement('canvas');
    canvas.width = WW * 2;
    canvas.height = HH * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, WW, HH);

    const areaTop = DL.titleBarH;
    const inputH = config.hideInputBar ? 0 : DL.inputH;
    const areaH = HH - areaTop - inputH;

    // 聊天区背景：浅灰（参考图 #f5f5f5）
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, areaTop, WW, areaH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, areaTop, WW, areaH);
    ctx.clip();
    ctx.translate(0, areaTop - lay.offset);
    lay.blocks.forEach(b => drawBlock(ctx, lay, b));
    ctx.restore();

    drawTitleBar(ctx, lay, config);
    drawFloatButtons(ctx, lay);
    if (!config.hideInputBar) drawInputBar(ctx, lay);

    return canvas;
  }

  window.WXDesktop = {
    render: renderDesktop,
    DL: DL,
    buildLayout: buildLayout
  };
})();
