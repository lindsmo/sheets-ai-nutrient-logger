# Accuracy Test Data

Data behind [accuracy-analysis.md](../docs/accuracy-analysis.md).

| File | Contents |
|---|---|
| [`accuracy-runs.csv`](accuracy-runs.csv) | All 107 test runs: one row per analysis, with Gemini's 31 nutrient estimates, its item and ingredient breakdown, and its notes. |
| [`accuracy-actuals.csv`](accuracy-actuals.csv) | The actual values for one serving of each meal, calculated from my recipes and USDA FoodData Central SR Legacy data. |

## accuracy-runs.csv

- **Run ID:** meal, prompt version, model, condition and run number, such as `egg-v18-lite-C4-r2`. `lite` is `gemini-3.1-flash-lite` and `38f` is `gemini-3.8-flash`.
- **Condition:** C1–C7, as defined in [Conditions](../docs/accuracy-analysis.md#conditions). The full note text for each condition is in [Appendix A](../docs/accuracy-analysis.md#appendix-a-note-text-by-condition), so it isn't repeated on every row.
- **Nutrient columns:** the same names and units as the [Food tab](../docs/sheet-schema.md#food-tab).
- **Items, Token Usage, Prompt Fingerprint:** recorded from v17 or v18 onward, so they're blank for earlier runs.
- **Run Date** is the date only.

The 3.8 Flash egg bake C1 and C2 rows were exploratory runs (see [Appendix B](../docs/accuracy-analysis.md#b2-v16-lite-and-38-flash)). C1 has 2 runs.

## accuracy-actuals.csv

- **Egg bake:** the recipe totals divided by 12, rounded to two decimal places.
- **Overnight oatmeal:** 165 g of the oatmeal base plus the toppings, rounded to one decimal place.

Percent error is `(mean estimate − actual) ÷ actual`, using the mean of the runs for each condition.
