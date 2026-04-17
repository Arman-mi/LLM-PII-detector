# 🛡️ Mini Tecto

**Mini Tecto** is a Chrome extension for **local PII (Personally Identifiable Information) detection and redaction** on AI chat inputs such as ChatGPT.

It scans text before submission, detects sensitive information, and lets the user redact it locally before sending.

---

## Features

- **PII detection**
  - Regex and heuristic detection for:
    - Email addresses
    - Phone numbers
    - SSNs
    - Credit cards
    - IP addresses
    - ID-like strings
  - Local NER model for:
    - Person names
    - Organizations
    - Locations

- **Fully local processing**
  - No backend
  - No API calls
  - Runs on-device in the browser

- **Redaction**
  - Replaces sensitive text with placeholders such as:
    - `John Doe -> [PERSON_1]`
    - `jane@email.com -> [EMAIL_1]`

- **Policy-based handling**
  - Each detection type can be configured to:
    - `REDACT`
    - `WARN`
    - `BLOCK`

- **Audit log**
  - Tracks redactions and blocked submissions in local storage

---

## High-Level Flow

```text
User types into chat input
        ↓
Content script captures input
        ↓
Detection pipeline runs
   ├─ Regex + heuristics
   └─ Local NER model (offscreen document)
        ↓
Detections are merged and deduplicated
        ↓
Policy engine assigns actions
        ↓
UI panel shows findings
        ↓
User can redact before sending
        ↓
Original text can be restored locally
```

---

## How It Works

### 1. Content script
The content script is injected into supported chat pages. It:

- Finds the active chat input
- Reads the current text
- Triggers scanning
- Renders the Mini Tecto panel
- Handles redaction and restore actions
- Intercepts sends when a policy says to block

### 2. Detection pipeline
The detector combines two approaches:

#### Regex and heuristics
Used for structured patterns such as:

- Emails
- Phones
- SSNs
- Credit cards
- IPs
- Potential internal IDs

#### Local NER
A local ONNX-based TinyBERT NER model is used to detect:

- `PERSON`
- `ORG`
- `LOCATION`

This runs in an offscreen extension document so the heavier ML logic stays separate from the main content script.

### 3. Merge and deduplication
All detections are merged together, then overlaps are resolved using priority rules so the final result is clean and consistent.

### 4. Policy evaluation
Each detection is assigned an action based on policy:

- `REDACT` → replace before sending
- `WARN` → show warning only
- `BLOCK` → prevent submission

### 5. Redaction
When the user clicks **Redact**, sensitive text is replaced with placeholders, and a replacement map is stored so the original text can later be restored locally.

---

## Project Structure

```text
mini-tecto/
│
├── manifest.json          # Chrome extension manifest
├── background.js          # Service worker / offscreen routing
├── content.js             # Main content script injected into chat pages
├── detectors.js           # Regex, heuristics, NER merge logic
├── redaction.js           # Redaction + restoration logic
├── policy.js              # Policy evaluation logic
├── offscreen.js           # Offscreen ML / NER runtime
├── ner-loader.js          # NER helper loader utilities
├── styles.css             # Injected panel styling
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic
│
├── dist/                  # Built main extension bundle
├── dist-offscreen/        # Built offscreen / ML bundle
│
├── package.json           # Dependencies and npm scripts
├── package-lock.json      # Exact dependency lockfile
└── README.md              # Project documentation
```

---

## Why There Are Two Builds

This project has two separate bundles:

### Main build
Builds the content script and extension-side logic used directly by the page.

### Offscreen build
Builds the separate offscreen ML environment used for NER inference.

That separation keeps the content script lighter and isolates the heavier ONNX / transformers logic.

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/Arman-mi/LLM-PII-detector.git
cd mini-tecto
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the project

```bash
npm run build
npm run build:offscreen
```

This generates:

- `dist/`
- `dist-offscreen/`

### 4. Load the extension in Chrome

1. Open `chrome://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the project folder

---

## Usage

1. Open a supported chat page
2. Start typing into the input box
3. The Mini Tecto panel appears
4. Review detected sensitive items
5. Click:
   - **Redact** to replace items with placeholders
   - **Restore** to restore original text
   - **Rescan** to re-run detection

If policy requires blocking, the extension prevents submission until sensitive content is removed or redacted.

---

## Supported Detection Types

- `EMAIL`
- `PHONE`
- `SSN`
- `CREDIT_CARD`
- `IP_ADDRESS`
- `CUSTOM_TERM`
- `POTENTIAL_ID`
- `PERSON`
- `ORG`
- `LOCATION`

---

## Privacy

Mini Tecto is designed to be local:

- No external API calls for detection
- No server-side processing
- Sensitive text stays on the device

---




