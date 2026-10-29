# -*- coding: utf-8 -*-
"""把项目聊天截图写入「附件N.项目进度沟通记录」Word 文档。

用法：
    python put_shots_to_docx.py --doc <docx路径> --shots <图片目录或文件...>
                                [--caption 前缀] [--new]

--new 表示目标文档不存在时新建；已存在则清空原有图片后重写。
"""
import argparse, glob, os, sys
from docx import Document
from docx.shared import Cm, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn

CN_NUM = '零一二三四五六七八九十'


def fit_width_cm(doc):
    sec = doc.sections[0]
    return sec.page_width.cm - sec.left_margin.cm - sec.right_margin.cm


def clear_body(doc):
    """删除正文全部内容（保留节属性）"""
    body = doc.element.body
    for child in list(body):
        if child.tag == qn('w:sectPr'):
            continue
        body.remove(child)


def add_caption(doc, text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.font.size = Pt(11)
    run.bold = True
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--doc', required=True)
    ap.add_argument('--shots', nargs='+', required=True)
    ap.add_argument('--title', default='项目进度沟通记录')
    ap.add_argument('--prefix', default='聊天记录')
    ap.add_argument('--new', action='store_true')
    args = ap.parse_args()

    files = []
    for s in args.shots:
        if os.path.isdir(s):
            files.extend(sorted(glob.glob(os.path.join(s, '*.jpg')) + glob.glob(os.path.join(s, '*.png'))))
        else:
            files.extend(sorted(glob.glob(s)))
    if not files:
        print('没有找到图片'); sys.exit(1)

    # 打开或新建
    if os.path.exists(args.doc):
        doc = Document(args.doc)
        clear_body(doc)
    else:
        doc = Document()
        sec = doc.sections[0]
        sec.left_margin = Cm(3.17)
        sec.right_margin = Cm(3.17)

    # 标题
    h = doc.add_paragraph()
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    hr = h.add_run(args.title)
    hr.bold = True
    hr.font.size = Pt(16)

    width = min(fit_width_cm(doc), 15.5)

    for i, f in enumerate(files, start=1):
        cap = doc.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cr = cap.add_run(f'{args.prefix}（{i}/{len(files)}）')
        cr.font.size = Pt(10)

        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run().add_picture(f, width=Cm(width))

        if i < len(files):
            doc.add_page_break()

    doc.save(args.doc)
    print(f'已写入 {len(files)} 张 -> {args.doc}')


main()
