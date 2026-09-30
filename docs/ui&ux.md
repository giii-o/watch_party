---
name: stark-minimalist-ui-engine
description: Enforces a sharp, high-contrast, text-first minimalist aesthetic matching pristine publication platforms (e.g., Medium sign-up cards).
triggers:
  - building modals, cards, sign-up/auth forms, or viewports
  - writing or editing layout container classes or spacing tokens
  - refactoring element corner radiuses (borders) and text alignments
---

# Stark Minimalist & Sleek UI/UX Engine

Use this skill to guide the composition, layout, and visual formatting of frontend components. This configuration prioritizes clean geometric layouts, typography-driven hierarchy, massive negative space, and a strict rulebook for geometric shapes.

## 1. Geometric & Corner Architecture
- **Stark Containers:** Grid blocks, form inputs, modals, and card containers must feature sharp **0px rounded corners (no border-radius)**. Do not apply rounding to main UI boxes.
- **Controlled Button Exceptions:** Pill-shaped rounding or heavy border-radius (`rounded-full` in Tailwind) is permitted **exclusively for primary action buttons** to clearly differentiate them from static structural elements. 
- **Subtle Containers:** Avoid physical borders to separate form sections. If an input field or section requires a background boundary, use a flat, low-contrast solid color fill (e.g., `#F9F9F9` or `rgba(0,0,0,0.03)`) with zero border lines.

## 2. Text-First Visual Hierarchy (The 3-Second Rule)
- **Centered Layout Focus:** Center-align text elements, avatars, and main action forms inside user acquisition modals, landing cards, and greeting structures to create a clear, elegant anchor point.
- **Bold Typography Pairings:** Use large, editorial serif or sharp grotesque sans-serif fonts for primary headlines to capture instant focus. Follow with smaller, high-readability regular-weight body text for helper information.
- **Progressive Functional Links:** Keep secondary navigation choices (e.g., "Other sign up options", "Sign in") cleanly structured underneath the primary action block using clean text underlines, rather than framing them inside independent boxes.

## 3. Interaction Mechanics & Micro-States
- **Instant State Changes:** To ensure the app feels sleek and snappy, avoid long, dramatic entry fade-ins. Keep interface transitions down to a fast, tight curve:
  ```css
  transition: all 150ms cubic-bezier(0.2, 0, 0, 1);
  ```
- **Form Input Focus States:** When a text field is selected, avoid glowing color rings. Transition cleanly by rendering a solid black or dark charcoal bounding line or subtle drop shadow shift to retain a premium feel.
- **Legal & Footer Subtext:** Tuck data policies, terms of service, and captcha notices cleanly at the lowest tier of the layout using an extremely small, desaturated font color block (e.g., text size `11px`-`12px` in light gray).

## 4. Code Impeccability Rules
- **Semantic Components:** Always employ standard semantic HTML components (`<form>`, `<button type="submit">`, `<input type="email">`) instead of building interactable blocks out of generic `<div>` arrays.
- **Deterministic Spacing:** Enforce strict vertical stack spacing (`gap-y-4` or `gap-y-6`) to let elements breathe gracefully. Avoid custom, uneven padding values.

## 5. Custom Components Identity
- **Buttons:** Minimmum curvature on buttons. The text to button text ratio should be about 3:1. The size configuration of width by lenght of each button should always produce a rectangle ( w < l && !== l / !== 2l: l ). Max height of any button should be (32px)
- **Input/Textbox:** The height of an input or textbox should be the same as the height of the button adjacent it.
- **Headers** The headers should have a mid-thick font weight.