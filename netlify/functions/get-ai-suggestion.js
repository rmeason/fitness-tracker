// This file is netlify/functions/get-ai-suggestion.js
// It runs on Netlify's server, not in the browser.

// We import the real Anthropic SDK
import Anthropic from '@anthropic-ai/sdk';

// Netlify's AI Gateway automatically provides the API key.
// We don't need to write any keys here!
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
    // 1. Get the prompt sent from the PWA
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'No prompt provided' }), { status: 400 });
    }

    // 2. Call the real Claude API securely
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      // A ceiling, not a spend: output is billed by what is actually produced. 1024 was
      // low enough to truncate a full recommendation into invalid JSON.
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    // 3. Send the AI's response back to the PWA
    // We send back *only* the text content
    return new Response(JSON.stringify({
      text: lastTextBlock(aiResponse)
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('AI Function Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
