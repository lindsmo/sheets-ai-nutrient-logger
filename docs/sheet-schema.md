# Sheet Schema

The spreadsheet has two data tabs, **`Water`** and **`Food`**. Tab names are case-sensitive and must match exactly. The script writes one row per entry with `appendRow`, so:

- **Columns are written by position, not by header name.** You can rename headers freely. If you add, remove, or reorder columns, update the matching `appendRow` array in [`Code.gs`](../apps-script/Code.gs).
- **Keep these tabs free of formulas and notes below the data.** `appendRow` writes below the last non-empty row in *any* column. Put summaries on a separate tab ([examples below](#example-summary-formulas)).

Both tabs store a full timestamp in column A and a date-only value in column B. The date is calculated in the **spreadsheet's** time zone (**File → Settings → Time zone**). See [design decision #8](design-decisions.md#8-a-separate-date-column-written-in-the-sheets-time-zone) for why, and for how this behaves when you travel.

---

## Water tab

One row per drink, written by the water route (`?key=...&oz=16`).

| Column | Header | Type | Example | Source |
|---|---|---|---|---|
| A | Timestamp | Date-time | 2026-10-11 14:32:05 | Time of the request |
| B | Date | Date | 2026-10-11 | Column A's date in the sheet's time zone |
| C | Oz | Number | 16 | The `oz` URL parameter |

**Header row:** copy this single line, click cell A1 in the Water tab, and paste. It fills columns A through C.

```text
Timestamp	Date	Oz
```

---

## Food tab

One row per confirmed meal, written by `logFoodToSheet()` after you tap **Log This Meal**. Columns E–AI are the meal totals Gemini returns. The **JSON key** column shows which field in Gemini's response fills each column, which is useful if you change the prompt.

The nutrient columns roughly follow the US Nutrition Facts label: calories and macronutrients first, then the minerals the label requires, then vitamins, then minerals and omega-3 that labels usually leave out. The order is kept as-is so existing rows stay aligned.

### Meal details

| Column | Header | JSON key | Notes |
|---|---|---|---|
| A | Timestamp | — | Time the meal was logged (not the time the photo was taken) |
| B | Date | — | Column A's date in the sheet's time zone |
| C | Meal | `meal_type` | `breakfast`, `lunch`, `dinner`, or `snack`. Gemini infers it from the photo, not the time of day. |
| D | Description | `meal_description` | One-line summary of the meal |

### Calories & macronutrients

| Column | Header | JSON key |
|---|---|---|
| E | Calories (kcal) | `calories` |
| F | Protein (g) | `protein_g` |
| G | Total Carbs (g) | `total_carbs_g` |
| H | Total Fat (g) | `total_fat_g` |

### Carb & fat details

| Column | Header | JSON key | Notes |
|---|---|---|---|
| I | Fiber (g) | `fiber_g` | Part of total carbs |
| J | Sugar (g) | `sugar_g` | Part of total carbs |
| K | Saturated Fat (g) | `saturated_fat_g` | Part of total fat |
| L | Trans Fat (g) | `trans_fat_g` | Part of total fat |
| M | Cholesterol (mg) | `cholesterol_mg` | A sterol, not a macronutrient; listed with fats as on nutrition labels |

### Minerals on the Nutrition Facts label

| Column | Header | JSON key |
|---|---|---|
| N | Sodium (mg) | `sodium_mg` |
| O | Potassium (mg) | `potassium_mg` |
| P | Calcium (mg) | `calcium_mg` |
| Q | Iron (mg) | `iron_mg` |

### Vitamins

| Column | Header | JSON key |
|---|---|---|
| R | Vitamin A (mcg RAE) | `vitamin_a_mcg` |
| S | Vitamin C (mg) | `vitamin_c_mg` |
| T | Vitamin D (mcg) | `vitamin_d_mcg` |
| U | Vitamin E (mg) | `vitamin_e_mg` |
| V | Vitamin K (mcg) | `vitamin_k_mcg` |
| W | Thiamin (B1) (mg) | `thiamin_mg` |
| X | Riboflavin (B2) (mg) | `riboflavin_mg` |
| Y | Niacin (B3) (mg) | `niacin_mg` |
| Z | Vitamin B6 (mg) | `vitamin_b6_mg` |
| AA | Folate (mcg DFE) | `folate_mcg` |
| AB | Vitamin B12 (mcg) | `vitamin_b12_mcg` |

### Other minerals & omega-3

| Column | Header | JSON key | Notes |
|---|---|---|---|
| AC | Magnesium (mg) | `magnesium_mg` | |
| AD | Zinc (mg) | `zinc_mg` | |
| AE | Selenium (mcg) | `selenium_mcg` | |
| AF | Phosphorus (mg) | `phosphorus_mg` | |
| AG | Copper (mg) | `copper_mg` | |
| AH | Manganese (mg) | `manganese_mg` | |
| AI | Omega-3 (g) | `omega3_g` | ALA + EPA + DHA combined |

### Estimate metadata

| Column | Header | JSON key | Notes |
|---|---|---|---|
| AJ | Confidence | `confidence` | `high`, `medium`, or `low`, based on the rubric in the prompt |
| AK | AI Notes | `notes` | Gemini's caveats, such as "sauce estimated from a typical restaurant portion" |
| AL | Photo URL | — | **Reserved for Phase 3** (Google Drive link). Currently left blank. |

### Items and tracking

These columns record what the estimate was based on, so any row can be checked or compared later. They were added during accuracy testing (see [accuracy-analysis.md](accuracy-analysis.md)).

| Column | Header | Source | Notes |
|---|---|---|---|
| AM | Items | `items` | Each food with its portion and source, plus its ingredients for mixed dishes. Example: `Spinach egg bake (209.2 g) [user]: Large eggs 75 g of 900 g [user]; Shredded cheddar 47.1 g of 565 g [user] \| Pecans (25 g) [visible]`. Items are separated by ` \| ` and ingredients by `; `. "of 900 g" is the amount in the full recipe, shown only when a recipe was given. Sources are `visible`, `inferred` (assumed, not seen), or `user` (from my note). |
| AN | Model | Set by the script | The Gemini model that produced the estimate |
| AO | Logging Method | Set by the script | `Photo only`, `Photo + note`, or `Photo + recipe` (the note contains the word "recipe"). A label for analysis only; it doesn't change how the meal is analyzed. |
| AP | User Notes | The note I typed | Stored as typed, so a row can be re-analyzed or compared later |
| AQ | Token Usage | Gemini's `usageMetadata` | For example, `input 2398 (image 1102, text 1296); output 745; total 3143`. Thinking and cached tokens appear only when nonzero. |
| AR | Prompt Fingerprint | Set by the script | The first 8 characters of an MD5 hash of the prompt text, excluding my note. It changes automatically whenever the prompt changes, including a new `HAND_LENGTH_INCHES` value, so every row can be traced to the prompt that produced it. |

**Units and rounding.** Units are part of each header, so charts and pivot tables label themselves. The prompt asks Gemini to round calories to the nearest 5, grams to one decimal place, and milligrams and micrograms to whole numbers.

**Your own columns.** The script writes columns A–AR only. Columns to the right of AR are safe for your own notes, such as a meal nickname or test labels, because they're on the same row as the data.

**Header row:** copy this single line, click cell A1 in the Food tab, and paste. It fills columns A through AR.

```text
Timestamp	Date	Meal	Description	Calories (kcal)	Protein (g)	Total Carbs (g)	Total Fat (g)	Fiber (g)	Sugar (g)	Saturated Fat (g)	Trans Fat (g)	Cholesterol (mg)	Sodium (mg)	Potassium (mg)	Calcium (mg)	Iron (mg)	Vitamin A (mcg RAE)	Vitamin C (mg)	Vitamin D (mcg)	Vitamin E (mg)	Vitamin K (mcg)	Thiamin (B1) (mg)	Riboflavin (B2) (mg)	Niacin (B3) (mg)	Vitamin B6 (mg)	Folate (mcg DFE)	Vitamin B12 (mcg)	Magnesium (mg)	Zinc (mg)	Selenium (mcg)	Phosphorus (mg)	Copper (mg)	Manganese (mg)	Omega-3 (g)	Confidence	AI Notes	Photo URL	Items	Model	Logging Method	User Notes	Token Usage	Prompt Fingerprint
```

The values are tab-separated. If pasting puts everything in cell A1, the tabs were lost while copying. Copy from the raw file view on GitHub instead.

---

## Example summary formulas

Put these on a **separate tab** (for example, `Totals`), never on the Water or Food tab.

**Water**

| What | Formula |
|---|---|
| Today's total | `=SUMIF(Water!B:B, TODAY(), Water!C:C)` |
| Total for the date in cell A2 | `=SUMIF(Water!B:B, A2, Water!C:C)` |
| One row per day | `=QUERY(Water!A:C, "select B, sum(C) where B is not null group by B label sum(C) 'Total oz'", 1)` |

**Food**

| What | Formula |
|---|---|
| Today's calories | `=SUMIF(Food!B:B, TODAY(), Food!E:E)` |
| Today's protein | `=SUMIF(Food!B:B, TODAY(), Food!F:F)` |
| Daily macro totals | `=QUERY(Food!B:H, "select B, sum(E), sum(F), sum(G), sum(H) where B is not null group by B label sum(E) 'Calories', sum(F) 'Protein (g)', sum(G) 'Carbs (g)', sum(H) 'Fat (g)'", 1)` |
| Meals per confidence level | `=QUERY(Food!AJ:AJ, "select AJ, count(AJ) where AJ is not null group by AJ", 1)` |
| Meals per prompt version | `=QUERY(Food!AR:AR, "select AR, count(AR) where AR is not null group by AR", 1)` |

For pivot tables, use **Insert → Pivot table**, set **Rows** to `Date`, and add **Values** such as `SUM of Calories (kcal)`. Freezing row 1 on the data tabs helps Sheets detect the headers.
