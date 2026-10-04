# Hotel Upwork — CRM Business Logic (Source of Truth)

This file is the **single source of truth for CRM business logic**: which pages exist, what
each page contains, and which roles can see what. It exists so that business-logic decisions
are made and reviewed in one readable place instead of being reverse-engineered from
component templates.

Last business-model review: 23 September 2026. First implementation pass against this revision
completed the same day (see "Implementation gaps" for what was verified and what remains).

## How to read this document

- **Intended rules** below define the product decisions to implement.
- **Page inventory** records the implementation described when this file was written. It is
  a reference, not permission to override the intended rules.
- **Implementation gaps** are reported discrepancies awaiting verification. Do not treat
  an old observation as proof that a defect still exists.
- Review CRM business logic in this file by default. Read application code only when asked
  to implement or verify a specific rule. Avoid generating a separate review document.

## Rules for humans and AI agents

1. **Read this file before reading page component code** when the task involves access rules,
   roles, permissions, or "who can see/do X".
2. **When business logic changes** (a new role, a page moves between roles, a section becomes
   restricted, etc.), **edit this file first**, then update the code (routes, `role.ts`,
   component gating) to match it. This file describes the intended behavior; the code should
   follow it, not the other way around.
3. Any code change that affects who can see or do something — routes, `ROLE_PAGES`,
   `ROLE_HOME`, capabilities, section gates, action guards, AI scope — must update this file in
   the same change: the page inventory row, and the gaps list (move items to resolved only after
   verification). Pure visual, copy or refactor changes don't need an update.
4. Record implementation gaps separately from product decisions. A specification edit does
   not mean the implementation is fixed. Mark a gap resolved only after verification.

## Roles

Defined in `src/app/shared/role.ts` (`Role` type, `ROLE_LABEL`). This is the one authoritative
role model for the logged-in user's own permissions.

| Role key       | Label (UI)                | Notes                                   |
| -------------- | -------------------------- | ---------------------------------------- |
| `owner`         | Власник                    | Business oversight and final authority; audit and last-owner safeguards still apply. |
| `manager`       | Менеджер                   | Daily operations across departments; no ownership/security administration. |
| `reception`     | Рецепція                   | Front-desk operations; no financial reporting/analytics. |
| `housekeeping`  | Прибирання                 | Assigned cleaning tasks; supervision is a separate capability. |
| `sales`         | Продажі / Маркетинг        | Availability, offers, assigned enquiries and aggregate marketing analytics; no guest payment ledger. |
| `accountant`    | Бухгалтер                  | Payments, reconciliation and read-only supporting booking/payer documents. |
| `maintenance`   | Технічне обслуговування    | Rooms/housekeeping only, no guest identity or pricing. |

In the static demo, role is stored client-side in `localStorage` (`hotelup_role`) and read via `getStoredRole()`.
`isPageAllowed(role, path)` and `defaultPageFor(role)` drive routing (`role.guard.ts`).
`defaultPageFor` reads the explicit `ROLE_HOME` map; login and denied-route fallback both use it.
Action authority is a separate `Capability` table in `role.ts`, checked with `can(role, cap)` /
`canCurrent(cap)`, never inferred from page access.

**Everyone with any role can open `/ai`** — when the hotel's plan includes it (see Plans).

## Plans — which features the hotel has paid for

Defined in `src/app/shared/plan.ts` (`Plan` type, `PLANS`, `PLAN_PAGES`). A plan is a
**hotel-level** switch, independent of the user's role. A page opens only when **both** the
role allows it (`ROLE_PAGES`) **and** the hotel's plan includes it (`PLAN_PAGES`); checked with
`isPageAvailable(role, plan, path)`. Plan never grants a role anything it could not do before.

| Plan key     | Name       | Price (demo)      | Pages added                                                        | Roles that can be used |
| ------------ | ---------- | ----------------- | ------------------------------------------------------------------ | ---------------------- |
| `start`      | Start      | Free              | `calendar`, `submissions`, `rooms`, `team`, `settings`             | owner, manager, reception, sales |
| `pro`        | Pro        | €39 / month       | + `dashboard`, `guests`, `payments`, `housekeeping`, `messages`    | all 7 |
| `enterprise` | Enterprise | €89 / month       | + `automations`, `sales`, `ai`                                      | all 7 |

Plan limits (`PLAN_ROOM_LIMIT`, `PLAN_STAFF_LIMIT`): Start — up to 10 rooms and 3 staff accounts;
Pro — up to 30 rooms and 15 staff; Enterprise — unlimited rooms/staff, several hotels, priority
support. Applied in the demo:

- **Rooms:** Rooms, Calendar and New booking show the demo room list cut down to the plan's room
  cap (`limitRoomsToPlan`). "Додати номер" is disabled once the cap is reached.
- **Staff:** Team shows only seed employees whose role is usable on the plan, up to the staff cap.
  Active and invited accounts count toward the cap; deactivated ones do not. "Додати працівника",
  sending an invite and restoring access are blocked once the cap is reached.

Rules:

- **Free features:** booking calendar and website form submissions (`submissions`). Websites are
  separate projects that post into Hotel Upwork through the public API; this project does not host
  hotel websites.
- **Home screen:** `defaultPageFor(role, plan)` uses `ROLE_HOME` when the plan includes it,
  otherwise the first page from `ROLE_PAGES[role]` the plan includes. A role with no page in the
  plan (housekeeping, accountant, maintenance on Start) cannot sign in; the login screen marks
  it "Доступно з тарифу Pro".
- **Plan-locked page:** the page is not hidden from the navigation; it shows a "Pro"/"Enterprise"
  tag. Opening it redirects to the home screen with `?locked=<page>`, and the shell explains which
  plan includes it with a link to `/pricing`. This is an upsell, not a permission error.
- **Team:** Add employee / change role offers only roles usable on the current plan.
- **Pricing page:** `/pricing` is public and prerendered; landing, login and the sidebar plan note
  link there.
- In the static demo the plan is stored client-side in `localStorage` (`hotelup_plan`, default
  `enterprise`) and picked on the test-login screen.

## Live pages — what a real account sees

A real, Firebase-signed-in account (`isLiveSession()`) sees only pages backed by real data:
`LIVE_PAGES` in `src/app/shared/role.ts`, currently **`dashboard`** (the home page after login), **`submissions`**, **`calendar`**, **`new-booking`**, **`guests`**, **`payments`** and **`rooms`**.
Everything else in this document describes the demo, which keeps every page (entered via `/demo`).

- Sidebar and mobile nav list only live pages; Team, Settings, AI button, search,
  notifications, profile and the plan note are hidden.
- Opening any other protected route redirects to the first live page with `?soon=<page>`, and
  the shell explains the section is not connected to real data yet.
- Inside Submissions, demo-only parts are hidden too: "Підключити сайт" dialog and the
  "Перша відповідь" tile.
- Inside Rooms, what depends on staff or demo data is hidden: the date timeline, links to
  Housekeeping, weekend/extra-guest prices and the AI strip. Current guest, stay dates, payment
  status and next arrival come from the hotel's bookings (still hidden for `maintenance`);
  "Створити/Відкрити бронювання" and "+ Нове бронювання" open the Calendar.
  Cleaning is "Почати прибирання" → "Завершити прибирання" (no assignee yet).
- Plan room/staff limits are not applied to real hotels: plan per hotel is not built yet.
- Inside Calendar, demo-only parts are hidden: "Відкрити бронювання" and "Надіслати повідомлення"
  in the booking panel, "Відкрити повну форму" in the booking dialog. Payment is only the
  booking's `paid` amount (no payments ledger yet).
- When a page is wired to Firestore, add its path to `LIVE_PAGES` and record it here.

## Hotels — one account, several hotels

One Firebase account can own many hotels. Ownership lives on the hotel document:
`hotels/{hotelId}` with `ownerUids` (array of Auth uids), `name` and optional `city`. Hotel
documents are created manually (console / admin script); there is no self-service creation.

- **Active hotel:** every hotel-scoped page works on exactly one hotel at a time —
  `HotelService.activeHotelId` (`src/app/feature/firebase/hotel.service.ts`). Pages must read it
  reactively and re-query when it changes; they never mix data from several hotels.
- **Switcher:** the sidebar hotel block becomes a dropdown when the account has 2+ hotels
  (search field above 6). One hotel shows a static block; the demo shows the static demo hotel.
- **Login:** loads the account's hotels (sorted by name) and keeps the last active hotel if the
  account still has access, otherwise the first. No hotels → sign-in is refused with a message.
  The list is refreshed when Firebase restores a session, and cleared on logout.
- **Storage:** `hotelup_hotel_id` (active hotel) and `hotelup_hotels` (cached list) in
  `localStorage`; access is enforced by `firestore.rules`, not by the cache.
- **Websites:** each hotel site posts submissions with its own `hotelId`; one site belongs to
  one hotel.

Not yet decided / not built: role per hotel (today every real account is Owner of all its
hotels), plan per hotel (plan is still one local demo setting), and whether several hotels
require Enterprise (pricing says so, not enforced). Only Dashboard, Submissions, Calendar, New booking, Guests, Payments and Rooms read real hotel
data today.

## Intended rules — take precedence over the page inventory

### People, roles and home screens

A role describes responsibility; a named employee owns work. “My tasks” must refer to a
specific demo employee, not everyone in that department. One person may hold multiple
capabilities in a small hotel. Keep the seven role presets; do not require separate accounts
for each responsibility.

| Role | Default home | First question it should answer |
| --- | --- | --- |
| Owner | Dashboard, business summary | Is the hotel healthy, and what needs my decision? |
| Manager | Dashboard, operational exceptions | What may disrupt today's service, and who is handling it? |
| Reception | Dashboard, current shift | Who arrives/leaves next, is the room ready, and what does the guest need? |
| Housekeeping | Housekeeping, My tasks | What should I clean next, and may I enter? |
| Sales | Sales, enquiries and performance | Who needs a follow-up, and where is demand coming from? |
| Accountant | Payments, reconciliation | Which amounts are unmatched, overdue or unexplained? |
| Maintenance | Repair queue within the existing Rooms/Housekeeping workspace | What is broken, how urgent is it, and when can I access it? |

Login and denied-route fallback must use the same explicit home mapping. A denied link
should explain the limitation and offer an allowed next step. Do not silently send staff to
the public landing page. Internal links must resolve to a usable page or contextual panel.

### Data visibility is separate from action authority

Opening a page does not grant every action on it. Apply the same rules to desktop/mobile,
dialogs, exports, notifications, search, AI answers, AI history and suggested prompts.

| Data or action | Default business rule |
| --- | --- |
| Guest bill, deposit and balance | Owner, Manager, Reception and Accountant; Reception needs these to serve a guest. |
| Hotel-wide financial reports and exports | Owner, Manager and Accountant. Reception sees individual bills and its shift totals, not hotel-wide revenue. |
| Sales analytics | Owner, Manager and Sales: aggregate booking value, channel performance and campaign results. Guest debts and payment/refund reconciliation remain excluded. |
| Sales contact and booking context | Assigned enquiries, relevant contact details, availability and approved quoted prices. No unrelated guest notes or payment ledger. |
| Cleaning/repair context | Room, occupancy/access window, DND, setup requirements, priority and relevant issue notes. No guest identity, contacts or finances by default. |
| Collect a payment | Owner, Manager, Reception and Accountant, against an identified booking/payer. |
| Refund or reassign a payment | Owner, Manager and Accountant with the explicit capability; Reception requests approval by default. Record reason and actor. |
| Change a booking | Owner, Manager and Reception within approved rates/policies. Sales may create offers/holds and convert assigned enquiries; changing unrelated bookings requires a separate grant. |
| Change prices or room inventory | Owner and authorized Manager. Maintenance can update technical condition, not pricing, room types or inventory structure. |
| Assign/inspect cleaning | Owner, Manager or an employee with housekeeping-supervisor capability. Cleaner starts/completes assigned tasks and reports blockers. |
| Complete a repair | Assigned technician; completion does not automatically release a room for sale. |
| Block/release a room | Owner or authorized Manager. Any worker can report an urgent issue and request a block; urgent requests need visible acknowledgement. |
| Guest export, merge or deletion | Separate capabilities, Owner/authorized Manager by default. Preserve linked booking/payment history; routine front-desk edits do not grant bulk export or deletion. |
| Manage staff | Owner; Manager may manage operational staff within granted authority and cannot grant privileges they do not possess. |
| Ownership, security and hotel deactivation | Owner only. Never remove the last active Owner, including through a role change. |

An unavailable action should offer “Request approval” when a worker legitimately needs it.
Show pending/approved/rejected, decision-maker and reason. Never require borrowing another
person's login. All consequential changes retain actor, time, reason and affected record.

### Daily workflows the prototype must demonstrate

These are intended acceptance criteria, not a claim that all flows already exist.

- **Owner:** understand today's position and next seven days, inspect an exception, see its
  responsible person and approve or delegate the next action. Keep this usable in 30 seconds
  on a phone; detailed reports remain one step away.
- **Manager:** identify an at-risk arrival, assign a cleaning/repair response, set a deadline,
  notify Reception and verify resolution. Carry unresolved work into an acknowledged shift
  handover rather than losing it in separate modules.
- **Reception:** open a booking, check readiness, collect the remaining balance, check in/out
  and record a guest promise. Handle early arrival, late checkout, room move and no-show with
  visible consequences. Access readiness/request context without needing the supervisor's
  full housekeeping board. Close the shift with collection totals and unresolved issues.
- **Housekeeping:** open My tasks, see access/DND and arrival deadline, start work, complete a
  checklist or report a blocker with notes/photo. Distinguish departure cleaning from an
  occupied-room service. Supervisor assigns and inspects; do not make every cleaner a supervisor.
- **Maintenance:** receive an issue with location, impact, assignee and access window; move it
  through reported → assigned → in progress → waiting for access/part → fixed → verified.
  Waiting needs a reason and ETA. Completion hands back to cleaning/inspection when necessary.
- **Sales:** record an enquiry/contact, dates and room requirements; prepare an approved
  quote or time-limited hold; record next follow-up; convert to booking or record lost reason.
  Assigned contact/conversation context may live in a scoped panel without opening all Guests
  or Messages. Keep campaign reporting alongside this work, not as a substitute for it.
- **Accountant:** open a transaction and read-only booking folio, see payer and document
  references, match a bank/acquirer receipt or flag a discrepancy, explain the balance and
  export the selected period. Distinguish future amounts due from overdue debt. Corrections
  retain history; closed periods require an explicit correction workflow.

### Shared operational definitions

- **Room state has separate dimensions:** occupancy, cleaning readiness and technical
  availability. “Vacant” does not mean clean; “cleaned” does not mean repaired. Sellable/ready
  requires every applicable condition. Occupancy comes from the stay, not a manual cleaning toggle.
- **Inspection is configurable:** a small hotel can allow cleaner completion to mark a room
  ready; a hotel requiring inspection uses cleaned → awaiting inspection → ready. An unresolved
  technical block prevents release in either mode.
- **A task has** an assignee, status, priority, deadline/access window, blocker and history.
  Guest-facing promises and cross-department requests need acknowledgement and closure.
- **A booking folio explains** charges, adjustments, payments, refunds and remaining balance.
  Payment reallocation corrects attribution; it is not a refund. Recording a transaction is
  distinct from matching its settlement.
- **Reports name their date basis and population.** Booking value, gross receipts, refunds,
  net receipts and outstanding balances are different measures. Do not label receipts profit.
  Channel and discovery source are separate dimensions; never add their shares together.
- **Reminders share history:** Reception, Accountant and automations can see the last contact
  and next planned reminder, avoiding duplicate requests to the same guest.
- **AI inherits the user's scope:** it may summarize allowed records and suggest allowed
  actions, but cannot reveal excluded data through chat history or broad questions. Sales may
  ask about room availability; that is different from private cleaning/repair details. Any
  consequential AI action follows the same confirmation/approval workflow as the normal UI.
- **One consistent demo hotel:** pages use the same demo date, bookings, room states, identities
  and balances. Dates and durations must remain plausible when switching roles.

### Scope discipline

Add housekeeping supervision as a capability first. Reservations agent, revenue manager,
night auditor and external contractor presets are later options when customer workflows
justify them. Do not add restaurant/spa operations or a full accounting ERP by default.
The static prototype should demonstrate the core journeys above without requiring integrations.

## Page access matrix — recorded implementation baseline

Source: `ROLE_PAGES` in `src/app/shared/role.ts`. ✅ = page is reachable for that role.
`—` = route is blocked by `roleGuard`; navigating there redirects to that role's home
(`ROLE_HOME`) with `?denied=<page>`, and the shell shows a notice explaining the limitation with
a link to the home page. Unknown routes (`**`) send a signed-in user to their home with
`?missing=<path>` instead of the public landing; signed-out visitors still go to the landing.

| Page (route)     | owner | manager | reception | housekeeping | sales | accountant | maintenance |
| ----------------- | :---: | :-----: | :-------: | :----------: | :---: | :--------: | :---------: |
| `dashboard`        |  ✅   |   ✅    |    ✅     |      —       |   —   |     —      |      —      |
| `calendar`         |  ✅   |   ✅    |    ✅     |      —       |  ✅   |     —      |      —      |
| `submissions`      |  ✅   |   ✅    |    ✅     |      —       |  ✅   |     —      |      —      |
| `guests`           |  ✅   |   ✅    |    ✅     |      —       |   —   |     —      |      —      |
| `rooms`            |  ✅   |   ✅    |    ✅     |      —       |   —   |     —      |     ✅      |
| `payments`         |  ✅   |   ✅    |    ✅     |      —       |   —   |    ✅      |      —      |
| `housekeeping`     |  ✅   |   ✅    |    —      |     ✅       |   —   |     —      |     ✅      |
| `messages`         |  ✅   |   ✅    |    ✅     |      —       |   —   |     —      |      —      |
| `automations`      |  ✅   |   ✅    |    —      |      —       |   —   |     —      |      —      |
| `sales`            |  ✅   |   ✅    |    —      |      —       |  ✅   |     —      |      —      |
| `ai`               |  ✅   |   ✅    |    ✅     |     ✅       |  ✅   |    ✅      |     ✅      |
| `team`             |  ✅   |   ✅    |    —      |      —       |   —   |     —      |      —      |
| `settings`         |  ✅   |   ✅    |    —      |      —       |   —   |     —      |      —      |

## Page inventory — recorded implementation baseline

For each page: purpose, its sections, and per-section access beyond the page-level gate above.
"Same as page" records the original page-level behavior, not blanket action authority.
Where this inventory conflicts with Intended rules, implementation must follow Intended rules.

### `dashboard` — Daily operations command center

One-sentence purpose: today's arrivals, occupancy, revenue, cleaning status, and quick actions
in one view.

| Section                                     | Extra access rule                          |
| -------------------------------------------- | -------------------------------------------- |
| KPI cards (arrivals, departures, occupancy, cleaning, outstanding payments) | Same as page |
| **Receipts KPI** | `financeReports` roles see hotel-wide "Надходження сьогодні"; `reception` sees "Зібрано за зміну" instead |
| Upcoming arrivals table                      | Same as page |
| "Needs attention" list                       | Same as page |
| Rooms summary + mini room list                | Same as page |
| New bookings list                             | Same as page |
| 7-day occupancy chart                         | Same as page |
| **Booking sources card**                      | **`salesAnalytics` only** — hidden for `reception` |
| AI insight panel                              | Same as page |
| Quick actions grid                            | Same as page |
| New-hotel empty-state / setup checklist        | Same as page (demo-only path) |

**Real hotels** see a live Dashboard built from the active hotel's rooms, bookings and website
requests (the demo keeps the seeded one above). Nothing is stored for it; every figure is computed
from those collections, so it follows the Calendar and Rooms exactly:

- **KPIs:** arrivals today (with how many already checked in), departures today (how many left),
  rooms occupied (a guest checked in) of all rooms, rooms needing cleaning (and being cleaned),
  amount outstanding (`guestBill` roles: sum of `total − paid` over non-cancelled bookings), and
  receipts today (`financeReports` roles: hotel-wide "Надходження сьогодні"; others: "Зібрано вами сьогодні", only what they recorded; from the payment journal), and new website requests.
- **Arrivals / departures tables:** "Відмітити заїзд" and "Відмітити виїзд" need `changeBooking`.
  Check-in is refused unless the room is ready (not dirty, being cleaned, blocked, or still
  occupied by another guest); check-out uses the Calendar's rules (early departure shortens the
  stay; the room goes to `needs-cleaning`).
- **Needs attention:** a guest past their check-out day, an arrival whose room is not ready, a
  guest who has not arrived after their arrival day, an arrival with a balance (`guestBill`),
  bookings still `pending`. All link to Calendar or Rooms.
- **Rooms card** (counts and the rooms waiting for cleaning, being cleaned or blocked), **new
  bookings** (latest 3 by creation time; amount for `guestBill` roles), **7-day occupancy**
  (share of rooms with a non-cancelled stay each night), **booking sources** (`salesAnalytics`
  only; bookings created this month, by `source`).
- Hidden for real hotels: the AI insight panel, "Додати гостя", messages, payments and
  housekeeping shortcuts, the new-hotel checklist and demo strip. "Нове бронювання" opens the
  desk booking form (`/new-booking`).

### `calendar` — Booking calendar / availability grid

Purpose: see room availability by date, manage bookings, move/extend stays, quick check-ins.

| Section                                      | Extra access rule |
| ---------------------------------------------- | -------------------- |
| Toolbar (date range, view length, search, filters) | Same as page |
| Legend + main grid (rooms × dates)              | Same as page |
| Hover preview card on booking blocks            | Same as page, **except** price/payment status only with `guestBill` |
| Mobile day/3-day cards                          | Same as page |
| Booking side panel: guest & stay info, source, notes, actions | Same as page |
| **Booking side panel: payment block ("Оплата") + "Додати оплату", unpaid badges** | **`guestBill` only** — hidden for `sales` |
| Quick-booking / conflict / move / message / payment / extend dialogs | Same as page |

**Booking data contract** (live; enforced by `firestore.rules`, written by `BookingsService` in
`src/app/feature/firebase/bookings.service.ts`). Only the hotel's owners (`ownerUids`) can read or
write; roles per hotel are not built yet.

- `hotels/{hotelId}/bookings/{id}`: `roomId` (rooms doc id; the grid follows the room if it is
  renumbered), `roomNumber` (display copy), `guestName` (1–200; the phone when no name was given),
  `checkIn`, `checkOut` (`YYYY-MM-DD`, `checkOut > checkIn`; the room is free for the next stay from
  the check-out day), `guests` (int 1–50, ≤ the room's capacity, checked in the client), `total`
  and `paid` (`0 ≤ paid ≤ total`), `status` (`pending | confirmed | checkedin | checkedout | cancelled`), optional
  `phone`, `email`, `source`, `notes` (≤1000), `submissionId`, `plannedCheckOut` (original check-out after an early departure), `guestId` (the guest profile, see Guest data contract), `lateCheckoutHour` (12–23),
  `createdAt`, `updatedAt` (server time on every write). Bookings are never deleted.
- Overlaps are prevented in the client (other active bookings and room blocks; a block's last day
  is inclusive). Rules cannot query, so two people booking the same room at the same moment can
  still double-book.
- Default total is nights × the room's price; the field is editable. Check-in is after 14:00 and
  check-out before 11:00 unless `lateCheckoutHour` is set.
- Who does what: everyone who opens Calendar can create a booking. Only `changeBooking`
  (owner, manager, reception) chooses the status, confirms, checks in, moves (drag), extends and
  cancels; Sales creates `pending` holds. Payment fields need `collectPayment` + `guestBill`.
  Cancelling asks for confirmation and keeps the record. "Відмітити заїзд" /
  "Відмітити виїзд" (`changeBooking`) move a booking to `checkedin` / `checkedout`; An early
  check-out shortens the stay: `checkOut` becomes today (at least the day after check-in), the
  room is free for sale from then, and the booked date is kept in `plannedCheckOut`. `total` and
  `paid` are not changed; settle any refund by hand until the Payments page is live.

### `submissions` — Website form submissions (free, Start plan)

Purpose: one inbox for forms sent from the hotel's websites (booking requests, call-backs,
questions, group requests). Sites are separate projects that post to the Hotel Upwork API.

| Section                                   | Extra access rule |
| --------------------------------------------- | -------------------- |
| KPI strip (new, in progress, converted, avg. first response) | Same as page |
| Status tabs, search, site filter, submissions table/cards | Same as page |
| Submission side panel: contact, dates, guests, room wish, message, source site/form, history | Same as page |
| Status actions: take into work, create booking, close, mark as spam | Same as page |
| **"Підключити сайт" dialog: API endpoint, API key, connected sites** | Endpoint/example: same as page. **API key and key rotation: `manageIntegrations` only** (owner, manager) |

"Create booking" (real hotels) opens `/calendar?submission=<id>`; the Calendar loads the request and
opens the new-booking form prefilled (guest, phone, email, dates, guests, message as notes, source
"Сайт", and a free room of the wished type that fits the guests). The submission is marked
`booked` ("Створено бронювання · номер N") only after the booking is saved, so leaving the form
leaves the request untouched. A booked request offers "Додати ще одне бронювання" for groups
that need several rooms. In the demo the button still marks the request booked and opens the
Calendar. Submissions contain no payment data.

**Submission data contract** (enforced by `firestore.rules`, written by `SubmissionsService` shape):

- Required from the visitor: `phone` only. Optional: `name`, `email`, `message`, `checkIn`,
  `checkOut` (`YYYY-MM-DD`), `guests` (1–300), `roomType`; for service requests `date`
  (`YYYY-MM-DD`), `time` (`HH:mm`), `service` (chosen option); for hostels `genders` (one
  `female`/`male` per guest). Any other field is rejected.
- Set by the site: `hotelId` (must be an existing `hotels/{id}`), `formId` (stable slug per form,
  e.g. `stay-request`; never renamed once live), `formName` (label shown in the CRM) and `site`
  (the site's public address from its `CNAME`, e.g. `https://kleopatra.webart.work/`, so local
  copies report the real site — a hotel may have several websites). The filter is by form (shown when 2+ forms have sent submissions). `hotelId` is
  never shown.
- A submission without a name is listed by its phone number.
- **"ID форми" column** links to the form: submission `site` + `#` + `formId`, with the site's
  host underneath. Convention: on the website, the section holding the form has `id` equal to its `formId`,
  so the link scrolls to the start of that section.
  Submissions without `site` show the ID as plain text.
- Live sites: `kleopatra.webart.work` → `kp-kleopatra`, form `stay-request`.

### `new-booking` — Desk booking form (real hotels)

Purpose: the daily "a guest calls or walks in" booking, as fast as possible. A route for real
hotels only: the demo still has its old seeded form (not reachable by any role today). It is in the
sidebar next to Calendar and is the primary "Нове бронювання" button on Dashboard and Calendar.

| Section | Extra access rule |
| --- | --- |
| 1. Dates and guests: check-in, nights (stepper and 1/2/3/5/7 chips), check-out, guests | Same as page |
| 2. Rooms: only rooms free for the whole stay, big enough and not blocked, cheapest first, the first one preselected; type filter | Same as page |
| 3. Guest: phone (focused on open), name, source chips, optional email and notes; a returning guest (phone found in earlier bookings) can be filled in with one click | Same as page |
| **Payment now (none / 50% / full)** | **`collectPayment` + `guestBill`** — others book with nothing paid |
| Summary: dates, room, editable total (nights × price by default), create button | Same as page |

- Enter in any field creates the booking; after saving, "Нове бронювання" returns a clean form that
  keeps the dates and source so several guests can be booked in a row; "Відкрити календар" shows it.
- Writes the same `hotels/{hotelId}/bookings` document as the Calendar (see Booking data contract),
  with status `confirmed` for roles with `changeBooking` and `pending` (a hold) for the others.
  Availability uses the same rule as the Calendar, plus a re-check at save time.
- Prefill through the URL: `/new-booking?room=101&start=2026-10-05&end=2026-10-07&guests=2`.
  Rooms' "+ Нове бронювання" uses `?room=`.
- Not covered yet: split stays across rooms, extras/services, taxes, a guest database (a returning
  guest is matched from past bookings only).

### `guests` — Guest CRM

Purpose: list/search/segment all guests, view profiles, message/tag/manage individually or in bulk.

| Section                                | Extra access rule |
| ----------------------------------------- | -------------------- |
| KPI strip (total, new, repeat, returned) | Same as page |
| "Ask AI about guests" strip              | Same as page |
| Segment tabs (All/Staying/Upcoming/Regular/New/Away) | Same as page |
| Search/sort/filter toolbar                | Same as page |
| Bulk action bar (tag/message)             | Same as page |
| **Header export, bulk export, row "merge duplicates" and "delete"** | **`guestBulk` only** (owner, manager) — hidden and handler-guarded for `reception` |
| Guest table/cards + row menu (profile, booking, message, note) | Same as page |
| Guest preview/add/edit/message/note/delete/bulk dialogs | Same as page |

**Real hotels** see a live Guests page (the demo keeps the seeded list above). Guests are the people
who stay; companies and agencies that pay for others are a later, separate concept.

**Guest data contract** (live; enforced by `firestore.rules`, written by `GuestsService` in
`src/app/feature/firebase/guests.service.ts`). Only the hotel's owners (`ownerUids`) can read or write.

- `hotels/{hotelId}/guests/{id}`: `name` (1–200), `phone` (≤40), `email`, `notes` (≤2000), `tags[]` (≤20;
  presets VIP, Постійний гість, Бізнес, Сім’я), `phoneKey` (last 9 digits of the phone, `""` when there
  are fewer than 7), `nameKey` (lower-cased name), `createdAt`, `updatedAt`.
- A booking keeps its own copy of the guest's name, phone and email and points to the profile with
  `guestId`. Merging or deleting a guest therefore never changes booking history.
- **A booking links to a guest when it is created** (Calendar form and New booking page): the guest
  with the same `phoneKey` is used, or — with no phone — the one with the same name and no phone;
  otherwise a profile is created. Existing guests are not edited by a booking. If the lookup fails the
  booking is still saved, unlinked.
- **Stats come from linked bookings, nothing is stored:** stays = bookings checked in or out; nights of
  those; "Оплачено" = `paid` on non-cancelled bookings (`guestBill` roles only); last visit; next booking
  (pending or confirmed, not yet departed); "У готелі" = a booking checked in.
- Segments: Усі, Зараз у готелі, Мають бронювання, Постійні (2+ stays), Нові (0 stays), Давно не були
  (2+ stays, last visit over 180 days ago, no next booking).
- **"Створити профілі з бронювань"** (banner, any role on the page) creates guests for bookings with
  no guest (older ones, or whose guest was deleted), grouped by phone or, without one, name, and links
  them. It can be run again safely.

| Section | Extra access rule |
| --- | --- |
| KPI strip (guests, new this month, repeat, in the hotel), segments, search, sort | Same as page |
| Guest table/cards and profile panel: contacts, tags, notes, stats, booking history, "Нове бронювання", edit | Same as page; **money (Оплачено, booking totals): `guestBill` only** |
| **Add guest, edit** | Same as page (routine front-desk edits); a phone or name already used is refused |
| **Export CSV, merge duplicates, delete** | **`guestBulk` only** (owner, manager) |

Not in the real page yet: bulk tags, messages, "Ask AI about guests", filters by tag or stay count, guest
preferences, archiving.

### `rooms` — Room inventory & pricing

Purpose: manage room types, pricing, live status, and per-room configuration.

| Section                                   | Extra access rule |
| --------------------------------------------- | -------------------- |
| KPI strip (total/occupied/free/needs cleaning/unavailable) | Same as page |
| "Ask AI about rooms" strip                  | Same as page |
| Segment chips, view toggle, search/filters   | Same as page |
| Room cards/list: type, floor, capacity, amenities, cleaning/maintenance status | Same as page |
| **Room cards/list: price line, current guest name, quick-book/open-booking actions** | **Hidden for `maintenance`** (`showGuestAndFinance = role !== 'maintenance'`) |
| **Room detail panel: pricing, current stay/next booking, "+ New booking"** | **Hidden for `maintenance`** |
| **Header "Типи номерів" / "+ Додати номер", panel "Редагувати"** | **`editInventory` only** (owner, manager) |
| **"Заблокувати номер" / "Редагувати блокування" / "Зняти блокування"** | **`blockRoom` only**; other roles get "Повідомити про проблему та запросити блокування" with a visible pending state |
| **Edit dialog "Видалити номер"** | **`editInventory` only** (inside the edit dialog) |
| Change status dialog | Same as page; choosing "Недоступний" opens the block dialog (dates + reason are required) |

**Room data contract** (live; enforced by `firestore.rules`, written by `RoomsService` in
`src/app/feature/firebase/rooms.service.ts`). Only the hotel's owners (`ownerUids`) can read or
write; roles per hotel are not built yet.

- `hotels/{hotelId}/roomTypes/{id}`: `name` (≤50, unique per hotel, checked in the client),
  `capacity` (int 1–50), `price` (≥0), optional `description`, `beds`, `area`, `amenities[]`.
  A type gives new rooms their defaults; changing a room's type copies the type's beds and
  amenities.
- `hotels/{hotelId}/rooms/{id}`: `number` (≤8, unique per hotel, checked in the client),
  `type` (type name), `floor` (int), `capacity` (int 1–50), `price` (≥0), `status`
  (`ready | occupied | needs-cleaning | cleaning | unavailable`), optional `beds`, `area`,
  `amenities[]`, `block` (`{reason, start, end, note}` with ISO dates, end ≥ start; set only
  while `unavailable`), `lastCleanedAt` (set when cleaning finishes or status goes back to
  ready), `createdAt`, `updatedAt` (server time on every write).
- **Occupancy comes from bookings (real hotels).** A room shows "occupied" while a booking in it
  is `checkedin` (even past its planned check-out, until "Відмітити виїзд" in the Calendar);
  a block (`unavailable`) always wins; a leftover stored `occupied` without a stay shows as
  ready. "Зайнятий" cannot be picked by hand, and any other status change on an occupied room is
  refused. Checking a guest out sets the room to `needs-cleaning` (unless it is blocked).
  The demo still sets `occupied` by hand.
- **A room with active bookings cannot be deleted** (pending/confirmed with a check-out after
  today, or a guest in the house); the error asks to cancel or move them in the Calendar. Past
  and cancelled bookings stay in Firestore but no longer show in the Calendar.
- A room's type is always picked from the hotel's room types (a select). Types are created in
  "Типи номерів", or from the room form's "+ Новий тип" link, which opens the type form and then
  returns to the room form with the new type selected (number and floor already typed are kept).
  With no types yet, the room form asks to create one first and cannot be submitted.
- "Типи номерів" and "+ Додати номер" stay disabled while the inventory loads or fails to load.

### `payments` — Payments & financial tracking

Purpose: track payments received, outstanding balances, refunds, and reminders.

| Section                                   | Extra access rule |
| --------------------------------------------- | -------------------- |
| KPI strip: received today, outstanding        | Same as page |
| **KPI strip: deposits, refunds; AI prompts about deposits/refunds** | **`financeReports` only** — hidden for `reception` |
| "Ask AI about payments" strip (other prompts) | Same as page |
| Outstanding balances cards (add payment, send reminder) | Same as page |
| **Monthly chart + daily-method breakdown**    | **`financeReports` only** — hidden for `reception` |
| **Export button**                             | **`financeReports` only** — hidden for `reception` |
| Status tabs + search/filter toolbar           | Same as page |
| Payments table/cards                          | Same as page |
| "Upcoming" (today/tomorrow/7-day) card         | Same as page |
| Payment side panel: amount/guest/booking/method/note | Same as page |
| **Payment side panel: refund / reassign** (status `success`) | **`refundPayment` only** (owner, manager, accountant). `reception` gets "Запросити погодження" buttons that show a pending state instead |
| Add payment / refund / reassign / note / reminder dialogs | Same as page |

**Real hotels** see a live Payments page (the demo keeps the seeded one above): the payment journal and the
bookings that still owe money. This first version records money and shows it; **refunds, reassigning a payment
to another booking, approval requests, reminders and the monthly chart are not built yet.**

**Payment data contract** (live; enforced by `firestore.rules`, written by `PaymentsService` in
`src/app/feature/firebase/payments.service.ts`). Only the hotel's owners (`ownerUids`) can read or write.

- `hotels/{hotelId}/payments/{id}`: `bookingId`, `guestName` and `roomNumber` (copies, so an entry reads on its
  own), `amount` (> 0), `type` (only `payment` for now), `method` (`cash | card | transfer | online | other`),
  `occurredOn` (`YYYY-MM-DD`, the day the money was received; today or earlier), optional `note` (≤300),
  `recordedBy` (name or email) and `recordedByUid`, `createdAt` (server time).
- **Entries are never edited or deleted.** A mistake will be corrected with another entry (refunds, later).
- **A booking's `paid` is the running total of its entries.** Recording a payment writes the entry and adds the
  amount to the booking with `increment()` in one batch; money taken when a booking is created (Calendar form,
  New booking page, with a method) is written in the same batch as the booking. The amount cannot exceed the
  booking balance. Rules do not cross-check the two writes yet (gap 29).
- Methods are the same everywhere (Готівка, Картка, Банківський переказ, Онлайн, Інше).
- **Older money:** bookings made before the journal can show `paid` with no entries. A banner (roles with
  `collectPayment`) offers "Додати до журналу", which writes one `other` entry per booking for the difference,
  dated the day the booking was created, without changing `paid`.

| Section | Extra access rule |
| --- | --- |
| KPI strip: received today, outstanding, received this month | Same as page, but **`financeReports` roles see hotel-wide figures; other roles see only the entries they recorded** |
| **Today by method; Export CSV** | **`financeReports` only** |
| "Очікують оплати": bookings with a balance (not cancelled), soonest arrival first | Same as page (every role here holds `guestBill`) |
| Payment journal: period (today / 7 days / month / all), method, search | Same as page, scoped as above |
| **Add payment** (from the header or a row) | **`collectPayment`** (owner, manager, reception, accountant) |
| Refund, reassign, approval requests | Not built (see above) |

### `housekeeping` — Cleaning operations

Purpose: coordinate which rooms need cleaning, assignment, priority, and task completion.

| Section                                   | Extra access rule |
| --------------------------------------------- | -------------------- |
| KPI strip (needs cleaning/cleaning/ready/occupied) | Same as page |
| "Ask AI about housekeeping" strip             | Same as page |
| Alerts strip (not-ready-soon, unassigned urgent, long-running, distribute) | Same as page |
| Toolbar (today/tomorrow/all tabs, board/list, sort, filters) | Same as page |
| Board / list of rooms-as-tasks                | Same as page |
| "Team today" stats cards                      | Same as page |
| Room detail side panel (notes, start/complete/report issue/checklist/history) | Same as page |
| Add task / report issue / complete dialogs     | Same as page |
| **Assign / distribute buttons and dialogs**    | **`assignCleaning` only** (owner, manager). Supervisor capability exists in Team but is not yet wired to the session |
| **"Позначити недоступним" (block room) follow-up dialog** | **`blockRoom` only**; other roles see "Запросити блокування" |
| **"Команда" link in header**                   | Shown only if current role can also open `/team` (`isPageAllowed(role, 'team')`) |

### `messages` — Guest messaging inbox

Purpose: unified inbox for guest conversations across channels, templates, AI-assisted replies.

| Section                                   | Extra access rule |
| --------------------------------------------- | -------------------- |
| Conversation list (search/filter/sort)        | Same as page |
| Active conversation thread                    | Same as page |
| Composer (channel, templates, attach, AI suggestions) | Same as page |
| Context side panel (guest info, booking info, incl. payment balance) | Same as page — intended: every role that opens Messages holds `guestBill` |
| Templates library + creation dialog            | Same as page |
| New message / conversation menu / edit-scheduled dialogs | Same as page |

### `automations` — Automated guest communication rules

Purpose: configure/monitor rules that auto-message guests on booking events.

| Section                                   | Extra access rule |
| --------------------------------------------- | -------------------- |
| KPI strip (active/executed/scheduled/failures) | Same as page |
| Tabs: Active / Disabled / Templates / History  | Same as page |
| Automation cards, templates gallery, history log, upcoming runs | Same as page |
| Automation detail side panel                   | Same as page |
| "Create via AI" + step-by-step wizard dialogs  | Same as page |

Currently reachable only by `owner`/`manager`. Editing rules, enabling message sending and
reviewing history may have different action permissions without changing page access.

### `sales` — Marketing / channel analytics

Purpose: where bookings/revenue come from, direct vs. OTA, campaigns, repeat-guest sourcing.

| Section                                   | Extra access rule |
| --------------------------------------------- | -------------------- |
| Header controls, discovery-source banner       | Same as page |
| **KPI "Отримано оплат" (gross receipts)**      | **`financeReports` only**; `sales` sees "Вартість бронювань" (booking value) instead |
| KPI strip (bookings, avg ticket, direct share)  | Same as page |
| Top sources, AI quick-questions card           | Same as page |
| Channel/discovery bar charts, revenue-by-channel | Same as page |
| Full sources table + manage/add source          | Same as page |
| Direct vs OTA breakdown, trend charts           | Same as page |
| "Cost of bookings" card: gross/adjusted booking value | Same as page |
| **"Cost of bookings" card: received, outstanding, refunds explanation** | **`financeReports` only** — `sales` sees an aggregate-value note instead |
| New vs repeat guests, campaigns cards           | Same as page |
| Source detail side panel, manage/add source dialogs | Same as page |

### `ai` — AI assistant

Purpose: conversational assistant answering questions about live operational/guest/financial
data, with links to relevant pages. This is the only page every role can open.

| Section                                   | Extra access rule |
| --------------------------------------------- | -------------------- |
| Chat history sidebar (seeded conversations)   | Filtered by the role's scope — a conversation is hidden if its text touches an excluded topic |
| Morning-brief card                            | Only roles holding both `guestBill` and operational detail (owner, manager, reception) |
| Welcome suggestions + insights row             | Filtered by scope; an insight also needs its linked page to be allowed |
| Composer                                       | Same as page |
| **Chat answers**                               | Refused per topic (see below); generated answers are re-checked against scope before display |

AI scope topics (`TOPIC_PATTERNS` / `topicAllowed` in `ai.component.ts`):

| Topic | Allowed roles |
| --- | --- |
| Guest bills, balances, deposits, refunds, reminders | `guestBill` holders (owner, manager, reception, accountant) |
| Hotel-wide revenue/receipts | `financeReports` or `salesAnalytics` holders (owner, manager, accountant, sales) |
| Cleaning/repair/complaint detail | everyone except `sales` and `accountant`; room availability is a separate question and stays open to `sales` |
| Prices | everyone except `housekeeping` and `maintenance` |

Detection is keyword-based over Ukrainian text; it is a demo approximation, not a data-level filter.

### `team` — Staff directory & access management

Purpose: staff directory; invite/manage employees, assign roles, control per-employee
permissions/notifications. **Manages other employees' roles — distinct from the viewer's own
role above.** Uses the shared 7-role model; demo staff include one named person per role.

| Section                                   | Extra access rule |
| --------------------------------------------- | -------------------- |
| KPI strip, search/filters (incl. sales/accountant/maintenance segments), staff table/cards | Same as page |
| Employee profile side panel (contacts, stats, notifications, activity log, security) | Same as page |
| **Edit / change role / deactivate / reactivate / permission toggles** | Owner: any employee. Manager: operational staff only — not Owners or other Managers ("Керувати цим працівником може лише Власник") |
| **Deactivate and change role**                 | Disabled when target employee `isLastOwner`; also enforced in the handlers |
| Add employee / change role options             | Owner: every role except Owner. Manager: reception, housekeeping, sales, accountant, maintenance (cannot grant Manager) |
| Per-role permission toggles                    | manager: refund/team/settings; reception: cancel bookings; housekeeping: supervisor; sales: change bookings outside own enquiries; accountant: refund/reassign |
| Role-access matrix dialog                      | Read-only, generated from `ROLE_PAGES` for all 7 roles |

Team permission toggles are recorded per employee but are **not yet connected to the logged-in
session** (the session only knows a role preset). See Implementation gaps.

### `settings` — Hotel configuration

Purpose: property info, booking/payment/cancellation rules, direct-booking page, messaging/
automation defaults, notifications, AI configuration, account/security/danger-zone.

13 tabs: General, Contacts & location, Check-in/out, Booking rules, Payments, Policies, Booking
Page, Messages, Automations (link out), Notifications, Booking sources, AI (+ knowledge-base
upload), Security (numbering, legal/company data, data export, change history, danger zone).

| Access rule                                     | Applies to |
| -------------------------------------------------- | ------------ |
| Session role                                    | `getStoredRole()`; the in-page demo role selector was removed |
| **Owner-only sections** (locked/read-only banner for everyone else) | Payments, Policies (`rules`), AI, Security — `OWNER_ONLY = ['payments','rules','ai','security']` |
| **Editors**                                      | `owner`, `manager` (`EDITOR_ROLES`); any other role would see every section read-only |
| Danger zone (deactivate Booking Page / deactivate hotel) | Nested inside Security tab → owner-only by inheritance |

## Implementation gaps — verify before marking resolved

### Resolved and verified on 23 September 2026

Verified with a clean `ng build` and in the running app by switching roles:

- `settings` locking now uses the session role; demo selector removed.
- `team` and `settings` use the shared 7-role model; Team matrix is generated from `ROLE_PAGES`.
- Housekeeping block-room follow-up is enforced (`blockRoom`); others can request a block.
- `sales` no longer sees gross receipts, outstanding balances or refund reconciliation.
- `guests` export, merge and delete require `guestBulk` (owner, manager).
- Login and denied-route fallback share `ROLE_HOME` (Sales now lands on Sales, not Calendar);
  denied routes show a notice with an allowed next step; unknown routes no longer drop staff
  on the public landing.
- Reception sees shift receipts, not hotel-wide receipts, deposits or refunds; refund/reassign
  becomes "Request approval" with a visible pending state.
- Rooms pricing/inventory edits and room blocks require `editInventory` / `blockRoom`.
- AI history, suggestions, insights, morning brief and answers follow the role's scope.

### Still open

1. **Section-level gates are computed once at component construction**, not reactively. Harmless
   today because role changes always go through login navigation, but would break if a role
   could change in place.
2. **Approval requests are local UI state only**: no decision-maker, reason, approve/reject
   step or shared queue yet. Same for room-block requests and their acknowledgement.
3. **Team permission toggles are not connected to the session.** The session knows a role
   preset, not a named employee; the housekeeping-supervisor capability therefore cannot yet
   let a supervisor assign cleaning.
4. **Named-person "My tasks"** is not implemented: housekeeping and maintenance still see the
   whole board rather than tasks assigned to a specific demo employee.
5. **Workflows from "Daily workflows the prototype must demonstrate" are not built**: repair
   queue statuses, sales enquiry → quote/hold → follow-up → conversion, accounting
   reconciliation/matching, shift handover, owner approve/delegate.
6. **Room state is not yet split** into occupancy / cleaning readiness / technical availability,
   and inspection mode is not configurable.
7. **Maintenance home** is Rooms; a dedicated repair queue inside Rooms/Housekeeping is still
   to be designed.
8. **Unrouted detail links** (`/booking/`, `/guest/`, `/new-booking/`, `/book/`, `/search/`,
   `/notifications/`, `/profile/`) are plain `href`s; they now land on the role's home with a
   "not available in demo" notice rather than a contextual panel.
9. **Shared demo data consistency** (same bookings, balances and room states on every page)
   has not been verified.
10. **AI scope detection is keyword-based**; it can over- or under-block unusual phrasing.

Found while rewriting the Gemini Gem knowledge on 23 September 2026 (code read, not yet fixed):

11. **Calendar: `sales` could move and cancel any booking** — fixed 2 October 2026: move, confirm,
    check in, extend and cancel need `changeBooking`; Sales creates `pending` holds only; cancel
    asks for confirmation. Not yet verified in the running app.
12. **Rooms: "Призначити прибирання" is not gated** (any role that opens Rooms can use it,
    and it always assigns the same demo person). Intended: `assignCleaning` only.
13. **Housekeeping: "+ Додати задачу" lets any role pick an assignee.** Intended: assigning is
    `assignCleaning` only; others create an unassigned task.
14. **Housekeeping: occupied room cards show guest names** to `housekeeping` and
    `maintenance`. Intended: no guest identity for cleaning/repair roles.
15. **Sales: "Експорт" is shown to the `sales` role**, and "Середній чек" is computed from
    received payments. Decide whether a sales-scoped export and a booking-value average are
    intended; hotel-wide financial exports are finance-roles only.
16. **Payments: method names are inconsistent** (the live Payments page, Calendar and New booking now share one list; the demo still has the old names) between the add-payment form ("Карта",
    "Онлайн") and filters ("Картка на місці", "Оплата онлайн").
17. **Calendar mobile cards showed payment status to `sales`** — fixed 2 October 2026 (gated by
    `showFinance`). Not yet verified in the running app.

Added with plans on 29 September 2026 (not yet verified in the running app):

18. **Plan limits apply to demo data only** (since 2 October 2026): Rooms, Calendar, New booking
    and Team trim their local seed lists. Housekeeping keeps its own 28-room list; it is
    Pro+ only, where 28 rooms fit under the cap.
19. **Settings tabs for plan-locked features** (Messages, Automations, AI) stay editable on
    lower plans; they should show the plan requirement.
20. **Links inside pages to plan-locked pages** (e.g. Calendar side panel → Guests/Payments) rely
    on the route redirect with `?locked=`; they are not tagged in place.
21. **"Підключити сайт" dialog is demo**: the endpoint, API key and connected-sites list are
    placeholders; real sites write to Firestore directly (see Submission data contract).

Added with live Calendar bookings on 2 October 2026 (not yet verified in the running app):

22. **Deleting a room with bookings** — fixed 4 October 2026 (active bookings block the delete).
    Not yet verified in the running app.
23. **Rooms `status` was set by hand** — fixed 4 October 2026 for real hotels: occupancy, current
    guest and next arrival come from bookings; Calendar has check-in/check-out. Early check-out
    frees the remaining nights (see Booking data contract). Not yet verified in the running app.
24. **The Calendar loads every booking of the hotel** (no date window), and double-booking by two
    people at the same moment is not prevented (see Booking data contract).
25. **Booking edits are limited**: dates and room change only by dragging; there is no edit form
    for guest details, and `paid` is a plain amount (no payments ledger, refunds or reminders).
26. **Group requests**: a booking holds one room and at most that room's capacity, so a request
    for many guests needs several bookings ("Додати ще одне бронювання" on the request).
27. **Dashboard figures are unverified**: the live Dashboard (4 October 2026) has not been checked in
    the running app against real data. It loads all rooms, bookings and requests of the hotel, like
    the Calendar (gap 24); "Потребує уваги" has no "my tasks" or approval items.
28. **Guests (4 October 2026) are unverified in the running app.** Open points: two people booking
    the same new guest at once can create two profiles (merge fixes it); a phone shared by several
    people (a company line) collapses them into one guest; deleting a guest leaves its bookings unlinked
    until "Створити профілі з бронювань" is run again (which recreates the guest); Guests reads all
    bookings of the hotel, like the Calendar (gap 24).
29. **Payments (4 October 2026) are unverified in the running app.** Open points: rules check each entry but not
    that it matches the booking's `paid` (both are written in one batch by the client); the Calendar booking
    panel does not list a booking's payments; no refunds or corrections yet; a role without hotel-wide finance
    sees only its own entries, so a colleague's payment on the same booking is not visible to it; "Зібрано вами"
    counts by day, not by shift (shifts are not modelled).

## Where implementation lives (for implementers)

- Plans, prices, plan page allowlist: `src/app/shared/plan.ts`
- Roles, labels, page allowlist: `src/app/shared/role.ts`
- Modals: `ModalService` from `@wawjs/ngx-ui` with `panelClass: 'crm-modal'` (CRM palette and
  form/button styles in `src/styles/_crm-modal.scss`). Rooms uses it (`src/app/pages/rooms/dialogs/`);
  other pages still have their own `<dialog>` and move over when they go live.
- Live data services: `src/app/feature/firebase/` (`submissions.service.ts`, `rooms.service.ts`, `bookings.service.ts`);
  access and field validation in `firestore.rules`
- Account hotels and active hotel: `src/app/feature/firebase/hotel.service.ts`,
  switcher in `src/app/layouts/app-shell/`
- Route guard: `src/app/shared/role.guard.ts`
- Route declarations: `src/app/app.routes.ts`
- Server-rendering mode per route (protected pages are client-only, not prerendered):
  `src/app/app.routes.server.ts`
- Each page's own gating flags/checks live inside that page's component
  (`src/app/pages/<name>/<name>.component.ts`), typically as a boolean computed once from
  `getStoredRole()`.
