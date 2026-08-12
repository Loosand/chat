---
title: 使用 Activity Component 显示/隐藏
impact: MEDIUM
impactDescription: preserves state/DOM
tags: rendering, activity, visibility, state-preservation
---

## 使用 Activity Component 显示/隐藏

Use React's `<Activity>` to preserve state/DOM for expensive components that frequently toggle visibility.

**使用:**

```tsx
import { Activity } from 'react'

function Dropdown({ isOpen }: Props) {
  return (
    <Activity mode={isOpen ? 'visible' : 'hidden'}>
      <ExpensiveMenu />
    </Activity>
  )
}
```

Avoids expensive re-renders and state loss.
