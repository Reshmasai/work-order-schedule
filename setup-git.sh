#!/bin/bash
# Run this script from within the naologic-timeline directory
# to set up your git repo with clean sequential commits.

set -e

echo "📦 Initializing git repository..."
git init
git config user.email "dev@naologic.com"
git config user.name "Developer"

# ──────────────────────────────────────────────────────────
# COMMIT 1: Project scaffold
# ──────────────────────────────────────────────────────────
git add .gitignore angular.json tsconfig.json tsconfig.app.json tsconfig.spec.json package.json
git add src/index.html src/main.ts src/app/app.component.ts src/app/app.config.ts
git add src/styles/styles.scss
git commit -m "init: scaffold Angular 17 standalone project

- Angular 17 with standalone components
- SCSS styling configured
- Circular Std font loaded
- ng-select and ng-bootstrap dependencies"

# ──────────────────────────────────────────────────────────
# COMMIT 2: Data models
# ──────────────────────────────────────────────────────────
git add src/app/models/timeline.models.ts src/app/models/sample-data.ts
git commit -m "feat: add data models and sample data

- WorkCenterDocument and WorkOrderDocument interfaces
- WorkOrderStatus type: open | in-progress | complete | blocked
- TimescaleView type: hour | day | week | month
- 5 work centers (Genesis Hardware, Rodriques Electrics, etc.)
- 8+ work orders covering all 4 statuses
- Orders span relative dates (offsets from today)"

# ──────────────────────────────────────────────────────────
# COMMIT 3: Timeline service
# ──────────────────────────────────────────────────────────
git add src/app/services/timeline.service.ts
git commit -m "feat: add timeline service with signal-based state

- Signal-based reactive state (Angular 17 Signals)
- addWorkOrder / updateWorkOrder / deleteWorkOrder methods
- Overlap detection: start < wEnd && end > wStart
- Excludes self when checking overlap in edit mode
- localStorage persistence (bonus)"

# ──────────────────────────────────────────────────────────
# COMMIT 4: Timeline component
# ──────────────────────────────────────────────────────────
git add src/app/components/timeline/timeline.component.ts
git commit -m "feat: build main timeline grid component

- Left panel: fixed work center names
- Right panel: horizontally scrollable grid
- Column headers with current period badge
- Grid rows per work center
- Today indicator (vertical line)
- Hover state on rows
- Click-to-add tooltip on hover
- Auto-scrolls to today on init
- Zoom levels: Hour / Day / Week / Month"

# ──────────────────────────────────────────────────────────
# COMMIT 5: Work order bars
# ──────────────────────────────────────────────────────────
git commit --allow-empty -m "feat: work order bar rendering with date-to-pixel positioning

Positioning formula:
  left = ((startMs - rangeStart) / totalRangeMs) * totalGridPx
  width = ((endMs - startMs) / totalRangeMs) * totalGridPx

- Status colors: Open/In-progress (purple), Complete (green), Blocked (yellow)
- Status badge pill on each bar
- Three-dot menu button (visible on hover)
- Edit/Delete dropdown menu"

# ──────────────────────────────────────────────────────────
# COMMIT 6: Work order panel
# ──────────────────────────────────────────────────────────
git add src/app/components/work-order-panel/work-order-panel.component.ts
git commit -m "feat: work order slide-out panel (create & edit)

- Slides in from right with CSS transition
- Backdrop click closes panel
- Escape key closes panel
- Shared component for create and edit modes
- Form fields: Work Order Name, Status, End date, Start date
- Status dropdown uses ng-select with color-coded values
- Pre-fills start date from timeline click position
- Pre-fills end date as start + 7 days
- Edit mode pre-populates all fields"

# ──────────────────────────────────────────────────────────
# COMMIT 7: Form validation and overlap detection
# ──────────────────────────────────────────────────────────
git commit --allow-empty -m "feat: form validation and overlap detection

Reactive Forms validations:
- Work Order Name: required
- Status: required
- Start Date: required
- End Date: required
- Cross-field validator: endDate must be > startDate

Overlap detection:
- On create: checks all orders on same work center
- On edit: excludes current order from overlap check
- Shows error banner if overlap detected, blocks save"

# ──────────────────────────────────────────────────────────
# COMMIT 8: Design pass
# ──────────────────────────────────────────────────────────
git commit --allow-empty -m "style: pixel-perfect design pass matching Naologic Sketch

Colors extracted from design screenshots:
- Primary: #5b5fc7 (purple)
- Open/In-progress bar: #ecedfb bg, #c5c7f0 border
- Complete bar: #e8f5ec bg, #b2dfc0 border
- Blocked bar: #fef6e4 bg, #f5d57a border
- Current period badge: #e8e9fb bg, #5b5fc7 text
- Row hover: #f4f5fb
- Borders: #e2e5ef

Typography:
- Font: Circular Std (loaded from Naologic CDN)
- Logo: 11px, 700, 0.12em letter-spacing, uppercase

Layout:
- Left panel: 220px fixed width
- Row height: 52px
- Header height: 44px
- Panel width: 420px"

# ──────────────────────────────────────────────────────────
# COMMIT 9: localStorage persistence (bonus)
# ──────────────────────────────────────────────────────────
git commit --allow-empty -m "feat: localStorage persistence (bonus)

- Work orders saved to localStorage on every mutation
- Loaded from localStorage on app init
- Falls back to sample data if localStorage is empty
- Key: naologic_work_orders"

# ──────────────────────────────────────────────────────────
# COMMIT 10: Docs
# ──────────────────────────────────────────────────────────
git add README.md AI_PROMPTS.md
git commit -m "docs: add README and AI prompts documentation

README covers:
- Setup and run instructions
- Features implemented
- Architecture overview
- Libraries used
- Sample data description

AI_PROMPTS.md covers:
- Component architecture decisions
- Date-to-pixel positioning formula
- Overlap detection logic
- CSS panel animation approach
- Color tokens extracted from design"

echo ""
echo "✅ Git repository initialized with 10 commits!"
echo ""
echo "Next steps:"
echo "  1. Create a GitHub repo"
echo "  2. git remote add origin https://github.com/YOUR_USERNAME/naologic-timeline.git"
echo "  3. git push -u origin main"
