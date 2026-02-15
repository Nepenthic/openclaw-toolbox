import sqlite3
path=r'C:\Users\Nepen\.openclaw\memory\main.sqlite'
con=sqlite3.connect(path)
cur=con.cursor()
for row in cur.execute('PRAGMA table_info(files)'):
    print(row)
