# The API's configuration on AWS. Committed, so nothing secret here: keys, passwords and email addresses go in
# the closed-loop/api secret (docs/DEPLOY.md). Every name in .env.example is accepted.

# The app's address. First apply: leave as is; then paste the "app_url" output here and apply again.
app_url = "https://pending.invalid"

# Must all exist in the secret, or the container won't start. Drop a line here (and from the secret) if you don't use it.
secret_keys = [
  "KEY_ENCRYPTION_SECRET", # openssl rand -base64 48; encrypts users' saved API keys, never change it once set
  "ADMIN_EMAILS",
  "GOOGLE_CLIENT_SECRET",
  "SMTP_USER",         # the Gmail address emails come from
  "SMTP_APP_PASSWORD", # a Google App Password for it (myaccount.google.com/apppasswords)
]

app_env = {
  GOOGLE_CLIENT_ID = "981432854278-cr5bp0sft8j2091aj090hm4p89t6plnp.apps.googleusercontent.com"
  SESSION_TTL_DAYS = "7"
}
