import { NextResponse } from "next/server";
import { z } from "zod";

import { issueDemoAccessCookie } from "@/lib/server/auth";
import { hashWithSalt, safeEqual } from "@/lib/server/crypto";
import { getServerEnv } from "@/lib/server/env";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { consumeIpQuota, getHashedIp } from "@/lib/server/quota";

const requestSchema = z.object({ code: z.string().min(1).max(200) });

export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    if (env.DEMO_ENABLED !== "true") {
      throw new ApiError(503, "DEMO_DISABLED", "The live demo is temporarily disabled.");
    }
    const ipHash = getHashedIp(request.headers);
    await consumeIpQuota("access_attempt", ipHash, 20);
    const { code } = requestSchema.parse(await request.json());
    const received = hashWithSalt(code, env.COOKIE_SIGNING_SECRET);
    const expected = hashWithSalt(env.DEMO_ACCESS_CODE, env.COOKIE_SIGNING_SECRET);
    if (!safeEqual(received, expected)) {
      throw new ApiError(401, "INVALID_ACCESS_CODE", "That access code is not valid.");
    }
    await issueDemoAccessCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
