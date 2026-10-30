# Setup

This guide sets up your own copy of the water and food logger: a Google Sheet, an Apps Script web app attached to it, and home-screen shortcuts on an Android phone. It takes about 30–45 minutes.

**You'll need:**
- A Google account
- A Gemini API key (free; see step 1)
- An Android phone for the one-tap water widget. The food logger is a web page, so it works in any mobile browser.

**Contents**
1. [Get a Gemini API key](#1-get-a-gemini-api-key)
2. [Create the spreadsheet](#2-create-the-spreadsheet)
3. [Add the Apps Script code](#3-add-the-apps-script-code)
4. [Set Script Properties](#4-set-script-properties)
5. [Authorize external requests](#5-authorize-external-requests)
6. [Deploy the web app](#6-deploy-the-web-app)
7. [Test both routes](#7-test-both-routes)
8. [Add home-screen shortcuts](#8-add-home-screen-shortcuts)
9. [Updating the code later](#9-updating-the-code-later)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Get a Gemini API key

1. Go to [Google AI Studio → API keys](https://aistudio.google.com/apikey) and sign in.
2. Click **Create API key**. Choose an existing Google Cloud project or let AI Studio create one.
3. Copy the key and keep it somewhere private. **Don't put it in the code or commit it anywhere.** It goes into Script Properties in step 4.

> **Free vs. paid tier:** A key in a project with no billing account uses Gemini's free tier, which is plenty for a few meals a day. On the free tier, Google may use your prompts and photos to improve its products. Check [current pricing and terms](https://ai.google.dev/gemini-api/docs/pricing) before deciding.

**Choose a model:** the default, `gemini-3.1-flash-lite`, works for most people, and you can skip this. To use a different model, find its name in the [Gemini models list](https://ai.google.dev/gemini-api/docs/models) or the model picker in AI Studio. Neither needs your key. You'll enter the name, without any `models/` prefix, in step 4. Step 7's test analysis confirms that your key and model work together.

**Optional: list the models your key can use.** Run one of these in a terminal. Each sends the key in a request header instead of the URL, and reads it from a prompt so it isn't saved in your command history. **Don't put the key in a URL** (such as `...models?key=...`), because browser history saves it and Chrome can sync that history to your other devices.

macOS or Linux (bash or zsh):
```bash
read -s GEMINI_API_KEY   # paste the key; it isn't shown or saved in history
curl -s -H "x-goog-api-key: $GEMINI_API_KEY" \
  https://generativelanguage.googleapis.com/v1beta/models | grep '"name"'
```

Windows (PowerShell):
```powershell
$key = Read-Host "Gemini API key"   # what you type here isn't saved in command history
(Invoke-RestMethod -Uri https://generativelanguage.googleapis.com/v1beta/models `
  -Headers @{ 'x-goog-api-key' = $key }).models |
  Where-Object { $_.supportedGenerationMethods -contains 'generateContent' } |
  Select-Object -ExpandProperty name
```

The bash version lists every model; use one whose `supportedGenerationMethods` includes `generateContent`. The PowerShell version shows only those.

---

## 2. Create the spreadsheet

1. Create a new Google Sheet. Any name works.
2. **Set the time zone:** go to **File → Settings → Time zone** and choose your local time zone. The script uses the spreadsheet's time zone to decide which day an entry belongs to. (If you travel, see [design decision #8](design-decisions.md#8-a-separate-date-column-written-in-the-sheets-time-zone).)
3. Create two tabs, named exactly **`Water`** and **`Food`**. Tab names are case-sensitive.
4. Add the header rows:
   - **Water:** `Timestamp`, `Date`, `Oz` in columns A–C.
   - **Food:** 44 columns, A–AR. Copy the one-line header row from [sheet-schema.md](sheet-schema.md), click cell A1 in the Food tab, and paste.
5. **Format both tabs:**
   - Select row 1 and make it bold.
   - **View → Freeze → 1 row**.
   - Select column B and choose **Format → Number → Date**.

Keep any summary formulas, such as daily totals, **on a separate tab**. The script adds rows below the last filled row in *any* column, so a formula result spilling down the Water or Food tab would push new entries below it. [sheet-schema.md](sheet-schema.md) has example formulas.

---

## 3. Add the Apps Script code

1. In the spreadsheet, go to **Extensions → Apps Script**. This creates a script project attached to this spreadsheet.
2. Rename the project (click "Untitled project" at the top), for example to `nutrient_logging`.
3. **`Code.gs`:** replace the contents of the default `Code.gs` file with [`apps-script/Code.gs`](../apps-script/Code.gs).
4. **`FoodLogger.html`:** click **+** next to **Files**, choose **HTML**, and name it `FoodLogger`. Apps Script adds the `.html`, and the name must match exactly. Replace its contents with [`apps-script/FoodLogger.html`](../apps-script/FoodLogger.html).
5. Click **Save** (💾).

---

## 4. Set Script Properties

All keys and personal settings live in Script Properties, not in the code.

1. In the Apps Script editor, click **Project Settings** (⚙️ in the left sidebar).
2. Scroll to **Script Properties** and click **Edit script properties**, then **Add script property**.
3. Add each property below. Enter plain values, **without quotes**:

| Property | Required? | Value | If missing |
|---|---|---|---|
| `SECRET_KEY` | Required | A word you choose, using letters and numbers only. Characters like `&`, `?`, `#` or spaces break the URL. | Every request returns `no` |
| `GEMINI_API_KEY` | Required | Your key from step 1 | Food analysis fails with an error |
| `GEMINI_MODEL` | Optional | A model name from step 1, such as `gemini-3.1-flash-lite` | Defaults to `gemini-3.1-flash-lite` |
| `HAND_LENGTH_INCHES` | Optional | Your hand length in inches, from the crease at your wrist to the tip of your middle finger, number only, such as `7.25` | Defaults to `7` |

4. Click **Save script properties**.

**Photograph your hand the way you measured it.** Lay it flat next to the food, with your fingers together and the whole hand from wrist to fingertips in the frame. Gemini compares that length with `HAND_LENGTH_INCHES`. A spread hand, or one cut off at the edge of the frame, gives it the wrong ruler.

`SECRET_KEY` is the only thing that stops other people from using your web app, so treat it like a password. See [design decision #5](design-decisions.md#5-a-shared-secret-key-as-the-gatekeeper) for what someone with the key could and couldn't do.

---

## 5. Authorize external requests

The script calls the Gemini API, so Google requires you to approve that once from inside the editor.

1. In the toolbar, choose **`authorizeScript`** from the function dropdown, next to **Debug**.
2. Click **Run**.
3. When **Authorization required** appears, click **Review permissions** and choose your account.
4. Google shows **"Google hasn't verified this app."** That's expected: the developer is you. Click **Advanced → Go to [project name] (unsafe)**, then **Allow**.
5. The execution log should show **Execution completed**.

The permission screen should mention only *the spreadsheet this script is installed in*, not all of your spreadsheets. The `/** @OnlyCurrentDoc */` line at the top of `Code.gs` limits that. See [design decision #4](design-decisions.md#4-narrowing-the-oauth-scope).

---

## 6. Deploy the web app

1. Click **Deploy → New deployment**.
2. Click the ⚙️ next to **Select type** and choose **Web app**.
3. Fill in:
   - **Description:** for example `v1`
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**
4. Click **Deploy** and approve any permission prompts.
5. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy.../exec`.

"Anyone" lets the phone shortcuts call the app without signing in. The script runs as you, so it can write to your sheet, and it rejects any request without the correct `SECRET_KEY`.

---

## 7. Test both routes

Replace `YOUR_URL` with your web app URL and `YOUR_KEY` with your `SECRET_KEY`.

> **This URL ends up in your browser history.** That's unavoidable here: the home-screen shortcuts in step 8 depend on a URL that includes `SECRET_KEY`. It's also why `SECRET_KEY` should be a separate value, never your Gemini key or a password you use elsewhere. Treat it like a password, and if it leaks, change it in Script Properties and update your shortcuts. [Design decision #5](design-decisions.md#5-a-shared-secret-key-as-the-gatekeeper) covers what someone with the key could and couldn't do.

**Water:** open this in a browser:
```
YOUR_URL?key=YOUR_KEY&oz=8
```
You should see something like `8 oz · 8 oz today` (the second number is today's running total), and a new row should appear in the Water tab. Delete the test row afterward if you like.

**Food:** open this on your phone:
```
YOUR_URL?page=food&key=YOUR_KEY
```
1. Tap **📷 Camera** or **🖼️ Photos** and choose a photo of food, ideally with your hand flat beside it (see step 4).
2. Optionally add a note, such as "about 1 cup of chili."
3. Tap **Analyze Photo**. Gemini usually responds in 3–8 seconds.
4. Review the results, then tap **Log This Meal**. A new row should appear in the Food tab of your spreadsheet.

**Wrong key:** open `YOUR_URL?key=wrong&oz=8`. You should see `no`, and no row should be added.

---

## 8. Add home-screen shortcuts

### Water: one-tap widget (Android)

1. Install [HTTP Shortcuts](https://github.com/Waboodoo/HTTP-Shortcuts), a free, open-source app with no ads, from Google Play or F-Droid.
2. Create a new shortcut for each amount you usually drink:
   - **Method:** GET
   - **URL:** `YOUR_URL?key=YOUR_KEY&oz=16`, with a different `oz` value for each shortcut
   - **Response handling:** show the response as a **toast**
3. Add the shortcuts, or the app's widget, to your home screen.

One tap now logs a new row in the Water tab of your spreadsheet and shows a toast such as `14 oz · 70 oz today`.

> On iOS, an Apple Shortcut using **Get Contents of URL** should make the same request. I haven't tested it.

### Food: home-screen shortcut

1. Open `YOUR_URL?page=food&key=YOUR_KEY` in Chrome on your phone.
2. Tap **⋮ → Add to Home screen** and name it something like "Food Logger."

Both shortcuts contain your secret key in the URL. Don't share screenshots of the address bar or of the shortcut settings.

---

## 9. Updating the code later

To change the code **without changing the web app URL**, which your shortcuts depend on:

1. Edit and save the files in the Apps Script editor.
2. Go to **Deploy → Manage deployments**.
3. Click ✏️ **Edit** on your active deployment.
4. Under **Version**, choose **New version**, add a description (such as `v2`), and click **Deploy**.

**Don't use Deploy → New deployment** for updates. It creates a new URL, and your existing shortcuts would keep calling the old code.

After any update, tap one water shortcut and analyze one photo to check that both routes still work, since they share a deployment.

Changing a Script Property, such as `GEMINI_MODEL`, takes effect immediately. It doesn't need a redeploy.

---

## 10. Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Every request returns `no` | `SECRET_KEY` is missing or doesn't match the URL's `key` | Check Script Properties. Remove any quotes or trailing spaces. |
| A permission error mentioning `UrlFetchApp.fetch` | External requests weren't authorized | Run `authorizeScript` once (step 5). |
| `GEMINI_API_KEY not set in Script Properties` | The property is missing or misspelled | Add it in Project Settings (step 4). |
| `Gemini API error: ... not found` | The model name is wrong or unavailable to your key | Check the model list from step 1 and update `GEMINI_MODEL`. Don't include `models/`. |
| `Gemini API error: ... high demand` | Gemini is temporarily overloaded | The script already retries twice. Wait a minute and try again. |
| `Analysis expired. Please re-upload the photo.` | More than 10 minutes passed between analyzing and confirming | Analyze the photo again. |
| `No tab named "Food" found` | The tab is missing or named differently | Rename the tab to exactly `Food`. |
| Water toast total looks wrong | The spreadsheet's time zone is wrong, or there's text in column B | Check **File → Settings → Time zone**, and make sure column B contains dates. |
| Changes don't show up | The deployment wasn't updated, or a new deployment was created | Edit the existing deployment with **New version** (step 9). Make sure the shortcuts use that deployment's URL. |
| A new row appears far below the others | Something in a lower row of that tab, such as a formula | Move formulas to a separate tab (step 2). |

To see server-side errors and logs, open **Executions** (☰ in the Apps Script sidebar) and click a run.
