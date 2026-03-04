# Naologic Work Order Schedule Timeline

An interactive timeline component for visualizing and managing work orders across work centers in a manufacturing ERP system.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Installation

```bash
npm install
```

### Running the App

```bash
ng serve
# or
npm start
```

Navigate to `http://localhost:4200`.

---

## ✅ Features Implemented

### Core
- **Timeline grid** with Day / Week / Month zoom levels (Hour included as bonus)
- **Work order bars** positioned accurately by date with status color coding
- **Create panel** — click any empty row area → slide-out form prefills start date
- **Edit panel** — three-dot menu → Edit → form prefilled with existing data
- **Delete** — three-dot menu → Delete removes the work order
- **Overlap detection** — error shown, save blocked if orders overlap on same work center
- **Form validation** — required fields, end date must be after start date
- **Today indicator** — vertical line on current date
- **Current period badge** — "Current month / week / Today" label in header
- **Hover states** — row highlight on hover, "Click to add dates" tooltip
- **Three-dot menu** — appears on bar hover, opens Edit/Delete dropdown

### Bonus
- **localStorage persistence** — work orders survive page refresh
- **Panel animation** — smooth slide-in/out transition
- **Keyboard support** — Escape closes panel
- **Today auto-scroll** — timeline centers on today on load

---

## 🏗 Architecture

```
src/app/
├── models/
│   ├── timeline.models.ts     # TypeScript interfaces & types
│   └── sample-data.ts         # Hardcoded sample data (5 WCs, 8+ WOs)
├── services/
│   └── timeline.service.ts    # Signal-based state management
└── components/
    ├── timeline/
    │   └── timeline.component.ts   # Main timeline grid
    └── work-order-panel/
        └── work-order-panel.component.ts  # Slide-out create/edit panel
```

### Key Design Decisions

- **Angular Signals** for reactive state — avoids NgRx overhead for this scope
- **Computed columns** — rebuilds timeline columns whenever view or anchor changes
- **Pixel positioning** — work order bars use absolute `left` + `width` in pixels, calculated from date range proportions
- **Single panel component** — shared for create and edit modes via `PanelMode` input
- **Overlap check** — server-side-style validation in the service layer
- **OnPush change detection** — for performance across all components

### Date Positioning Logic

```
left (px) = ((startDate - rangeStart) / totalRangeMs) * totalGridPx
width (px) = ((endDate - startDate) / totalRangeMs) * totalGridPx
```

---

## 🛠 Libraries Used

| Library | Reason |
|---------|--------|
| `@ng-select/ng-select` | Required — dropdowns (timescale, status) |
| `@ng-bootstrap/ng-bootstrap` | Required — date utilities |
| Angular Reactive Forms | Required — form validation |
| Angular Signals | State management (built-in Angular 17+) |

---

## 📁 Sample Data

- **5 work centers**: Genesis Hardware, Rodriques Electrics, Konsulting Inc, McMarrow Distribution, Spartan Manufacturing
- **8 work orders** spanning all 4 statuses (Open, In Progress, Complete, Blocked)
- Konsulting Inc and Spartan Manufacturing each have 2 non-overlapping orders

---

## 🗂 Commit History

1. `init: scaffold Angular 17 project`
2. `feat: add data models and sample data`  
3. `feat: add timeline service with signal-based state`
4. `feat: build main timeline grid component`
5. `feat: build work order slide-out panel`
6. `feat: wire up create, edit, delete flows`
7. `feat: add overlap detection and form validation`
8. `feat: add localStorage persistence (bonus)`
9. `style: pixel-perfect design pass matching Sketch`
10. `docs: add README`
