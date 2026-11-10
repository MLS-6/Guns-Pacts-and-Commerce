# Guns, Pacts, and Commerce

A daily-turn game of diplomacy, trade and supply lines for 4–10 players. The whole game is one file, `index.html`.

## Put it on GitHub Pages

1. Create a repository and upload `index.html` (and this README).
2. In the repository, go to **Settings → Pages**, set the source to your main branch, and save.
3. Open the address GitHub gives you, for example `https://yourname.github.io/supply-lines/`.

Each player can bookmark `index.html?player=3` (their player number) so the page opens as their nation only.

## Three ways to share a game

GitHub Pages only serves files, so it can't collect everyone's orders on its own. Pick one of these at the top of `index.html` in `window.SUPPLY_LINES_CONFIG`:

| Setting | How a turn works |
| --- | --- |
| `STATE_URL: ''` | Pass-and-play in one browser. Everyone picks "Playing as", submits, then anyone clicks **Resolve turn**. Good for testing. |
| `STATE_URL: 'state.json'` (this file's setting) | No server needed. The host creates the game and commits the downloaded `state.json` to the repo. Each day players submit, which downloads an orders file they send to the host. The host uses **Game → Import players' orders**, clicks **Resolve turn**, and commits the new `state.json`. Everyone's page picks it up automatically. |
| `SERVER_URL: 'https://…'` | Fully automatic, with any small server or hosted JSON store that implements the three calls below. |

### Server contract

```
GET  {SERVER_URL}/game               → { state, pending }   (404 if there is no game yet)
PUT  {SERVER_URL}/game               ← { state, pending }   (the whole game, after a turn resolves)
PUT  {SERVER_URL}/orders/{playerId}  ← { orders, turn }     (store as pending[playerId] = { orders, turn, at })
```

Any player can resolve once everyone has submitted, and the page polls every `POLL_SECONDS`. There is no login, so this suits a group of friends rather than strangers. The game engine (`Engine.resolveTurn(state, ordersByPlayer)`) has no browser dependencies, so a Node server can also resolve turns itself on a daily schedule.

## Changing the rules

Every number (costs, production, damage, prices, starting stock) is in the `RULES` block near the top of the script in `index.html`. Edit it and reload.

## Where the code made calls the rules didn't cover

- Walls are limited to one per city; otherwise HP could be stacked without limit.
- Naval batteries need a city next to water.
- City tiles count as rail stations, so a railroad only has to reach the city's edge.
- City tiles are exempt from the two-logistics-units-per-tile limit, so routes can share a hub.
- Diplomacy (war declarations, accepted treaties) resolves first, before combat, so a war declared this turn allows attacks this turn.
- A peace treaty fails as a whole if either side no longer has what it promised when it is accepted, and each side must keep at least one city.
- Ceded tiles join the receiving nation's nearest city. Units on a ceded city tile move to the nearest free tile.
- Ships on open ocean go anywhere; rivers and lakes inside another nation's territory need transit rights, like land.
- Supply, upkeep and repairs happen at the end of the logistics phase.
- Rubber and oil regions are centred on open land far from every capital (and roomy enough to hold the region), so they are contested ground. Inside a region the tiles are spread out, never two side by side; tiles within 2 hexes of a capital never get rubber or oil.
- Production runs before construction, so goods made this turn can be built with, but inputs are also taken first. A new building starts producing the turn after it is built.
- Clearing a forest that has a lumber yard on it requires demolishing the lumber yard first. Lumber that won't fit in the city's storage is lost.
- Starting goods set in the setup screen are capped at the capital's base storage of 100 each.
- Caravans and other transports eat from their own cargo first, so long caravan routes deliver less (or starve). The route form shows path length and capacity before you commit.
