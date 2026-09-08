# Setting up "Continue with Google"

The code is deployed and inert. Until the three environment variables below are
set, `GET /api/v1/auth/google/status` reports `configured: false`, the SPA
renders no button, and everything behaves exactly as it did before. Nothing
here is urgent and nothing breaks while it is undone.

## What the button actually does

**Google proves an email address. It does not grant membership.** AESIS is a
supervised programme with roles, placements and supervisor assignments, so a
Google account by itself buys nothing:

| Who signs in | What happens |
|---|---|
| Email matches an existing AESIS account | Signed in, whatever their role. A pending email verification is settled, since Google just proved the address. |
| Email is on the class roster, unclaimed | A **student** account is created, claims that roster row, and is signed in. |
| Neither | Refused. Nothing is created. They are told to ask their coordinator to add them to the roster. |

A Google-created student has no programme and no placement yet — the roster
carries neither, and inventing them for a real student would be worse than
asking. They complete those in the app, exactly as a student who registered
with a password does.

## 1. Create the OAuth client

1. <https://console.cloud.google.com/> → create a project (or pick an existing
   one). Name it something recognisable, e.g. **AESIS**.
2. **APIs & Services → OAuth consent screen**
   - User type: **External**.
   - App name **AESIS**, your support email, your developer email.
   - Scopes: the three defaults are enough — `openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile`. Do not add more; the app asks for nothing else.
   - While the app is **Testing**, only accounts you list as test users can sign
     in. Add your own account, plus a student's if you want to try the roster
     path. Publishing it later removes that limit; with only these three basic
     scopes it does not need Google verification.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**.
   - Name: `AESIS backend`.

### Authorised JavaScript origins

```
https://aesis.vercel.app
http://localhost:5173
```

### Authorised redirect URIs

```
https://aesis.onrender.com/api/v1/auth/google/callback
http://localhost:3002/api/v1/auth/google/callback
```

> **This is the step that goes wrong.** Google compares the redirect URI as a
> whole string. A trailing slash, `http` where you registered `https`, or a
> different port is a rejected login — `redirect_uri_mismatch` — not a warning.
> Read `PORT` out of your own `backend/.env` before registering the localhost
> one — this box currently runs on **3002** while `.env.example` ships `3000`,
> so the two disagree by design and only yours is right.

Copy the **Client ID** and **Client secret**.

## 2. Set them on Render

`aesis-backend` → Environment → add three variables, then save:

| Key | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the client ID |
| `GOOGLE_CLIENT_SECRET` | the client secret |
| `GOOGLE_REDIRECT_URI` | `https://aesis.onrender.com/api/v1/auth/google/callback` |

`GOOGLE_REDIRECT_URI` must be byte-identical to the one registered above.

Locally, the same three go in `backend/.env` with the localhost callback.

**Do not paste the secret into a chat window, a commit, or this file.** It is a
password for the OAuth client.

## 3. Check it

```bash
curl -s https://aesis.onrender.com/api/v1/auth/google/status
# {"data":{"configured":true}}
```

Then open the login page: the button appears under the sign-in form. Sign in
with an account that is **not** on the roster and you should land back on the
login page reading "That Google account is not on the class roster."

## How it is secured

- **`state`** — 32 random bytes per attempt, held in an HttpOnly cookie and
  compared on the way back. Without it, a crafted callback URL logs a victim
  into an attacker's Google account. `SameSite=Lax` deliberately: the cookie
  has to survive Google's cross-site redirect, and `Strict` withholds it there.
- **The code is exchanged server-to-server**, authenticated with the client
  secret. The browser never handles a token.
- **The ID token's signature is verified** against Google's published keys, then
  its issuer, audience and expiry are checked. An unverified JWT is a base64
  string anyone can type.
- **`email_verified` must be true.** Google will assert an unverified address,
  and matching one against the roster would let someone claim another student's
  place.
- **No access token in any URL.** The callback sets the refresh cookie and
  redirects to `/auth/callback`; the SPA trades the cookie for a session the
  same way it does on every reload. A token in a URL ends up in browser
  history, the `Referer` header and proxy logs.
- **No password is left usable** on a Google-created account: the stored hash is
  of 32 random bytes nobody has seen. To get a password they use the normal
  reset flow, which emails the address Google just proved.

No new dependency was added. `jsonwebtoken` was already here, and Node's
`crypto.createPublicKey({ format: 'jwk' })` turns Google's signing keys into
something it can verify with.

## Turning it off

Remove the three variables. The button disappears; existing accounts keep
working with their passwords, and any account created through Google keeps its
roster link and index number.
