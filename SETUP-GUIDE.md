# Fast Typing Challenge – setup guide

A static website (GitHub Pages) + a free Firebase project for sign-in and the live results.
Everything below is free. Allow about 30–40 minutes the first time.

**What the site does**

- Students register with name + username + password (or "Continue with Google") and sign in / sign out.
- 3 rounds: **30 s, 45 s, 60 s** per attempt (changeable in the admin panel), **3 attempts** per round.
- Each round's score = the student's **best WPM** of their attempts. A student may press **"Finish round now"** after any attempt (even after the first one).
- Total = sum of the three round scores. Ties are broken by accuracy.
- Organizer panel: open/close rounds, live results, projector view, publish the leaderboard to students, edit the typing texts, export CSV, give a student a redo, reset all scores.

**Files:** `index.html`, `style.css`, `app.js`, `backend.js`, `logic.js`, `logo.png` (CIFS Support logo), `config.js` (you edit this), `firestore.rules` (you paste this into Firebase).

---

## 0. Try it first (2 minutes, nothing to install)

Double-click `index.html`. With the default `config.js` it runs in **DEMO MODE**: data is stored only in that browser.
Click **"Organizer (demo admin)"** to see the admin panel, open a second tab and register a student to see the other side.

---

## 1. Create the Firebase project (free "Spark" plan, no card)

1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `cifs-typing`) → you can turn Google Analytics off.
2. **Build → Authentication → Get started → Sign-in method**
   - enable **Email/Password** (students' username + password uses this)
   - enable **Google** (set a support email) – the organizer signs in with this
3. **Build → Firestore Database → Create database** → pick the closest region → **Start in production mode**.
4. **Firestore → Rules** → delete everything, paste the content of `firestore.rules`, **change `admin@example.com` to the organizer's Google e-mail**, press **Publish**.
5. **Project settings (gear icon) → General → Your apps → Web (`</>`)** → register an app → copy the `firebaseConfig` values.

## 2. Edit `config.js`

- Paste `apiKey`, `authDomain`, `projectId`, `appId` from step 1.5.
- Put the organizer's Google e-mail in `ADMIN_EMAILS` (**the same one as in the rules**).
- Optionally change `EVENT_TITLE`.

> The Firebase `apiKey` is not a secret – it is meant to be public. Security comes from the rules.

## 3. Put the site on GitHub Pages

1. Create a GitHub account → **New repository** (public), e.g. `fast-typing`.
2. **Add file → Upload files** → drag all the site files (keep them in the repository root) → Commit.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.**
4. After about a minute the site is live at `https://YOUR-USERNAME.github.io/fast-typing/`.
5. **Tell Firebase about the address:** Firebase → Authentication → **Settings → Authorized domains → Add domain** → `YOUR-USERNAME.github.io` (and your custom domain later). Without this, Google sign-in shows "unauthorized domain".

This address is completely free and enough for the event.

## 4. Optional: a custom domain such as `fasttypingcifssuport.me`

GitHub itself does not give free `.me` names. The free one comes from the **GitHub Student Developer Pack**: verified students get a `.me` domain from Namecheap free for 1 year (it renews at the normal price afterwards).
It needs a verified student account – apply at https://education.github.com/pack.

1. Claim the domain in the Student Pack (Namecheap offer), and check that `fasttypingcifssuport.me` is available.
2. GitHub repo → **Settings → Pages → Custom domain** → enter the domain → Save. (Do this *before* editing DNS.)
3. In Namecheap → **Advanced DNS** add:
   - four **A** records, host `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - one **CNAME** record, host `www`, value `YOUR-USERNAME.github.io`
4. Wait for DNS (minutes to a few hours), then tick **Enforce HTTPS** in Settings → Pages.
5. Add the domain to Firebase **Authorized domains** (step 3.5).

If you are not a student, either keep the free `github.io` address or buy a cheap domain; nothing else in the project changes.

---

## 5. Running the event

**Before (the day before):**
1. Sign in with the organizer's Google account → admin panel.
2. Register 2–3 test students on other computers/phones, run all three rounds, check the leaderboard.
3. Control → **Reset all scores** (participants stay registered). In *Texts* you can replace the 9 built-in passages (aim for about 10 characters per second of the round).

**On the day:**
1. Students open the link, register (or sign in) and wait on "My rounds". Use Chrome/Edge on laptops or desktop PCs.
2. Organizer: **Control → Open round 1**. Everyone can press *Start attempt* when ready; the timer starts on their first key. When the time is up, press **Close current round** (an attempt already running still saves).
3. Repeat for rounds 2 and 3.
4. Tick **"Show the leaderboard to students"** to publish results (keep the organizer page open – it refreshes the leaderboard automatically). Use **Live results → Projector view** for the big screen, **Export CSV** to keep the results.

**Useful details**
- Refreshing or closing the page during an attempt uses up that attempt (anti-cheating). If it was an accident: Live results → *Details* → ✕ on the attempt gives that student a redo while the round is open.
- Pasting is blocked, only correct characters count, and Firestore's rules enforce one record per attempt, the round time limit and a maximum of 300 WPM.
- **Honest limit:** WPM is calculated in the student's browser, so a determined technical student could try to cheat. Keep the organizers in the room and watch the screens; for a school event this is normally enough.
- Free-plan limits (Spark): 50,000 reads and 20,000 writes per day. For ~50 students this event needs only a few thousand writes and roughly 10,000 reads, so it stays well inside the free limits.
- WPM = (correct characters ÷ 5) ÷ minutes. Mistakes must be corrected with Backspace to count.

## Troubleshooting

| Problem | Fix |
|---|---|
| Page says "Could not load Firebase" | Check internet and that `config.js` has the right values |
| Google sign-in: *unauthorized domain* | Add the site address in Firebase → Authentication → Settings → Authorized domains |
| Google sign-in works but no admin panel | The Google e-mail must match `ADMIN_EMAILS` in `config.js` **and** the rules |
| "Missing or insufficient permissions" | Rules not published, or the organizer's e-mail in the rules is wrong |
| Students cannot start: "round is not open" | Organizer must press *Open round N* first |
| Username already taken | Another student used it; choose another |
