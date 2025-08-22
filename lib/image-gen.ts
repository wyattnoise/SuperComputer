// SuperCompute Image Generation — ComfyUI integration for uncensored SDXL/Flux models
import { randomUUID } from 'crypto';
import { IMAGE_CREDITS, COMFY_URL, IMAGE_TIMEOUT_MS } from '../config';

export const IMAGE_MODEL_ID = 'supercompute-image';

export interface GenerateParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
}

export interface GenerateResult {
  imageBuffer: Buffer;
  seed: number;
  width: number;
  height: number;
  totalTime: number;
}

// ── Safety Guard ──

const HARD_BLOCK_TERMS = ['loli', 'lolita', 'shota', 'shotacon', 'lolicon'];
const MINOR_TERMS = ['child', 'children', 'kid', 'toddler', 'infant', 'underage', 'minor', 'juvenile', 'adolescent', 'schoolgirl', 'schoolboy'];
const SEXUAL_TERMS = ['nude', 'naked', 'nsfw', 'sexual', 'explicit', 'pornographic', 'genital', 'penis', 'vagina'];
const UNDERAGE_AGE = /\b(?:0?[0-9]|1[0-7])\s*(?:yo|years?\s*old)\b/i;

export interface SafetyResult { allowed: boolean; reason?: string }

export function checkPromptSafety(prompt: string, nsfwAllowed: boolean = false): SafetyResult {
  const p = prompt.toLowerCase().trim();
  if (!p) return { allowed: false, reason: 'Empty prompt.' };

  if (HARD_BLOCK_TERMS.some(t => p.includes(t))) {
    return { allowed: false, reason: 'This prompt was blocked. Sexual content involving minors will never be generated.' };
  }

  const sexual = SEXUAL_TERMS.some(t => p.includes(t));
  const minor = MINOR_TERMS.some(t => p.includes(t)) || UNDERAGE_AGE.test(p);
  if (sexual && minor) return { allowed: false, reason: 'Blocked: minor + adult content.' };

  if (sexual && !nsfwAllowed) {
    return { allowed: false, reason: 'Adult prompt detected. Enable the NSFW toggle (18+) to generate this.' };
  }

  return { allowed: true };
}

// ── ComfyUI Workflow Builder ──

const BASE_NEGATIVE = 'oversaturated, hdr, heavy vignette, dark corners, excessive bokeh, plastic skin, overprocessed, deep fried, blurry, low quality, jpeg artifacts, watermark, text, extra limbs, deformed';

function clampDim(v: number | undefined, def: number): number {
  const n = Math.round(Number(v) || def);
  if (!Number.isFinite(n)) return def;
  return Math.min(1536, Math.max(512, Math.round(n / 64) * 64));
}

function hashSeed(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export function buildWorkflow(p: GenerateParams): { workflow: Record<string, unknown>; seed: number; width: number; height: number } {
  const width = clampDim(p.width, 1024);
  const height = clampDim(p.height, 1024);
  const steps = Math.min(60, Math.max(10, Math.round(Number(p.steps) || 32)));
  const cfg = Math.min(15, Math.max(1, Number(p.cfg) || 4.0));
  const seed = Number.isFinite(Number(p.seed)) && Number(p.seed) > 0
    ? Math.floor(Number(p.seed))
    : Math.floor(Math.abs(hashSeed(p.prompt + ':' + randomUUID())));
  const negative = [BASE_NEGATIVE, (p.negativePrompt || '').trim()].filter(Boolean).join(', ');

  // SDXL/Flux compatible workflow graph
  const workflow: Record<string, unknown> = {
    '3': { class_type: 'KSampler', inputs: { seed, steps, cfg, sampler_name: 'euler', scheduler: 'normal', denoise: 1 } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: p.prompt, clip: ['30', 1] } },
    '5': { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['30', 1] } },
    '6': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '7': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['30', 2] } },
    '8': { class_type: 'KSampler', inputs: { seed, steps, cfg, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['30', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'supercompute', images: ['7', 0] } },
    '30': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: process.env.SC_SD_MODEL || 'sd_xl_base_1.0.safetensors' } },
  };

  return { workflow, seed, width, height };
}

// ── Generation ──

export async function generateImage(params: GenerateParams): Promise<GenerateResult> {
  const { workflow, seed, width, height } = buildWorkflow(params);
  const clientId = randomUUID();
  const startTime = Date.now();

  // Submit to ComfyUI
  const submitRes = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal: AbortSignal.timeout(15000),
  });

  if (!submitRes.ok) {
    throw new Error(`ComfyUI submission failed: ${submitRes.status}`);
  }

  const { prompt_id } = await submitRes.json() as { prompt_id: string };

  // Poll for completion
  const deadline = Date.now() + IMAGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const histRes = await fetch(`${COMFY_URL}/history/${prompt_id}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (histRes.ok) {
      const history = await histRes.json() as Record<string, any>;
      const entry = history[prompt_id];
      if (entry?.outputs) {
        const output = Object.values(entry.outputs)[0] as any;
        if (output?.images?.[0]) {
          const img = output.images[0];
          const imgRes = await fetch(`${COMFY_URL}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`, {
            signal: AbortSignal.timeout(30000),
          });
          if (imgRes.ok) {
            const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
            return { imageBuffer, seed, width, height, totalTime: Date.now() - startTime };
          }
        }
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  throw new Error('Image generation timed out');
}


