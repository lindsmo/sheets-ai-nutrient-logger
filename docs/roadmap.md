# Roadmap

This project is built in phases, and each phase leaves a working tool. Phases 0 and 1 are done. The Phase 1 section below summarizes its accuracy testing. Everything after that is planned rather than built, and may change as I learn from real use.

| Phase | Scope | Status |
|---|---|---|
| 0 | API keys, spreadsheet tabs, and headers | ✅ Done |
| 1 | Gemini-only MVP: photo → nutrient estimate → review → sheet, with prompt iteration and an accuracy baseline | ✅ Done ([`v1.0-gemini-mvp`](https://github.com/lindsmo/sheets-ai-nutrient-logger/releases/tag/v1.0-gemini-mvp)) |
| 2 | Cross-check nutrients against USDA FoodData Central | Next |
| 3 | Polish: meal type from time of day, photos in Drive, quick re-logging, dashboard | Planned |
| 4 | Optional extras, in any order | Ideas |

---

## Phase 1: Prompt iteration and accuracy baseline

Once the MVP worked, and before adding USDA data, I wanted a measured baseline for Gemini's estimates on their own, so that Phase 2 has something concrete to beat. Full results are in [accuracy-analysis.md](accuracy-analysis.md).

**What I did:**
- **Tested two meals I'd calculated from USDA data,** overnight oats and an egg bake, under seven conditions: from photo only up to the full recipe with weights, 3 runs each. I scored each one by mean absolute percent error (MAPE) and signed bias.
- **Compared three prompt versions:**
  - the original prompt;
  - an ingredient breakdown for mixed dishes, with each ingredient labeled `visible`, `inferred`, or `user`;
  - a recipe rule that converts the recipe to grams and scales it to my serving.
- **Compared two models** (see [design decision #16](design-decisions.md#16-the-faster-model-over-the-more-accurate-one)).
- **Added tracking columns** for the ingredient breakdown, model, note, token usage, and prompt fingerprint, so later changes can be measured the same way.

**What I learned:**
- **Photo only** was 23–49% off, because the photo can't show hidden ingredients. Naming them in a one-line note helped the oatmeal a lot (18%), but not the egg bake.
- **A recipe** gave the best results on the production model: 8% for the egg bake with the recipe and serving weight, and 13% for the oatmeal with the recipe alone. The egg bake figure leaves out fiber and omega-3, because percent errors calculated on such tiny amounts aren't meaningful.
- **Gemini's ingredient amounts are now accurate, but its nutrient totals don't follow them.** That points to calculating the totals in code (Phase 2) rather than further prompt work.

**Carried into Phase 2:** stating units in the prompt (vitamin A as mcg RAE, folate as mcg DFE) for meals where Gemini's estimates are still used.

---

## Phase 2: USDA FoodData Central cross-check

**Goal:** replace Gemini's estimated nutrient values with lab-based values from [USDA FoodData Central](https://fdc.nal.usda.gov/) wherever a food matches confidently, and keep Gemini's estimates as the fallback.

**Approach:**
1. Gemini still identifies each food and estimates its weight in grams. For mixed dishes, it also lists each ingredient's grams (`items[].ingredients[].grams`). The schema already captures both.
2. Look up each ingredient, or each simple food that has no ingredients, in USDA's SR Legacy data first, then Foundation, then FNDDS for prepared foods.
3. Scale USDA's per-100 g values to the grams, then add everything up in code. For a recipe item, the serving is the sum of its ingredients, not Gemini's separate portion estimate.
4. Show the source on the review screen: **USDA**, **USDA + AI**, or **AI estimate**, with a match indicator for each item.

**Why this order:** in the Phase 1 accuracy testing, Gemini's ingredient amounts for recipes came within a few grams of the actual values, while its calorie totals were off by up to 63%. My rough sums of its own ingredient lists came within about 4% of actual calories. Calculating in code uses the part Gemini does well and skips the part it does badly.

**Open questions:**
- **Match quality.** USDA's top search result can be wrong; "chicken" might return "chicken liver." I'll likely need a relevance check, or ask Gemini to name foods the way USDA does ("broccoli, steamed" rather than "garlicky roasted broccolini").
- **Partial matches.** Ingredient-level lookups let sources mix: a matched ingredient uses USDA, and an unmatched one needs a fallback. Gemini only returns meal totals, so the fallback might need per-item estimates from Gemini.
- **Volume conversions.** Gemini still misconverts some volumes to grams, such as chia, flax, and cooking spray. USDA's portion data (grams per cup or tablespoon) could handle that in code when a recipe is given.
- **Photo-only meals.** Without a recipe, the ingredient amounts are Gemini's guesses (for example, twice the egg that's really in the egg bake). USDA values make each gram accurate, but not the number of grams, so Phase 2 will help photo-only meals less than recipes.

**Done when:** the Phase 1 accuracy test is rerun with USDA enabled and the results are compared side by side.

---

## Phase 3: Polish

| Feature | What it does | Open question or tradeoff |
|---|---|---|
| **Meal type from time of day** | Sets breakfast, lunch, dinner, or snack from the local time, keeps Gemini's guess as the fallback for unusual hours, and adds a picker to correct it before logging | Uses the phone's time zone, which the page sends with each request; otherwise travel mislabels meals (see [design decision #8](design-decisions.md#8-a-separate-date-column-written-in-the-sheets-time-zone)). |
| **Photos saved to Google Drive** | Saves each photo to a private Drive folder and fills the reserved **Photo URL** column (AL) | Uses the narrow `drive.file` scope, so the script can see only files it created, not my whole Drive. The photo is too large for the cache, so the page sends it again when I confirm. Saving at confirm means discarded analyses leave no photos behind. |
| **Quick re-logging** | A "Recent meals" list on the page; tap one to log it again with a new timestamp | Re-logs the stored values without a new analysis, so it's best for meals I eat often in the same amounts. The tracking columns (model, tokens, prompt fingerprint) should be marked as a re-log rather than copied from the original row. |
| **Dashboard tab** | Daily totals, a daily history built with `QUERY`, 7-day averages, and today's water and food together | None; it's spreadsheet formulas only, with no code changes |
| **Record time zone** | Adds a time zone column to both tabs | Lets analysis of travel days account for local time |

---

## Phase 4: Optional extras

Each of these is self-contained. Rough priority order:

| Idea | Why | Notes |
|---|---|---|
| **Saved recipes** | Define a regular meal once, as ingredients in grams plus its total weight, then log it by the grams I eat, calculated from USDA data | For meals I eat often, an exact recipe beats any AI estimate, which the Phase 1 accuracy testing made clear. The two test meals double as a check: they should reproduce the hand-calculated values. |
| **Text-only logging** | Log a meal with no photo ("handful of almonds, about 1 oz") | Same prompt, with a text version of the portion instructions and its own prompt fingerprint |
| **Edit grams before logging** | Correct an ingredient's or food's grams on the review screen | The totals are recalculated from USDA data, so a corrected weight gives corrected nutrients |
| **Barcode lookup** | Label values for packaged foods, from a photo of the barcode | Read in the browser; looked up in USDA Branded foods first, then [Open Food Facts](https://world.openfoodfacts.org/). Micronutrients beyond the label are often missing. |
| **Trend charts** | Charts of calories, macros, and water over time, with optional goal lines | Built in Sheets on the Phase 3 dashboard |
| **Share-sheet capture** | Send a photo to the logger from Android's share menu or an iOS Shortcut | A `doPost` endpoint, gated by the same secret key, that analyzes the photo and queues it for review on the page rather than logging it, keeping [design decision #11](design-decisions.md#11-review-before-commit). It depends on whether HTTP Shortcuts can send a shared image as base64. |

---

## Not planned

- **Multiple users.** This is a personal tool. Supporting other people would need real authentication instead of a shared key, plus separate storage for each user.
- **A native app.** The web app plus home-screen shortcuts already give one-tap logging without an app store.
- **Medical or dietary guidance.** The tool records estimates. It doesn't interpret them.
