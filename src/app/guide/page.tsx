import Link from "next/link";
import { currentUserId } from "@/lib/context";
import { Card, PageHeader, buttonSecondary } from "@/components/ui";
import { ScrumDiagram } from "@/components/scrum-guide/ScrumDiagram";

/**
 * PAGE GUIDE SCRUM — /guide
 * Référence visuelle statique (diagramme unique), aucun appel base :
 * accessible à tous les rôles connectés, y compris Stakeholder en lecture.
 */
const LEGEND: { dot: string; label: string; hint: string }[] = [
  { dot: "bg-violet-500", label: "Product Owner", hint: "Maximise la valeur" },
  { dot: "bg-teal-500", label: "Developers", hint: "Réalisent l'Increment" },
  { dot: "bg-orange-500", label: "Scrum Master", hint: "Efficacité de l'équipe" },
  { dot: "bg-blue-500", label: "Événements", hint: "Planning · Daily · Review · Rétro" },
  { dot: "bg-slate-500", label: "Artefacts", hint: "Backlogs · Increment" },
  { dot: "bg-amber-500", label: "Engagements", hint: "Objectifs · DoD" },
  { dot: "bg-navy-900", label: "Piliers", hint: "Transparence · Inspection · Adaptation" },
  { dot: "bg-pink-500", label: "Valeurs", hint: "Engagement · Focus · Ouverture · Respect · Courage" },
];

export default async function GuidePage() {
  // Tous les rôles connectés (lecture seule, aucune garde métier ici).
  await currentUserId();
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <PageHeader
        title="Guide Scrum — le diagramme unique"
        subtitle="Tout le framework en un coup d'œil : cycle, équipe, Sprint, artefacts, piliers et valeurs. Référence rapide, lecture seule."
        actions={
          <Link href="/backlog" className={buttonSecondary} title="Retour au Product Backlog">
            ← Backlog
          </Link>
        }
      />

      <Card className="mb-3">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <ScrumDiagram />
          </div>
        </div>
      </Card>

      {/* Légende couleur en HTML (accessible), hors SVG. */}
      <Card>
        <h2 className="mb-2 font-medium">Légende des couleurs</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {LEGEND.map((l) => (
            <li key={l.label} className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded-full ${l.dot}`} />
              <span>
                <span className="font-bold text-navy-900">{l.label}</span>{" "}
                <span className="text-navy-900/60">— {l.hint}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
