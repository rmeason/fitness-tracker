// This file is netlify/functions/get-vision-extraction.js
// It runs on Netlify's server, not in the browser.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();


// Claude returns an ARRAY of content blocks and block 0 is not always the answer. With
// adaptive thinking -- on by default for Sonnet 5 -- a thinking block comes first, and
// its .text is undefined, so content[0].text silently yields undefined and the client
// then throws on it. Take the last text block instead.
const lastTextBlock = (message) => {
  const blocks = (message.content || []).filter(b => b.type === 'text' && typeof b.text === 'string');
  return blocks.length > 0 ? blocks[blocks.length - 1].text : '';
};

export default async (req, context) => {
  try {
    // 1. Get the content (prompt + image/text) from the PWA
    const { content } = await req.json();

    if (!content || content.length === 0) {
      return new Response(JSON.stringify({ error: 'No content provided' }), { status: 400 });
    }

    // 2. Call the real Claude Vision API
    const aiResponse = await anthropic.messages.create({
      // Haiku stays: it is the cheapest model and this runs on a metered credit budget.
      // Dated model IDs are no longer the correct form.
      model: 'claude-haiku-4-5',
      // A ceiling, not a spend. A multi-item meal parse overran 1024 and came back as
      // truncated, unparseable JSON.
      max_tokens: 4096,
      messages: [
        { role: 'user', content: content }
      ]
    });

    // 3. Send the AI's response (the JSON text) back to the PWA
    return new Response(JSON.stringify({
      text: lastTextBlock(aiResponse)
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Vision Function Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
