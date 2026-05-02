/**
 * Shared state types for the /settings/auxiliaries Server Action forms.
 * Lives outside `actions.ts` because Next.js Server Action files
 * (`"use server"`) can only export async functions.
 */
export type AuxActionState = {
  ok: boolean;
  message: string;
  nonce: number;
};

export const initialAuxState: AuxActionState = {
  ok: true,
  message: "",
  nonce: 0,
};
