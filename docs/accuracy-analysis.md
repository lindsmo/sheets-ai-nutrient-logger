# Phase 1 Accuracy Testing

## Summary

I tested how close Gemini's nutrient estimates come to values I calculated from the recipe and USDA data, using two meals I eat regularly. I compared three prompt versions and two models:
- **v16:** the original prompt.
- **v17:** adds an ingredient breakdown.
- **v18:** adds a rule for converting and scaling recipes.

Run data: [`accuracy-runs.csv`](../data/accuracy-runs.csv) has all 107 runs, and [`accuracy-actuals.csv`](../data/accuracy-actuals.csv) has the actual values they're scored against.

**MAPE by condition, `gemini-3.1-flash-lite`** (lower is better)

| Condition | Oatmeal v16 | Oatmeal v17 | Oatmeal **v18** | Egg bake v16 | Egg bake v17 | Egg bake **v18** |
|---|---|---|---|---|---|---|
| C1: Photo only | 47% | 37% | **49%** | 39% | 26% | **23%** |
| C2: + short note | 42% | 31% | **35%** | 55% | 34% | **31%** |
| C3: + full recipe | 16% | 14% | **13%** | 117% | 66% | **79%** |
| C4: + recipe and serving weights | 25% | 19% | **22%** | 38% | 15% | **8%** |
| C5: + recipe and servings count | — | — | — | — | 12% | **26%** |
| C6: + recipe, count, and weights | — | — | **24%** | — | — | **11%** |
| C7: + note naming hidden ingredients (no recipe) | — | — | **18%** | — | — | **31%** |

*Egg bake MAPE excludes fiber (0.6 g actual) and omega-3 (0.18 g actual); see [Metrics](#metrics). For reference, `gemini-3.8-flash` (v16 prompt) scored 10% and 9% on oatmeal C3 and C4, and 5% and 4% on egg bake C3 and C4.*

**Takeaways:**
- **v18 fixed the recipe arithmetic, but MAPE didn't improve.** In every recipe run for both meals, the ingredient amounts now match the recipe to within a few grams, labeled as coming from me (`user`). v17 had been off by up to 3 times (see [What v18 changed](#what-v18-changed)). MAPE still didn't improve, because **the model's nutrient totals aren't calculated from its own ingredient list**:
  - **Egg bake C3:** with exactly the right ingredients, it reported 640 kcal for a serving of about 393 kcal. The totals follow a portion weight it estimates separately (about 334 g, against the real 209 g), even though the prompt tells it to use the sum of its ingredients (about 210 g).
  - **Oatmeal C4:** with the right ingredients and the right serving weight, it reported 23% too few calories. Adding up its own list gives about 562 kcal (−4%).
- **So the next gain comes from calculating in code (Phase 2), not from more prompt work.** I'm keeping v18 because its ingredient lists are the input Phase 2 needs.
- **A recipe plus the serving weight (C4) is still the most reliable note on v18.** The egg bake reached 8%, its best result so far. The oatmeal's C4 was consistently low (−22% bias). Adding the servings count to the weights (C6) changed nothing for either meal. A count without weights (C5) got worse, because the model estimated a portion that was too large.
- **Naming the hidden ingredients in one line (C7) helped the oatmeal a lot, but not the egg bake.** The oatmeal reached 18%, with calories exact, against 31–49% for every earlier note without a recipe. The egg bake stayed at 31%, because the model still had to guess the egg-to-cheese ratio.
- **I'm keeping `gemini-3.1-flash-lite` as the production model.** `gemini-3.8-flash` is far more accurate with a recipe, but too slow and unreliable for daily use (see [Model choice](#model-choice)).
- **These are two case studies, not a benchmark.** Calorie estimates vary by up to ±12% between runs of the same condition, so differences of under about 10 MAPE points aren't meaningful.

---

## Setup

| | |
|---|---|
| **Models** | `gemini-3.1-flash-lite` (production, chosen for speed and free-tier limits) and `gemini-3.8-flash` (reference only) |
| **Temperature** | 0.2 |
| **Prompt versions** | **v16:** the original prompt.<br>**v17:** each item lists its ingredients, with grams and a source (`visible`, `inferred`, or `user`), including likely hidden ingredients. Also added the Items, Model, and Logging Method columns.<br>**v18:** a recipe rule (treat the recipe as authoritative and label it `user`, convert it to grams for the full recipe, take the serving fraction from the recipe rather than the photo, then scale) and a `recipe_grams` field. Also added the User Notes, Token Usage, and Prompt Fingerprint columns. Fingerprint `35a0a42e`. |
| **Test dates** | October 21–27, 2026 |
| **Photos** | One photo per meal, with my hand in frame. The same file was used for every run, and later phases retest with the same files. |
| **Runs** | 3 per condition, except 3.8 Flash egg bake C1 (2 runs). 107 runs total. |
| **Actual values** | Calculated per ingredient from USDA FoodData Central **SR Legacy** entries, scaled by my measured recipe and serving weights. The one exception is cacao nibs, which use a Branded entry because no SR Legacy or Foundation entry exists (see [Data corrections](#data-corrections)). |
| **Token usage (v18 baseline)** | Photo only: 2,398 input tokens (1,102 image, 1,296 text) and about 700–750 output. With a full recipe: about 2,670–2,740 input and 890–1,000 output. About 3,100–3,700 tokens in total per analysis, with no thinking tokens reported. |

### Conditions

| ID | What was in the note | Full text |
|---|---|---|
| C1 | Nothing (photo only) | — |
| C2 | A short description of the meal | [Appendix A](#appendix-a-note-text-by-condition) |
| C3 | C2 + the full recipe (ingredients and instructions) | [Appendix A](#appendix-a-note-text-by-condition) |
| C4 | C3 + total recipe weight and serving weight | [Appendix A](#appendix-a-note-text-by-condition) |
| C5 | C3 + the number of servings the recipe makes (egg bake only: "Makes 48 squares") | [Appendix A](#appendix-a-note-text-by-condition) |
| C6 | C3 + the servings count *and* both weights, on one line | [Appendix A](#appendix-a-note-text-by-condition) |
| C7 | A one-line description naming the hidden ingredients, with no recipe and no weights | [Appendix A](#appendix-a-note-text-by-condition) |

The two meals' C2 notes aren't equally detailed. The oatmeal note lists weights for each component; the egg bake note says only "4 squares of spinach egg bake." The oatmeal's C7 note drops those weights.

### Metrics

- **Percent error** for each nutrient: `(mean estimate − actual) ÷ actual`, using the mean of the runs. A single run can be further off than the mean; the ranges in the values tables show how far.
- **MAPE (accuracy):** the mean of the *absolute* percent errors.
- **Bias (direction):** the mean of the *signed* percent errors.
- **Calories + macros:** the same two metrics across calories, protein, carbs, and fat only.
- **Nutrients included:** calories, protein, carbs, fat, fiber, sugar, cholesterol, sodium, potassium, calcium, iron, and omega-3, minus any with an actual value of 0 (cholesterol for the oatmeal).
- **Low-value nutrients:** for the egg bake, fiber (0.6 g) and omega-3 (0.18 g) are left out of MAPE and bias, because differences of a few tenths of a gram produce errors of 100–370%. Their percent errors still appear in the tables, and an all-nutrient MAPE is listed for reference.
- **Egg bake actual values** are the recipe totals divided by 12, without rounding. The rounded values appear in the tables.

### Hypotheses going in

- **H1:** Accuracy improves as the note gets more specific (C1 → C4).
- **H2:** With the full recipe and weights (C4), every nutrient lands within ±10% of actual.

---

## What v18 changed

### The ingredient amounts are now right

The v18 recipe rule did what it was designed to do. In every recipe run (C3–C6) for both meals:
- each ingredient's full-recipe amount was converted to grams and multiplied by the serving fraction;
- the fraction came from the recipe (1/12 for the egg bake, 165 ÷ 2042 for the oatmeal) and was stated in the notes;
- every recipe ingredient was labeled `user`.

| Ingredient (per serving) | Actual | v17, C4 runs | v18, C3–C6 runs |
|---|---|---|---|
| Oatmeal: old-fashioned oats | 13 g | 28–39 g | 12.9–13.9 g |
| Oatmeal: peanut butter | 42 g | 34–36 g | 41.7–44.8 g |
| Oatmeal: water | 96 g | 54–84 g | 95.6–102.7 g |
| Egg bake: eggs | 75 g | 100–126 g | 75 g in every run |
| Egg bake: Greek yogurt | 57 g | 35–42 g | 56.7–62.5 g |
| Egg bake: cheddar | 47 g | 29–35 g | 47–52 g |

A few conversions are still off, all for ingredients the prompt gives no example density for:
- **Chia:** ¾ cup was read as 120 g, against 144 g.
- **Flax in oatmeal C4 and C6:** ½ cup was read as 28–45 g, against 56 g. C3 had it right.
- **Cooking spray in egg bake C6:** a "6-second spray" was read as 56 g of oil, about 4.7 g (40 kcal) per serving. USDA counts a spray that short as about 0 kcal.

### The nutrient totals don't follow the ingredients

The model now lists the right ingredients and then reports totals that don't match them.

**Egg bake: the totals follow a separately estimated portion.** The prompt asks that ingredient grams add up to the item's `portion_grams`. v18's recipe rule goes further, telling the model to use the sum of the scaled ingredients *as* `portion_grams` (step 4). v17 kept the sum by inflating the ingredients to fill the portion. v18 keeps the ingredients right and ignores the instruction:

| Condition | Portion the model reported | Sum of its ingredient grams | Calories vs. actual |
|---|---|---|---|
| C3 | 330–334 g (1.6 × actual) | about 206–212 g | +63% |
| C5 | 250–254 g (1.2 × actual) | about 205–217 g | +26% |
| C4, C6 | 209.2 g (from my note) | about 206–215 g | +9%, +11% |

The calorie error tracks the portion, not the ingredients. One C5 run estimated the full recipe at 3,049 g, against the real 2,511 g. Adding up the v18 C3 ingredient list instead gives about 393–408 kcal (0 to +4%).

**Oatmeal: correct ingredients, low totals.** In C4 and C6, the serving weight was given and the ingredients added up to it. Yet every run reported 445–465 kcal (−21% to −23%). Adding up the model's own C4 ingredient list gives about 562 kcal (−4%) and about 46.5 g of fat (−3%, against the reported −27%).

**What it means:** the model's ingredient list is now more reliable than its nutrient totals. Calculating the totals in code from the ingredient grams, as planned for Phase 2, should remove most of the remaining recipe error. A recipe rule can't fix this on its own.

---

## Results: Overnight Oatmeal (lite, v18)

### Values: mean (min–max) of 3 runs

| Nutrient | Actual | C1 | C2 | C3 | C4 | C6 | C7 |
|---|---|---|---|---|---|---|---|
| Confidence | — | medium | high | high | high | high | high |
| Calories (kcal) | 583.7 | 375 (365–395) | 451.7 (445–455) | 561.7 (545–585) | 451.7 (445–455) | 458.3 (455–465) | 583.3 (540–645) |
| Protein (g) | 16.8 | 8.2 (7.5–8.5) | 10.5 | 16.9 (16.5–17.5) | 14.4 (13.8–14.8) | 13.8 | 17.2 (16.5–18.5) |
| Total carbs (g) | 30.4 | 32 | 44.3 (42–48.5) | 32.1 (31.2–32.5) | 24.6 (24.2–25.2) | 24.7 (24.5–25.2) | 38 |
| Total fat (g) | 48.0 | 26.5 (25.5–28.5) | 28.5 (26.5–29.5) | 43.5 (41.5–45.5) | 34.8 (34.5–35.5) | 35.6 (35.2–36.5) | 42.7 (38.5–48) |
| Fiber (g) | 12.8 | 6.3 (6–6.5) | 10.2 (9.5–10.5) | 12.8 (12.4–13.5) | 10.7 (10.5–10.8) | 10.3 (10.2–10.5) | 11.5 (10.5–13.5) |
| Sugar (g) | 5.6 | 7.8 (7–8.5) | 9.8 (8.5–11.5) | 2.4 (2.1–2.5) | 2.2 (2.1–2.5) | 2.1 | 4.2 (3.5–4.5) |
| Sodium (mg) | 58.5 | 8.3 (5–15) | 25 (15–35) | 61.7 (55–65) | 51.7 (45–55) | 45 | 110 |
| Potassium (mg) | 523.4 | 300 (280–310) | 433.3 (410–480) | 546.7 (480–580) | 483.3 (480–485) | 481.7 (480–485) | 526.7 (480–580) |
| Calcium (mg) | 139.0 | 41.7 (35–45) | 106.7 (95–115) | 115 | 91.7 (85–95) | 88.3 (85–95) | 133.3 (115–165) |
| Iron (mg) | 3.4 | 2.6 (2.2–2.8) | 3.7 (3.5–3.8) | 4.3 (4.2–4.5) | 3.3 (3.2–3.5) | 3.2 | 3.9 (3.8–4.2) |
| Omega-3 (g) | 3.4 | 0.3 | 2.1 (2.1–2.2) | 3.1 (2.8–3.2) | 2.7 (2.4–2.8) | 2.7 (2.4–2.8) | 2.8 (2.1–3.5) |

A single value means all 3 runs matched. Cholesterol was 0 in every run and in the actual value.

### Percent error

| Nutrient | C1 | C2 | C3 | C4 | C6 | C7 |
|---|---|---|---|---|---|---|
| Calories | −36% | −23% | −4% | −23% | −21% | 0% |
| Protein | −51% | −38% | +1% | −14% | −18% | +2% |
| Total carbs | +5% | +46% | +5% | −19% | −19% | +25% |
| Total fat | −45% | −41% | −9% | −27% | −26% | −11% |
| Fiber | −51% | −21% | 0% | −16% | −20% | −10% |
| Sugar | +40% | +76% | −58% | −60% | −62% | −26% |
| Sodium | −86% | −57% | +5% | −12% | −23% | +88% |
| Potassium | −43% | −17% | +4% | −8% | −8% | +1% |
| Calcium | −70% | −23% | −17% | −34% | −36% | −4% |
| Iron | −24% | +9% | +26% | −3% | −6% | +16% |
| Omega-3 | −91% | −37% | −10% | −22% | −22% | −18% |
| **MAPE** | **49%** | **35%** | **13%** | **22%** | **24%** | **18%** |
| **Bias** | −41% | −11% | −5% | −22% | −24% | +6% |
| **Calories + macros MAPE** | 34% | 37% | 5% | 21% | 21% | 10% |
| **Calories + macros bias** | −32% | −14% | −2% | −21% | −21% | +4% |

### Observations

1. **The v17 → v18 changes in C2–C4 are within run-to-run noise** (31% → 35%, 14% → 13%, and 19% → 22%). C3 did tighten: its calorie range narrowed from 535–645 to 545–585 kcal, and calories plus macros improved from 9% to 5%.
2. **The C1 drop (37% → 49%) is noise in what gets inferred, not an effect of v18.** The recipe rule doesn't apply to a photo with no note. The difference is chia: v17 inferred it in 2 of 3 runs, while v18 inferred it in none (omega-3 0.3 g in every run), so its results look like v16's (47%).
3. **C4 got the ingredients right but the totals 22% low,** consistently: 445–455 kcal across the 3 runs. Its ingredient list adds up to about 562 kcal (see [What v18 changed](#what-v18-changed)). C3 used a slightly larger fraction (0.087 instead of 0.081), which gave more of every ingredient, yet came out closer to actual. Neither condition's totals match its own list.
4. **C6 behaved the same as C4:** the same fraction (165 ÷ 2042), the same ingredient grams and 24% MAPE. Since C4 already gives the exact fraction, adding the count gives the model nothing new.
5. **C7, a one-line note naming peanut butter, chia, and flax, did nearly as well as the full recipe** (18% against C3's 13%). Calories were exact and macros 10% off. Every earlier note without a recipe scored 31–49%. Some of that is luck from errors canceling out:
   - It inferred 40–60 g of oats (actual 13 g) and 80 g of almond milk, so carbs came out +25%.
   - It inferred 32 g of peanut butter (actual 42 g), so fat came out −11%.
   - Sodium was +88% (110 mg in every run).

   It labeled the peanut butter `visible` and the chia and flax `inferred`, even though the note named all three.
6. **The toppings were still handled correctly in every recipe run:** pecans (25 g) and cacao nibs (4 g) came back as separate `user` items.

### Hypotheses

| # | Hypothesis | Status |
|---|---|---|
| H-O1 | **Hidden ingredients.** Peanut butter, chia, and flax are mixed in and invisible. | ✅ **Confirmed.** No photo-only run inferred peanut butter or flax. C7 shows that naming them in the note recovers most of the gap: 18% MAPE, against 31–49% without them. |
| H-O2 | **Naming the dish implied chia.** | ✅ **Confirmed.** All 3 C2 runs inferred 10 g of chia on both v17 and v18. |
| H-O3 | **The cacao nibs were read as chocolate chips.** | ✅ **Confirmed.** Every photo-only run (v16–v18) listed "dark chocolate chips." No prompt change is planned. |
| H-O4 | **Scaling error in C4.** | ✅ **Confirmed in v17, and fixed by v18.** v17 divided the 165 g serving among the ingredients by estimate (oats 28–39 g against 13 g). v18 scaled them correctly (12.9 g), but C4 is still 22% low. The remaining error comes from the totals, not the ingredients (see [What v18 changed](#what-v18-changed)). |
| H-O5 | **Toppings outside the recipe confuse the scaling.** | ❌ **Ruled out.** The toppings stayed separate, with exact weights, on v17 and v18. |

---

## Results: Egg Bake (lite, v18)

### Values: mean (min–max) of 3 runs

| Nutrient | Actual | C1 | C2 | C3 | C4 | C5 | C6 | C7 |
|---|---|---|---|---|---|---|---|---|
| Confidence | — | medium | high | high | high | high | high | medium |
| Portion the model used (g) | 209.2 | 200–240 | 240–280 | 330–334 | 209.2 | 250–254 | 209.2 | 240 |
| Calories (kcal) | 393.3 | 388.3 (340–415) | 423.3 (365–460) | 640 (635–645) | 428.3 (415–445) | 495 (465–535) | 435 | 378.3 (365–385) |
| Protein (g) | 26.7 | 27.2 (24.5–28.5) | 30.5 (26.5–32.5) | 42.9 (42.8–43.2) | 27.4 (26.8–28.5) | 33.1 (31.5–35.2) | 27.8 (26.8–28.5) | 24.5 |
| Total carbs (g) | 13.0 | 6.4 (6.2–6.5) | 7.7 (6.2–8.5) | 22.1 (21.5–22.4) | 15.9 (15.2–16.2) | 19.3 (18.5–20.8) | 15.4 (15.2–15.8) | 21.1 (18.2–22.5) |
| Total fat (g) | 25.8 | 28.6 (24.8–30.5) | 30.2 (26.1–33) | 41.4 (41.2–41.8) | 27.9 (26.4–28.8) | 31.4 (28.5–34.1) | 28.9 (28.4–29.8) | 21.6 (21.4–22) |
| Fiber (g) | 0.6 | 1.2 | 1.4 (1.2–1.5) | 1.3 (1.2–1.5) | 0.8 (0.8–0.9) | 0.9 (0.8–1.2) | 0.8 | 1.4 (1.2–1.5) |
| Sugar (g) | 2.9 | 2.8 (2.1–3.8) | 3.3 (2.8–3.5) | 6.5 (5.8–6.8) | 2.9 (2.4–3.2) | 4.4 (4.2–4.8) | 3.2 (3.1–3.2) | 3.3 (3.1–3.5) |
| Cholesterol (mg) | 333.0 | 500 (450–565) | 521.7 (485–565) | 885 (745–1055) | 378.3 (325–445) | 471.7 (365–585) | 425 (355–465) | 485 (445–565) |
| Sodium (mg) | 708.3 | 483.3 (460–510) | 503.3 (410–580) | 983.3 (980–985) | 618.3 (585–685) | 703.3 (680–745) | 651.7 (585–685) | 390 (380–410) |
| Potassium (mg) | 309.5 | 426.7 (380–480) | 535 (485–580) | 553.3 (520–620) | 335 (310–385) | 390 (380–410) | 336.7 (310–380) | 456.7 (410–480) |
| Calcium (mg) | 482.2 | 406.7 (350–450) | 440 (380–480) | 800 (780–840) | 485 | 526.7 (480–580) | 455 (415–485) | 293.3 (285–310) |
| Iron (mg) | 2.3 | 3.1 (2.8–3.2) | 3.4 (3.2–3.8) | 3.8 | 2.2 | 2.6 (2.2–2.8) | 2.2 (2.1–2.4) | 3.1 (2.8–3.2) |
| Omega-3 (g) | 0.18 | 0.5 (0.4–0.6) | 0.5 (0.4–0.6) | 0.8 (0.8–0.9) | 0.4 | 0.5 (0.4–0.6) | 0.4 | 0.4 |

### Percent error

| Nutrient | C1 | C2 | C3 | C4 | C5 | C6 | C7 |
|---|---|---|---|---|---|---|---|
| Calories | −1% | +8% | +63% | +9% | +26% | +11% | −4% |
| Protein | +2% | +14% | +61% | +2% | +24% | +4% | −8% |
| Total carbs | −51% | −41% | +70% | +22% | +48% | +18% | +62% |
| Total fat | +11% | +17% | +60% | +8% | +22% | +12% | −16% |
| Fiber¹ | +102% | +136% | +119% | +40% | +57% | +35% | +136% |
| Sugar | −2% | +14% | +126% | +3% | +54% | +11% | +14% |
| Cholesterol | +50% | +57% | +166% | +14% | +42% | +28% | +46% |
| Sodium | −32% | −29% | +39% | −13% | −1% | −8% | −45% |
| Potassium | +38% | +73% | +79% | +8% | +26% | +9% | +48% |
| Calcium | −16% | −9% | +66% | +1% | +9% | −6% | −39% |
| Iron | +33% | +47% | +65% | −5% | +13% | −3% | +33% |
| Omega-3¹ | +201% | +201% | +370% | +126% | +201% | +126% | +126% |
| **MAPE (excl. fiber, omega-3)** | **23%** | **31%** | **79%** | **8%** | **26%** | **11%** | **31%** |
| **Bias (excl. fiber, omega-3)** | +3% | +15% | +79% | +5% | +26% | +8% | +9% |
| MAPE, all 12 nutrients | 45% | 54% | 107% | 21% | 43% | 22% | 48% |
| **Calories + macros MAPE** | 16% | 20% | 63% | 10% | 30% | 11% | 23% |
| **Calories + macros bias** | −10% | 0% | +63% | +10% | +30% | +11% | +8% |

¹ In grams, the fiber misses were +0.6, +0.8, +0.7, +0.2, +0.3, +0.2, and +0.8, and the omega-3 misses were +0.4, +0.4, +0.7, +0.2, +0.4, +0.2, and +0.2.

### Observations

1. **Photo only (C1) and the short note (C2) didn't change meaningfully from v17** (26% → 23% and 34% → 31%). The model still pictured a frittata of eggs, spinach, cheddar, and a little milk, with 120–150 g of egg against the real 75 g, so cholesterol was +50% and carbs −51%. The all-nutrient MAPE for C2 fell further (62% → 54%), but almost all of that drop came from fiber and omega-3, which differ by tenths of a gram.
2. **C4 is the best lite result so far (8%, against 15% on v17).** The ingredients were exact, and the error left on cholesterol fell from +53% to +14%. Calories were still +9%, with all 3 runs between 415 and 445 kcal.
3. **C3 and C5 got worse (66% → 79% and 12% → 26%) even though their ingredients became exact.** In both, the model reported a portion larger than its ingredients add up to (334 g and 250 g, against about 206–215 g), and the nutrients scaled with that portion (see [What v18 changed](#what-v18-changed)). In C3, 2 of the 3 runs labeled that inflated portion `user`.
4. **C6 behaved the same as C4** (11% against 8%; the same 209.2 g portion and ingredients). The one difference was the cooking spray, read as 4.7 g of oil per serving, which may explain some of C6's +11% calories. Once the serving weight is in the note, the servings count adds nothing.
5. **C7, a note naming Greek yogurt and flour, scored the same as photo only (31% against C1's 23%) but missed in different ways:**
   - **What improved:** the model added the yogurt and flour, labeled `user`, and stopped picturing a frittata.
   - **What it guessed wrong:** without a recipe it had to guess the proportions. It used twice the flour (20 g against 10 g), too much egg (120–150 g against 75 g), and too little cheese (15–20 g against 47 g). Carbs came out +62%, calcium −39%, and sodium −45%, since it added no salt or leavening.
   - **Confidence:** C7 was the only condition with a note that reported "medium" confidence instead of "high."

### Hypotheses

| # | Hypothesis | Status |
|---|---|---|
| H-E1 | **Read as a frittata (mostly egg, no flour).** | ✅ **Confirmed** in every photo-only and short-note run (v17 and v18). Naming the yogurt and flour (C7) changed the picture, but not the proportions. |
| H-E2 | **The vague note made it scale up.** | ✅ **Confirmed, and smaller on v18.** The C2 portion was 240–280 g, against C1's 200–240 g. |
| H-E3 | **Miscounted servings: 24 instead of 48.** | ✅ **Fixed.** Every v17 and v18 recipe run stated 4 of 48 squares, or 1/12. |
| H-E4 | **The lite model's limits.** | **Split into two mechanisms.** (a) In C4, the model divided the serving weight among ingredients by estimate: ✅ **fixed by v18**. (b) It sizes the portion separately from the recipe: ❌ **not fixed** (H-E5). 3.8 Flash does neither. |
| H-E5 | **A photo-based portion overrides the recipe fraction.** | ✅ **Confirmed, and now isolated to the portion.** On v18, the ingredients follow the recipe fraction, but the portion (330–334 g in C3) doesn't, and the nutrients follow the portion. C5 shows the same problem, with an estimated recipe weight instead of the photo. |

### Hypotheses checked against the starting assumptions

- **H1 (more context means more accuracy): partly supported.**
  - **Egg bake:** recipe plus weights (C4) is the best condition, at 8%. A recipe without a weight (C3, C5) still does worse than photo only.
  - **Oatmeal:** the recipe alone (C3, 13%) beat recipe plus weights (C4, 22%) on all three prompt versions.
- **H2 (C4 within ±10% for every nutrient): not supported on the lite model.**
  - **Egg bake v18:** 3 of 10 core nutrients were more than 10% off: carbs +22%, cholesterol +14%, and sodium −13%.
  - **Oatmeal v18:** 9 of 11 were more than 10% off, almost all of them low.
  - **3.8 Flash (v16):** the egg bake was close (only sugar outside ±10%), but the oatmeal had 4 nutrients outside.

---

## Cross-meal findings

1. **v18 fixed the conversion and scaling; the totals are now the weak step.** See [What v18 changed](#what-v18-changed). Volume-to-weight conversions are mostly right. The remaining misses are chia, flax, and cooking spray, none of which have an example density in the prompt.
2. **Recipe ingredients are now labeled `user`.** That's true in every v18 recipe run; v17 labeled them `inferred`. When ingredients are named in a short note (C7), the labeling is inconsistent: the egg bake's yogurt and flour were labeled `user`, while the oatmeal's peanut butter was labeled `visible`.
3. **Consistent runs aren't necessarily accurate ones.** v18 recipe runs vary much less: egg bake C6 gave 435 kcal in all 3 runs, egg bake C3 635–645 kcal, and oatmeal C4 445–455 kcal. But they're consistently off, so a narrow range isn't a sign of accuracy. Across all lite runs, calories vary up to about ±12% within a condition, so differences of under about 10 MAPE points aren't meaningful.
4. **Confidence isn't calibrated.** It said "medium" for every photo-only run, and "high" for every run with a note except egg bake C7. Egg bake C3 said "high" at +79%.
5. **Naming the hidden ingredients works best when the proportions are easy to guess.** Overnight oats with peanut butter, chia, and flax follow a common pattern, and C7 landed close. The egg bake's error depends on the egg-to-cheese ratio, which a description can't convey.

---

## Model choice

| | `gemini-3.1-flash-lite` | `gemini-3.8-flash` |
|---|---|---|
| Recipe conditions (C3, C4), core MAPE | 8–79% (v18) | 4–10% (v16) |
| Typical analysis time | Seconds | Often over 1 minute, sometimes 3+ minutes, then a timeout |
| Failures | Rare | Frequent high-traffic and quota errors |

**Decision:** keep **flash-lite** in production, because a tool that's slow or fails often won't get used. On v18, flash-lite reached 8% MAPE for the egg bake with a recipe and serving weight, and 13% for the oatmeal with a recipe. Its main weakness, the totals, is what Phase 2 moves into code. Use 3.8 Flash only as a reference when testing prompt changes, to tell whether an error comes from the prompt or from the model's limits.

---

## Next Steps

**Done:**
- ✅ Actual values fixed (see [Data corrections](#data-corrections))
- ✅ Run-to-run spread recorded
- ✅ Model comparison (see [Model choice](#model-choice))
- ✅ H-E3 fix tested: the servings count (C5)
- ✅ Prompt change 1, ingredient breakdown (v17): improved every condition
- ✅ Prompt change 2, convert-then-scale recipe rule with `recipe_grams` (v18): the ingredient amounts are now right, but MAPE didn't improve (see [What v18 changed](#what-v18-changed))
- ✅ Count plus weights (C6): no better than weights alone (C4), so I'm not adopting it as my standard note
- ✅ Better notes (C7): big gain for the oatmeal, none for the egg bake
- ✅ Logging User Notes, Token Usage, and Prompt Fingerprint (v18 sets the token baseline)

**Phase 1 decision:** keep v18 as it is. It doesn't improve MAPE, but its ingredient lists are accurate and show their work, which is what Phase 2 builds on.

**Remaining, in priority order:**

A. **Phase 2: calculate nutrients in code from the ingredient grams.** Look up each ingredient in USDA data, multiply by its grams, and sum the results, rather than trusting the model's totals.
   - **Check before relying on it:** recalculate the v18 recipe rows from their Items column using USDA data, and compare the results with the actual values. Phase 2 will automate this as a backtest (see the [roadmap](roadmap.md#phase-2-usda-fooddata-central-cross-check)). My rough estimates are −4% calories for oatmeal C4 and 0 to +4% for egg bake C3.
   - **Conversions to handle:** USDA's portion weights (grams per cup or tablespoon) can handle volume-to-weight conversions in code, which would cover the chia, flax, and spray misses.

B. **Note habits for now (no code change):**
   - **Recipes I've written down:** include the serving weight (C4 format). It keeps the portion right and is the most reliable lite result for the egg bake.
   - **Meals without a recipe:** name the hidden ingredients (C7 format).

C. **Correct the portion in code** (planned for Phase 2, along with prompt changes: USDA-style food names, a stronger portion rule, and explicit units). v18 already tells the model to use the ingredient sum as `portion_grams`, and C3 and C5 ignored it, so another prompt rule is unlikely to help. Instead, after parsing, the code could:
   - compare each recipe item's `portion_grams` with the sum of its ingredient grams, and add a warning to AI Notes when they differ by more than 10%;
   - for a meal that's a single recipe item, scale the totals by (ingredient sum ÷ reported portion).

   The scaling would have brought egg bake C3 from 640 to about 403 kcal (+2%) and C5 from 495 to about 416 kcal (+6%). It can't be applied to a meal with toppings or sides, because the totals aren't broken down by item. Phase 2's per-ingredient calculation removes that limit.

**Ideas considered and dropped:**
- **H-O5, a photo without toppings:** ruled out by the v17 results.
- **Using 3.8 Flash for recipe notes:** too slow and unreliable (see [Model choice](#model-choice)).
- **Detecting recipes by keyword in code to change the prompt:** unnecessary. (The Logging Method column uses a keyword check, but only as a label.)
- **A separate hidden-ingredients prompt change:** folded into the ingredient breakdown.
- **A prompt rule that baked items contain flour:** overfits to one dish.
- **"Prefer counts over weights":** reversed by v18. Weights (C4) beat the count (C5), and giving both (C6) didn't help.
- **More example densities in the prompt (chia, flax, cooking spray):** this would overfit to these two recipes. Conversions belong in code (step A).

**For meals I eat regularly,** an exact saved recipe will always beat AI estimation. Prompt work on recipes matters most for meals I haven't calculated yet.

---

## Data corrections

The actual values changed while I was testing. The first set came from Cronometer; the current set is my own calculation from USDA SR Legacy data, with the errors below corrected.

| Meal | Nutrient | Original (Cronometer) | Current | What changed |
|---|---|---|---|---|
| Egg bake | Iron | 6.9 mg | 2.3 mg | Cronometer, and my first USDA lookup, used a **Branded** cheddar entry listing 9.64 mg of iron per 100 g. The package label shows 0% DV. Replaced with SR Legacy cheddar. |
| Egg bake | Omega-3 | 0 g | 0.18 g | The Foundation egg entry doesn't report omega-3 fatty acids. Switched eggs to SR Legacy (`171287`: about 0.05 g per large egg, or 0.92 g for 18 eggs). |
| Egg bake | Fiber | 0.7 g | 0.6 g | The Foundation egg entry's "<0.75 g" fiber value (a detection limit, not a measured amount) had been entered as a value. SR Legacy lists 0 g for eggs; the remaining fiber comes from the spinach and flour. |
| Oatmeal | Calories | 622.9 kcal | 583.7 kcal | The vanilla extract row had used per-100 g values × 3 teaspoons (711 kcal) instead of per-teaspoon values (30 kcal). Carbs changed slightly too (31.0 → 30.4 g). |
| Both | Several | — | — | Replaced Cronometer's values with my own per-ingredient USDA calculation, and moved the spinach, cheddar, and eggs from Foundation to SR Legacy entries so all ingredients use the same database. |

**Rule for actual values, in order of preference:**
1. **SR Legacy:** the most complete nutrient coverage. Foundation entries only report the nutrients measured in that particular analysis, so some, like the egg's omega-3, may be missing.
2. **Foundation:** if there's no SR Legacy entry.
3. **Branded:** only as a last resort, when neither of the others has the ingredient (currently just the cacao nibs). Check Branded values against the package label, since they come from manufacturer submissions and aren't verified.

---

## Limitations

- **Two meals, 3 runs per condition.** These are case studies.
- **The actual values carry roughly ±5–10% uncertainty** from measurements and from the gap between product labels and USDA averages.
- **Errors are calculated on the mean of the runs,** so a single run can be further off. The ranges show by how much.
- **Low-value nutrients** (egg bake fiber and omega-3) are excluded from the egg bake's headline MAPE.
- **3.8 Flash was tested only with the v16 prompt.**
- **The hand reference was labeled "hand span" but held my hand length.** Every run used my hand's length from wrist to middle fingertip, and the photos show my hand flat with the fingers together. So the number matched what the photos show, even though the prompt called it a span. Photo-based portions showed no size bias (photo-only egg bake: 200–240 g against 209 g). The setting has since been renamed `HAND_LENGTH_INCHES`, and the prompt now describes the hand as it appears.
- **The notes differ in detail between the two meals.** The oatmeal's C2 note has weights and the egg bake's doesn't. The oatmeal's C7 note names three hidden ingredients, while the egg bake's names two and leaves out the leavening and salt.
- **The ingredient-sum estimates** in [What v18 changed](#what-v18-changed) are my rough calculations from the model's ingredient lists, not a full per-nutrient recalculation. Step A's check would confirm them.

---

## Appendix A: Note text by condition

### Overnight oatmeal

**C2**
```
165 g overnight oatmeal, 4 g unsweetened cacao nibs, and 25 g natural pecans
```

**C3:** the C2 text, plus:
```
Recipe:

2 cups peanut butter, just peanuts, no salt
3 tablespoons cocoa powder
2 teaspoon ground cinnamon
¼ teaspoon salt
5 cups water
3 teaspoons vanilla
2 cups old-fashioned oats
¾ cups chia seeds
½ cups ground flaxseed

1. In stand mixer bowl, add peanut butter, cocoa powder, cinnamon, and salt.
2. Run stand mixer with mixing paddle until well mixed (about 30 seconds, until you no longer see the powder of the cocoa powder and cinnamon). Stop the stand mixer.
3. Add the water and vanilla, then run stand mixer to combine while you start to measure out dry ingredients (about 30 seconds). Stop the stand mixer.
4. Add the oats, chia seeds, and ground flax seeds and run stand mixer to combine (1.5 minutes). If you're making multiple batches, start prepping for the next batch at this point.
5. Remove and roughly scrape big chunks off of the paddle.
6. Pour into a container with a lid, roughly scraping the big chunks off of the bottom of the bowl into the container, and refrigerate overnight.
```

**C4:** the C3 text, with these two lines added directly under `Recipe:`
```
Prepared recipe weight = 2042 g
Serving weight = 165 g
```

**C6:** the C3 text, with this line added directly under `Recipe:`
```
Makes about 12 servings; serving = 165 g of 2042 g
```

**C7** (replaces the C2 text; no weights)
```
overnight oats with peanut butter, chia and flax
```

### Egg bake

**C2**
```
4 squares of spinach egg bake
```

**C3:** the C2 text, plus:
```
Recipe:

6 oz bag fresh baby spinach
18 large eggs
4 C shredded cheddar cheese mixed in
1 C shredded cheddar cheese topping
3 C Fage 5% full-fat Greek yogurt
1 C flour
1 ½ t baking powder
1 t baking soda
½ t salt
Olive oil cooking spray (6-second spray)

1. Preheat the oven to 350 degrees Fahrenheit.
2. Spray two 9×13 glass baking dishes with cooking spray.
3. In a large mixing bowl, mix the eggs and yogurt.
4. Mix in the flour, baking powder, baking soda, and salt.
5. Mix in the spinach, any other optional vegetables, and cheese.
6. Pour and evenly spread the egg mixture into the two baking dishes, aiming to keep the thickness roughly the same between the two dishes.
7. Sprinkle some additional cheddar cheese on top of the egg mixture as a topping.
8. Countertop breville oven: Bake one dish at a time for 35 minutes each.
Large oven: Bake both dishes side-by-side for 45-60 minutes or until an inserted toothpick comes out clean. If you're baking a half recipe in one dish, check at 35 minutes to ensure the egg bake doesn't burn.
9. Let cool for a few minutes before cutting each dish into 6 rows of 4 squares.
```

**C4:** the C3 text, with these two lines added directly under `Recipe:`
```
Prepared recipe weight = 2510.6 g
Weight of 4 squares = 209.2 g
```

**C5:** the C3 text, with this line added directly under `Recipe:`
```
Makes 48 squares
```

**C6:** the C3 text, with this line added directly under `Recipe:`
```
Makes 48 squares; serving = 4 squares (209.2 of 2510.6 g)
```

**C7** (replaces the C2 text)
```
egg bake with Greek yogurt and flour
```

---

## Appendix B: Earlier prompt versions and 3.8 Flash

### B1. v17 (lite)

**Overnight oatmeal**

| Nutrient | C1 | C2 | C3 | C4 |
|---|---|---|---|---|
| Calories | −32% | −25% | +3% | −17% |
| Protein | −39% | −38% | +8% | −10% |
| Total carbs | +18% | +34% | +18% | −4% |
| Total fat | −46% | −41% | −6% | −24% |
| Fiber | −44% | −26% | +5% | −10% |
| Sugar | +19% | +46% | −55% | −67% |
| Sodium | −60% | +40% | −12% | +28% |
| Potassium | −33% | −19% | +4% | −2% |
| Calcium | −47% | −23% | −22% | −29% |
| Iron | −10% | +6% | +14% | +7% |
| Omega-3 | −62% | −44% | −10% | −14% |
| **MAPE** | **37%** | **31%** | **14%** | **19%** |
| **Bias** | −31% | −8% | −5% | −13% |
| **Calories + macros MAPE** | 34% | 34% | 9% | 14% |

Mean calories (min–max): C1 398.3 (365–415), C2 435 (425–445), C3 598.3 (535–645), C4 485 (455–545).

Notable v17 results:
- The short note led the model to invent a generic overnight-oats recipe, with almond milk, 15 g of maple syrup, and chia.
- In C4, it filled the 165 g serving by estimate: 28–39 g of oats against 13 g, and too little peanut butter and water.

**Egg bake**

| Nutrient | C1 | C2 | C3 | C4 | C5 |
|---|---|---|---|---|---|
| Calories | −12% | +17% | +54% | −2% | +3% |
| Protein | −11% | +22% | +51% | −6% | −6% |
| Total carbs | −52% | −36% | +108% | +22% | +40% |
| Total fat | 0% | +29% | +41% | −6% | −1% |
| Fiber | +119% | +169% | +119% | +40% | +23% |
| Sugar | −37% | +26% | +125% | −6% | +7% |
| Cholesterol | +33% | +68% | +114% | +53% | +20% |
| Sodium | −32% | −24% | +30% | −21% | −18% |
| Potassium | +23% | +68% | +67% | +9% | −2% |
| Calcium | −34% | −3% | +26% | −19% | −12% |
| Iron | +21% | +43% | +43% | −3% | −12% |
| Omega-3 | +126% | +238% | +313% | +126% | +107% |
| **MAPE (excl. fiber, omega-3)** | **26%** | **34%** | **66%** | **15%** | **12%** |
| **Bias (excl. fiber, omega-3)** | −10% | +21% | +66% | +2% | +2% |
| MAPE, all 12 nutrients | 42% | 62% | 91% | 26% | 21% |
| **Calories + macros MAPE** | 19% | 26% | 63% | 9% | 13% |

Portion the model used: C1 200 g, C2 280 g, C3 320–360 g, C4 209.2 g, C5 200–240 g. Mean calories (min–max): C1 346.7 (340–360), C2 461.7 (460–465), C3 606.7 (540–640), C4 385 (365–415), C5 405 (360–460).

Notable v17 results:
- **C3:** the model stated the right fraction (1/12), but filled a photo-sized portion of 320–360 g with 150–180 g of egg.
- **C4:** it gave the eggs 100–126 g, against 75 g.
- **C5:** it gave the best split of that version (eggs 75–90 g).

### B2. v16 (lite) and 3.8 Flash

**Overnight oatmeal**

| Nutrient | Lite v16 C1 | Lite v16 C2 | Lite v16 C3 | Lite v16 C4 | 3.8 Flash C3 | 3.8 Flash C4 |
|---|---|---|---|---|---|---|
| Calories | −32% | −33% | −8% | −19% | −3% | −1% |
| Protein | −49% | −45% | −2% | −10% | +4% | +6% |
| Total carbs | +5% | +5% | +11% | −8% | −7% | −5% |
| Total fat | −41% | −43% | −16% | −25% | −3% | −2% |
| Fiber | −51% | −34% | −10% | −15% | +3% | +5% |
| Sugar | +52% | −55% | −55% | −67% | −49% | −26% |
| Sodium | −63% | −57% | −12% | +74% | −10% | +13% |
| Potassium | −43% | −27% | −2% | −8% | +1% | +16% |
| Calcium | −68% | −58% | −23% | −28% | −12% | −16% |
| Iron | −24% | −18% | +19% | +3% | +3% | +5% |
| Omega-3 | −91% | −91% | −18% | −18% | −10% | −6% |
| **MAPE** | **47%** | **42%** | **16%** | **25%** | **10%** | **9%** |
| **Bias** | −37% | −41% | −11% | −11% | −8% | −1% |
| **Calories + macros MAPE** | 32% | 32% | 9% | 15% | 4% | 4% |

Mean calories (min–max): lite v16 C1 398.3 (365–415), C2 391.7 (375–415), C3 538.3 (535–545), C4 475 (445–495); 3.8 Flash C3 566.7 (565–570), C4 575 (570–580).

**Egg bake**

| Nutrient | Lite v16 C1 | Lite v16 C2 | Lite v16 C3 | Lite v16 C4 | 3.8 Flash C1¹ | 3.8 Flash C2 | 3.8 Flash C3 | 3.8 Flash C4 |
|---|---|---|---|---|---|---|---|---|
| Calories | +17% | +37% | +78% | +18% | −12% | −7% | 0% | 0% |
| Protein | +20% | +38% | +90% | +26% | −20% | −2% | +4% | +1% |
| Total carbs | −38% | −6% | +146% | +60% | −52% | −62% | −9% | −9% |
| Total fat | +29% | +52% | +60% | +6% | −3% | +3% | −1% | +2% |
| Fiber | +236% | +304% | +236% | +113% | +152% | +158% | +1% | +1% |
| Sugar | −30% | +49% | +180% | +49% | −21% | −32% | −22% | −15% |
| Cholesterol | +122% | +122% | +180% | +116% | +8% | +42% | +1% | +1% |
| Sodium | +12% | +33% | +62% | +5% | −7% | −7% | −4% | −3% |
| Potassium | +45% | +110% | +139% | +56% | −1% | +23% | +2% | 0% |
| Calcium | +5% | +5% | +109% | +6% | −39% | −32% | −6% | −2% |
| Iron | +66% | +95% | +124% | +39% | −16% | +4% | 0% | −2% |
| Omega-3 | +220% | +351% | +577% | +238% | +41% | +79% | +13% | +32% |
| **MAPE (excl. fiber, omega-3)** | **39%** | **55%** | **117%** | **38%** | **18%** | **21%** | **5%** | **4%** |
| **Bias (excl. fiber, omega-3)** | +25% | +54% | +117% | +38% | −16% | −7% | −4% | −3% |
| **Calories + macros MAPE** | 26% | 33% | 93% | 28% | 22% | 19% | 3% | 3% |

¹ 2 runs. 3.8 Flash C1 and C2 were exploratory runs, made before I stopped testing that model.

Mean calories (min–max): lite v16 C1 460 (420–480), C2 540 (520–580), C3 700 (640–780), C4 465 (465–465); 3.8 Flash C1 345 (320–370), C2 365 (340–380), C3 395, C4 395.
