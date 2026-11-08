# Dissertation

- `DISSERTATION.md`: the full draft, in the UTP order (front matter, Chapters 1–5, references, appendices).
  It uses IEEE citations, numbered in order of first citation, and every DOI was checked against Crossref or DataCite.
- `figures/`: every figure it uses. The charts and screenshots come from the real system and real results.
- `research_table_a.md`: the verified hydraulic-dataset benchmarks behind Tables 2.1 and 4.4.

Search for `[TO FILL]` to find everything that still needs your input or results that don't exist yet
(the semester and date, the acknowledgements, the RQ2 small-model run, the usefulness ratings, the user study,
Part D and the Advisor screenshot).

## To Word (for the UTP format)

```bash
pandoc DISSERTATION.md -o DISSERTATION.docx --resource-path=. --toc
```

Then, in Word, apply the format rules: Times New Roman 12 pt, 1.5 line spacing, margins of 25 mm (top, bottom
and right) and 40 mm (left), chapter headings in bold capitals at 14 pt, page numbers at the bottom centre
(roman numerals for the front matter), and the table of contents under References → Table of Contents.
The body is about 13,000 words plus 16 figures, which is close to the 50-page limit. If it runs over, shrink the
screenshots (Figures 4.4–4.9) to half-page width first.
