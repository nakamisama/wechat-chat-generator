# -*- coding: utf-8 -*-
"""项目配置打包 / 还原。

项目配置、项目专用头像、现场照片都只保留在本地（不入 git）。
换电脑时用本脚本打包成一个 .zip，带到新机器再还原即可。

用法：
    # 导出（在旧电脑）
    python project_config.py export -o D:/备份/微信配置_20251101.zip

    # 导入（在新电脑，先 clone 仓库）
    python project_config.py import -i D:/备份/微信配置_20251101.zip

    # 查看当前本地有哪些项目
    python project_config.py list
"""
import argparse, json, os, sys, zipfile

BASE = os.path.dirname(os.path.abspath(__file__))

# 需要随配置一起迁移的本地资源
INCLUDE_DIRS = [
    'configs',
    'avatars/projects',
]
INCLUDE_GLOBS = [
    'assets/gen_*.jpg',
    'assets/gen_*.png',
]
EXCLUDE = {'configs/_template.json'}


def collect():
    """收集需要打包的文件（相对路径）"""
    import glob
    files = []
    for d in INCLUDE_DIRS:
        root = os.path.join(BASE, d)
        if not os.path.isdir(root):
            continue
        for dirpath, _, names in os.walk(root):
            for n in names:
                full = os.path.join(dirpath, n)
                rel = os.path.relpath(full, BASE).replace('\\', '/')
                if rel in EXCLUDE:
                    continue
                files.append(rel)
    for g in INCLUDE_GLOBS:
        for full in glob.glob(os.path.join(BASE, g)):
            rel = os.path.relpath(full, BASE).replace('\\', '/')
            if rel not in files:
                files.append(rel)
    return sorted(files)


def cmd_list(args):
    cfg_dir = os.path.join(BASE, 'configs')
    if not os.path.isdir(cfg_dir):
        print('configs 目录不存在')
        return
    rows = []
    for n in sorted(os.listdir(cfg_dir)):
        if not n.endswith('.json') or n == '_template.json':
            continue
        p = os.path.join(cfg_dir, n)
        try:
            d = json.load(open(p, encoding='utf-8'))
        except Exception as e:
            print(f'  {n}  解析失败: {e}')
            continue
        mode = d.get('mode', 'mobile')
        who = d.get('opponent', {}).get('name') or d.get('group', {}).get('name') or ''
        rows.append((n[:-5], d.get('title', ''), mode, who, len(d.get('messages', []))))
    if not rows:
        print('暂无本地项目配置')
        return
    print(f'{"key":<12}{"标题":<22}{"端":<10}{"对方":<24}{"消息数"}')
    for k, t, m, w, n in rows:
        print(f'{k:<12}{t:<22}{m:<10}{w:<24}{n}')


def cmd_export(args):
    files = collect()
    if not files:
        print('没有可导出的文件')
        return
    out = args.output
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for rel in files:
            z.write(os.path.join(BASE, rel), rel)
    size = os.path.getsize(out) / 1024 / 1024
    print(f'已导出 {len(files)} 个文件 -> {out}  ({size:.1f} MB)')
    for rel in files:
        print('  ', rel)


def cmd_import(args):
    src = args.input
    if not os.path.exists(src):
        print(f'文件不存在: {src}')
        sys.exit(1)
    with zipfile.ZipFile(src) as z:
        names = z.namelist()
        # 安全检查：禁止绝对路径 / 上跳
        for n in names:
            if n.startswith('/') or '..' in n.split('/'):
                print(f'压缩包含非法路径，已中止: {n}')
                sys.exit(1)
        for n in names:
            target = os.path.join(BASE, n)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with z.open(n) as fsrc, open(target, 'wb') as fdst:
                fdst.write(fsrc.read())
    print(f'已还原 {len(names)} 个文件到 {BASE}')
    cmd_list(args)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)

    p_list = sub.add_parser('list', help='列出本地项目配置')
    p_list.set_defaults(func=cmd_list)

    p_exp = sub.add_parser('export', help='打包本地配置与素材')
    p_exp.add_argument('-o', '--output', required=True, help='输出 zip 路径')
    p_exp.set_defaults(func=cmd_export)

    p_imp = sub.add_parser('import', help='从 zip 还原')
    p_imp.add_argument('-i', '--input', required=True, help='zip 路径')
    p_imp.set_defaults(func=cmd_import)

    args = ap.parse_args()
    args.func(args)


main()
