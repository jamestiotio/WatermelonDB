// @flow
const fs = require(`fs`)
const SQliteDatabase = require('better-sqlite3')

class Database {
  instance: SQliteDatabase = undefined

  path: string

  cachedRecords = []

  constructor(path: string = ':memory:'): void {
    this.path = path
    // this.instance = new SQliteDatabase(path);
    this.open()
  }

  open = () => {
    let { path } = this
    if (path === 'file::memory:' || path.indexOf('?mode=memory') >= 0) {
      path = ':memory:'
    }
    this.instance = new SQliteDatabase(path, { verboze: console.log })

    if (!this.instance || !this.instance.open) {
      throw new Error('Failed to open the database.')
    }
  }

  inTransaction = (executeBlock: () => void) => this.instance.transaction(executeBlock)()

  execute = (query: string, args: any[] = []) => {
    this.instance.prepare(query).run(args)
  }

  executeStatements = (queries: string) => this.instance.exec(queries)

  queryRaw = (query: string, args: any[] = []) => {
    let results = []
    try {
      // console.log(`>>> queryRaw 1`, query, args)
      const stmt = this.instance.prepare(query)
      // console.log(`>>> queryRaw 2`, stmt)
      // console.log(`>>> queryRaw 3`, stmt.get(args))
      if (stmt.get(args)) {
        // console.log(`stmt.get 2`)
        results = stmt.all(args)
      }
      // console.log(`stmt.get 3`)
    } catch (e) {
      // console.log(`queryRaw e`, e.code, e.message)
    }
    return results
    // return this.instance.prepare(query).all(args)
  }

  count = (query: string, args: any[] = []) => {
    const results = this.instance.prepare(query).all(args)

    if (results.length === 0) {
      throw new Error('Invalid count query, can`t find next() on the result')
    }

    const result = results[0]

    if (result.count === undefined) {
      throw new Error('Invalid count query, can`t find `count` column')
    }

    return Number.parseInt(result.count, 10)
  }

  getUserVersion = (): number => {
    return this.instance.pragma('user_version', {
      simple: true,
    })
  }

  get userVersion(): number {
    return this.getUserVersion()
  }

  set userVersion(version: number): number {
    this.instance.pragma(`user_version = ${version}`)
    return this.getUserVersion()
  }

  unsafeDestroyEverything = () => {
    // Deleting files by default because it seems simpler, more reliable
    // And we have a weird problem with sqlite code 6 (database busy) in sync mode
    // But sadly this won't work for in-memory (shared) databases, so in those cases,
    // drop all tables, indexes, and reset user version to 0

    if (this.isInMemoryDatabase()) {
      const results = this.queryRaw(`SELECT * FROM sqlite_master WHERE type = 'table'`)
      this.inTransaction(() => {
        const tables = results.map(table => table.name)
        // console.log(`tables`, tables, typeof tables, Array.isArray(tables))

        tables.forEach(table => {
          // console.log(`delete table ${table}`)
          this.instance.execute(`DROP TABLE IF EXISTS ${table}`)
        })

        this.execute('PRAGMA writable_schema=1')
        const count = this.queryRaw(`SELECT * FROM sqlite_master`).length
        if (count) {
          // IF required to avoid SQLIte Error
          this.execute('DELETE FROM sqlite_master')
        }
        this.execute('PRAGMA user_version=0')
        this.execute('PRAGMA writable_schema=0')
      })
    } else {
      this.instance.close()
      if (this.instance.open) {
        throw new Error('Could not close database')
      }

      if (fs.existsSync(this.path)) {
        fs.unlinkSync(this.path)
      }
      if (fs.existsSync(`${this.path}-wal`)) {
        fs.unlinkSync(`${this.path}-wal`)
      }
      if (fs.existsSync(`${this.path}-shm`)) {
        fs.unlinkSync(`${this.path}-shm`)
      }

      this.open()
    }
  }

  isInMemoryDatabase = () => {
    return this.instance.memory
  }
}

export default Database
