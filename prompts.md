## Phase 1 — Architecture & Scaffold

### 1. Establishing the technical foundation upfront

> *"Scaffold an Angular 17 standalone application for a Work Order Schedule Timeline. Use signals and computed() for all reactive state — no RxJS Subject or BehaviorSubject. Apply OnPush change detection globally. The folder structure should be: models/ for interfaces and sample data, services/ for a singleton TimelineService, and components/ for timeline, work-order-panel. Export interfaces for WorkCenterDocument, WorkOrderDocument, WorkOrderStatus, TimescaleView, and TimelineColumn. TimelineService should expose read-only signals via asReadonly() so components can consume but never mutate service state directly."*


### 2. Defining the bar-positioning contract before implementing it

> *"Before writing any component logic, define the pixel-positioning formula as a pure utility and document it: `left = ((clampedStart - rangeStart) / totalMs) * totalPx`, `width = ((clampedEnd - clampedStart) / totalMs) * totalPx`. Inputs and outputs should be typed. Clamp bars that start before the grid to left=0. Bars narrower than 4px should return null. This function will be called per work order per row on every change detection cycle — keep it pure so it can be memoized later."*


### 3. Designing the state shape before the service

> *"Design the TimelineService state shape before writing the implementation. State should hold: `workCenters: Signal<WorkCenterDocument[]>`, `workOrders: Signal<WorkOrderDocument[]>`. CRUD methods: `addWorkOrder`, `updateWorkOrder`, `deleteWorkOrder`. Overlap detection should use a half-open interval check (`start < existingEnd && end > existingStart`) and exclude the work order being edited by its docId. Persist to localStorage on every mutation. Expose a `checkOverlap(start, end, excludeId?)` method separately so the panel component can call it on form submit without coupling to the add/update logic."*


## Phase 2 — Component Design

### 4. Specifying the component split with clear ownership boundaries

> *"Split the timeline into two components with explicit ownership: `TimelineComponent` owns page layout, the timescale pill, the left work-center label strip, and all column/date math. It exposes `columns`, `columnWidth`, `totalGridWidth` as computed() signals passed down as `Signal<T>` inputs. `TimelineGridComponent` owns the scrollable grid — headers, row backgrounds, bar rendering, ghost placeholder, and the three-dot menu. It emits `createRequest`, `editRequest`, `deleteRequest` as typed outputs. No direct service injection in the grid — all data flows in via inputs and out via outputs. The grid exposes one public method `scrollToColumn(index: number)` accessible via @ViewChild."*

### 5. Designing the panel's form with validation strategy upfront

> *"The work-order-panel should use a reactive FormGroup with a cross-field `endAfterStart` group validator — not field-level validators. The validator compares NgbDateStruct values directly: end must be strictly after start (same-day is invalid). The form should store dates internally as NgbDateStruct and only convert to/from ISO strings at the service boundary using `ngbToIso()` and `isoToNgb()` helpers. On mode change (create vs edit) the form should reset via `ngOnChanges` — not via an `@Input` setter — to ensure it fires after all inputs have settled. Overlap error from the service should be set as a form-level error using `form.setErrors({ overlap: true })`, not shown via a separate boolean flag."*

### 6. Getting the date utility layer right

> *"Create a dedicated date utility file with these functions, each with inline documentation: `isoToNgb(iso: string): NgbDateStruct` — parse ISO date string to datepicker struct. `ngbToIso(d: NgbDateStruct): string` — serialize to ISO for storage. `addDays(d: NgbDateStruct, n: number): NgbDateStruct` — used to default end date to 7 days after start on create. `isSameDay(a: Date, b: Date): boolean` — compare by calendar day only, not timestamp, to avoid off-by-one errors caused by time-of-day differences. All functions should be pure with no side effects."*


## Phase 3 — Correctness & Edge Cases


### 7. Auditing against the spec proactively

> *"Before we move to styling, do a systematic pass against the requirements document covering: (1) all three timescale views render correct column counts and widths, (2) overlap detection fires on both create and edit and excludes the item being edited, (3) the panel resets cleanly when switching between create and edit modes without stale data, (4) bars that extend beyond the grid boundary are clamped and not clipped by overflow:hidden, (5) today auto-scroll centres on the current period, not just scrolls to it. Flag anything that deviates."*


### 8. Catching the empty-bar regression with a root cause question

> *"When switching to month view, a phantom work order bar is appearing. Before fixing it, tell me what is causing it — is it a signal not being reset between view changes, a computed() that includes stale column state, or a bar-positioning formula returning a valid object for an invalid date range? I want to understand the root cause before we patch it."*


### 9. Addressing the datepicker popup rendering bug with context

> *"The ngb-datepicker popup is rendering transparently — the form behind it is visible through it. This is almost certainly a CSS scoping issue caused by `container='body'`, which teleports the popup outside the component's style encapsulation boundary. The fix should go in global styles.scss, not in the component SCSS, and should explicitly set background on `.ngb-dp`, `.ngb-dp-months`, and `.ngb-dp-month` with `!important` to override whatever is causing the bleed-through. Confirm this is the root cause before applying the fix."*


## Phase 4 — Code Quality

### 10. Requesting comments that explain non-obvious decisions

> *"Add inline comments to all TypeScript files. Comments should explain two things: (1) the 'why' behind non-obvious calculations — for example, why `getDay() - 56` gives us 8 weeks before the start of the current week, why we use `setHours(0,0,0,0)` before timestamp arithmetic, why `isSameDay` compares date parts instead of using `getTime()`, and why `Math.max/min` clamping is needed in `toBar()`. (2) Key architectural decisions — why `checkOverlap` is separate from the mutation methods, why the grid takes `Signal<T>` inputs instead of plain values, why `outsideClickListener` must be an arrow function for `removeEventListener` to work. No markdown formatting in comments — plain prose only."*


### 11. Decomposing with a defined public API

> *"Extract the scrollable grid into `TimelineGridComponent`. The parent will hold a `@ViewChild('grid') gridRef` and call `gridRef.scrollToColumn(index)` after view changes — so that method must be public on the child. All grid-internal state (hoveredRow, openMenuId, ghostLeft, barHovered) stays inside the child as signals. The child must not inject TimelineService — data comes in via typed Signal inputs and mutations go out via EventEmitter outputs. After the split, the parent's template should have no grid-specific logic — no bar math, no column header rendering, no ghost placeholder handling."*


### 12. Thinking about change detection before it becomes a problem

> *"Ensure all components use `ChangeDetectionStrategy.OnPush`. The grid component receives Signal inputs — Angular's signal graph will trigger re-renders automatically when those signals change, so no manual `markForCheck()` calls should be needed. The one exception is after `@ViewChild` resolution in `ngAfterViewInit` — wrap the `scrollToToday()` call there in a `setTimeout(0)` to let Angular complete the current render cycle before we read DOM dimensions for the scroll calculation."*


