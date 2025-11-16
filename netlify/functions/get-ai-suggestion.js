// This file is netlify/functions/get-ai-suggestion.js
// It runs on Netlify's server, not in the browser.

// We import the real Anthropic SDK
import Anthropic from '@anthropic-ai/sdk';

// Netlify's AI Gateway automatically provides the API key.
// We don't need to write any keys here!
const anthropic = new Anthropic();

export default async (req, context) => {
  try {
    // 1. Get the prompt sent from the PWA
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'No prompt provided' }), { status: 400 });
    }

    // 2. Call the real Claude API securely
    const aiResponse = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    // 3. Send the AI's response back to the PWA
    // We send back *only* the text content
    return new Response(JSON.stringify({
      text: aiResponse.content[0].text
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('AI Function Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
