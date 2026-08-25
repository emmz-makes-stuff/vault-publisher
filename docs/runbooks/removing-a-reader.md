# Removing a reader

**Removing someone from the allow-list does not sign them out.** It stops them logging in again; a
session they already hold keeps working until it expires — up to the application's session duration,
currently 24 hours. Withdrawing access now takes **two** steps, and doing only the first leaves a
removed reader reading the site for the rest of the day.

This is the operation most likely to be done in a hurry, so it is written down rather than
remembered.

## The two steps

**1. Remove them from the allow-list.** This stops them authenticating again.

Cloudflare dashboard → **Zero Trust** → **Access controls** → **Policies** → the site's policy →
remove the address from the `Include → Emails` list → **Save**.

**2. Revoke their existing session.** This ends access they already hold.

**Zero Trust** → **Team & Resources** → **Users** → tick the user → **Action** → **Revoke**.

Revoke **per user**, not per application. The application-level control
(**Applications → Configure → Revoke existing tokens**) ends _everyone's_ session, so every remaining
reader has to log in again — needless, and it means a routine removal interrupts people who were not
removed.

## Confirming it worked

Do not rely on the policy screen looking right. Confirm in a browser that holds a live session for
that address:

- Request a page that browser has **not** visited before. A page it has already loaded may render
  from cache and look like access when access is gone — which reads as a pass while proving nothing.
- Expect the Cloudflare Access login page.
- Entering the removed address should produce the code screen with **no email arriving**. That is the
  correct refusal: the login page deliberately reports a code as sent whether or not one was, so it
  cannot disclose who the readers are.

For up to a minute after a revoke, Cloudflare blocks login attempts for that user and shows an
error. If a check immediately afterwards looks strange, wait sixty seconds and repeat it.

## If you only did step one

They keep access until their session expires — up to 24 hours from their last authentication, not
from the removal. If that matters, do step two. There is no way to shorten an already-issued session
other than revoking it.

## Why it is built this way

The session is deliberately long. Every re-authentication is another one-time-PIN round trip through
email, and that path can fail quietly — a code filed as spam, or consumed by a mail scanner before
the reader gets to it. Two of the three readers are non-technical, so friction on the common path
costs more than a second step on a rare, deliberate one. The trade was made knowingly; see the
change's DEVLOG under section 2.
