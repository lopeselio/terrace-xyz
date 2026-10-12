import { NextResponse } from "next/server";

/*
 * WebAuthn related origins (served at /.well-known/webauthn on every Terrace host): lists the sites
 * allowed to use passkeys created for this host. It lets play.terrace.social sign fans in with a
 * passkey made on terrace-monad.vercel.app, and keeps old accounts working through future moves.
 */
const ORIGINS = ["https://play.terrace.social", "https://terrace.social", "https://app.terrace.social", "https://terrace-monad.vercel.app"];

export function GET() {
  return NextResponse.json({ origins: ORIGINS }, { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
