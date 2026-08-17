# Chromium security update policy

LongView follows supported Chromium Stable rather than maintaining an indefinitely frozen browser.

- The pin watcher checks Chrome for Testing Stable daily.
- A newer stable version creates a security-upgrade issue and blocks stable release promotion.
- Critical Chromium fixes target a LongView rebuild within 72 hours of an applicable stable release.
- Normal stable updates target seven days.
- LongView patches must apply cleanly to the new pin and pass feature-off differential tests before promotion.
- Stable update feeds support immediate rollout suspension and rollback.
