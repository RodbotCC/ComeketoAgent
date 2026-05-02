/** Shared between Server Actions and the client SettingsForm (`useFormState`). */

export type SettingsActionState = {
  ok: boolean;
  message: string;
  /** Increments on every action call so identical results re-trigger client effects. */
  nonce: number;
};

export const initialSettingsState: SettingsActionState = {
  ok: true,
  message: "",
  nonce: 0,
};
