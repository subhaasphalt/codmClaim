# CODM Daily Gift Claimer

## Setup
1. Create a **private** GitHub repo and push these files.
2. Repo > Settings > Secrets and variables > Actions > New secret:
   - `CODM_PLAYER_ID` = your player ID
   - `TELEGRAM_BOT_TOKEN` = from @BotFather
   - `TELEGRAM_CHAT_ID` = your chat ID (message @userinfobot)
3. Actions tab > "CODM Daily Gift" > Run workflow (test it manually first).
4. If it fails, download the screenshot artifact and adjust selectors in claim.js.

GitHub also emails you on failed scheduled runs by default.
