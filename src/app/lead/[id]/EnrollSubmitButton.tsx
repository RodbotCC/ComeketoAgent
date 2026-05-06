"use client";

import { useFormStatus } from "react-dom";

export function EnrollSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="plan-btn plan-btn-primary" disabled={pending}>
      {pending ? "Enrolling…" : "Enroll contact"}
    </button>
  );
}
