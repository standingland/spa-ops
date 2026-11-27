# Connecting LINE Official Account (Vercel)

The code for LINE sign-in, outgoing messages and the incoming webhook already exists. This page is only the wiring: what to create at LINE, what to set on Vercel, and how to check it. Nothing here has been run against a real LINE account yet.

## 1. At LINE Developers (one provider, two channels)

| Channel | Used for | You copy |
|---|---|---|
| **LINE Login** | guests prove who they are on `/book` | Channel ID, Channel secret |
| **Messaging API** (your Official Account) | confirmations, reminders, waitlist offers | Channel access token (long-lived), Channel secret |

The two channel secrets are different values. Do not mix them up.

1. LINE Login channel → **Callback URL**: `https://<domain>/api/line/callback`, then set the channel to **Published**.
2. LINE Login channel → link the Official Account, so guests are asked to add it as a friend (needed to receive push messages).
3. Messaging API channel → issue a **long-lived channel access token**.
4. Official Account Manager → Response settings: turn **Webhook** on. Auto-reply and greeting messages are your choice; the app sends no replies.

## 2. Vercel environment variables (Production)

| Variable | Value |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | LINE Login → Channel ID |
| `LINE_LOGIN_CHANNEL_SECRET` | LINE Login → Channel secret |
| `LINE_MESSAGING_TOKEN` | Messaging API → channel access token |
| `LINE_MESSAGING_CHANNEL_SECRET` | Messaging API → Channel secret (webhook signature) |
| `PUBLIC_BASE_URL` | `https://<domain>`, no trailing path |
| `PUBLIC_TOKEN_SECRET` | 32+ random characters: `openssl rand -base64 48` |

`LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, `LINE_MESSAGING_TOKEN`, `PUBLIC_BASE_URL` and `PUBLIC_TOKEN_SECRET` are **all or none**: a partial set stops the app at startup (`src/lib/env.ts`). `LINE_MESSAGING_CHANNEL_SECRET` is only for the webhook.

Never commit real values, and do not paste them into chat. Add them in Vercel → Project → Settings → Environment Variables, then **redeploy** (variables apply only to new deployments).

## 3. Webhook

Messaging API channel → Webhook URL: `https://<domain>/api/line/webhook` → **Verify** (expect success) → turn **Use webhook** on. The endpoint only authenticates events; it stores nothing and replies to nothing.

## 4. Message scheduler (easy to miss)

Messages are sent by `POST /api/internal/dispatch` with `Authorization: Bearer <CRON_SECRET>`. That route accepts **POST only**, and Vercel Cron makes **GET** requests, so Vercel Cron alone will not trigger it. Use one of:

* `pg_cron` + `pg_net` inside Supabase calling the URL every minute (see `docs/deployment.md` step 6), or
* any external scheduler that can send a POST with the bearer header.

A new online booking sends its confirmation right after the response, without waiting for the scheduler. If that send fails (for example LINE is down), the message stays queued and the scheduler retries it. Reminders, waitlist offers and every retry still depend on the scheduler, so it is still required.

## 5. Switch on, then test

1. Apply migrations to production (`docs/deployment.md`).
2. In the app: turn on therapists' **Show on the public page** and services' **Bookable online**.
3. Owner → **Settings → Online booking** → open the public booking page. Reminders and the waitlist have separate switches, still off by default.
4. Test with your own LINE account: add the Official Account, book on `/th/book`, wait for the scheduler, check the Flex confirmation, cancel from its link, and confirm **Admin → Notifications** shows `sent`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| App will not start, lists `LINE...: missing` | partial set of the five variables |
| Page says "Online booking is not open yet" | LINE variables unset, or the owner switch is off |
| Login returns `LINE_AUTH_FAILED` | callback URL mismatch, or the Login channel is not Published |
| Webhook Verify fails | `LINE_MESSAGING_CHANNEL_SECRET` is the Login secret, or the deploy predates the variable |
| Notification `failed` with `LINE_PUSH_FAILED` | guest blocked the account, or an expired/wrong access token |
| Notification stuck `pending` or `failed` | scheduler in section 4 is not running, so retries never happen |
