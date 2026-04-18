# Figma Annotation Guide

Conventions for annotating duplicated/adjusted frames in task-design-sync workflow.

## Annotation Style

- **Shape:** Rectangle, fill `#FFF9C4` (yellow), corner radius 4px
- **Border:** 1px solid `#F9A825`
- **Text style:** 12px / Inter / Regular / `#333333`
- **Placement:** Outside the frame boundary, connected to the annotated element with a straight line (1px, `#F9A825`)

## Label Format

```
[#N] Short description of the change or element
```

Examples:
- `[#1] New — Add empty state illustration here`
- `[#2] Modified — Button changed from ghost to primary`
- `[#3] Existing component — use Badge/Success/Default`

## Required Annotations for Every Adjusted Frame

1. **Top-level task label** (placed above the frame):
   ```
   Task: [Task Title] · [Task ID]
   Duplicated from: [Original frame name]
   ```

2. **One annotation per changed or added element**

3. **"No change" note** if a section is intentionally untouched:
   ```
   [~] No changes — preserve existing behavior
   ```

## Grouping

- Group all annotation elements (rectangle + line + text) per annotation
- Name the group: `Annotation/#N`
- Group all annotations for a frame into a parent group: `Annotations/[FrameName]`
