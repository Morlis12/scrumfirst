"""Generation de la presentation ScrumFirst (DataOps) - Version Pro Executive."""

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt, Emu
import copy

# ────────────────────────────────────────────── PALETTE PROFESSIONNELLE
SAND       = RGBColor(248, 247, 242)   # fond crème chaleureux
NAVY       = RGBColor(0x0B, 0x12, 0x20) # bleu nuit profond
NAVY_MID   = RGBColor(0x16, 0x22, 0x3A)
NAVY_SOFT  = RGBColor(0x2D, 0x3E, 0x5E)
ACCENT     = RGBColor(0xE8, 0x7A, 0x2E) # orange terracotta - énergie, confiance
ACCENT_SOFT= RGBColor(0xF2, 0x9E, 0x4E)
WHITE      = RGBColor(0xFF, 0xFF, 0xFF)
GREY_LIGHT = RGBColor(0xE8, 0xEB, 0xF0)
GREEN_OK   = RGBColor(0x16, 0xA3, 0x4A)
RED_ALERT  = RGBColor(0xDC, 0x26, 0x26)

TITLE_FONT = "Calibri"
BODY_FONT  = "Calibri"

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

prs = Presentation()
prs.slide_width  = SLIDE_W
prs.slide_height = SLIDE_H
BLANK = prs.slide_layouts[6]

# ────────────────────────────────────────────── UTILS
def set_bg(slide, color=SAND):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color

def add_shape(slide, left, top, width, height, fill_color, line_color=None):
    shp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill_color
    if line_color:
        shp.line.color.rgb = line_color
        shp.line.width = Pt(1)
    else:
        shp.line.fill.background()
    shp.shadow.inherit = False
    return shp

def add_rounded(slide, left, top, width, height, fill_color, radius=0.15):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill_color
    shp.line.fill.background()
    shp.adjustments[0] = radius
    shp.shadow.inherit = False
    return shp

def add_text(slide, left, top, width, height, text, size=18, font=BODY_FONT,
             bold=False, color=NAVY, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
             space_after=6, line=1.15, name=None):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    p.alignment = align
    p.space_after = Pt(space_after)
    p.line_spacing = line
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.name = font
    r.font.color.rgb = color
    return tb

def add_rich(tf, segments, size=16, align=PP_ALIGN.LEFT, space_after=8, line=1.25, first=False):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    p.space_after = Pt(space_after)
    p.line_spacing = line
    for text, bold, clr in segments:
        r = p.add_run()
        r.text = text
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.name = BODY_FONT
        r.font.color.rgb = clr
    return p

def slide_header(slide, num, title, subtitle=None):
    add_shape(slide, Inches(0), Inches(0), Inches(0.16), SLIDE_H, NAVY)
    add_text(slide, Inches(0.7), Inches(0.38), Inches(1.4), Inches(0.35),
             f"0{num}", size=12, font=TITLE_FONT, bold=True, color=ACCENT)
    add_text(slide, Inches(0.7), Inches(0.75), Inches(12), Inches(1.0),
             title, size=34, font=TITLE_FONT, bold=True, color=NAVY, line=1.1)
    y = Inches(1.8)
    if subtitle:
        add_text(slide, Inches(0.72), Inches(1.65), Inches(11.5), Inches(0.5),
                 subtitle, size=16, font=BODY_FONT, color=NAVY_SOFT, line=1.3)
        y = Inches(2.2)
    add_shape(slide, Inches(0.72), y - Inches(0.1), Inches(2.5), Pt(4), ACCENT)
    return y + Inches(0.35)

def add_footer(slide, txt="ScrumFirst  •  Direction Data & Intelligence Artificielle  •  Confidentiel"):
    add_shape(slide, Inches(0), Inches(7.05), SLIDE_W, Inches(0.45), NAVY)
    add_text(slide, Inches(0.72), Inches(7.08), Inches(11), Inches(0.35),
             txt, size=10, font=BODY_FONT, color=ACCENT_SOFT)

def kpi_card(slide, x, y, w, h, label, value, delta=None, trend="up"):
    card = add_rounded(slide, x, y, w, h, WHITE, 0.08)
    add_text(slide, x + Inches(0.25), y + Inches(0.15), w - Inches(0.5), Inches(0.4),
             label, size=11, font=BODY_FONT, bold=True, color=NAVY_SOFT, align=PP_ALIGN.CENTER)
    add_text(slide, x + Inches(0.2), y + Inches(0.5), w - Inches(0.4), Inches(0.7),
             value, size=28, font=TITLE_FONT, bold=True, color=NAVY, align=PP_ALIGN.CENTER)
    if delta:
        clr = GREEN_OK if trend == "up" else RED_ALERT
        sym = "▲" if trend == "up" else "▼"
        add_text(slide, x + Inches(0.2), y + Inches(1.2), w - Inches(0.4), Inches(0.3),
                 f"{sym} {delta}", size=12, font=BODY_FONT, bold=True, color=clr, align=PP_ALIGN.CENTER)

def metric_row(slide, y, items):
    """items = [(label, value, color), ...]"""
    gap = Inches(0.15)
    card_w = (Inches(11.8) - gap * 3) / 4
    x_start = Inches(0.72)
    for i, (label, value, clr) in enumerate(items):
        x = x_start + (card_w + gap) * i
        add_rounded(slide, x, y, card_w, Inches(1.1), clr, 0.06)
        add_text(slide, x + Inches(0.15), y + Inches(0.1), card_w - Inches(0.3), Inches(0.35),
                 label, size=10, font=BODY_FONT, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
        add_text(slide, x + Inches(0.15), y + Inches(0.45), card_w - Inches(0.3), Inches(0.6),
                 value, size=22, font=TITLE_FONT, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

# ────────────────────────────────────────────── SLIDE 1 : COUVERTURE
s = prs.slides.add_slide(BLANK)
set_bg(s, NAVY)

# Bandeau latéral
add_shape(s, Inches(0), Inches(0), Inches(0.16), SLIDE_H, ACCENT)
# Ligne décorative
add_shape(s, Inches(1.2), Inches(2.0), Inches(2.8), Pt(4), ACCENT)

add_text(s, Inches(1.2), Inches(1.2), Inches(8), Inches(0.4),
         "PRÉSENTATION EXÉCUTIVE", size=14, font=TITLE_FONT, bold=True,
         color=ACCENT_SOFT, space_after=0)

add_text(s, Inches(1.2), Inches(2.2), Inches(10.5), Inches(2.2),
         "ScrumFirst\nL'Agilité à l'Échelle pour les Projets Data & IA",
         size=48, font=TITLE_FONT, bold=True, color=WHITE, line=1.1)

add_text(s, Inches(1.2), Inches(4.6), Inches(10), Inches(1.2),
         "Piloter la valeur continue · Automatiser la gouvernance · Structurer le DataOps",
         size=22, font=BODY_FONT, color=GREY_LIGHT, line=1.4)

# Badge version
badge = add_rounded(s, Inches(1.2), Inches(5.8), Inches(3.2), Inches(0.55), ACCENT, 0.2)
add_text(s, Inches(1.2), Inches(5.82), Inches(3.2), Inches(0.55),
         "v1.0  •  Direction Data & IA", size=13, font=BODY_FONT, bold=True,
         color=WHITE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

add_text(s, Inches(1.2), Inches(6.6), Inches(8), Inches(0.4),
         "Confidentiel — Usage interne uniquement",
         size=11, font=BODY_FONT, color=GREY_LIGHT)

# ────────────────────────────────────────────── SLIDE 2 : CONTEXTE & ENJEUX
s = prs.slides.add_slide(BLANK)
set_bg(s)
y = slide_header(s, 2, "Contexte : Le Mur Invisible du DataOps",
                 "Pourquoi les projets Data/IA échouent à l'industrialisation")

# 3 cartes problème
card_data = [
    ("🎯  Désalignement Métier–Tech",
     "Backlogs fragmentés, priorités opaques,\nROI non mesuré avant production"),
    ("🔧  Dette Technique Silencieuse",
     "Pas de Definition of Done uniforme,\npipelines non testés, modèles non versionnés"),
    ("👁️  Boîte Noire Gouvernance",
     "Aucune traçabilité des décisions,\naudit impossible, conformité risquée"),
]
x_start = Inches(0.72)
card_w = Inches(3.7)
gap = Inches(0.35)
for i, (title, desc) in enumerate(card_data):
    x = x_start + (card_w + gap) * i
    card = add_rounded(s, x, y, card_w, Inches(3.4), WHITE, 0.08)
    add_shape(s, x, y, card_w, Inches(0.06), ACCENT)
    add_text(s, x + Inches(0.3), y + Inches(0.25), card_w - Inches(0.6), Inches(0.7),
             title, size=16, font=TITLE_FONT, bold=True, color=NAVY)
    add_text(s, x + Inches(0.3), y + Inches(1.1), card_w - Inches(0.6), Inches(2.0),
             desc, size=14, font=BODY_FONT, color=NAVY_SOFT, line=1.4)

# Chiffre clé
add_rounded(s, Inches(0.72), y + Inches(3.8), Inches(11.8), Inches(1.0), NAVY_MID, 0.06)
add_text(s, Inches(1.0), y + Inches(3.9), Inches(11.2), Inches(0.8),
         "« 87 % des projets Data n'atteignent jamais la production »  —  Gartner 2023",
         size=18, font=TITLE_FONT, bold=True, color=ACCENT_SOFT, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

add_footer(s)

# ────────────────────────────────────────────── SLIDE 3 : LA SOLUTION SCRUMFIRST
s = prs.slides.add_slide(BLANK)
set_bg(s)
y = slide_header(s, 3, "ScrumFirst : Le DataOps Nativement Agile",
                 "Une plateforme qui structure, gouverne et accélère")

# 3 piliers
pillars = [
    ("📋", "Backlog Unifié\n& Value Scoring", "Un seul Product Backlog.\nChaque item porte un score\nde valeur métier quantifié."),
    ("✅", "Definition of Done\nAutomatisée", "Critères non négociables\n(tests, lineage, versioning).\nBlocage natif si DoD < 100 %."),
    ("🔄", "Multi-Équipes\nParallèles", "Team Data Eng. & Data Science\nsur le même backlog.\nSprints étanches, zéro conflit."),
]

x_start = Inches(0.72)
p_w = Inches(3.6)
gap = Inches(0.35)
for i, (icon, title, desc) in enumerate(pillars):
    x = x_start + (p_w + gap) * i
    # Cercle icône
    circ = s.shapes.add_shape(MSO_SHAPE.OVAL, x + Inches(1.15), y, Inches(1.3), Inches(1.3))
    circ.fill.solid()
    circ.fill.fore_color.rgb = ACCENT
    circ.line.fill.background()
    circ.shadow.inherit = False
    add_text(s, x + Inches(1.15), y + Inches(0.32), Inches(1.3), Inches(0.7),
             icon, size=36, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    add_text(s, x, y + Inches(1.55), p_w, Inches(0.7),
             title, size=17, font=TITLE_FONT, bold=True, color=NAVY, align=PP_ALIGN.CENTER)
    add_text(s, x + Inches(0.15), y + Inches(2.25), p_w - Inches(0.3), Inches(1.2),
             desc, size=13, font=BODY_FONT, color=NAVY_SOFT, align=PP_ALIGN.CENTER, line=1.4)

# Flèches de liaison
for i in range(2):
    x = x_start + (p_w + gap) * i + p_w + Inches(0.05)
    add_text(s, x, y + Inches(0.7), Inches(0.35), Inches(0.5),
             "→", size=28, bold=True, color=ACCENT, align=PP_ALIGN.CENTER)

# Bénéfices quantifiés
y2 = y + Inches(3.8)
add_text(s, Inches(0.72), y2, Inches(11.8), Inches(0.4),
         "Résultats attendus à 6 mois", size=18, font=TITLE_FONT, bold=True, color=NAVY)
metric_row(s, y2 + Inches(0.5), [
    ("Time-to-Value", "−40 %", ACCENT),
    ("Dette Technique", "−60 %", GREEN_OK),
    ("Taux Mise en Prod", "×2.5", NAVY),
    ("Audit Conformité", "100 %", ACCENT_SOFT),
])
add_footer(s)

# ────────────────────────────────────────────── SLIDE 4 : ARCHITECTURE & GOUVERNANCE
s = prs.slides.add_slide(BLANK)
set_bg(s)
y = slide_header(s, 4, "Architecture : Gouvernance Native & Sécurité",
                 "Modèle de données relationnel strict • Prisma ORM • PostgreSQL")

# Schéma textuel simplifié
layers = [
    ("Couche Produit", "Product ←→ BacklogItem ←→ Sprint", NAVY),
    ("Couche Exécution", "DailyNote • Increment • DoDChecklist", NAVY_MID),
    ("Couche Sécurité", "RoleMatrix (R/W) • AuditLog • Row-Level Security", ACCENT),
]
for i, (name, detail, clr) in enumerate(layers):
    yy = y + Inches(i * 1.45)
    add_rounded(s, Inches(0.72), yy, Inches(3.0), Inches(1.2), clr, 0.06)
    add_text(s, Inches(0.85), yy + Inches(0.1), Inches(2.7), Inches(0.35),
             name, size=13, font=TITLE_FONT, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    add_text(s, Inches(0.85), yy + Inches(0.45), Inches(2.7), Inches(0.65),
             detail, size=11, font=BODY_FONT, color=GREY_LIGHT, align=PP_ALIGN.CENTER, line=1.3)

    # Zone détail à droite
    add_rounded(s, Inches(3.9), yy, Inches(8.6), Inches(1.2), WHITE, 0.06)
    add_text(s, Inches(4.1), yy + Inches(0.1), Inches(8.2), Inches(0.35),
             f"Détails : {detail}", size=12, font=BODY_FONT, color=NAVY)
    # points clés
    bullets = {
        0: ["Product Owner unique · Priorisation value-driven", "BacklogItem : type (feature/tech/debt) + score métier"],
        1: ["Sprint verrouillé par équipe (1 actif max)", "DoDChecklist : 8 critères automatisés (CI/CD)"],
        2: ["Matrice rôles codée en dur (ScrumTeam / Stakeholder)", "RLS Postgres : lecture seule stakeholders"],
    }
    tb = s.shapes.add_textbox(Inches(4.1), yy + Inches(0.45), Inches(8.2), Inches(0.7))
    tf = tb.text_frame
    tf.word_wrap = True
    for j, b in enumerate(bullets[i]):
        p = tf.paragraphs[0] if j == 0 else tf.add_paragraph()
        p.space_after = Pt(2)
        r = p.add_run()
        r.text = "▸ " + b
        r.font.size = Pt(11)
        r.font.name = BODY_FONT
        r.font.color.rgb = NAVY_SOFT

add_footer(s)

# ────────────────────────────────────────────── SLIDE 5 : RITUELS & TRAÇABILITÉ
s = prs.slides.add_slide(BLANK)
set_bg(s)
y = slide_header(s, 5, "Rituels Agiles : Traçabilité Totale & Auditabilité",
                 "La « Time Machine » du projet — Chaque décision historisée")

rituals = [
    ("Daily Scrum", "Compteur dynamique (ex: 12/20)\nClôture définitive par Scrum Master", "📅"),
    ("Sprint Planning", "Sélection value-driven depuis backlog global\nVerrou anti-double-sprint par équipe", "🎯"),
    ("Sprint Review", "Incrément validé si DoD = 100 %\nRejet possible → retour backlog + purge auto", "✅"),
    ("Rétrospective", "Notes typées (Avancement/Blocage/Annonce)\nFiltres [Produit → Sprint → Timeline]", "🔍"),
]

for i, (name, desc, icon) in enumerate(rituals):
    col = i % 2
    row = i // 2
    x = Inches(0.72) + col * Inches(5.9)
    yy = y + row * Inches(2.35)
    card = add_rounded(s, x, yy, Inches(5.6), Inches(2.1), WHITE, 0.08)
    add_text(s, x + Inches(0.25), yy + Inches(0.15), Inches(1), Inches(0.5),
             icon, size=28, align=PP_ALIGN.CENTER)
    add_text(s, x + Inches(1.1), yy + Inches(0.15), Inches(4.2), Inches(0.4),
             name, size=18, font=TITLE_FONT, bold=True, color=NAVY)
    add_text(s, x + Inches(1.1), yy + Inches(0.6), Inches(4.3), Inches(1.3),
             desc, size=13, font=BODY_FONT, color=NAVY_SOFT, line=1.4)

add_footer(s)

# ────────────────────────────────────────────── SLIDE 6 : ROI & BUSINESS CASE
s = prs.slides.add_slide(BLANK)
set_bg(s)
y = slide_header(s, 6, "Business Case : ROI Projeté sur 12 Mois",
                 "Investissement maîtrisé • Valeur mesurable • Risque réduit")

# KPIs principaux
kpis = [
    ("Gain Productivité\nÉquipes", "+35 %", "Vélocité stable,\nmoins de réouverture", "up"),
    ("Délai Mise en Prod", "−45 %", "DoD auto + CI/CD\nintégré", "up"),
    ("Coût Non-Qualité", "−60 %", "Détection précoce,\npurge auto anomalies", "up"),
    ("Conformité Audit", "100 %", "Traçabilité native,\nexport 1-clic", "up"),
]
for i, (label, value, desc, trend) in enumerate(kpis):
    x = Inches(0.72) + i * Inches(3.1)
    kpi_card(s, x, y, Inches(2.8), Inches(2.0), label, value, desc, trend)

# Tableau investissement vs gain
y2 = y + Inches(2.3)
add_text(s, Inches(0.72), y2, Inches(11.8), Inches(0.35),
         "Investissement vs Retour Estimé", size=18, font=TITLE_FONT, bold=True, color=NAVY)

# Tableau simple
from pptx.util import Inches, Pt
table_shape = s.shapes.add_table(4, 4, Inches(0.72), y2 + Inches(0.45), Inches(11.8), Inches(2.0))
tbl = table_shape.table
tbl.columns[0].width = Inches(3.5)
tbl.columns[1].width = Inches(2.8)
tbl.columns[2].width = Inches(2.8)
tbl.columns[3].width = Inches(2.7)

headers = ["Poste", "Investissement (k€)", "Gain Annuel (k€)", "ROI"]
rows = [
    ["Licences & Infra", "120", "—", "—"],
    ["Intégration & Formation", "80", "—", "—"],
    ["Économies / An (productivité, qualité, conformité)", "—", "420", "3.1×"],
]

for j, h in enumerate(headers):
    cell = tbl.cell(0, j)
    cell.text = h
    for p in cell.text_frame.paragraphs:
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.name = BODY_FONT
        p.font.color.rgb = WHITE
        p.alignment = PP_ALIGN.CENTER
    cell.fill.solid()
    cell.fill.fore_color.rgb = NAVY

for i, row in enumerate(rows):
    for j, val in enumerate(row):
        cell = tbl.cell(i+1, j)
        cell.text = val
        for p in cell.text_frame.paragraphs:
            p.font.size = Pt(11)
            p.font.name = BODY_FONT
            p.font.color.rgb = NAVY if j == 0 else (GREEN_OK if j == 2 else NAVY)
            p.font.bold = (j == 0 or j == 3)
            p.alignment = PP_ALIGN.CENTER if j > 0 else PP_ALIGN.LEFT
        cell.fill.solid()
        cell.fill.fore_color.rgb = WHITE if i % 2 == 0 else GREY_LIGHT

add_footer(s)

# ────────────────────────────────────────────── SLIDE 7 : ROADMAP & GO/NO-GO
s = prs.slides.add_slide(BLANK)
set_bg(s)
y = slide_header(s, 7, "Roadmap : 3 Phases · 9 Mois · Go/No-Go Clairs",
                 "Approche itérative, risques maîtrisés, valeur précoce")

phases = [
    ("Phase 1 — Fondation\nMois 1–3", [
        "✅  Setup plateforme (infra, auth, modèle Prisma)",
        "✅  Migration backlog existant → ScrumFirst",
        "✅  DoD v1 configurée + CI/CD basique",
        "🎯  GO/NO-GO : 1 équipe pilote opérationnelle",
    ], ACCENT),
    ("Phase 2 — Échelle\nMois 4–6", [
        "🔄  Onboarding Team Data Science",
        "🔄  Multi-sprints parallèles activés",
        "🔄  Value Scoring affiné (métier + tech)",
        "🎯  GO/NO-GO : 2 équipes · vélocité ×2",
    ], NAVY),
    ("Phase 3 — Maturité\nMois 7–9", [
        "📊  Dashboard exécutif temps réel",
        "📊  Data Lineage complet + audit export",
        "📊  RLS + conformité RGPD/ISO",
        "🎯  GO/NO-GO : Industrialisation complète",
    ], GREEN_OK),
]

for i, (title, items, clr) in enumerate(phases):
    x = Inches(0.72) + i * Inches(4.05)
    # Header phase
    add_rounded(s, x, y, Inches(3.75), Inches(0.7), clr, 0.06)
    add_text(s, x + Inches(0.15), y + Inches(0.08), Inches(3.45), Inches(0.55),
             title, size=15, font=TITLE_FONT, bold=True, color=WHITE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    # Contenu
    card = add_rounded(s, x, y + Inches(0.75), Inches(3.75), Inches(2.8), WHITE, 0.06)
    tb = s.shapes.add_textbox(x + Inches(0.25), y + Inches(0.95), Inches(3.25), Inches(2.5))
    tf = tb.text_frame
    tf.word_wrap = True
    for j, item in enumerate(items):
        p = tf.paragraphs[0] if j == 0 else tf.add_paragraph()
        p.space_after = Pt(8)
        p.line_spacing = 1.3
        r = p.add_run()
        r.text = item
        r.font.size = Pt(12)
        r.font.name = BODY_FONT
        r.font.color.rgb = NAVY if "✅" in item or "🔄" in item else (GREEN_OK if "🎯" in item else NAVY_SOFT)
        r.font.bold = "🎯" in item

add_footer(s)

# ────────────────────────────────────────────── SLIDE 8 : APPEL À DÉCISION
s = prs.slides.add_slide(BLANK)
set_bg(s, NAVY)
add_shape(s, Inches(0), Inches(0), Inches(0.16), SLIDE_H, ACCENT)

add_text(s, Inches(1.2), Inches(1.0), Inches(10.5), Inches(0.5),
         "DÉCISION REQUISE", size=14, font=TITLE_FONT, bold=True, color=ACCENT_SOFT)

add_text(s, Inches(1.2), Inches(1.6), Inches(10.5), Inches(1.5),
         "Valider le lancement de ScrumFirst\nPhase 1 — Fondation (3 mois)",
         size=42, font=TITLE_FONT, bold=True, color=WHITE, line=1.1)

# 3 ask
asks = [
    ("👥", "Équipe Pilote", "1 PO + 1 SM + 5 Dev (Data Eng)"),
    ("💰", "Budget Phase 1", "200 k€ (infra + formation + intégration)"),
    ("📅", "Démarrage", "Sprint 0 — semaine prochaine"),
]
for i, (icon, label, detail) in enumerate(asks):
    x = Inches(1.2) + i * Inches(3.8)
    yy = Inches(3.6)
    add_text(s, x, yy, Inches(3.5), Inches(0.6),
             icon, size=36, align=PP_ALIGN.CENTER)
    add_text(s, x, yy + Inches(0.6), Inches(3.5), Inches(0.4),
             label, size=18, font=TITLE_FONT, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    add_text(s, x, yy + Inches(1.0), Inches(3.5), Inches(0.5),
             detail, size=14, font=BODY_FONT, color=GREY_LIGHT, align=PP_ALIGN.CENTER, line=1.3)

# CTA
cta = add_rounded(s, Inches(1.2), Inches(5.0), Inches(4.0), Inches(0.7), ACCENT, 0.1)
add_text(s, Inches(1.2), Inches(5.02), Inches(4.0), Inches(0.7),
         "➤  APPROUVER LE LANCEMENT", size=18, font=TITLE_FONT, bold=True,
         color=WHITE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

add_text(s, Inches(1.2), Inches(6.1), Inches(10), Inches(0.5),
         "Contact : [Votre Nom]  •  Direction Data & IA  •  [email]  •  [téléphone]",
         size=13, font=BODY_FONT, color=GREY_LIGHT)

# ────────────────────────────────────────────── SAVE
OUT = "ScrumFirst_Presentation_Pro.pptx"
prs.save(OUT)
print(f"✅  Généré : {OUT} ({len(prs.slides._sldIdLst)} diapositives)")
print("   → Ouvrir dans PowerPoint → Transitions → Morph/Fondu → Appliquer à toutes")