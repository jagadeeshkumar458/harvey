# Harvey

An AI closer for negotiations, tough conversations and career moves — built on the mindset of Harvey Specter from *Suits*. The personality is written in original words; no show dialogue is reproduced.

**Live:** https://jagadeeshkumar458.github.io/harvey/

## Three modes

| Mode | What it does |
|---|---|
| **Counsel** | Bring him a situation. He gives you the read, the play, and the exact line to say. |
| **Prep** | Fill a case file (what you want, who's across the table, your leverage). He returns a structured playbook: anchor, key lines, pushback responses, mistakes to avoid, walk-away point. |
| **Spar** | He plays the person across the table — tough, friendly-but-stingy, or stonewaller — using your case file. When you're done, he grades you out of 10 and rewrites your weakest line. |

Harvey won't help with anything illegal or manipulative (fake offers, threats, harassment), and tells you to get a licensed professional for real legal, tax or medical questions.

## Setup

1. Open the site and click **Settings**.
2. Paste a Claude API key from [console.anthropic.com](https://console.anthropic.com) and pick a model.

The key is stored only in your browser and sent only to Anthropic. API usage is billed per request from Console credits.

## Develop

React 19, bundled with esbuild. No backend — the browser calls the Claude Messages API directly.

```bash
npm install
npm run build   # outputs to docs/
npm run serve   # http://localhost:8000
```

GitHub Pages serves the committed `docs/` folder (Settings → Pages → Branch: `main`, folder: `/docs`). Rebuild and commit `docs/` after changing `src/`.

| File | What it holds |
|---|---|
| `src/persona.js` | Harvey's character, mode prompts, sparring prompt, and the tool schemas for the playbook and debrief |
| `src/api.js` | Streaming and structured (tool-use) calls to the Claude API |
| `src/App.jsx` | Counsel, Prep, Spar and Settings screens |
| `src/style.css` | Navy-pinstripe and oxblood-tie design |
