# Naologic — Work Order Schedule Timeline

An Angular 17 application for visualising and managing work orders across multiple work centres on an interactive Gantt-style timeline.

---

## Getting Started

**Prerequisites:** Node.js 18+ and Angular CLI 17 installed globally.

```bash
# Install Angular CLI if you haven't already
npm install -g @angular/cli

# Install dependencies
npm install

# Start the development server
ng serve
```

Navigate to `http://localhost:4200`. The application will reload automatically on any source file change.

---

## Approach

The goal was to build a production-representative scheduling interface — not just a functional prototype. Every architectural decision was made with that bar in mind.

### Signal-first state management

The application uses Angular 17's signals API (`signal`, `computed`, `effect`) exclusively for reactive state — no RxJS `Subject` or `BehaviorSubject`. The `TimelineService` holds the source-of-truth signals for work centres and work orders and exposes them as read-only via `asReadonly()`, so components can consume state but never reach in and mutate it directly. Derived values like the column array and total grid pixel width are `computed()` signals, meaning they recalculate automatically and precisely when their dependencies change.

### Container / presenter component split

The timeline UI is split into two components with explicit ownership boundaries:

- **`TimelineComponent`** is the page shell. It owns the timescale pill, the fixed left-panel label strip, and all column/date arithmetic. It passes `Signal<T>` inputs down to the grid and receives typed `EventEmitter` outputs back up.
- **`TimelineGridComponent`** owns everything inside the scrollable grid — column headers, row backgrounds, bar rendering, the ghost placeholder, and the three-dot dropdown menu. It has no direct service injection; all data arrives via inputs, all mutations leave via outputs. This makes it fully portable and independently testable.

Communication between the two components flows in one direction for data, and back up through typed outputs for user actions.

### Bar positioning

Work order bars are positioned using a proportional pixel formula:

```
left  = ((clampedStart − rangeStart) / totalRangeMs) × totalGridPx
width = ((clampedEnd   − clampedStart) / totalRangeMs) × totalGridPx
```

Bars that begin before the visible grid are clamped to `left = 0` rather than discarded. Bars narrower than 4px are dropped since they are impossible to interact with. All date arithmetic normalises to midnight before computing millisecond offsets to avoid time-of-day drift corrupting positions.

### Reactive form with cross-field validation

The work order panel uses a `ReactiveFormsModule` `FormGroup` with a group-level `endAfterStart` validator rather than field-level validators, since the validity of each date field depends on the other. Dates are stored internally as `NgbDateStruct` and only converted to ISO strings at the service boundary. The overlap check is a separate method on the service — decoupled from the mutation methods — so the form can call it on submit without committing a change.

### OnPush everywhere

All three components use `ChangeDetectionStrategy.OnPush`. Because state flows through signals, Angular's signal graph handles re-render scheduling automatically with no manual `markForCheck()` calls needed.

### Persistence

Work order state is persisted to `localStorage` on every mutation so the board survives a page refresh.

---

## Libraries Used

| Library | Version | Why |
|---|---|---|
| **@ng-bootstrap/ng-bootstrap** | ^16.0.0 | Provides the `NgbDatepicker` component used in the work order panel. Its `NgbDateStruct` type is a plain object (`{ year, month, day }`) with no Date prototype baggage, which makes form validation and serialisation straightforward. `container="body"` support allows the popup to escape overflow-hidden containers without clipping. |
| **@ng-select/ng-select** | ^12.0.0 | Used for the timescale view switcher pill and the status dropdown in the work order panel. Chosen over a native `<select>` because it supports fully custom option and label templates, allowing the coloured status badge to render inside the input field as well as in the dropdown list. |
| **@angular/forms** | ^17.3.0 | `ReactiveFormsModule` powers the work order panel form with typed `FormGroup`, cross-field group validators, and `form.setErrors()` for surfacing service-level overlap errors back into the form model. |

