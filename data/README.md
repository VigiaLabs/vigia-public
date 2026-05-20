# VIGIA Mock Data

## `nhai_mock.db` — Pre-indexed NHAI Contract Data

SQLite database with FTS5 full-text search. Created by `scripts/index-nhai.ts`.

### Schema

```sql
CREATE VIRTUAL TABLE nhai_sections USING fts5(
  content,
  section_title,
  page_number UNINDEXED
);
```

### Usage

```typescript
import Database from 'better-sqlite3';
const db = new Database('data/nhai_mock.db', { readonly: true });
const rows = db.prepare(
  `SELECT content, section_title, page_number FROM nhai_sections WHERE nhai_sections MATCH ? ORDER BY rank LIMIT 5`
).all('"road" OR "maintenance"');
```

### Regenerating

```bash
npx tsx scripts/index-nhai.ts
```
