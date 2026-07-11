# Exporte tous les Markdown du dossier jury en PDF sous docs/jury/pdf/
# (arborescence miroir). Chaîne : python-markdown (tables, code) → HTML habillé
# aux couleurs de la charte → Edge headless --print-to-pdf. Les liens relatifs
# vers un .md converti pointent vers son PDF (URL absolue de cette machine) ;
# images et autres liens relatifs sont résolus via <base href>.
# Usage : python scripts/pdf-jury.py
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import markdown
from pypdf import PdfReader

RACINE = Path(__file__).resolve().parent.parent
JURY = RACINE / "docs" / "jury"
SORTIE = JURY / "pdf"
EDGES = [
    Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
    Path("C:/Program Files/Microsoft/Edge/Application/msedge.exe"),
]

STYLE = """
body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2933;line-height:1.55;
     max-width:960px;margin:0 auto;padding:24px;font-size:13px}
h1{color:#2563eb;font-size:24px;border-bottom:2px solid #2563eb;padding-bottom:6px}
h2{color:#2563eb;font-size:18px;margin-top:26px}
h3{color:#1d4ed8;font-size:15px}
a{color:#2563eb;text-decoration:none}
code{background:#eef2f7;padding:1px 5px;border-radius:4px;font-size:12px}
pre{background:#eef2f7;padding:10px;border-radius:6px;overflow-x:hidden;
    white-space:pre-wrap;overflow-wrap:anywhere}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:11.5px}
th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top;
      overflow-wrap:anywhere}
th{background:#eff6ff;color:#1d4ed8;overflow-wrap:normal}
tr{page-break-inside:avoid}
img{max-width:100%;border:1px solid #e5e7eb;border-radius:6px}
blockquote{border-left:4px solid #2563eb;margin:12px 0;padding:4px 14px;
           color:#5b6470;background:#f8fafc}
li{margin:3px 0}
h1,h2,h3{page-break-after:avoid}
.pied-doc{margin-top:28px;border-top:1px dashed #cbd5e1;padding-top:8px;
          color:#5b6470;font-size:10.5px}
@page{size:A4;margin:14mm 12mm}
"""


def edge():
    for chemin in EDGES:
        if chemin.exists():
            return str(chemin)
    sys.exit("Microsoft Edge introuvable (chemins Program Files).")


def reecrit_liens(html, dossier_source, convertis):
    """Fait pointer les liens relatifs vers un .md converti sur son PDF."""
    def remplace(m):
        cible = m.group(1)
        if re.match(r"^(https?:|mailto:|#|file:)", cible):
            return m.group(0)
        absolu = (dossier_source / re.sub(r"#.*$", "", cible)).resolve()
        if absolu in convertis:
            pdf = SORTIE / absolu.relative_to(JURY).with_suffix(".pdf")
            return f'href="{pdf.as_uri()}"'
        return m.group(0)
    return re.sub(r'href="([^"]+)"', remplace, html)


def main():
    # La console Windows est en cp1252 par défaut : sans cela, ✓/✗ plantent.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sources = sorted(p for p in JURY.rglob("*.md") if SORTIE not in p.parents)
    convertis = {p.resolve() for p in sources}
    navigateur = edge()
    echecs = []
    with tempfile.TemporaryDirectory(prefix="pdf-jury-") as tmp:
        profil = Path(tmp) / "profil"
        for source in sources:
            relatif = source.relative_to(JURY)
            texte = source.read_text(encoding="utf-8")
            corps = markdown.markdown(
                texte, extensions=["tables", "fenced_code", "sane_lists"])
            corps = reecrit_liens(corps, source.parent, convertis)
            titre_h1 = re.search(r"^# (.+)$", texte, re.M)
            titre = titre_h1.group(1) if titre_h1 else source.stem
            html = (
                "<!doctype html><html lang='fr'><head><meta charset='utf-8'>"
                f"<title>{titre}</title><base href='{source.parent.as_uri()}/'>"
                f"<style>{STYLE}</style></head><body>{corps}"
                f"<p class='pied-doc'>MoniteurConnect — dossier jury DWWM · "
                f"source : docs/jury/{relatif.as_posix()}</p></body></html>"
            )
            page = Path(tmp) / relatif.with_suffix(".html")
            page.parent.mkdir(parents=True, exist_ok=True)
            page.write_text(html, encoding="utf-8")

            pdf = SORTIE / relatif.with_suffix(".pdf")
            pdf.parent.mkdir(parents=True, exist_ok=True)
            r = subprocess.run(
                [navigateur, "--headless=new", f"--print-to-pdf={pdf}",
                 "--no-pdf-header-footer", f"--user-data-dir={profil}",
                 "--no-first-run", page.as_uri()],
                capture_output=True, timeout=120)
            try:
                pages = len(PdfReader(str(pdf)).pages)
                print(f"  ✓ {relatif.as_posix()} -> pdf/{relatif.with_suffix('.pdf').as_posix()} ({pages} p.)")
            except Exception as err:  # PDF absent ou illisible
                echecs.append(relatif.as_posix())
                print(f"  ✗ {relatif.as_posix()} : {err} (code Edge {r.returncode})")

    print(f"\n{len(sources) - len(echecs)}/{len(sources)} PDF dans {SORTIE}")
    sys.exit(1 if echecs else 0)


if __name__ == "__main__":
    main()
