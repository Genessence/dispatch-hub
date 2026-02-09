## Minutes of Meeting (MoM) — Dispatch Hub Feature List (Flow-wise)

### Meeting details
- **Date**: \<DD-MMM-YYYY\>
- **Client**: \<Client Name\>
- **Project**: Dispatch Hub (Manufacturing Dispatch)
- **Version**: 1.0
- **Prepared by**: \<Name\>

### Attendees
- **Client team**: \<Names\>
- **Dispatch Hub team**: \<Names\>

### Agenda
- **Walkthrough**: Current feature set and process flows (end-to-end)
- **Confirmations**: Business rules, validations, and exception handling
- **Reporting**: Available reports/logs and export options
- **Next steps**: Client actions + enhancements/backlog (if any)

---

## Executive summary (what the system covers)
- **Invoice-first workflow**: Invoices are the primary source of truth; schedule is **optional** and used as supporting metadata (delivery time / unloading location fallback).
- **Two scanning stages**:
  - **Doc Audit (Dock Audit)**: Customer label + Autoliv label validation in strict order, with staged scanning and resume support.
  - **Loading & Dispatch**: Customer label only, with de-duplication, over-scan prevention, and gatepass generation.
- **Exception control**: On mismatch/over-scan conditions, the invoice can be **blocked** and an **Exception Alert** is raised for Admin review.
- **Gatepass**: Generated per vehicle dispatch, includes QR payload (offline-friendly when possible) + server-truth verification.
- **Multi-device sync**: Real-time updates via Socket.IO; users see changes across devices without manual coordination.

---

## Feature flows (report points in MoM format)

### 1) Authentication, roles, and session
- **Actors**: Operator, Admin
- **Flow**:
  - User logs in using username/password.
  - System issues a JWT token and stores session client-side for subsequent API calls.
  - System loads user profile including **role** (`user`/`admin`), saved selections, and scanner preferences.
- **Role enforcement**:
  - Operator: operational modules (Upload, Doc Audit, Dispatch, Gatepass Verification, Logs).
  - Admin: all operator modules + Analytics/Reports + Exceptions + Master Data endpoints.
- **Outputs**:
  - Valid session + real-time socket connection initialized for multi-device refresh.

### 2) Customer & facility selection (precondition for operations)
- **Actors**: Operator, Admin
- **Flow**:
  - User selects **Facility** (e.g., Cheyyar / Pune / Bengaluru / Mysuru / Badli).
  - User selects **Customer** (MSIL customers).
  - System saves selection locally (and can also save to backend profile).
- **Validation**:
  - If customer/facility not selected, system blocks access to operational screens and redirects to selection.
- **Outputs**:
  - Context used for filtering/UX in dashboard and operational modules.

### 3) Upload data (Invoices required; Schedule optional)
- **Actors**: Operator, Admin
- **Preconditions**:
  - Logged in
  - Customer selected (customer code derived from selection)
- **Flow (UI)**:
  - User uploads **Invoices Excel** (required).
  - User uploads **Schedule Excel** (optional).
  - System performs client-side validation preview (valid/warning/error).
  - On “Import”, system uploads schedule (if provided) and invoices.
  - System refreshes shared data across devices.
- **Key invoice validations/enforcements (server-side)**:
  - Required columns: Invoice Number, Bill To, Invoice Date, Customer Name, Customer Item, Item Number, Quantity Invoiced.
  - Prevent re-upload once an invoice is already **audited** or **dispatched** (locks invoice lifecycle).
  - Optional enforcement: uploaded invoice must match selected customer code (Bill To).
  - Multi-sheet invoices supported (items merged across sheets).
- **Schedule behavior**:
  - Schedule rows where **Quantity == Quantity Dispatched** are filtered out (treated as already dispatched).
  - Schedule is primarily used as supporting metadata/fallback, not dispatch readiness gating.
- **Outputs**:
  - Invoices + items stored in DB
  - Upload logs recorded
  - Real-time event broadcast: `invoices:updated`, `schedule:updated`

### 4) Doc Audit (Dock Audit) — staged scan, strict ordering, mismatch blocking
- **Actors**: Operator (scanner), Admin (exception resolution)
- **Purpose**: Validate that Customer label and Autoliv label correspond to the correct invoice line items and quantities.
- **Preconditions**:
  - Invoices uploaded
  - Operator selects invoices for audit (system prevents scanning when selected invoice is blocked)
- **Flow (Happy path)**:
  - Operator selects invoice(s) for Doc Audit.
  - Operator selects Delivery Date / Delivery Time / Unloading Location options (derived from invoice fields, and schedule as fallback).
  - **Step 1 — Customer scan**:
    - Operator scans **Customer label**.
    - System enforces that the Customer label contains a valid **invoice number** and that this invoice is selected.
    - System matches Customer part number → `invoice_items.customer_item`.
    - System records a **staged scan** (`stage=customer`) and increments customer-stage counters.
  - **Step 2 — Autoliv (INBD) scan**:
    - Operator scans **Autoliv label** (must be next).
    - System validates quantity consistency between labels.
    - System pairs with the latest pending customer-stage scan and updates inbound counters.
  - **Auto-compute progress**:
    - System recomputes audit completion based on per-item counters.
    - When all items complete, invoice becomes **audit_complete=true** and is eligible for dispatch.
- **Resume mode (important)**:
  - If Customer scan was staged and app/device refreshes, the operator can **resume from Autoliv stage** using server-truth pending customer-stage scans (safe only when unambiguous).
- **Validations / blocks / exceptions**:
  - **Wrong scan order** (Autoliv scanned first): system rejects and prompts correct order.
  - **Customer QR mismatch** (part not found in invoice): system blocks invoice + raises exception alert.
  - **Duplicate bin scans**:
    - Duplicate scans are rejected with warnings (do not necessarily require admin).
  - **Over-scan** (scanned qty exceeds item qty):
    - System blocks invoice + raises exception alert for admin review.
- **Outputs**:
  - Validated scan records stored
  - Invoice audit progress updated + audit logs recorded
  - Real-time events: `audit:progress`, `audit:scan`, `audit:stage-scan`, `alert:new` (on mismatch)

### 5) Loading & Dispatch — bin loading, controls, and dispatch submission
- **Actors**: Operator (loading), Admin (if exception), Security Gate (verification downstream)
- **Purpose**: Ensure only the correct bins are loaded and counted, then dispatch with a vehicle gatepass.
- **Preconditions**:
  - Invoice(s) must be **audited**, **not dispatched**, and **not blocked**.
  - Vehicle number entered for gatepass generation.
- **Flow (Happy path)**:
  - Operator selects invoice(s) ready for dispatch.
  - Operator scans **Customer label only** for each bin loaded.
  - System matches scanned customer item → invoice line item(s) in selected invoices.
  - System records each loading scan with context `loading-dispatch` and stores bin number + bin quantity.
  - Operator continues scanning until expected bins are loaded.
  - Operator clicks “Generate Gatepass” to submit dispatch.
- **Validations / controls**:
  - **Customer label only**: Autoliv QR scans are rejected in dispatch loading.
  - **Duplicate prevention**:
    - Bin number duplicates are rejected (prevents double counting).
    - Customer barcode duplicates are rejected.
  - **Over-scan prevention (hard stop)**:
    - If loaded bins exceed expected bins for an item, system creates exception alert and **blocks invoice** for admin review.
  - **Deletion/correction**:
    - System supports deleting a wrongly scanned bin in `loading-dispatch` context (operational correction).
  - **Cross-device continuity**:
    - When invoices are selected, the system can hydrate the screen with existing loading scans from server-truth, enabling resume on another device.
- **Outputs**:
  - Loading scans stored in DB
  - Dispatch logs recorded
  - Real-time events: `dispatch:completed`, plus data refresh on `audit:scan` / `invoices:updated`

### 6) Gatepass generation — number, details, QR payload, print
- **Actors**: Operator
- **Flow**:
  - On dispatch submit, system validates invoice set and generates a gatepass number (format `GP-########`).
  - System enforces that all invoices in a vehicle share the **same customer code** (Bill To). If not, dispatch fails with a clear validation error and is logged.
  - System saves:
    - gatepass header (gatepass number, vehicle number, customer/customer code, invoice list)
    - dispatch timestamps and metadata
    - server-truth “loaded bins” details (with enrichment from doc-audit where available)
  - System produces a **QR payload** for gatepass:
    - Plain JSON when small enough
    - Compressed payload with prefix `DH1.` when large
    - Minimal fallback reference if still too large (ensures scan reliability)
  - Operator can print a gatepass including:
    - invoice list with delivery details (date/time/unloading loc) and status (on-time/late/unknown)
    - item totals and bin scan details (where available)
- **Outputs**:
  - Gatepass record in DB
  - QR text value to embed in QR code
  - Printable gatepass format for operations

### 7) Gatepass verification (Security checkpoint)
- **Actors**: Security Gate / Verifier
- **Flow**:
  - Verifier scans/pastes:
    - Gatepass QR value (payload), or
    - Gatepass number (manual entry)
  - System decodes QR:
    - If payload contains enough details, UI can show them immediately (offline-friendly).
    - If not, UI fetches full details from server using gatepass number.
  - System shows:
    - Gatepass number, vehicle number, customer code, dispatch time
    - Invoice list (unloading/delivery/status)
    - Loaded bin details (server-truth) when available
- **Validation outcome**:
  - Valid: gatepass verified, vehicle authorized to exit.
  - Invalid: gatepass not found / forged / corrupted QR → show security alert message.

### 8) Real-time multi-device updates (Socket.IO)
- **Actors**: All logged-in users
- **Behavior**:
  - System pushes events like `invoices:updated`, `schedule:updated`, `audit:progress`, `audit:scan`, `audit:stage-scan`, `dispatch:completed`, `alert:new`, `alert:resolved`.
  - Client auto-refreshes shared data on key events to keep screens consistent across devices.

### 9) Logs (auditable history)
- **Actors**: Operator, Admin
- **Types**:
  - Upload logs (invoice/schedule imports)
  - Audit logs (audit completion)
  - Dispatch logs (dispatch submissions and corrections like scan deletion)
- **Outputs**:
  - Download/inspection for operational tracking and audits.

### 10) Admin-only modules

### 10.1 Exception Alerts (mismatch handling + unblock workflow)
- **Actors**: Admin
- **Flow**:
  - Admin views exceptions list (pending/approved/rejected), filterable by invoice/status.
  - Admin approves or rejects an alert:
    - **Approve**: Unblocks invoice.
      - For specific customer-stage validation issues, system may clean up pending customer-stage scans and rollback counters to allow safe re-scan.
      - For Autoliv/INBD-stage issues, system preserves customer-stage scan to allow resume from the Autoliv step.
    - **Reject**: Keeps exception status updated (and invoice remains blocked unless separately handled).
- **Outputs**:
  - Alert resolution record + `alert:resolved` broadcast.

### 10.2 Analytics & Reports
- **Actors**: Admin
- **Capabilities**:
  - Overview analytics (totals: invoices, audited, dispatched, blocked; today metrics; top customers; dispatch by day).
  - Report list: filterable + paginated invoice reporting by status:
    - dispatched / audited / pending / mismatched
    - date range meaning depends on selected status (dispatch/audit/upload/mismatch-created timestamps).
  - Export: UI provides a dispatch report export derived from dispatch logs.

### 10.3 Master Data
- **Actors**: Admin
- **Capabilities (Backend)**:
  - Master data overview endpoint includes customers summary, schedule summary, and users list.
- **Note (Current UI behavior)**:
  - The Master Data screen currently demonstrates upload/edit UX with sample in-memory data; align with backend persistence requirements as needed.

### 11) Scanner preferences (Wired scanner vs Mobile camera)
- **Actors**: Operator, Admin
- **Purpose**: Improve scanning reliability across devices and scanner models.
- **Capabilities**:
  - Configure default mode: **Wired Scanner** or **Camera** (camera intended for mobile usage).
  - Configure scanner suffix: Enter / Tab / None.
  - Configure auto-timeout for scanners without suffix.
  - Configure duplicate-scan threshold to prevent double reads.
- **Outputs**:
  - Preferences are saved per user and applied when scanner dialogs open.

---

## Decisions / confirmations (agreed system rules)
- **Invoice-first**: Schedule does not gate dispatch readiness; invoices drive audit and dispatch.
- **Doc Audit scan order**: Customer label must be scanned before Autoliv label; resume mode supports completing the second stage after refresh.
- **Blocking**: Mismatch/over-scan conditions can block invoices and require admin review.
- **Dispatch loading rule**: Loading uses customer label only and enforces de-duplication by bin number.
- **Vehicle constraint**: All invoices in the same dispatch vehicle must share the same **customer code (Bill To)**.
- **Gate verification**: Gatepass verification can be done using QR payload and/or server lookup.

---

## Action items (client/process)
- **Client process**:
  - Define who acts as **Admin** and the daily cadence for reviewing **pending Exception Alerts**.
  - Define SOP for **barcode correction** when exceptions occur (what changes on label, re-scan procedure).
  - Confirm gate security workflow: whether verification is always online (server lookup) or needs offline tolerance.
- **Operational readiness**:
  - Confirm invoice Excel templates and column naming conventions with client (to avoid upload failures).
  - Confirm customer label QR includes invoice number as per required nomenclature.

## Action items (product/implementation follow-ups, if required)
- **Master Data**: Confirm if Master Data should be persisted and enforce validations via backend (current UI includes sample data patterns).
- **Reports**: Confirm final report formats required by client (fields, date filters, export templates).
- **Role hardening**: Confirm whether invoice deletion / schedule clearing must be admin-only in code (policy recommendation).

---

## Out of scope / assumptions
- **Assumption**: Client provides invoice/schedule Excel files in expected formats; scanning labels follow supported QR nomenclature.
- **Out of scope** (unless requested):
  - Custom integrations (ERP/WMS) beyond Excel ingestion.
  - Custom hardware configuration beyond typical wired scanner + mobile camera support.
  - Client-specific UI branding changes.

