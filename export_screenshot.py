# -*- coding: utf-8 -*-
"""
微信聊天截图生成器 - Playwright 截图脚本
用法：
  python export_screenshot.py --config configs/example.json --output output/example_01.png
  python export_screenshot.py --config configs/example.json --all   # 按时间戳分段导出多张
"""
import json
import os
import sys
import argparse
import asyncio
import tempfile

from playwright.async_api import async_playwright

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DEVICE_SIZES = {
    'iphone-14pro': (393, 852),
    'iphone-15': (393, 852),
    'iphone-se': (375, 667),
    'huawei-mate60': (393, 852),
    'huawei-p60': (390, 844),
    'honor-magic6': (393, 852),
    'honor-90': (388, 840),
    'xiaomi-14pro': (402, 874),
    'xiaomi-k70': (393, 852),
    'oppo-findx7': (393, 868),
    'vivo-x100': (393, 873),
}


def build_html(config):
    """生成独立HTML（内嵌配置，避免跨域问题）"""
    with open(os.path.join(BASE_DIR, 'js', 'render.js'), 'r', encoding='utf-8') as f:
        render_js = f.read()
    with open(os.path.join(BASE_DIR, 'css', 'wechat.css'), 'r', encoding='utf-8') as f:
        css = f.read()

    config_json = json.dumps(config, ensure_ascii=False)
    # 把相对头像路径转为 file:// 绝对路径
    avatar_prefix = 'file:///' + BASE_DIR.replace('\\', '/') + '/'
    config_json = config_json.replace('avatars/', avatar_prefix + 'avatars/')

    long_mode = config.get('longMode', False)

    html = f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
{css}
html, body {{ margin:0; padding:0; background:#ededed; }}
#wrap {{ display:inline-block; }}
.long-screenshot {{ height:auto !important; }}
.long-screenshot .chat-area {{ position:static; overflow:visible; }}
.long-screenshot .input-bar {{ position:static; }}
</style></head>
<body>
<div id="wrap"><div class="phone-frame" id="phoneFrame"></div></div>
<script>
{render_js}
const cfg = {config_json};
cfg.longMode = {str(long_mode).lower()};
WXRenderer.renderPhone(cfg, document.getElementById('phoneFrame'));
</script>
</body></html>'''
    return html


async def screenshot(config, output_path, scale=3):
    """用Playwright渲染并截图"""
    html = build_html(config)
    device = config.get('device', 'iphone-14pro')
    width, height = DEVICE_SIZES.get(device, (393, 852))
    long_mode = config.get('longMode', False)

    # 写临时HTML
    tmp = tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8')
    tmp.write(html)
    tmp.close()

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page(
                viewport={'width': width, 'height': height},
                device_scale_factor=scale
            )
            await page.goto('file:///' + tmp.name.replace('\\', '/'))
            await page.wait_for_timeout(800)

            if long_mode:
                await page.screenshot(path=output_path, full_page=True)
            else:
                frame = await page.query_selector('#phoneFrame')
                await frame.screenshot(path=output_path)

            await browser.close()
        print(f'  OK: {output_path}')
        return True
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


def split_by_time(config):
    """按时间戳消息把聊天记录分成多段，每段生成一张截图"""
    messages = config.get('messages', [])
    segments = []
    current = []

    for msg in messages:
        if msg.get('type') == 'time' and current:
            segments.append(current)
            current = [msg]
        else:
            current.append(msg)
    if current:
        segments.append(current)

    result = []
    for i, seg in enumerate(segments, 1):
        new_cfg = dict(config)
        new_cfg['messages'] = seg
        new_cfg['longMode'] = False
        result.append((i, new_cfg))
    return result


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True, help='JSON配置文件路径')
    parser.add_argument('--output', help='输出图片路径')
    parser.add_argument('--all', action='store_true', help='按时间戳分段导出多张')
    parser.add_argument('--scale', type=int, default=3, help='缩放倍数（默认3）')
    args = parser.parse_args()

    with open(args.config, 'r', encoding='utf-8') as f:
        config = json.load(f)

    if args.all:
        base_name = os.path.splitext(os.path.basename(args.config))[0]
        out_dir = os.path.join(BASE_DIR, 'output')
        os.makedirs(out_dir, exist_ok=True)
        segments = split_by_time(config)
        print(f'共 {len(segments)} 段，开始导出...')
        for i, seg_cfg in segments:
            out_path = os.path.join(out_dir, f'{base_name}_{i:02d}.png')
            await screenshot(seg_cfg, out_path, args.scale)
    else:
        if not args.output:
            args.output = os.path.join(BASE_DIR, 'output', 'screenshot.png')
        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        await screenshot(config, args.output, args.scale)


if __name__ == '__main__':
    asyncio.run(main())
