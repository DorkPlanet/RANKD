# Putting Rankd on your phone

The aim is opening Rankd at work, not running a hosting project. Vercel, because
a tunnel or a VPN would need this laptop awake and running — and if the laptop
has to be on, you may as well be at it.

## Once, to get a URL

From `rankd-app/` (not the repo root):

```bash
npx vercel
```

It opens a browser to sign in — GitHub or email, either is fine — then asks a
few questions. The answers:

- **Set up and deploy?** yes
- **Which scope?** your own account
- **Link to existing project?** no
- **Project name?** `rankd` (or anything)
- **In which directory is your code located?** `./` — you're already in
  `rankd-app`, which is the app root
- **Modify settings?** no

Then give it the TMDb key, which never reaches the browser and isn't in git:

```bash
npx vercel env add TMDB_API_KEY production
```

Paste the key when prompted (it's in `rankd-app/.env.local`). Then publish:

```bash
npx vercel --prod
```

That prints a URL. Open it on your phone and add it to the home screen — the app
is built for a phone-sized viewport and will feel like an app rather than a page.

## Every time after that

```bash
npx vercel --prod
```

## Getting your library onto the phone

**This is the part that isn't obvious.** Your 828 films live in this browser's
storage under `localhost:3000`. A deployed Rankd is a different address, so it
gets its own empty storage — you'd open it and find ten seed films. That isn't a
bug, it's how browsers keep sites apart.

So, once:

1. On this laptop, at `localhost:3000`: **Settings → Save a backup**. You get a
   `rankd-backup-….json` of about 200 KB with everything in it — films, scores,
   placements, duel counts, your profile and banner.
2. Get that file to your phone. Email it to yourself, or drop it in Drive or
   iCloud. Any way you'd move a file.
3. On the phone, open your Vercel URL: **Settings → Restore**, pick the file. It
   checks the file before writing anything, then reloads with your library.

Repeat whenever you want the two to match. It's one file each way.

**When this stops being necessary:** once there's an account system and a
database, the library lives on the server and follows you automatically. Every
write in the app already funnels through one function (`saveFilms` in
`src/lib/store.ts`), so that change is contained — but it's a project of its own.

## Before you share the URL with anyone

- **Rotate the TMDb key.** The old prototype `rankd.html` has a key hardcoded in
  it and that file is committed, so the key is in git history and should be
  treated as public. Generate a new one at TMDb, put the new one in
  `.env.local` and in `vercel env`, and revoke the old one.
- The API routes already refuse calls that don't come from your own deployment,
  and rate-limit each caller — so a stranger who finds the URL can't quietly
  spend your TMDb quota.
- Anyone with the URL gets their own empty library. There are no accounts, so
  nobody can see yours.
