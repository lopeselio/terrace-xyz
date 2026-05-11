import { createSign } from "crypto";
import { NextResponse } from "next/server";

async function getAccessToken(creds: {
  client_email: string;
  private_key: string;
}) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: creds.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");

  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(creds.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Failed to get access token");
  return data.access_token;
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    let creds: Record<string, string>;
    try {
      creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "{}");
    } catch {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!creds.client_email || !creds.private_key || !spreadsheetId) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    creds.private_key = creds.private_key.replace(/\\n/g, "\n");

    let token: string;
    try {
      token = await getAccessToken(creds as { client_email: string; private_key: string });
    } catch {
      return NextResponse.json({ error: "Auth failed" }, { status: 500 });
    }

    const sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1%21A%3AB:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [[email, new Date().toISOString()]] }),
      }
    );

    if (!sheetsRes.ok) {
      return NextResponse.json({ error: "Sheets error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
