import sqlite3, json, textwrap
path=r'C:\Users\Nepen\.openclaw\memory\main.sqlite'
con=sqlite3.connect(path)
con.row_factory=sqlite3.Row
cur=con.cursor()
print('meta:')
for r in cur.execute('SELECT key, value FROM meta ORDER BY key'):
    print(f"  {r['key']}: {r['value']}")
print('\nfiles (most recent 30):')
for r in cur.execute('SELECT id, path, hash, bytes, createdAt, updatedAt FROM files ORDER BY updatedAt DESC LIMIT 30'):
    print(f"- id={r['id']} bytes={r['bytes']} updatedAt={r['updatedAt']} path={r['path']}")
