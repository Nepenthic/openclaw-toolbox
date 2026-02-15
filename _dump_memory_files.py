import sqlite3
path=r'C:\Users\Nepen\.openclaw\memory\main.sqlite'
con=sqlite3.connect(path)
con.row_factory=sqlite3.Row
cur=con.cursor()
print('files count:', cur.execute('SELECT COUNT(*) FROM files').fetchone()[0])
print('recent by mtime:')
for r in cur.execute('SELECT path, source, size, mtime FROM files ORDER BY mtime DESC LIMIT 50'):
    print(f"- {r['mtime']} size={r['size']} source={r['source']} path={r['path']}")
