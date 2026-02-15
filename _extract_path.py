import sqlite3, sys
path=r'C:\Users\Nepen\.openclaw\memory\main.sqlite'
want=sys.argv[1]
con=sqlite3.connect(path)
con.row_factory=sqlite3.Row
cur=con.cursor()
rows=cur.execute('SELECT start_line,end_line,text FROM chunks WHERE path=? ORDER BY start_line', (want,)).fetchall()
print('chunks',len(rows),'for',want)
for r in rows:
    print(f"\n--- lines {r['start_line']}-{r['end_line']} ---\n")
    print(r['text'])
