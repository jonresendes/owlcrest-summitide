# Summitide Learning — the two store apps (v79)

One codebase, three editions:

| Edition | Who it is for | How it is paid for | Where data lives |
|---|---|---|---|
| **web** (this repository as it is) | The school's own site | — | The school's Firebase project |
| **Schools** (`dist/schools`) | Schools and boards | Invoiced by you, outside the app. Nothing is sold in the app. | Each school's own Firebase project, found by a school code |
| **Personal** (`dist/personal`) | A family, or a single teacher | In-app purchase through Apple and Google: one course at a time, or a subscription to everything | On the device only. No accounts, no cloud. |

They must be **two separate store listings** with different app ids. Do not add prices or a "buy" button to the Schools app, and do not offer school invoicing inside the Personal app.

## What you need

- Node 20 or newer (for the build tool and Capacitor).
- **Android:** Android Studio; a Google Play developer account.
- **iOS:** a Mac with the current Xcode; an Apple Developer Program membership.
- **Personal edition only:** a RevenueCat account (it sits between the app and both stores, and is where you watch sales).

## 1. Fill in `tools/editions.json`

- `appId` for each edition (reverse-domain style, yours to choose once; it cannot change after publishing).
- `schools.directory`: the https address of the folder that holds one small file per school (see step 4).
- `personal.store.appleKey` / `googleKey`: the **public** SDK keys from RevenueCat (one per store).
- `personal.store.terms` / `privacy`: https links to your terms of use and privacy policy (both stores require them for subscriptions).

## 2. Build

```
node tools/build-editions.js schools
node tools/build-editions.js personal --courses /path/to/your/course-json-files
```

The course files are not in this repository and must not be added to it (it is public). The Personal build packs the files in the folder you name and prints the product ids to create in the stores (`course_eng3u`, …, plus the subscription products).

To try the Personal edition in a browser with pretend purchases: add `--test-store`, then serve `dist/personal` (`npx serve dist/personal`). Never ship a `--test-store` build.

## 3. Make the apps

```
cd wrap/personal          (or wrap/schools)
npm install
npx cap add android       (first time only)
npx cap add ios           (first time only, on the Mac)
npx cap sync              (every time after a build)
npx cap open android      (then Build > Generate Signed App Bundle in Android Studio)
npx cap open ios          (then Product > Archive in Xcode)
```

## 4. Schools edition: the school directory and licences

For each school, copy `wrap/schools-directory/example.json` to `<school code in lower case>.json` in the directory folder and fill in that school's Firebase web settings (public identifiers, the same ones in its `cloud-config.js`) and its licence (`plan`, `seats`, `expires`). Give the school its code. The app asks for the code once per device.

The directory is your licence register: one file per school, with the plan and the end date. The Headmaster sees the licence under Administration and is warned in the last 30 days. It is a notice, not a lock.

Each school still needs its own Firebase project with `firestore.rules` published, exactly as now.

## 5. Personal edition: products and where to watch sales

1. In App Store Connect and in Play Console, create one **non-consumable / one-time product** per course with the ids the build printed, and the two **subscriptions** (`summitide_all_monthly`, `summitide_all_yearly`) in one subscription group.
2. In RevenueCat, add both apps, import the products, and create **entitlements**: `all` (attach both subscriptions) and one per course with the same id as its product (`course_eng3u` → product `course_eng3u`).
3. Sales, active subscriptions, renewals, refunds and revenue for both stores then show in the RevenueCat dashboard. App Store Connect and Play Console show the same per store.

## Where to watch the money

| What | Where |
|---|---|
| School licences | Your invoicing tool (for example Stripe invoices or subscriptions) + the school directory files |
| Personal: subscriptions and course sales | RevenueCat dashboard (both stores together); App Store Connect; Play Console |
| Course files sold directly to schools | Your web storefront's dashboard |

## Not done yet (be honest with reviewers and yourself)

- Not run on a real phone, and no purchase has been made against Apple, Google or RevenueCat. The store screens were tested in a browser with pretend purchases.
- iOS needs a native feature beyond the web view to pass Apple's minimum-functionality review; push notifications for Notices is the planned one.
- The Personal app's users may be children: the stores' rules for children's apps (age rating, a parental gate before purchases, data declarations) still have to be worked through.
- What has been bought is remembered on the device so courses open offline; the course files travel inside the app. Both can be got at by a determined person. A real lock needs a server.
- A teacher using the Personal edition keeps students on that one device. Students on their own devices need the Schools edition.
