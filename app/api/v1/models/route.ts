// SuperCompute Models API — GET /api/v1/models
import { NextResponse } from 'next/server';

const models = [
  { id: 'supercompute-chat', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'supercompute', permission: [], root: 'supercompute-chat' },
  { id: 'supercompute-default', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'supercompute', permission: [], root: 'supercompute-default' },
  { id: 'supercompute-image', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'supercompute', permission: [], root: 'supercompute-image' },
  { id: 'supercompute-embedding', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'supercompute', permission: [], root: 'supercompute-embedding' },
];

export async function GET() {
  return NextResponse.json({ object: 'list', data: models });
}


