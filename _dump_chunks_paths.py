import sqlite3
path=r'C:\Users\Nepen\.openclaw\memory\main.sqlite'
con=sqlite3.connect(path)
con.row_factory=sqlite3.Row
cur=con.cursor()
rows=cur.execute('SELECT path, COUNT(*) as n, MAX(updated_at) as last FROM chunks GROUP BY path ORDER BY last DESC').fetchall()
print('distinct paths:', len(rows))
for r in rows[:50]:
    print(f"- {r['path']}: chunks={r['n']} last={r['last']}")
