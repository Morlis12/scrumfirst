/**
 * Diagramme Scrum unique — référence visuelle statique du framework.
 * SVG inline dessiné à la main (aucune librairie externe), contenu pur
 * (aucun appel API, aucune dépendance à la base de données).
 * Contenu en français (l'app est unilingue FR) ; le prop `locale` est
 * exposé pour une future internationalisation.
 */
const NAVY = "#1c3359";
const INK = "#1c3359";
const FONT = "Arial, Helvetica, sans-serif";

const C = {
  po: { fill: "#ede9fe", stroke: "#7c3aed", header: "#7c3aed" },
  dev: { fill: "#ccfbf1", stroke: "#0d9488", header: "#0d9488" },
  sm: { fill: "#ffedd5", stroke: "#ea580c", header: "#ea580c" },
  event: { fill: "#dbeafe", stroke: "#2563eb", header: "#2563eb" },
  artefact: { fill: "#f1f5f9", stroke: "#475569", header: "#475569" },
  engagement: { fill: "#fef3c7", stroke: "#d97706", header: "#b45309" },
  pilier: { fill: "#eef1f6", stroke: "#1c3359", header: "#1c3359" },
  valeur: { fill: "#db2777", stroke: "#db2777" },
  frame: "#1c3359",
  frameFill: "#fbf7e9",
  sand: "#e3cf85",
};

function SectionTitle({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text x={x} y={y} fontFamily={FONT} fontSize={22} fontWeight={700} fill={NAVY}>
      {children}
    </text>
  );
}

export function ScrumDiagram({ locale = "fr" }: { locale?: "fr" | "en" }) {
  return (
    <div>
      <svg
        viewBox="0 0 960 1770"
        role="img"
        lang={locale}
        aria-label="Diagramme unique du framework Scrum : cycle, équipe, sprint, artefacts, piliers et valeurs"
        className="h-auto w-full"
      >
        <title>Scrum — le diagramme unique</title>
        <defs>
          <marker
            id="scrum-arrow"
            viewBox="0 0 10 10"
            refX={8}
            refY={5}
            markerWidth={7}
            markerHeight={7}
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={NAVY} />
          </marker>
        </defs>

        {/* ============ Bloc 1 — Le cycle en bref ============ */}
        <g role="group" aria-label="Le cycle Scrum en bref : Product Owner, Scrum Team, inspection, répétition">
          <SectionTitle x={24} y={34}>
            1 — Le cycle Scrum en bref
          </SectionTitle>
          {/* 4 boîtes en boucle horaire */}
          <g role="group" aria-label="Étape 1 : Product Owner ordonne le Product Backlog">
            <rect x={370} y={60} width={220} height={70} rx={12} fill={C.po.fill} stroke={C.po.stroke} strokeWidth={2} />
            <text x={480} y={88} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill={INK}>
              Product Owner
            </text>
            <text x={480} y={110} textAnchor="middle" fontFamily={FONT} fontSize={13} fill={INK}>
              ordonne le Product Backlog
            </text>
          </g>
          <g role="group" aria-label="Étape 2 : la Scrum Team transforme une sélection en Increment durant un Sprint">
            <rect x={680} y={185} width={220} height={90} rx={12} fill={C.dev.fill} stroke={C.dev.stroke} strokeWidth={2} />
            <text x={790} y={213} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill={INK}>
              Scrum Team
            </text>
            <text x={790} y={235} textAnchor="middle" fontFamily={FONT} fontSize={13} fill={INK}>
              sélection → Increment
            </text>
            <text x={790} y={253} textAnchor="middle" fontFamily={FONT} fontSize={13} fill={INK}>
              durant un Sprint
            </text>
          </g>
          <g role="group" aria-label="Étape 3 : équipe et parties prenantes inspectent et s'adaptent">
            <rect x={370} y={320} width={220} height={70} rx={12} fill={C.event.fill} stroke={C.event.stroke} strokeWidth={2} />
            <text x={480} y={348} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill={INK}>
              Équipe + parties prenantes
            </text>
            <text x={480} y={368} textAnchor="middle" fontFamily={FONT} fontSize={13} fill={INK}>
              inspectent et s&apos;adaptent
            </text>
          </g>
          <g role="group" aria-label="Étape 4 : répéter, un nouveau Sprint démarre aussitôt">
            <rect x={60} y={185} width={220} height={90} rx={12} fill={C.pilier.fill} stroke={C.pilier.stroke} strokeWidth={2} />
            <text x={170} y={213} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill={INK}>
              Répéter
            </text>
            <text x={170} y={235} textAnchor="middle" fontFamily={FONT} fontSize={13} fill={INK}>
              un nouveau Sprint
            </text>
            <text x={170} y={253} textAnchor="middle" fontFamily={FONT} fontSize={13} fill={INK}>
              démarre aussitôt
            </text>
          </g>
          {/* Centre de la boucle */}
          <ellipse cx={480} cy={230} rx={105} ry={58} fill={C.sand} opacity={0.45} stroke={NAVY} strokeWidth={2} />
          <text x={480} y={222} textAnchor="middle" fontFamily={FONT} fontSize={18} fontWeight={700} fill={INK}>
            SCRUM
          </text>
          <text x={480} y={241} textAnchor="middle" fontFamily={FONT} fontSize={11.5} fill={INK}>
            le Scrum Master crée
          </text>
          <text x={480} y={255} textAnchor="middle" fontFamily={FONT} fontSize={11.5} fill={INK}>
            l&apos;environnement
          </text>
          {/* Flèches courbes horaires */}
          <path d="M590,95 Q655,105 688,183" fill="none" stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
          <path d="M790,275 Q740,330 592,352" fill="none" stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
          <path d="M370,358 Q300,340 232,278" fill="none" stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
          <path d="M150,185 Q220,120 368,128" fill="none" stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
        </g>

        {/* ============ Bloc 2 — La Scrum Team ============ */}
        <g role="group" aria-label="La Scrum Team : Product Owner, Developers et Scrum Master">
          <SectionTitle x={24} y={434}>
            2 — La Scrum Team
          </SectionTitle>
          <rect x={20} y={454} width={920} height={290} rx={14} fill={C.frameFill} stroke={C.frame} strokeWidth={2} strokeDasharray="8 5" />
          {/* Product Owner */}
          <g role="group" aria-label="Rôle : Product Owner, accountable de maximiser la valeur">
            <rect x={34} y={474} width={286} height={250} rx={10} fill="#ffffff" stroke={C.po.stroke} strokeWidth={2} />
            <rect x={34} y={474} width={286} height={46} rx={10} fill={C.po.header} />
            <rect x={34} y={500} width={286} height={20} fill={C.po.header} />
            <text x={177} y={494} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill="#ffffff">
              Product Owner
            </text>
            <text x={177} y={511} textAnchor="middle" fontFamily={FONT} fontSize={11.5} fill="#ffffff">
              maximise la valeur du produit
            </text>
            {[
              "Objectif de Produit formulé",
              "éléments créés et communiqués",
              "Product Backlog ordonné",
              "transparence garantie",
              "1 personne, jamais un comité",
              "peut déléguer, reste redevable",
            ].map((line, i) => (
              <text key={line} x={48} y={542 + i * 30} fontFamily={FONT} fontSize={12} fill={INK}>
                • {line}
              </text>
            ))}
          </g>
          {/* Developers */}
          <g role="group" aria-label="Rôle : Developers, s'engagent sur tout ou partie de l'Increment">
            <rect x={337} y={474} width={286} height={250} rx={10} fill="#ffffff" stroke={C.dev.stroke} strokeWidth={2} />
            <rect x={337} y={474} width={286} height={46} rx={10} fill={C.dev.header} />
            <rect x={337} y={500} width={286} height={20} fill={C.dev.header} />
            <text x={480} y={494} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill="#ffffff">
              Developers
            </text>
            <text x={480} y={511} textAnchor="middle" fontFamily={FONT} fontSize={11.5} fill="#ffffff">
              réalisent chaque Increment
            </text>
            {[
              "créent le Sprint Backlog",
              "qualité instillée via la DoD",
              "plan adapté chaque jour",
              "responsabilité mutuelle",
              "décident seuls du « comment »",
              "dimensionnent les éléments",
            ].map((line, i) => (
              <text key={line} x={351} y={542 + i * 30} fontFamily={FONT} fontSize={12} fill={INK}>
                • {line}
              </text>
            ))}
          </g>
          {/* Scrum Master */}
          <g role="group" aria-label="Rôle : Scrum Master, accountable de l'efficacité de la Scrum Team">
            <rect x={640} y={474} width={286} height={250} rx={10} fill="#ffffff" stroke={C.sm.stroke} strokeWidth={2} />
            <rect x={640} y={474} width={286} height={46} rx={10} fill={C.sm.header} />
            <rect x={640} y={500} width={286} height={20} fill={C.sm.header} />
            <text x={783} y={494} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill="#ffffff">
              Scrum Master
            </text>
            <text x={783} y={511} textAnchor="middle" fontFamily={FONT} fontSize={11.5} fill="#ffffff">
              efficacité de l&apos;équipe
            </text>
            {[
              "sert l'équipe (obstacles, événements)",
              "sert le PO (Backlog clair)",
              "sert l'organisation (coaching)",
              "leader au service de tous",
            ].map((line, i) => (
              <text key={line} x={654} y={542 + i * 30} fontFamily={FONT} fontSize={12} fill={INK}>
                • {line}
              </text>
            ))}
          </g>
        </g>

        {/* ============ Bloc 3 — Le Sprint ============ */}
        <g role="group" aria-label="Le Sprint d'un mois au plus : Planning, Daily, Review et Rétrospective en séquence">
          <SectionTitle x={24} y={788}>
            3 — Le Sprint (1 mois au plus)
          </SectionTitle>
          <rect x={20} y={808} width={920} height={205} rx={14} fill="none" stroke={C.frame} strokeWidth={2} strokeDasharray="8 5" />
          <text x={928} y={830} textAnchor="end" fontFamily={FONT} fontSize={12} fontWeight={700} fill={NAVY}>
            SPRINT · ≤ 1 mois
          </text>
          {/* Planning */}
          <g role="group" aria-label="Événement : Sprint Planning, 8 heures maximum, crée le Sprint Backlog et l'Objectif de Sprint">
            <rect x={40} y={843} width={190} height={150} rx={10} fill={C.event.fill} stroke={C.event.stroke} strokeWidth={2} />
            <rect x={40} y={843} width={190} height={44} rx={10} fill={C.event.header} />
            <rect x={40} y={867} width={190} height={20} fill={C.event.header} />
            <text x={135} y={861} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill="#ffffff">
              Sprint Planning
            </text>
            <text x={135} y={878} textAnchor="middle" fontFamily={FONT} fontSize={11} fill="#ffffff">
              max 8h · toute l&apos;équipe
            </text>
            <text x={135} y={907} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>Pourquoi / Quoi /</text>
            <text x={135} y={927} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>Comment → Sprint</text>
            <text x={135} y={947} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>Backlog + Objectif</text>
            <text x={135} y={967} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>de Sprint fixés</text>
          </g>
          {/* Daily */}
          <g role="group" aria-label="Événement : Daily Scrum, 15 minutes chaque jour, pour les Developers">
            <rect x={270} y={843} width={190} height={150} rx={10} fill={C.event.fill} stroke={C.event.stroke} strokeWidth={2} />
            <rect x={270} y={843} width={190} height={44} rx={10} fill={C.event.header} />
            <rect x={270} y={867} width={190} height={20} fill={C.event.header} />
            <text x={365} y={861} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill="#ffffff">
              Daily Scrum
            </text>
            <text x={365} y={878} textAnchor="middle" fontFamily={FONT} fontSize={11} fill="#ffffff">
              15 min · chaque jour
            </text>
            <text x={365} y={907} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>pour les Developers</text>
            <text x={365} y={927} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>inspecte l&apos;Objectif</text>
            <text x={365} y={947} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>adapte le Backlog</text>
            <path d="M460,880 Q505,855 405,841" fill="none" stroke={NAVY} strokeWidth={2} markerEnd="url(#scrum-arrow)" />
          </g>
          {/* Review */}
          <g role="group" aria-label="Événement : Sprint Review, 4 heures maximum, inspecte l'Increment avec les parties prenantes">
            <rect x={500} y={843} width={190} height={150} rx={10} fill={C.event.fill} stroke={C.event.stroke} strokeWidth={2} />
            <rect x={500} y={843} width={190} height={44} rx={10} fill={C.event.header} />
            <rect x={500} y={867} width={190} height={20} fill={C.event.header} />
            <text x={595} y={861} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill="#ffffff">
              Sprint Review
            </text>
            <text x={595} y={878} textAnchor="middle" fontFamily={FONT} fontSize={11} fill="#ffffff">
              max 4h · atelier, pas démo
            </text>
            <text x={595} y={907} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>équipe + parties</text>
            <text x={595} y={927} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>prenantes : inspecte</text>
            <text x={595} y={947} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>l&apos;Increment, ajuste</text>
            <text x={595} y={967} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>le Product Backlog</text>
          </g>
          {/* Rétro */}
          <g role="group" aria-label="Événement : Rétrospective, 3 heures maximum, conclut le Sprint par un plan d'amélioration">
            <rect x={730} y={843} width={190} height={150} rx={10} fill={C.event.fill} stroke={C.event.stroke} strokeWidth={2} />
            <rect x={730} y={843} width={190} height={44} rx={10} fill={C.event.header} />
            <rect x={730} y={867} width={190} height={20} fill={C.event.header} />
            <text x={825} y={861} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill="#ffffff">
              Rétrospective
            </text>
            <text x={825} y={878} textAnchor="middle" fontFamily={FONT} fontSize={11} fill="#ffffff">
              max 3h · conclut
            </text>
            <text x={825} y={907} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>individus, process,</text>
            <text x={825} y={927} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>outils, DoD → plan</text>
            <text x={825} y={947} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>d&apos;amélioration</text>
          </g>
          {/* Flèches de séquence */}
          <line x1={230} y1={918} x2={268} y2={918} stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
          <line x1={460} y1={918} x2={498} y2={918} stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
          <line x1={690} y1={918} x2={728} y2={918} stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
          {/* Rebouclage pointillé */}
          <text x={480} y={1038} textAnchor="middle" fontFamily={FONT} fontSize={12} fontStyle="italic" fill={INK}>
            un nouveau Sprint démarre immédiatement après la fin du précédent
          </text>
          <path d="M880,1013 L880,1048 L80,1048 L80,1013" fill="none" stroke={NAVY} strokeWidth={2} strokeDasharray="6 4" markerEnd="url(#scrum-arrow)" />
        </g>

        {/* ============ Bloc 4 — Artefacts ↔ Engagements ============ */}
        <g role="group" aria-label="Artefacts et engagements : Product Backlog, Sprint Backlog, Increment et leurs engagements">
          <SectionTitle x={24} y={1094}>
            4 — Artefacts ↔ Engagements
          </SectionTitle>
          <g role="group" aria-label="Product Backlog, liste ordonnée émergente, engagement : Objectif de Produit">
            <rect x={130} y={1128} width={320} height={64} rx={10} fill={C.artefact.fill} stroke={C.artefact.stroke} strokeWidth={2} />
            <text x={290} y={1154} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill={INK}>Product Backlog</text>
            <text x={290} y={1174} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>liste ordonnée, émergente</text>
            <line x1={460} y1={1160} x2={518} y2={1160} stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
            <rect x={530} y={1128} width={320} height={64} rx={10} fill={C.engagement.fill} stroke={C.engagement.stroke} strokeWidth={2} />
            <text x={690} y={1154} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill={INK}>Objectif de Produit</text>
            <text x={690} y={1174} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>cible long terme</text>
          </g>
          <g role="group" aria-label="Sprint Backlog, le quoi et le comment des Developers, engagement : Objectif de Sprint">
            <rect x={130} y={1218} width={320} height={64} rx={10} fill={C.artefact.fill} stroke={C.artefact.stroke} strokeWidth={2} />
            <text x={290} y={1244} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill={INK}>Sprint Backlog</text>
            <text x={290} y={1264} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>quoi + comment (Developers)</text>
            <line x1={460} y1={1250} x2={518} y2={1250} stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
            <rect x={530} y={1218} width={320} height={64} rx={10} fill={C.engagement.fill} stroke={C.engagement.stroke} strokeWidth={2} />
            <text x={690} y={1244} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill={INK}>Objectif de Sprint</text>
            <text x={690} y={1264} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>le pourquoi (engagement)</text>
          </g>
          <g role="group" aria-label="Increment, pas vers l'Objectif de Produit, engagement : Definition of Done">
            <rect x={130} y={1308} width={320} height={64} rx={10} fill={C.artefact.fill} stroke={C.artefact.stroke} strokeWidth={2} />
            <text x={290} y={1334} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill={INK}>Increment</text>
            <text x={290} y={1354} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>pas vers l&apos;Objectif, utilisable</text>
            <line x1={460} y1={1340} x2={518} y2={1340} stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
            <rect x={530} y={1308} width={320} height={64} rx={10} fill={C.engagement.fill} stroke={C.engagement.stroke} strokeWidth={2} />
            <text x={690} y={1334} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill={INK}>Definition of Done</text>
            <text x={690} y={1354} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>seuil qualité → Increment</text>
          </g>
          <text x={480} y={1404} textAnchor="middle" fontFamily={FONT} fontSize={13} fontStyle="italic" fill={INK}>
            ↩ Sans la DoD : retour au Product Backlog — jamais publié ni présenté.
          </text>
          <text x={480} y={1428} textAnchor="middle" fontFamily={FONT} fontSize={13} fontStyle="italic" fill={INK}>
            ● Plusieurs Increments par Sprint, livrables avant la Review.
          </text>
        </g>

        {/* ============ Bloc 5 — Les 3 piliers ============ */}
        <g role="group" aria-label="Les 3 piliers : Transparence, Inspection puis Adaptation, chacun permet le suivant">
          <SectionTitle x={24} y={1474}>
            5 — Les 3 piliers (chacun permet le suivant)
          </SectionTitle>
          <g role="group" aria-label="Pilier Transparence : le travail est visible">
            <rect x={70} y={1508} width={240} height={72} rx={12} fill={C.pilier.fill} stroke={C.pilier.stroke} strokeWidth={2} />
            <text x={190} y={1538} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill={INK}>Transparence</text>
            <text x={190} y={1560} textAnchor="middle" fontFamily={FONT} fontSize={12.5} fill={INK}>le travail est visible</text>
          </g>
          <line x1={310} y1={1544} x2={358} y2={1544} stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
          <g role="group" aria-label="Pilier Inspection : les 5 événements l'organisent">
            <rect x={360} y={1508} width={240} height={72} rx={12} fill={C.pilier.fill} stroke={C.pilier.stroke} strokeWidth={2} />
            <text x={480} y={1538} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill={INK}>Inspection</text>
            <text x={480} y={1560} textAnchor="middle" fontFamily={FONT} fontSize={12.5} fill={INK}>5 événements l&apos;organisent</text>
          </g>
          <line x1={600} y1={1544} x2={648} y2={1544} stroke={NAVY} strokeWidth={2.5} markerEnd="url(#scrum-arrow)" />
          <g role="group" aria-label="Pilier Adaptation : au plus tôt, dès l'écart détecté">
            <rect x={650} y={1508} width={240} height={72} rx={12} fill={C.pilier.fill} stroke={C.pilier.stroke} strokeWidth={2} />
            <text x={770} y={1538} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill={INK}>Adaptation</text>
            <text x={770} y={1560} textAnchor="middle" fontFamily={FONT} fontSize={12.5} fill={INK}>au plus tôt, dès l&apos;écart</text>
          </g>
        </g>

        {/* ============ Bloc 6 — Les 5 valeurs ============ */}
        <g role="group" aria-label="Les 5 valeurs : Engagement, Focus, Ouverture, Respect et Courage">
          <SectionTitle x={24} y={1626}>
            6 — Les 5 valeurs
          </SectionTitle>
          {["Engagement", "Focus", "Ouverture", "Respect", "Courage"].map((v, i) => (
            <g key={v} role="group" aria-label={`Valeur : ${v}`}>
              <rect
                x={65 + i * 170}
                y={1660}
                width={150}
                height={46}
                rx={23}
                fill={C.valeur.fill}
                stroke={C.valeur.stroke}
                strokeWidth={2}
              />
              <text
                x={140 + i * 170}
                y={1689}
                textAnchor="middle"
                fontFamily={FONT}
                fontSize={15}
                fontWeight={700}
                fill="#ffffff"
              >
                {v}
              </text>
            </g>
          ))}
          <text x={480} y={1740} textAnchor="middle" fontFamily={FONT} fontSize={13} fontStyle="italic" fill={INK}>
            Vécues par l&apos;équipe → transparence, inspection et adaptation émergent en consolidant la confiance.
          </text>
        </g>
      </svg>
      {/* Équivalent textuel pour lecteurs d'écran */}
      <div className="sr-only">
        <h2>Résumé du framework Scrum</h2>
        <p>
          Cycle : le Product Owner ordonne le Product Backlog, la Scrum Team transforme une
          sélection en Increment durant un Sprint, l&apos;équipe et les parties prenantes
          inspectent et adaptent, puis un nouveau Sprint démarre aussitôt. Le Scrum Master
          crée l&apos;environnement.
        </p>
        <p>
          Scrum Team : Product Owner (maximise la valeur, un seul responsable), Developers
          (réalisent l&apos;Increment, décident du comment), Scrum Master (efficacité de
          l&apos;équipe, lève les obstacles).
        </p>
        <p>
          Sprint d&apos;un mois au plus : Planning 8h (pourquoi, quoi, comment), Daily 15
          minutes (Developers), Review 4h (Increment inspecté avec les parties prenantes),
          Rétrospective 3h (plan d&apos;amélioration).
        </p>
        <p>
          Artefacts et engagements : Product Backlog et Objectif de Produit, Sprint Backlog
          et Objectif de Sprint, Increment et Definition of Done. Sans la DoD, retour au
          Backlog, jamais publié.
        </p>
        <p>Piliers : Transparence, puis Inspection, puis Adaptation.</p>
        <p>Valeurs : Engagement, Focus, Ouverture, Respect, Courage.</p>
      </div>
    </div>
  );
}
