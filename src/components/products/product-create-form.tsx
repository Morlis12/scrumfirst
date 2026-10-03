"use client";

import { ActionForm, Field, inputClass } from "@/components/action-form";
import { createProductWithTeam } from "@/app/actions/products";

/**
 * Formulaire de création de Produit (Nom, Description, teamId/équipe initiale).
 * Accès : Admin/PO + Scrum Master uniquement — masqué/désactivé pour
 * Developer et Stakeholder (garde serveur `guardCreateProduct`).
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
      <Field
        label="Description (stockée comme Product Goal initial)"
        hint="Le schéma Prisma validé ne porte pas de colonne description sur Product : elle devient l'objectif produit initial."
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
        hint="À la création, l'équipe n'existe pas encore : on crée la Team fille du Product avec ce nom."
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
  );
}
