import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface EnvStatusResponse {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
  replicate: boolean;
  fal: boolean;
  kie: boolean;
  wavespeed: boolean;
  poyo: boolean;
  muapi: boolean;
}

export async function GET() {
  // Check which API keys are configured via environment variables.
  const status: EnvStatusResponse = {
    gemini: !!process.env.GEMINI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    replicate: !!process.env.REPLICATE_API_KEY,
    fal: !!process.env.FAL_API_KEY,
    kie: !!process.env.KIE_API_KEY,
    wavespeed: !!process.env.WAVESPEED_API_KEY,
    poyo: !!process.env.POYO_API_KEY,
    muapi: !!process.env.MUAPI_API_KEY,
  };

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
