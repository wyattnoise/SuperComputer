// SuperCompute Image Generation API — POST /api/v1/images/generate
import { NextRequest, NextResponse } from 'next/server';
import { generateImage, checkPromptSafety } from '@/lib/image-gen';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, negative_prompt, width, height, steps, cfg, seed, nsfw_allowed = false } = body;

    if (!prompt) {
      return NextResponse.json({ error: { message: 'Prompt is required', type: 'invalid_request_error' } }, { status: 400 });
    }

    // Safety check
    const safety = checkPromptSafety(prompt, nsfw_allowed);
    if (!safety.allowed) {
      return NextResponse.json({ error: { message: safety.reason, type: 'content_filter' } }, { status: 400 });
    }

    const result = await generateImage({
      prompt,
      negativePrompt: negative_prompt,
      width,
      height,
      steps,
      cfg,
      seed,
    });

    // Convert buffer to base64 for JSON response
    const base64 = result.imageBuffer.toString('base64');

    return NextResponse.json({
      created: Math.floor(Date.now() / 1000),
      data: [{
        b64_json: base64,
        seed: result.seed,
        width: result.width,
        height: result.height,
        generation_time_ms: result.totalTime,
      }],
    });
  } catch (err) {
    return NextResponse.json({
      error: { message: err instanceof Error ? err.message : 'Image generation failed', type: 'server_error' },
    }, { status: 500 });
  }
}



