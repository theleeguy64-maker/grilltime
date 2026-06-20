"""E2E verification of GrillTime over file:// (the no-server promise)."""
import sys, pathlib
from playwright.sync_api import sync_playwright

INDEX = pathlib.Path(__file__).resolve().parent.parent / "web" / "index.html"
URL = INDEX.as_uri()  # file:// URL

failures = []
def check(name, cond):
    print(("PASS" if cond else "FAIL"), name)
    if not cond: failures.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})  # iPhone-ish
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # 1. No module/CORS console errors — the headline file:// promise
    check("no console/page errors on file:// load", len(errors) == 0)
    if errors:
        print("  errors:", errors)

    # 2. Empty state renders
    check("empty state shown initially", "No dishes yet" in page.content())

    # Set a serve time well in the future (use the page's own clock: now + 3h)
    serve = page.evaluate("""() => {
        const d = new Date(Date.now() + 3*60*60*1000);
        return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    }""")
    page.fill("#serve-time", serve)

    # 3. Add a dish (Ribeye)
    page.click("#show-add")
    page.fill("#d-name", "Ribeye")
    page.fill("#d-prep", "5")
    page.fill("#d-cook", "12")
    page.fill("#d-rest", "8")
    page.click("#save-dish")
    page.wait_for_timeout(200)
    check("Ribeye row rendered", "Ribeye" in page.inner_text("#schedule"))
    check("schedule shows a serve time", "serve" in page.inner_text("#schedule"))
    check("headline shows start time", "Start cooking at" in page.inner_text("#headline"))

    # 4. Add a second dish (Asparagus) -> chronological merge, two rows
    page.click("#show-add")
    page.fill("#d-name", "Asparagus")
    page.fill("#d-cook", "6")
    page.click("#save-dish")
    page.wait_for_timeout(200)
    rows = page.locator(".dish-row").count()
    check("two dish rows after second add", rows == 2)
    # Ribeye (longer, prep+cook+rest) should sort before Asparagus (short)
    first_name = page.locator(".dish-row .name").first.inner_text()
    check("rows sorted chronologically (Ribeye first)", first_name == "Ribeye")

    # 5. Validation: cook=0 blocked
    page.click("#show-add")
    page.fill("#d-name", "Bad")
    page.fill("#d-cook", "0")
    page.click("#save-dish")
    page.wait_for_timeout(150)
    check("cook=0 shows validation error", page.inner_text("#e-cook").strip() != "")
    check("invalid dish not added (still 2 rows)", page.locator(".dish-row").count() == 2)
    page.click("#cancel-add")

    # 6. Late flag: serve time in ~10 min, but Ribeye needs 25 min -> late
    soon = page.evaluate("""() => {
        const d = new Date(Date.now() + 10*60*1000);
        return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    }""")
    page.fill("#serve-time", soon)
    page.wait_for_timeout(200)
    check("late dish flagged red", page.locator(".dish-row.late").count() >= 1)
    check("headline shows behind", "behind" in page.inner_text("#headline").lower())
    check("late badge has formatted reason", "running late by" in page.inner_text("#schedule"))

    # 7. Serve time in the past -> 'already passed' state, not a wall of red
    past = page.evaluate("""() => {
        const d = new Date(Date.now() - 30*60*1000);
        return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    }""")
    page.fill("#serve-time", past)
    page.wait_for_timeout(200)
    check("serve-in-past panel shown", "already passed" in page.inner_text("#headline").lower())

    # 8. Remove a dish -> recompute (reset serve to future first)
    page.fill("#serve-time", serve)
    page.wait_for_timeout(150)
    page.locator(".dish-row .danger").first.click()
    page.wait_for_timeout(200)
    check("one row after remove", page.locator(".dish-row").count() == 1)

    # 9. Persistence: reload, dishes survive (localStorage)
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(200)
    check("dish persisted across reload", page.locator(".dish-row").count() == 1)

    page.screenshot(path="/tmp/grilltime.png", full_page=True)
    browser.close()

print()
if failures:
    print(f"{len(failures)} FAILED:", failures)
    sys.exit(1)
print("ALL E2E CHECKS PASSED")
