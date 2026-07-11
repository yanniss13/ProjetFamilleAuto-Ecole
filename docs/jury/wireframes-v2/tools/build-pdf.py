# Assemble le PDF de présentation des 30 wireframes v2 : couverture, sommaire,
# puis une page A4 paysage par écran (titre, route, acteur, image entière,
# numéro de page). Usage : python docs/jury/wireframes-v2/tools/build-pdf.py
import json
import re
import subprocess
import sys
from pathlib import Path

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "wireframes-v2.pdf"
LARGEUR, HAUTEUR = landscape(A4)
MARGE = 36

# Le manifeste CommonJS est la source de vérité : on le lit via node pour ne
# pas dupliquer la liste des écrans dans ce script.
manifeste = json.loads(subprocess.check_output(
    ["node", "-e",
     "console.log(JSON.stringify(require(process.argv[1])))",
     str(RACINE / "screens.cjs")],
    text=True, encoding="utf-8"))


def pied(c, numero):
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0.36, 0.39, 0.44)
    c.drawRightString(LARGEUR - MARGE, MARGE / 2, f"page {numero} / {len(manifeste) + 2}")


c = canvas.Canvas(str(SORTIE), pagesize=landscape(A4))
c.setTitle("MoniteurConnect — wireframes v2")

# Page 1 : couverture.
c.setFillColorRGB(0.10, 0.30, 0.56)
c.setFont("Helvetica-Bold", 30)
c.drawString(MARGE, HAUTEUR - 130, "MoniteurConnect — wireframes v2")
c.setFillColorRGB(0.12, 0.16, 0.20)
c.setFont("Helvetica", 14)
c.drawString(MARGE, HAUTEUR - 170, "30 écrans et états filaires conformes à l'application livrée (lots A à L).")
c.drawString(MARGE, HAUTEUR - 192, "Maquettes v1 de juin 2026 conservées intactes ; cette v2 est datée du 2026-07-11.")
c.setFont("Helvetica", 11)
c.setFillColorRGB(0.36, 0.39, 0.44)
c.drawString(MARGE, HAUTEUR - 230, "Sources HTML navigables : docs/jury/wireframes-v2/index.html — matrice de traçabilité : matrice-couverture.md")
pied(c, 1)
c.showPage()

# Page 2 : sommaire.
c.setFillColorRGB(0.10, 0.30, 0.56)
c.setFont("Helvetica-Bold", 20)
c.drawString(MARGE, HAUTEUR - 60, "Sommaire")
c.setFont("Helvetica", 9.5)
colonnes = [MARGE, LARGEUR / 2 + 10]
par_colonne = 15
for i, s in enumerate(manifeste):
    x = colonnes[i // par_colonne]
    y = HAUTEUR - 100 - (i % par_colonne) * 28
    c.setFillColorRGB(0.12, 0.16, 0.20)
    c.drawString(x, y, f"{i + 3}. {s['title']} ({s['section']})")
    c.setFillColorRGB(0.36, 0.39, 0.44)
    c.drawString(x + 14, y - 11, f"{s['route']} — {s['view']}")
pied(c, 2)
c.showPage()

# Pages 3 à 32 : un écran par page, image entière proportionnée.
for i, s in enumerate(manifeste):
    png = RACINE / "png" / re.sub(r"\.html$", ".png", s["filename"])
    image = ImageReader(str(png))
    il, ih = image.getSize()
    c.setFillColorRGB(0.10, 0.30, 0.56)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(MARGE, HAUTEUR - 42, s["title"])
    c.setFillColorRGB(0.36, 0.39, 0.44)
    c.setFont("Helvetica", 10)
    c.drawString(MARGE, HAUTEUR - 58, f"{s['route']} — {s['view']} — {s['role']} · {s['state']}")
    zone_h = HAUTEUR - 90 - MARGE
    zone_l = LARGEUR - 2 * MARGE
    echelle = min(zone_l / il, zone_h / ih)
    c.drawImage(image, MARGE, HAUTEUR - 90 - ih * echelle,
                width=il * echelle, height=ih * echelle)
    pied(c, i + 3)
    c.showPage()

c.save()
print(f"PDF écrit : {SORTIE.name}, {len(manifeste) + 2} pages attendues.")
