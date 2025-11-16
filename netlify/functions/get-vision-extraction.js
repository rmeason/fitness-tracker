// This file is netlify/functions/get-vision-extraction.js
// It runs on Netlify's server, not in the browser.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export default async (req, context) => {
  try {
    // 1. Get the content (prompt + image/text) from the PWA
    const { content } = await req.json();

    if (!content || content.length === 0) {
      return new Response(JSON.stringify({ error: 'No content provided' }), { status: 400 });
    }

    // 2. Call the real Claude Vision API
    const aiResponse = await anthropic.messages.create({
      // Use Haiku for vision, it's fast and cheap
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: content }
      ]
    });

    // 3. Send the AI's response (the JSON text) back to the PWA
    return new Response(JSON.stringify({
      text: aiResponse.content[0].text
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Vision Function Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
