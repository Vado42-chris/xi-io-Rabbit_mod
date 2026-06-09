# Design Plan: Rosetta Stone Lexicon & White-Label Taxonomy Mapping

## 1. Overview & Goals
The objective of this design is to decouple user-facing terminology in the `xi-io: ibal` companion interface from fixed backend/framework schemas. 

By implementing a client-side and server-side translation mapping layer ("Rosetta Stone"), users can project their own mental models (e.g., mapping generic "Workspaces", "Extensions", "Connections", "Diagnostics", and "Tasks" to domain-specific "Dockets", "Apps", "Integrations", "Health-Checks", "Projects", "Epics", or "Sprints").

The backend remains white-labeled, generic, and compliant with framework standards (e.g., standard EventAtom schemas, file formats, and database registries), while the user interface dynamically translates all text labels, titles, table headers, status tags, and breadcrumbs based on the selected terminology profile.

---

## 2. Terminology Mapping Schema
We will introduce a new configuration file stored at `data/lexicon_preferences.json` on the companion server. The schema represents the translation dictionary, preset profiles, and subgroup naming hierarchies:

```json
{
  "activeProfile": "docket",
  "customMapping": {
    "workspace": "docket",
    "workspaces": "dockets",
    "extension": "app",
    "extensions": "apps",
    "connection": "integration",
    "connections": "integrations",
    "diagnostic": "health-check",
    "diagnostics": "health-checks",
    "task": "item",
    "tasks": "items",
    "group": "Epic",
    "subgroup": "Sprint"
  },
  "profiles": {
    "developer": {
      "workspace": "workspace",
      "workspaces": "workspaces",
      "extension": "extension",
      "extensions": "extensions",
      "connection": "connection",
      "connections": "connections",
      "diagnostic": "diagnostic",
      "diagnostics": "diagnostics",
      "task": "task",
      "tasks": "tasks",
      "group": "group",
      "subgroup": "subgroup"
    },
    "docket": {
      "workspace": "docket",
      "workspaces": "dockets",
      "extension": "app",
      "extensions": "apps",
      "connection": "integration",
      "connections": "integrations",
      "diagnostic": "health-check",
      "diagnostics": "health-checks",
      "task": "item",
      "tasks": "items",
      "group": "Epic",
      "subgroup": "Sprint"
    },
    "legal": {
      "workspace": "case",
      "workspaces": "cases",
      "extension": "resource",
      "extensions": "resources",
      "connection": "exhibit",
      "connections": "exhibits",
      "diagnostic": "verification",
      "diagnostics": "verifications",
      "task": "action-item",
      "tasks": "action-items",
      "group": "matter",
      "subgroup": "filing"
    }
  }
}
```

---

## 3. Proposed Changes

### A. Backend API Integration
We will expose two endpoints in `server.js` to manage the lexicon mappings:
- **`GET /api/lexicon`**: Serves the current lexicon preferences. If `data/lexicon_preferences.json` does not exist, it initializes it with default profiles (Developer, Docket, Legal) and sets `'developer'` as the active profile.
- **`POST /api/lexicon`**: Updates the active profile and/or custom mapping values. Saves the payload back to `data/lexicon_preferences.json` and emits a WebSocket notification (`lexicon-updated`) so connected clients reload settings instantly.

### B. Client-Side Translation Module
We will create a lightweight translation utility module in `public/js/lexicon.js`:
- Loads translation strings from `/api/lexicon` on startup.
- Exposes `window.t(key, count)`: translates singular/plural keys. If the translation is missing, it falls back gracefully to a default value.
- Exposes `window.translateDOM(container)`: walks the specified DOM tree and translates elements marked with a `data-t` or `data-t-placeholder` attribute.

### C. Router Integration
We will update `public/router.js` to automatically translate page layouts:
- Right after an HTML partial is fetched and injected into `#content-area`, `window.translateDOM(document.getElementById('content-area'))` is executed.
- We will also translate global layout elements in `index.html` (e.g. sidebar navigation links, topbar brand prefixes, breadcrumbs, resolution selector labels).

### D. Settings Interface (Rosetta Stone Panel)
We will add a dynamic "Rosetta Stone / Lexicon Configuration" panel to the **Account** view (`public/pages/account.html`):
- **Profile Selector**: Dropdown to select between Developer, White-Label Docket, Legal, and Custom.
- **Custom Term Editor**: Displays input fields for each mapped word (Workspace, Extension, Connection, Diagnostic, Task, Group, Subgroup). If a preset profile (e.g., Docket) is chosen, the input fields are populated and disabled. Selecting "Custom" enables editing of all fields.
- **Group Hierarchy Visualizer**: A live mockup showing how their customized terms chain together (e.g., showing a tree: `Docket (Case A) ➔ Epic (Matter B) ➔ Sprint (Filing C) ➔ Item (Action-Item D)`).
- **Save Trigger**: A save button that posts preferences to the server, triggers real-time updates across the app, and logs a telemetry event.

---

## 4. Acceptance Criteria

### I. Schema & Storage Integrity
1. Preference settings are persisted in `data/lexicon_preferences.json`.
2. The server initializes default values if the file is missing.
3. The API rejects malformed request payloads and logs details without crashing.

### II. Dynamic Translation Compliance
1. Navigating to any page partial (Extensions, Connections, Diagnostics, Account, etc.) translates all headers, metrics, labels, tables, and help texts without page refresh.
2. The browser title dynamically reflects the translated page name (e.g., "xi-io: ibal — Apps" instead of "Extensions").
3. Sidebar labels and breadcrumbs react instantly to profile changes.

### III. User Controls & Hierarchy Validation
1. Selecting a predefined profile (e.g. Docket) instantly loads correct names and disables form fields.
2. Selecting the "Custom" profile unlocks all fields for arbitrary editing.
3. Saving updates emits a `lexicon-updated` socket signal and saves to the JSON store.
4. The Group Hierarchy Visualizer displays the customized hierarchy structure accurately.

---

## 5. Verification Plan
1. **Automated Tests**: Add a test suite `test/lexicon.test.js` to verify:
   - Lexicon GET and POST API endpoints.
   - Validation of custom mapping keys.
   - Fallback logic for missing configuration files.
2. **Manual & Visual Inspection**:
   - Navigate to the Account tab.
   - Change the profile from "Developer" to "Docket".
   - Confirm that sidebar navigation changes from "Extensions" to "Apps", and "Connections" to "Integrations".
   - Confirm that "Primary Workspace" headers in Connections render as "Primary Docket".
   - Switch to "Custom" and customize "task" as "Bug", then verify the tasks page (or list views) renders as "Bugs".
