# AI Prompts Used

This file documents key AI-assisted decisions made during development.

---

## Prompt 1 — Component Architecture

**Prompt:**
> "I need to build an Angular 17 timeline component with signal-based state. The component must: render work order bars positioned by date, support zoom levels (day/week/month), and open a slide-out panel on click. How should I structure the components and service?"

**AI Suggestion:**
- Use Angular Signals (`signal()`, `computed()`) instead of BehaviorSubjects for simpler reactive state
- Keep a single `TimelineService` that holds work centers and orders as signals
- Separate the panel into its own component with `@Input() panelMode` 
- Use `computed()` columns that rebuild when view or anchor date changes

**Decision:** Adopted this architecture. Signals reduce boilerplate versus RxJS for this use case.

---

## Prompt 2 — Date-to-Pixel Positioning

**Prompt:**
> "How do I convert a work order's start/end dates into pixel positions for a timeline grid that shows N columns?"

**AI Suggestion:**
```
left = ((startMs - rangeStartMs) / totalRangeMs) * totalGridPx
width = ((endMs - startMs) / totalRangeMs) * totalGridPx
```
Where `totalGridPx = numberOfColumns * columnWidthPx`.

**Decision:** Used this formula. It handles all zoom levels uniformly.

---

## Prompt 3 — Overlap Detection

**Prompt:**
> "What's the correct logic to detect if two date ranges overlap?"

**AI Suggestion:**
```typescript
const overlaps = start < wEnd && end > wStart;
```
This handles all overlap cases (partial left, partial right, contained, containing).

**Decision:** Implemented this check in `TimelineService.checkOverlap()`.

---

## Prompt 4 — Styling Panel Animation

**Prompt:**
> "How do I implement a smooth slide-in panel from the right in CSS without Angular animations?"

**AI Suggestion:**
```scss
.panel {
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  &.open { transform: translateX(0); }
}
```

**Decision:** Used CSS transitions instead of Angular Animations for simplicity and performance.

---


