import { timingSafeEqual } from "crypto";

import { env } from "@/lib/env";

export const authService = {
  authenticate(email: string, password: string) {
    if (email !== env.ADMIN_EMAIL) {
      return false;
    }

    const incoming = Buffer.from(password);
    const expected = Buffer.from(env.ADMIN_PASSWORD);

    if (incoming.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(incoming, expected);
  }
};
