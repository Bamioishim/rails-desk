---
mode: testing
tags: [smoke]
max_steps: 30
timeout: 120
url: https://preview.invalid/rails
---
# Rails settings persist in this browser

## Save, reload, and restore the test policy
Set "Maximum transfer amount" to 25 and set "Allowed recipients" to Alex, Jordan, Sam, and Taylor, one per line. Click "Save policy changes" and verify the "Rails saved" confirmation appears. Reload the page and verify the maximum remains 25 and Taylor remains in the allowed recipients. Restore the defaults (maximum 20 and Alex, Jordan, Sam), save again, and verify the confirmation. This check is limited to this browser's local policy settings; do not claim that the isolated `/demo` uses these settings.