import sqlite3
path=r'C:\Users\Nepen\.openclaw\memory\main.sqlite'
con=sqlite3.connect(path)
cur=con.cursor()
rows=cur.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type,name").fetchall()
print('objects:', len(rows))
for name, typ in rows:
    print(f"{typ}\t{name}")
