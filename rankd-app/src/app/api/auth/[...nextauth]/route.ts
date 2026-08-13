// Auth.js's own endpoints — sign-in, callback, sign-out, session. Nothing but a
// re-export: every decision about how auth behaves lives in the seam.

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
