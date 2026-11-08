# Technical paper .md -> .docx in the UTP FYP2 format (TNR 11, 1.5 spacing, justified, 2.5 cm margins, A4).
# usage: uv run --no-project --with pypandoc-binary --with python-docx python build_docx.py TECHNICAL_PAPER.md TECHNICAL_PAPER.docx
import re
import sys
from pathlib import Path

import pypandoc
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

src, out = Path(sys.argv[1]), Path(sys.argv[2])
md = src.read_text()
md = re.sub(r'<div align="center">Figure \d+[^<]*</div>\n', "", md)  # pandoc's figure caption replaces it
md = re.sub(r'<div align="center">(Table \d+[^<]*)</div>', r"::: tablecap\n\1\n:::", md)
md = md.replace(r"\tag{1}", r"\qquad (1)")
pypandoc.convert_text(md, "docx", format="markdown", outputfile=str(out),
                      extra_args=[f"--resource-path={src.parent}"])

doc = Document(str(out))
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
for side in ("top_margin", "bottom_margin", "left_margin", "right_margin"):
    setattr(sec, side, Cm(2.5))
TEXT_W = Cm(16)


def font(run, size=11, bold=None):
    run.font.name = "Times New Roman"
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "Times New Roman")
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor(0, 0, 0)
    if bold is not None:
        run.font.bold = bold


for st in doc.styles:
    if st.type == 1:  # paragraph styles
        st.font.name, st.font.size = "Times New Roman", Pt(11)
        st.font.color.rgb = RGBColor(0, 0, 0)
        st.font.italic = False if st.name.startswith("Heading") else st.font.italic

body = list(doc.paragraphs)
abstract_at = next(i for i, p in enumerate(body) if p.text.strip() == "ABSTRACT")
keywords_at = next(i for i, p in enumerate(body) if p.text.startswith("Keywords"))
refs_at = next(i for i, p in enumerate(body) if p.text.strip() == "REFERENCES")
for i, p in enumerate(body):
    pf = p.paragraph_format
    heading = p.style.name.startswith("Heading")
    pf.line_spacing = 1.0 if abstract_at < i <= keywords_at else 1.5
    pf.space_before, pf.space_after = Pt(0), Pt(11)  # one blank line between paragraphs
    for r in p.runs:
        font(r, bold=True if heading else None)
    if i < abstract_at:                                   # title block
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pf.line_spacing, pf.space_after = 1.0, Pt(6)
    elif heading:
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        pf.keep_with_next = True
    elif re.match(r"(Table|Figure) \d+ ", p.text) or p._p.xpath(".//w:drawing") or p._p.xpath(".//m:oMathPara"):
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pf.line_spacing = 1.0
        if p.text.startswith("Table"):
            pf.keep_with_next, pf.space_after = True, Pt(4)
        if p._p.xpath(".//w:drawing"):
            pf.keep_with_next, pf.space_after = True, Pt(4)
    else:
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    if i > refs_at:  # reference list single-spaced, like the abstract
        pf.line_spacing, pf.space_after = 1.0, Pt(4)

for shape in doc.inline_shapes:  # wide diagram at text width, charts at 12 cm
    w = TEXT_W if shape.width > 3 * shape.height else Cm(12)
    shape.height, shape.width = int(shape.height * w / shape.width), w


def border_all(table):
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{edge}")
        e.set(qn("w:val"), "single"), e.set(qn("w:sz"), "4"), e.set(qn("w:color"), "000000")
        borders.append(e)
    table._tbl.tblPr.append(borders)


for t in doc.tables:
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    border_all(t)
    for ri, row in enumerate(t.rows):
        for cell in row.cells:
            for p in cell.paragraphs:
                p.paragraph_format.line_spacing, p.paragraph_format.space_after = 1.0, Pt(0)
                for r in p.runs:
                    font(r, bold=True if ri == 0 else None)

doc.save(str(out))
print("wrote", out)
