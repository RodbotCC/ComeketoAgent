import { createWorkflowDraftAction } from "../actions";

/**
 * Creates a fresh workflow draft and redirects to its authoring page.
 * Server Component → server action → redirect, single round trip.
 */
export default async function NewWorkflowPage() {
  await createWorkflowDraftAction();
  // createWorkflowDraftAction redirects on success; this return is unreachable.
  return null;
}
