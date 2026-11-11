# Technical Paper (FYP 2)

- `TECHNICAL_PAPER.docx`: the submission file, already formatted to the FYP 2 rules:
  - A4 page, one column, 2.5 cm margins;
  - Times New Roman 11 pt, 1.5 line spacing, justified, one blank line between paragraphs;
  - the abstract and the reference list single-spaced;
  - table titles above the tables, figure titles below the figures;
  - the equation in Word equation format.
- `TECHNICAL_PAPER.md`: the same text in Markdown.
- `figures/`: the figures as 300 dpi JPEGs, to attach separately as the rules require.
- `build_docx.py`: rebuilds the .docx from the .md if you edit the Markdown instead of the Word file.

**Checks against the rules:**
- the title has 10 words;
- the abstract has 269 words, so the remaining `[TO FILL]` RQ2 sentence still fits under 300;
- there are 6 keywords, none repeated from the title;
- headings use at most two levels;
- there are 25 IEEE references, numbered in order of first citation.

**Length:** a test render with Times-compatible font metrics came to about 5.5 pages. That leaves roughly half a page for the
RQ2 rows and the user-study table. After filling them in, check the page count in Word, and cut text from the Discussion first if it runs over 6.

**Still to fill** (search for `[TO FILL]`):
- the corresponding e-mail address;
- the RQ2 results (abstract, Section 4.2, Conclusions); the user-study text now reports the synthetic pipeline validation only;
- the acknowledgment.
