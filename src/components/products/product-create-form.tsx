"use client";

import { ActionForm, Field, inputClass } from "@/components/action-form";
import { createProductWithTeam } from "@/app/actions/products";
import {
  MAX_DEVELOPERS_PER_TEAM,
  MAX_SCRUM_TEAM_SIZE,
} from "@/lib/scrum-rules";

/**
 * Formulaire de création de Produit : gouvernance PROPRE au produit.
 * Le PO et le SM sont saisis à la création (par département) — toutes les
 * équipes du produit en hériteront, de manière non modifiable.
 * Accès : Admin/PO + Scrum Master uniquement (garde serveur).
 * Charte : actif = fond jaune sand-300 + texte bleu navy-900 en gras.
 */
export function ProductCreateForm({ canCreate }: { canCreate: boolean }) {
  if (!canCreate) {
    return (
      <div className="rounded-lg bg-sand-300 p-3 text-sm font-bold text-navy-900">
        Création de produit réservée à l&apos;Admin / Product Owner
        et au Scrum Master — compte Developer en lecture seule.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-xl border border-sand-300 bg-sand-300/60 p-3"
        aria-label="Gouvernance du produit"
      >
        <p className="text-xs font-bold uppercase tracking-wide text-navy-900">
          Gouvernance du produit — 1 PO + 1 SM par produit
        </p>
        <p className="mt-1 text-xs text-navy-900/70">
          Chaque produit a sa réalité (par département) : renseignez son binôme.
          Les équipes déclarées hériteront automatiquement de ces deux personnes —
          seuls des Développeurs (max {MAX_DEVELOPERS_PER_TEAM}, total{" "}
          {MAX_SCRUM_TEAM_SIZE} avec PO + SM, Scrum Guide) y seront ajoutés.
        </p>
      </div>
      <ActionForm action={createProductWithTeam} submitLabel="Créer le produit">
        <Field label="Nom du produit">
          <input
            name="name"
            required
            minLength={3}
            maxLength={200}
            className={inputClass}
            placeholder="Ex. Portail de réservation"
            autoComplete="off"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Product Owner du produit (email)">
            <input
              name="productOwnerEmail"
              type="email"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Ex. po.data@entreprise.fr"
              autoComplete="off"
            />
          </Field>
          <Field label="Scrum Master du produit (email)">
            <input
              name="scrumMasterEmail"
              type="email"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Ex. sm.data@entreprise.fr"
              autoComplete="off"
            />
          </Field>
        </div>
        <Field
          label="Description (stockée comme Product Goal initial)"
          hint="Le schéma Prisma ne porte pas de colonne description sur Product : elle devient l'objectif produit initial."
        >
          <textarea
            name="description"
            rows={2}
            maxLength={2000}
            className={inputClass}
            placeholder="Ex. Permettre la réservation en 2 clics…"
          />
        </Field>
        <Field
          label="Équipe initiale (teamId)"
          hint="À la création, l'équipe n'existe pas encore : on crée la Team fille du Product avec ce nom. L'équipe de base de votre espace y est rattachée avec les bons rôles."
        >
          <input
            name="teamId"
            required
            minLength={2}
            maxLength={200}
            defaultValue="Équipe 1"
            className={inputClass}
            placeholder="Ex. Équipe Alpha"
            autoComplete="off"
          />
        </Field>
      </ActionForm>
    </div>
  );
}
