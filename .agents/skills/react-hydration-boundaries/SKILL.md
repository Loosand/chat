---
name: react-hydration-boundaries
description: Design and review React/Next.js pages so hydration, persisted state, SWR, and client providers do not create visible fallback frames, flicker, or avoidable client bundle weight. Use when optimizing App Router pages, splitting server/client components, auditing hydration-driven layout jumps, or applying the "decouple hydration from React UI" pattern.
---

# React Hydration Boundaries

Use this skill when a React or Next.js page should show one stable loading state, then the final usable UI, with no intermediate "client data arrived" frames.

## Core Rule

Separate three concerns:

1. **Server data readiness**: fetch and normalize route-critical data before rendering the client island.
2. **Client interaction readiness**: hydrate only the components that need event handlers or browser APIs.
3. **Persistence/store readiness**: initialize persisted stores outside visible React UI, then let UI subscribe to a ready snapshot.

Do not let a visible component tree be the thing that discovers whether its required data or persisted state exists.

## Audit Workflow

1. Identify the first visible viewport and list every client component inside it.
2. For each client component, classify its inputs:
   - route-critical display data,
   - interaction state,
   - realtime/live data,
   - persisted user preference,
   - heavy optional UI.
3. Move route-critical display data to RSC/server loaders and pass minimal serializable props.
4. Keep SWR for post-interaction freshness, pagination, realtime-ish data, and mutation invalidation, not for first paint data that determines component shape.
5. Replace provider-driven "empty then fetch" state with either:
   - server-provided initial data,
   - an external store created before React renders,
   - or a hidden/offscreen client island that does not alter first viewport layout.
6. Dynamically import heavy optional UI only when the user opens or reaches it.
7. Verify with screenshots/traces that the page has a stable skeleton frame and a stable final frame, not a sequence of partial UI states.

## Next.js App Router Pattern

Prefer this split:

```tsx
// page.tsx - Server Component
export default async function Page({ params, searchParams }) {
  const [app, plan, userState] = await Promise.all([
    getApp(params),
    buildInitialFormPlan(params, searchParams),
    getUserShellState(),
  ]);

  return (
    <StudioFrame app={app}>
      <StudioClientIsland initialPlan={plan} initialUserState={userState} />
    </StudioFrame>
  );
}
```

Rules:

- Keep layout, SEO, marketing/read-only content, and skeletons as server components unless they need browser events.
- Make the client island as small as possible: form state, submit, drawer/popover, live job tracking.
- Pass a compiled "view model" or "form plan" instead of raw DB rows or all resolved models.
- Use `Promise.all` for independent server reads.
- Use `React.cache` for request-level dedupe and `unstable_cache`/`updateTag` for cross-request config data.
- Do not call `headers()`, `cookies()`, or auth APIs inside `unstable_cache`; pass stable parameters into cached functions.

## SWR Rules

Use SWR when the data is not required to decide the first visible UI shape:

- credits/balance refresh,
- pinned/favorites,
- infinite gallery next pages,
- trigger token/status polling,
- mutation revalidation after submit/delete/favorite.

For first paint, prefer server-provided initial data. If SWR remains in the path, use `fallbackData` and configure revalidation so it cannot visually regress the UI to empty state.

## Persisted State Rules

Persisted UI state can cause a "default UI then hydrated UI" frame. Avoid that by:

- reading safe defaults on the server when possible,
- seeding an external store before the visible component renders,
- keeping preference changes cosmetic and layout-stable,
- delaying non-critical preference application until after the first viewport is stable.

Do not make a top-level provider render `null`, skeletons, or alternate layout while it rehydrates localStorage/sessionStorage.

## Import-Time Side Effects

Avoid module-level registration that can run too late or in an unpredictable order during route-level code splitting. Prefer explicit bootstrapping:

```ts
export function ensureFeatureRegistry() {
  registerFeature("x", impl);
}
```

Call bootstrapping from a stable server loader or route entry before rendering consumers. This mirrors the "hydrate store outside React UI" lesson: readiness must be explicit, not an incidental result of importing a component.

## Verification Checklist

- No route-critical component renders from an empty provider and then refills after hydration.
- No `useEffect` fetch determines first viewport content.
- No `useSearchParams`/`usePathname` component forces broad CSR without a tight Suspense boundary.
- RSC props are minimal and serializable; no `Date`, `Map`, `Set`, or broad DB rows cross the boundary.
- A fresh load shows: route loading skeleton → final UI. It does not show: shell → missing selector → selector appears → prompt changes.
- Performance checks include both network waterfall and visual frame sequence.
