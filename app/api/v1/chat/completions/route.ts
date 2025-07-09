// SuperCompute OpenAI-Compatible Chat Completion API
// POST /api/v1/chat/completions
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import db, { createJob } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, messages, stream = false, max_tokens = 2048, temperature = 0.7 } = body;

    if (!messages?.length) {
      return NextResponse.json({ error: { message: 'Messages required', type: 'invalid_request_error' } }, { status: 400 });
    }

    // Extract user content from last message
    const lastMsg = messages[messages.length - 1];
    const prompt = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);

    // Create a job in the queue
    const jobId = randomUUID();
    const job = {
      id: jobId,
      type: 'chat' as const,
      model: model || 'supercompute-default',
      prompt,
      params: { max_tokens, temperature, stream, messages },
      status: 'queued' as const,
      creditsCost: 0.01,
      createdAt: Date.now(),
    };

    createJob(job);

    if (stream) {
      // For streaming, we'll return a server-sent events stream
      const encoder = new TextEncoder();
      const stream_ = new ReadableStream({
        async start(controller) {
          try {
            // Wait for the job to complete (polling approach)
            let attempts = 0;
            const maxAttempts = 60; // 30 seconds max wait
            
            while (attempts < maxAttempts) {
              await new Promise(r => setTimeout(r, 500));
              const result = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as any;
              
              if (result?.status === 'completed') {
                const content = result.tokens_generated 
                  ? `Simulated response for: "${prompt.slice(0, 50)}..."`
                  : 'Job completed.';
                
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content }, index: 0 }] })}\n\n`));
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                controller.close();
                return;
              }
              
              if (result?.status === 'failed') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: result.error })}\n\n`));
                controller.close();
                return;
              }
              
              attempts++;
            }
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Request timed out. Please try again.' }, index: 0 }] })}\n\n`));
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });

      return new Response(stream_, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming: wait for result with timeout
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(r => setTimeout(r, 1000));
      const result = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as any;
      
      if (result?.status === 'completed' || result?.status === 'failed') {
        const content = result.status === 'completed'
          ? `I processed your request. Model: ${model}`
          : `Error: ${result.error || 'Job failed'}`;
        
        return NextResponse.json({
          id: jobId,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: prompt.length / 4, completion_tokens: 50, total_tokens: Math.ceil(prompt.length / 4) + 50 },
        });
      }
      attempts++;
    }

    return NextResponse.json({
      id: jobId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: 'Request queued. Check back for results.' }, finish_reason: 'stop' }],
    });
  } catch (err) {
    return NextResponse.json({ error: { message: err instanceof Error ? err.message : 'Internal error', type: 'server_error' } }, { status: 500 });
  }
}

