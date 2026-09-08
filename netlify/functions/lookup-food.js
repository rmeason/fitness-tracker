// This file is netlify/functions/lookup-food.js
// It runs on Netlify's server, not in the browser.
//
// Proxies USDA FoodData Central so the API key never reaches the client. This is its own
// function rather than a third AI passthrough: it holds a different secret and it has the
// opposite failure contract. The two AI functions return 500 on error because the client
// has nothing to fall back on. Here the client DOES -- it drops to AI-estimated macros --
// so an upstream problem returns 200 with an empty list and an error note. A 500 would
// throw away a good parse over a lookup that was only ever advisory.

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// Verified against live responses, not assumed. In the SEARCH endpoint the 1003-series
// numbers live on nutrientId; nutrientNumber carries the legacy INFOODS tagnames
// (203/204/205/208/291), so keying off nutrientNumber finds nothing.
const MACRO_BY_NUTRIENT_ID = {
  1003: 'protein',
  1004: 'fat',
  1005: 'carbs',
  1008: 'calories',
  1079: 'fiber'
};
// Atwater-specific energy, used only when the plain energy figure is missing.
const ALT_ENERGY_IDS = [2047, 2048];

// Search results are per 100 g (or per 100 ml for liquids) for BOTH Foundation/SR Legacy
// and Branded -- confirmed by hand: Core Power banana reports 7.65 g protein per 100 ml
// and a 340 ml serving, and 7.65 * 3.4 = 26.0 g, which is the label figure. The
// per-serving labelNutrients block only appears on the /food/{id} detail endpoint, which
// this function does not use. One scaling path therefore covers both.
const extractPer100 = (food) => {
  const per100 = {};
  for (const n of (food.foodNutrients || [])) {
    const key = MACRO_BY_NUTRIENT_ID[n.nutrientId];
    // Absent stays absent. A macro the database does not carry must not become 0.
    if (key && typeof n.value === 'number') per100[key] = n.value;
  }
  if (per100.calories === undefined) {
    for (const n of (food.foodNutrients || [])) {
      if (ALT_ENERGY_IDS.includes(n.nutrientId) && typeof n.value === 'number') {
        per100.calories = n.value;
        break;
      }
    }
  }
  return per100;
};

// A single Foundation hit is ~35 KB of full nutrient data. The client needs the fields it
// ranks on plus the five macros, so trim here rather than shipping all of it per item.
const trimFood = (food) => ({
  fdcId: food.fdcId,
  description: food.description,
  dataType: food.dataType,
  brandOwner: food.brandOwner || null,
  servingSize: food.servingSize || null,
  servingSizeUnit: food.servingSizeUnit || null,
  per100: extractPer100(food)
});

const ok = (payload) => new Response(JSON.stringify(payload), {
  headers: { 'Content-Type': 'application/json' }
});

export default async (req, context) => {
  try {
    const { query, dataType } = await req.json();

    if (!query || !String(query).trim()) {
      return ok({ foods: [], error: 'No query provided' });
    }

    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) {
      return ok({ foods: [], error: 'USDA_API_KEY is not set' });
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      query: String(query).trim(),
      // The ranker can only choose from what comes back, and USDA's own relevance often
      // puts a derivative ahead of the plain food -- "Almond butter" before almonds. More
      // candidates give the coverage/density filters something better to find; the trimmed
      // shape keeps each one at roughly 200 bytes.
      pageSize: '15'
    });
    if (dataType) params.set('dataType', String(dataType));

    const res = await fetch(`${SEARCH_URL}?${params.toString()}`);
    if (!res.ok) {
      return ok({ foods: [], error: `USDA lookup failed: ${res.status} ${res.statusText}` });
    }

    const data = await res.json();
    const foods = Array.isArray(data.foods) ? data.foods.map(trimFood) : [];
    return ok({ foods });

  } catch (err) {
    console.error('Lookup Food Function Error:', err);
    // Still a 200: the client degrades to the AI estimate rather than losing the parse.
    return ok({ foods: [], error: err.message });
  }
};
