# Figma MCP Query Reference

Common Figma MCP operations used by the `figma-design-generator` skill.

---

## Creating a New File

```
Create a new Figma file named "{APP_NAME} — Design System & Screens"
```

Returns: `file_key`, `file_url`

---

## Creating Pages

```
Create a new page named "{PAGE_NAME}" in Figma file {FILE_KEY}
```

Do this for each page in sequence:
1. Cover
2. Design System
3. [Each epic name]
4. Flow Diagrams

---

## Creating Frames

```
Create a frame named "{ScreenName}/Mobile" with width 390 in Figma file {FILE_KEY} on page {PAGE_ID}
Create a frame named "{ScreenName}/Tablet" with width 768 in Figma file {FILE_KEY} on page {PAGE_ID}
Create a frame named "{ScreenName}/Desktop" with width 1440 in Figma file {FILE_KEY} on page {PAGE_ID}
```

---

## Reading Node Details

```
Get node {NODE_ID} from Figma file {FILE_KEY}
```

Returns: full node JSON with children, styles, layout properties

---

## Listing Page Contents

```
Get all children of node {PAGE_NODE_ID} in Figma file {FILE_KEY}
```

---

## Getting Node IDs After Creation

After creating elements, always retrieve and record their node IDs:

```
List all frames on page {PAGE_NODE_ID} in Figma file {FILE_KEY}
```

Store these in memory to populate the design-guide.md at the end.

---

## Getting Component Details

```
Get component {COMPONENT_NODE_ID} from Figma file {FILE_KEY} including all variants
```

---

## Getting Design Styles

```
Get all local styles from Figma file {FILE_KEY}
```

Returns: color styles, text styles with their IDs and values

---

## Node ID Recording Template

As you create screens, maintain this map in memory:

```json
{
  "file_key": "...",
  "file_url": "...",
  "pages": {
    "cover": "NODE_ID",
    "design_system": "NODE_ID",
    "epics": {
      "Epic Name": "NODE_ID"
    }
  },
  "screens": {
    "ScreenName": {
      "mobile": "NODE_ID",
      "tablet": "NODE_ID",
      "desktop": "NODE_ID"
    }
  },
  "components": {
    "ComponentName/Variant/State": "NODE_ID"
  }
}
```

This map is used at the end to populate the `design-guide.md`.
