# -*- coding: utf-8 -*-
"""按项目配置导出 Windows 微信（PC 端）聊天截图。

项目配置只保留本地（configs/<key>.json），脚本本身不含任何客户信息。

用法：
    python regen_project.py --config daxing
    python regen_project.py --config daxing --out "D:/某项目/聊天记录截图"
    python regen_project.py --config daxing --label 项目A --out ...

--label  输出文件名前缀，默认取配置里的 title
--out    归档目录，默认 output/
"""
import argparse, asyncio, base64, glob, os, shutil, sys
from playwright.async_api import async_playwright

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'output')
PORT = 8899

JS_MEASURE = '''() => {
    const cfg = Object.assign({}, config, { scrollToMsg: 0, forceOffset: 0 });
    return WXDesktop.buildLayout(cfg).then(lay => {
        const rows = lay.blocks.filter(b => b.kind === 'row')
            .map(b => ({ mi: b.mi, y: b.y, h: b.h }));
        return { availH: lay.availH, contentH: lay.contentH, rows: rows };
    });
}'''

JS_RENDER = '''async (args) => {
    const [off] = args;
    const cfg = Object.assign({}, config, { scrollToMsg: 0, forceOffset: off });
    const c = await WXDesktop.render(cfg);
    const c2 = document.createElement('canvas');
    c2.width = c.width; c2.height = c.height;
    const x = c2.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, c2.width, c2.height);
    x.drawImage(c, 0, 0);
    return c2.toDataURL('image/jpeg', 0.92);
}'''


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', required=True, help='configs 下的配置名（不含 .json）')
    ap.add_argument('--label', default=None, help='输出文件名前缀，默认用配置 title')
    ap.add_argument('--out', default=None, help='归档目录，默认 output/')
    ap.add_argument('--port', type=int, default=PORT)
    args = ap.parse_args()

    cfg_path = os.path.join(BASE, 'configs', args.config + '.json')
    if not os.path.exists(cfg_path):
        print(f'配置不存在: {cfg_path}')
        print('提示：项目配置只保留本地，换电脑请先执行 python project_config.py import -i <zip>')
        sys.exit(1)

    import json
    cfg = json.load(open(cfg_path, encoding='utf-8'))
    label = args.label or cfg.get('title') or args.config

    for f in glob.glob(os.path.join(OUT, label + '_*.jpg')):
        os.remove(f)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto(f'http://localhost:{args.port}/index.html')
        await page.wait_for_timeout(1800)

        await page.evaluate('''async (name) => {
            const r = await fetch('configs/' + name + '.json');
            const cfg = await r.json();
            applyConfig(cfg);
        }''', args.config)
        await page.wait_for_timeout(1600)

        geo = await page.evaluate(JS_MEASURE)
        availH, contentH, rows = geo['availH'], geo['contentH'], geo['rows']
        print(f'  {label}: 可视高 {availH:.0f}，内容高 {contentH:.0f}，消息 {len(rows)} 条')

        starts = []
        off = 0
        while True:
            # 顶部对齐：若 off 落在某条消息中间，上移到该条起点
            for r in rows:
                if r['y'] < off < r['y'] + r['h']:
                    off = max(0, r['y'] - 8)
                    break
            starts.append(off)
            if off + availH >= contentH - 2:
                break
            off = off + availH

        # 末屏贴底，但若与上一屏重叠过多（<120px 新内容）则不追加
        if starts:
            last = starts[-1]
            if last + availH < contentH - 2:
                bottom_start = max(0, contentH - availH)
                if bottom_start - last > 120:
                    starts.append(bottom_start)

        starts = sorted(set(int(round(s)) for s in starts))
        print(f'  计划 {len(starts)} 张')

        for i, s in enumerate(starts, start=1):
            url = await page.evaluate(JS_RENDER, [s])
            fn = f'{label}_{i:02d}.jpg'
            path = os.path.join(OUT, fn)
            with open(path, 'wb') as f:
                f.write(base64.b64decode(url.split(',', 1)[1]))
            print(f'  OK: {fn}  offset={s}  ({os.path.getsize(path)//1024} KB)')

        await browser.close()

    if args.out:
        os.makedirs(args.out, exist_ok=True)
        for f in glob.glob(os.path.join(args.out, '*.jpg')) + glob.glob(os.path.join(args.out, '*.png')):
            os.remove(f)
        files = sorted(glob.glob(os.path.join(OUT, label + '_*.jpg')))
        for f in files:
            shutil.copy2(f, args.out)
        print(f'已归档 {len(files)} 张 -> {args.out}')


asyncio.run(main())
