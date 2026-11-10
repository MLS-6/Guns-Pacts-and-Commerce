# Guns, Pacts, and Commerce — campaign server

This runs one campaign on Cloudflare's free plan:

- Players open the game's web address and type their PIN. Nothing else.
- Orders are saved on the server as players submit them, and players can resubmit until the turn ends.
- The turn resolves automatically at **10 PM New York time**, or earlier when you click **Resolve turn now** after logging in with the admin PIN.
- The game page and rules live in this GitHub repository. Change a file on GitHub and Cloudflare redeploys within a couple of minutes.

**Cost: $0.** The free plan is plenty for one campaign of 4–10 friends: 100,000 requests a day, and a daily resolve uses a few seconds of compute at most. The only optional cost is a custom domain, about $10 a year; without one the address looks like `guns-pacts-and-commerce.yourname.workers.dev`.

## What's in the repository

```
wrangler.jsonc        Cloudflare settings: auto-resolve time, time zone
package.json          tells Cloudflare which tool deploys the server
public/index.html     the game page
public/rules.js       every number in the game (costs, production, damage, starting stock...)
public/engine.js      the rules engine; the page and the server both use this one file
server/worker.mjs     the server: PINs, orders, saving, and resolving turns
```

## One-time setup (about 15 minutes)

### 1. Put the files on GitHub

1. Open your repository on GitHub.
2. Delete the old `index.html`, `README.md` and any `state.json` from the repository's top level. Open each file, click the trash icon, and commit.
3. Click **Add file → Upload files**. Drag in everything from this folder, including the `public` and `server` folders themselves, so GitHub keeps them as folders. Commit.

You can turn GitHub Pages off afterwards (**Settings → Pages**), since the game will now be served by Cloudflare.

### 2. Create the server on Cloudflare

1. Sign up for a free account at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. Go to **Compute (Workers) → Workers & Pages → Create**, choose **Import a repository**, and connect your GitHub account when asked. You can give Cloudflare access to this one repository only.
3. Pick the repository. Leave the build command empty and the deploy command as `npx wrangler deploy`. Click **Create and deploy**.
4. Wait for the first deploy to finish. It takes a minute or two. Cloudflare shows the game's address, ending in `.workers.dev`.

### 3. Set your admin PIN

1. In Cloudflare, open the worker (**guns-pacts-and-commerce**) and go to **Settings → Variables and Secrets → Add**.
2. Set **Type** to **Secret**, **Name** to `ADMIN_PIN` and **Value** to a number only you know. Use 6 or more digits.
3. Click **Deploy**.

### 4. Start the campaign

1. Open the game's address and enter the admin PIN.
2. Fill in the setup screen. Every player gets a random 6-digit PIN, which you can change before starting.
3. Click **Start campaign**, then send each friend the address and their own PIN.

Because you're also playing, log in with **your player PIN** to play. Then open **Game ▾**, type the admin PIN and click **Unlock admin** to get **Resolve turn now**, the PIN list, backups and the new-campaign button, all in the same session.

## Day to day

- Players submit whenever they like; the colored chips show who is in.
- At 10 PM the turn resolves, and everyone's page picks up the new turn within a minute.
- **Resolve turn now** resolves early. If you do that in the evening, the 10 PM resolve skips that night so nobody loses their turn. More precisely, a turn younger than `MIN_TURN_HOURS` (12) is left until the next evening.
- **Game ▾ → Download game file** makes a backup at any time. **Restore game from a backup file** puts one back, and everyone keeps their PIN.
- **Game ▾ → Show player PINs** lists the PINs and lets you change one, for example if a friend forgets theirs.

## Changing the game

| To change | Edit | Notes |
| --- | --- | --- |
| Costs, production, damage, prices, starting stock | `public/rules.js` | |
| Rules logic | `public/engine.js` | |
| The page | `public/index.html` | |
| Resolve time or time zone | `wrangler.jsonc` → `RESOLVE_HOUR` (0–23) and `TIME_ZONE` | |
| Admin PIN | the `ADMIN_PIN` secret in Cloudflare | Not stored in GitHub. |

To edit, open the file on GitHub, click the pencil, and commit. Cloudflare redeploys automatically in about two minutes; you can watch it under the worker's **Deployments** tab. The running campaign is stored separately from the code, so redeploying never erases it.

Between campaigns, change anything freely and then use **Start a new campaign**. During a campaign, number changes in `rules.js` take effect from the next turn, which is fine for balance tweaks. For bigger engine changes, download a backup first.

## If something goes wrong

- **The page says it can't reach the server.** Check the latest deploy under **Deployments** in Cloudflare; a failed deploy shows its error log.
- **The admin PIN isn't accepted.** Make sure `ADMIN_PIN` is a **Secret** on the worker and that you clicked **Deploy** after adding it.
- **"Too many wrong PINs".** After 10 wrong PINs from one address, that address must wait 10 minutes.
- **The turn didn't resolve at 10 PM.** The server checks every hour, so it resolves at 11 PM at the latest. If the turn was opened by hand that evening, it waits until the next evening. Cloudflare shows each hourly run in the worker's logs and cron trigger history.
