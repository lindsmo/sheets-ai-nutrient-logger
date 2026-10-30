/** @OnlyCurrentDoc */
function doGet(e) {
  // Retrieve secret key from Script Properties
  const secretKey = PropertiesService.getScriptProperties().getProperty('SECRET_KEY');

  // Gatekeeper: require the secret key for ALL requests
  if (!secretKey || e.parameter.key !== secretKey.trim()) {
    return ContentService.createTextOutput('no');
  }

  // Route 1: Food logging page
  if (e.parameter.page === 'food') {
    return HtmlService.createHtmlOutputFromFile('FoodLogger')
      .setTitle('Food Logger')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Route 2: Water logging
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const day = Utilities.parseDate(todayStr, tz, 'yyyy-MM-dd');
  const oz = Number(e.parameter.oz);
  if (!(oz > 0)) {
    return ContentService.createTextOutput('Invalid oz value');
  }

  const sheet = ss.getSheetByName('Water');
  sheet.appendRow([now, day, oz]);
  SpreadsheetApp.flush();

  const isDate = v => v && typeof v.getTime === 'function';
  const todayTotal = sheet.getDataRange().getValues()
    .filter(r => isDate(r[1]) && Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') === todayStr)
    .reduce((sum, r) => sum + Number(r[2]), 0);

  return ContentService.createTextOutput(`${oz} oz · ${todayTotal} oz today`);
}

// Food Logging: Gemini analysis prompt
function buildFoodAnalysisPrompt(userNotes) {
  // Hand length for portion scale reference, in inches: wrist crease to middle fingertip, as the hand appears
  // in photos (flat, fingers together). Falls back to 7 if HAND_LENGTH_INCHES is not set or not a number.
  const handLengthIn = parseFloat(PropertiesService.getScriptProperties().getProperty('HAND_LENGTH_INCHES')) || 7;
  const handLengthCm = (handLengthIn * 2.54).toFixed(1);

  let prompt = `You are a nutrition analysis assistant. Analyze this food photo and provide a detailed nutritional breakdown.

TASK:
1. Identify every distinct food item in the photo. For mixed or prepared dishes (casseroles, baked goods, oatmeal, smoothies, salads with dressing), also list the ingredients you believe it contains, including likely ingredients that aren't visible (e.g., flour or dairy in a baked egg dish, nut butter or seeds mixed into oatmeal).
2. Estimate the portion size of each item. If a human hand is visible in the photo, use it as a size reference (my hand, flat with fingers together, is about ${handLengthIn} inches / ${handLengthCm} cm from wrist to middle fingertip). Also use plates, bowls, utensils, and other objects for scale.
3. For each food item, estimate the full nutritional content based on the identified food and estimated portion.
4. Sum the nutrients across all items to provide a meal total.

RESPOND WITH ONLY valid JSON in this exact structure (no markdown, no code fences):
{
  "meal_description": "Brief one-line description of the entire meal",
  "meal_type": "breakfast|lunch|dinner|snack",
  "items": [
    {
      "name": "Food item name",
      "estimated_portion": "e.g., 6 oz, 1 cup, 2 slices",
      "portion_grams": 170,
      "source": "visible|inferred|user",
      "ingredients": [
        { "name": "Ingredient name, e.g., egg, whole", "recipe_grams": 900, "grams": 75, "source": "visible|inferred|user" }
      ]
    }
  ],
  "totals": {
    "calories": 0,
    "protein_g": 0,
    "total_carbs_g": 0,
    "total_fat_g": 0,
    "fiber_g": 0,
    "sugar_g": 0,
    "saturated_fat_g": 0,
    "trans_fat_g": 0,
    "cholesterol_mg": 0,
    "sodium_mg": 0,
    "potassium_mg": 0,
    "calcium_mg": 0,
    "iron_mg": 0,
    "vitamin_a_mcg": 0,
    "vitamin_c_mg": 0,
    "vitamin_d_mcg": 0,
    "vitamin_e_mg": 0,
    "vitamin_k_mcg": 0,
    "thiamin_mg": 0,
    "riboflavin_mg": 0,
    "niacin_mg": 0,
    "vitamin_b6_mg": 0,
    "folate_mcg": 0,
    "vitamin_b12_mcg": 0,
    "magnesium_mg": 0,
    "zinc_mg": 0,
    "selenium_mcg": 0,
    "phosphorus_mg": 0,
    "copper_mg": 0,
    "manganese_mg": 0,
    "omega3_g": 0
  },
  "confidence": "high|medium|low",
  "notes": "Any caveats about the estimate, e.g., 'Sauce is difficult to quantify, estimated based on typical restaurant portion'"
}

GUIDELINES:
- Use your best nutritional knowledge. Base estimates on USDA nutritional data standards.
- For mixed dishes (casseroles, stews, etc.), estimate based on typical recipes and visible ingredients.
- For simple single foods (an apple, a slice of bread), "ingredients" may be an empty array.
- Ingredient grams for an item should sum approximately to that item's portion_grams.
- Mark the source of each item and each ingredient: "user" if it came from the user's notes or recipe, "visible" if you can see it in the photo, "inferred" if you're assuming it (e.g., a dressing or sauce you can't see, or an ingredient from typical recipes).
- "recipe_grams" is the ingredient's amount in the user's FULL recipe. Use null when the user hasn't provided a recipe.
- If the user provides a recipe:
  1. Treat its ingredients and amounts as authoritative. Mark them source "user", even after scaling.
  2. Convert each ingredient to grams for the FULL recipe ("recipe_grams"), using realistic densities for dry ingredients (e.g., 1 cup rolled oats ≈ 80 g, 1 cup shredded cheese ≈ 113 g, 1 large egg ≈ 50 g, 1 cup peanut butter ≈ 258 g).
  3. Determine the serving fraction from the recipe, not the photo: serving weight ÷ total recipe weight if weights are given, otherwise servings eaten ÷ total servings made.
  4. Multiply each ingredient's "recipe_grams" by that fraction to get its "grams", and use the sum as the item's portion_grams.
  5. Foods listed outside the recipe (e.g., toppings) are separate items.
  6. State the serving fraction you used in "notes".
- For restaurant food, consider that restaurants typically use more butter, oil, and salt than home cooking.
- Round nutrient values to reasonable precision (calories to nearest 5, grams to 1 decimal, mg to nearest 1, mcg to nearest 1).
- Set confidence to "high" for simple, clearly identifiable foods; "medium" for restaurant or partially obscured foods; "low" for complex mixed dishes or unclear photos.
- If the photo is not of food, respond with: {"error": "No food detected in this image"}`;

  if (userNotes) {
    prompt += `\n\nADDITIONAL CONTEXT FROM USER: ${userNotes}`;
  }

  return prompt;
}

// Food Logging: Gemini API call with retry on high demand
function analyzeFood(imageBase64, mimeType, userNotes) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in Script Properties');

  // Read model from Script Properties (defaults to gemini-3.1-flash-lite if not set)
  const model = (props.getProperty('GEMINI_MODEL') || 'gemini-3.1-flash-lite').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const prompt = buildFoodAnalysisPrompt(userNotes);

  const payload = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: mimeType || 'image/jpeg',
            data: imageBase64
          }
        },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: 0.2,       // Low temperature for more consistent/factual output
      responseMimeType: "application/json"  // Forces JSON output
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey }, // Key in a header, not the URL
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());

    if (statusCode === 200 && result.candidates && result.candidates[0]) {
      const text = result.candidates[0].content.parts[0].text;
      // Parse the JSON response (Gemini sometimes wraps in code fences despite instructions)
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const analysis = JSON.parse(cleaned);
      analysis.model_used = model; // Recorded in the Model column
      analysis.token_usage = formatTokenUsage(result.usageMetadata); // Recorded in the Token Usage column
      return analysis;
    }

    if (result.error) {
      lastError = result.error.message;
      const isTemporary = statusCode === 503 || statusCode === 429 || 
                          (result.error.message && result.error.message.includes('high demand'));

      if (isTemporary && attempt < maxAttempts) {
        Utilities.sleep(attempt * 2000);
        continue;
      }
    }
  }

  throw new Error(`Gemini API error: ${lastError}`);
}

// Food Logging: Append a row containing the parsed Gemini response to the Food tab in the Google spreadsheet.
function logFoodToSheet(analysis) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sheet = ss.getSheetByName('Food');
  if (!sheet) throw new Error('No tab named "Food" found in the spreadsheet');

  const now = new Date();
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const day = Utilities.parseDate(todayStr, tz, 'yyyy-MM-dd');

  const t = analysis.totals;

  const row = [
    now,                          // A: Timestamp
    day,                          // B: Date
    analysis.meal_type || '',     // C: Meal
    analysis.meal_description,    // D: Description
    t.calories,                   // E: Calories (kcal)
    t.protein_g,                  // F: Protein (g)
    t.total_carbs_g,              // G: Total Carbs (g)
    t.total_fat_g,                // H: Total Fat (g)
    t.fiber_g,                    // I: Fiber (g)
    t.sugar_g,                    // J: Sugar (g)
    t.saturated_fat_g,            // K: Saturated Fat (g)
    t.trans_fat_g,                // L: Trans Fat (g)
    t.cholesterol_mg,             // M: Cholesterol (mg)
    t.sodium_mg,                  // N: Sodium (mg)
    t.potassium_mg,               // O: Potassium (mg)
    t.calcium_mg,                 // P: Calcium (mg)
    t.iron_mg,                    // Q: Iron (mg)
    t.vitamin_a_mcg,              // R: Vitamin A (mcg RAE)
    t.vitamin_c_mg,               // S: Vitamin C (mg)
    t.vitamin_d_mcg,              // T: Vitamin D (mcg)
    t.vitamin_e_mg,               // U: Vitamin E (mg)
    t.vitamin_k_mcg,              // V: Vitamin K (mcg)
    t.thiamin_mg,                 // W: Thiamin (B1) (mg)
    t.riboflavin_mg,              // X: Riboflavin (B2) (mg)
    t.niacin_mg,                  // Y: Niacin (B3) (mg)
    t.vitamin_b6_mg,              // Z: Vitamin B6 (mg)
    t.folate_mcg,                 // AA: Folate (mcg DFE)
    t.vitamin_b12_mcg,            // AB: Vitamin B12 (mcg)
    t.magnesium_mg,               // AC: Magnesium (mg)
    t.zinc_mg,                    // AD: Zinc (mg)
    t.selenium_mcg,               // AE: Selenium (mcg)
    t.phosphorus_mg,              // AF: Phosphorus (mg)
    t.copper_mg,                  // AG: Copper (mg)
    t.manganese_mg,               // AH: Manganese (mg)
    t.omega3_g,                   // AI: Omega-3 (g)
    analysis.confidence,          // AJ: Confidence
    analysis.notes || '',         // AK: AI Notes
    '',                           // AL: Photo URL — to be added in Phase 3
    formatItems(analysis.items),  // AM: Items
    analysis.model_used || '',    // AN: Model
    analysis.logging_method || '',// AO: Logging Method
    analysis.user_notes || '',    // AP: User Notes
    analysis.token_usage || '',   // AQ: Token Usage
    analysis.prompt_fingerprint || '' // AR: Prompt Fingerprint
  ];

  sheet.appendRow(row);
  SpreadsheetApp.flush();

  return {
    description: analysis.meal_description,
    calories: t.calories,
    protein: t.protein_g,
    carbs: t.total_carbs_g,
    fat: t.total_fat_g
  };
}

// Food Logging: Flatten Gemini's items and their ingredients into one readable cell for the Items column, e.g.
//   Spinach egg bake (209 g) [user]: egg, whole 75 g of 900 g [user]; cheddar cheese 47 g of 565 g [user] | Pecans (25 g) [visible]
// Items are separated by " | " and ingredients by "; ", since food names often contain commas.
// "of N g" is the ingredient's full-recipe amount, shown only when the user provided a recipe.
function formatItems(items) {
  return (items || []).map(item => {
    let text = `${item.name} (${item.portion_grams} g) [${item.source}]`;
    const ingredients = item.ingredients || [];
    if (ingredients.length) {
      text += ': ' + ingredients.map(ing => {
        const recipeGrams = ing.recipe_grams != null ? ` of ${ing.recipe_grams} g` : '';
        return `${ing.name} ${ing.grams} g${recipeGrams} [${ing.source}]`;
      }).join('; ');
    }
    return text;
  }).join(' | ');
}

// Food Logging: Summarize Gemini's token counts for the Token Usage column, e.g.
//   input 1650 (image 1100, text 550); output 780; thinking 900; total 3330
// Counts come from the successful request only, not from any retried attempts.
function formatTokenUsage(usage) {
  if (!usage) return '';
  let input = `input ${usage.promptTokenCount || 0}`;
  const byModality = (usage.promptTokensDetails || [])
    .map(d => `${String(d.modality).toLowerCase()} ${d.tokenCount}`);
  if (byModality.length) input += ` (${byModality.join(', ')})`;
  const parts = [input, `output ${usage.candidatesTokenCount || 0}`];
  if (usage.thoughtsTokenCount) parts.push(`thinking ${usage.thoughtsTokenCount}`);
  if (usage.cachedContentTokenCount) parts.push(`cached ${usage.cachedContentTokenCount}`);
  parts.push(`total ${usage.totalTokenCount || 0}`);
  return parts.join('; ');
}

// Food Logging: Short fingerprint of the prompt text for the Prompt Fingerprint column.
// Changes automatically whenever the prompt (including the HAND_LENGTH_INCHES value in it) changes,
// so each logged row can be traced to the prompt version that produced it. Excludes the user's notes.
function getPromptFingerprint() {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, buildFoodAnalysisPrompt(''), Utilities.Charset.UTF_8);
  return digest.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('').slice(0, 8);
}

// Food Logging: Label how much context the user gave, for the Logging Method column.
// A label for later analysis only; it doesn't change how the meal is analyzed.
function getLoggingMethod(userNotes) {
  if (!userNotes) return 'Photo only';
  if (/recipe/i.test(userNotes)) return 'Photo + recipe';
  return 'Photo + note';
}

// Food Logging: Server-side handler
/**
 * Called from the front-end to analyze a food photo.
 * Returns the analysis for user review before logging.
 */
function analyzeFoodPhoto(imageBase64, mimeType, userNotes) {
  try {
    const analysis = analyzeFood(imageBase64, mimeType, userNotes);
    if (analysis.error) {
      return { success: false, error: analysis.error };
    }
    analysis.logging_method = getLoggingMethod(userNotes); // Recorded in the Logging Method column
    analysis.user_notes = userNotes || '';                 // Recorded in the User Notes column
    analysis.prompt_fingerprint = getPromptFingerprint();  // Recorded in the Prompt Fingerprint column
    // Store in cache for the confirm step (avoids re-sending the full analysis)
    CacheService.getUserCache().put('pendingAnalysis', JSON.stringify(analysis), 600); // 10 min TTL
    return { success: true, analysis: analysis };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Called from the front-end when the user confirms the analysis.
 * Logs the pending analysis to the sheet.
 */
function confirmAndLog() {
  try {
    const cached = CacheService.getUserCache().get('pendingAnalysis');
    if (!cached) {
      return { success: false, error: 'Analysis expired. Please re-upload the photo.' };
    }
    const analysis = JSON.parse(cached);
    const summary = logFoodToSheet(analysis);
    CacheService.getUserCache().remove('pendingAnalysis');
    return { success: true, summary: summary };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Food Logging: One-time-use function needed for the first time an Apps Script calls an external API. Within the Apps Script editor, select authorizeScript from the function dropdown (next to "Debug") in the toolbar at the top of the UI, then click Run. Grant necessary permissions in the popup that appears.
function authorizeScript() {
  UrlFetchApp.fetch("https://www.google.com");
}