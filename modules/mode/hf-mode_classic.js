/**
 * MODE: fldf-hf-mode_classic
 * =====================
 * Follow 30 users, like an image from the users, and defollow the first followed at 31 follow (in loop). This method is not detected from socialblade or similar software.
 * Also, follow hub-accounts with many followers to get their followers to follow us.
 *
 * @author:     Anders Green [@the_louie] <me@louie.se> (https://louie.se)
 * @license:    This code and contributions have 'GNU General Public License v3'
 *
 */

/**
 * reset database entries
 *
 * update temporary_follows set status='pending', follow_count = follow_count + 1 where status='defollowed' and followers > 1500 and (julianday('now') - julianday(updated_timestamp)) > 14 and followers < 1500000  ORDER BY points-((follow_count+1)*3) desc, random() limit 100;
 */

// function getText (linkText) {
//   linkText = linkText.replace(/\r\n|\r/g, '\n')
//   linkText = linkText.replace(/\ +/g, ' ')

//   // Replace &nbsp; with a space
//   var nbspPattern = new RegExp(String.fromCharCode(160), 'g')
//   return linkText.replace(nbspPattern, ' ')
// }

// function getMsSinceMidnight (d) {
//   var e = new Date(d !== undefined ? d : new Date())
//   return (d !== undefined ? d : new Date()) - e.setHours(0, 0, 0, 0)
// }

function getBatchEndTime () {
  const now = new Date().getTime()
  const r1 = 1 - Math.sqrt(1 - Math.random()) // weighted random, towards lower values
  const r2 = 1 - Math.sqrt(1 - Math.random()) // weighted random, towards lower values

  // random millisecond value around 10 minutes (-5 +10)
  const delta = (Math.floor(1200000 - (600000 * r1) + (300000 * r2)))
  return now + delta
}

// function stringify (o) {
//   var cache = []
//   return JSON.stringify(o, function (key, value) {
//       if (typeof value === 'object' && value !== null) {
//         if (cache.indexOf(value) !== -1) {
//           // Duplicate reference found
//           try {
//             // If this value does not reference a parent it can be deduped
//             return JSON.parse(JSON.stringify(value))
//               } catch (error) {
//             // discard key if value cannot be deduped
//             return
//               }
//         }
//         // Store value in our collection
//         cache.push(value)
//       }
//       return value
//   }, 2)
// }
function randomString (stringLen) {
  var result = ''
  for (var i = 0; i < stringLen; i++) {
    const cnum = 65 + (Math.floor(Math.random() * 26) + (Math.random() > 0.5 ? 32 : 0))
    result += String.fromCharCode(cnum)
  }
  return result
}

function weekdayRandom () {
  const day = (new Date()).getDay()
  return 1 + Math.abs((Math.cos(Math.PI + day / 2.5) + 1) / 13) + ((new Date()).getHours() / 200)
}

const ManagerState = require('../common/state').Manager_state

class HFModeClassic extends ManagerState {
  constructor (bot, config, utils, db) {
    super()
    this.bot = bot
    this.config = config
    this.utils = utils
    this.db = db['logs']
    // this.db_fldf = db["fldf"];
    this.LOG_NAME = 'hf_classic'
    this.STATE = require('../common/state').STATE
    this.STATE_EVENTS = require('../common/state').EVENTS
    this.Log = require('../logger/log')
    this.log = new this.Log(this.LOG_NAME, this.config)
    this.dayrest = false
  }

  /**
   * Database init
   * =====================
   * Save users nickname and other information
   *
   */
  async init_db () {
    let self = this

    await this.db.serialize(async function () {
      self.db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT, mode TEXT, username TEXT, photo_url TEXT, hashtag TEXT, type_action TEXT, inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP)', function (err) {
        if (err) {
          self.log.error(`init_db: ${err}`)
        }
      })

      self.db.run('ALTER TABLE users ADD COLUMN hashtag TEXT', function (err) {
        if (err) {
          self.log.info(`init_db users ADD COLUMN hashtag: ${err}`)
        }
      })

      self.db.run('ALTER TABLE users ADD COLUMN inserted_at DATETIME DEFAULT NULL', function (err) {
        if (err) {
          self.log.info(`init_db users ADD COLUMN inserted_at: ${err}`)
        }
      })

      self.db.run("CREATE TABLE IF NOT EXISTS liked_images (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATE DEFAULT (datetime('now','localtime')), account TEXT, username TEXT, photo_url TEXT)", function (err) {
        if (err) {
          self.log.error(`init_db liked_images: ${err}`)
        } else {
          self.log.info('init_db liked_images created')
        }
      })

      self.db.run(`CREATE TABLE IF NOT EXISTS temporary_follows (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      inserted_timestamp DATE DEFAULT (datetime('now','localtime')),
                      updated_timestamp DATE DEFAULT (datetime('now','localtime')),
                      account TEXT,
                      username TEXT,
                      followers INT,
                      status TEXT,
                      points INT
                  )`,
      function (err) {
        if (err) {
          self.log.error(`init_db temporary_follows: ${err}`)
        }
      }
      )

      self.db.run(`CREATE TABLE IF NOT EXISTS personal_stats (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      inserted_timestamp DATE DEFAULT (datetime('now','localtime')),
                      account TEXT,
                      following INT,
                      followers INT)`,
      function (err) {
        if (err) {
          self.log.error(`init_db temporary_follows: ${err}`)
        }
      }
      )
    })
  }

  /**
  * open user page
  * =====================
  * Open user page
  *
  */
  async openUserpageAndFollow (usernameCurrent) {
    return new Promise(async (resolve, reject) => {
      const that = this
      // that.log.info(`try open userpage ${usernameCurrent}`);

      try {
        //this.log.debug(`that.bot.goto(https://instagram.com/${usernameCurrent})`)
        that.bot.goto(`https://instagram.com/${usernameCurrent}`, {waitUntil: 'networkidle0', referer: 'https://instagram.com/'})
        const sleepTime = that.utils.random_interval(3, 5)
        // this.log.info(`that.utils.sleep(${sleepTime})`)
        await that.utils.sleep(sleepTime)

        // this.log.info(`wait for avatar ('section > main header span > img')`)
        await that.bot.waitForSelector('section > main header span > img', { timeout: 30000 })

        // this.log.info(`that.bot.waitForSelector('main header section span > span > button', { timeout: 30000 })`)
        await that.bot.waitForSelector(`main header section span > span > button`, { timeout: 30000 })
        // this.log.info(`that.bot.evaluate([... main header section span > span > button])`)
        const buttonBeforeClick = await that.bot.evaluate(el => el.innerHTML, await that.bot.$(`main header section span > span > button`))
        //this.log.debug(`buttonBeforeClick = ${buttonBeforeClick}`)

        if (buttonBeforeClick.toLowerCase() === 'following') {
          that.log.error(`Already following ${usernameCurrent}, checking next.`)
          await that.updateDBStatus(`following`, [usernameCurrent])
          const followers = await that.getFollowersCount(usernameCurrent)
          if (followers !== undefined && followers > 0) {
            await that.updateDBFollowers(usernameCurrent, followers)
          } else {
            this.log.warning(`Blacklisting ${usernameCurrent}.`)
            await this.updateDBStatus(`blacklisted`, [usernameCurrent])
          }
          that.emit(that.STATE_EVENTS.CHANGE_STATUS, that.STATE.OK)
          return resolve(false)
        }
      } catch (err) {
        await that.utils.screenshot(this.LOG_NAME, `_ERROR_missing-followbutton_${usernameCurrent}`)
        that.log.error(`openUserpageAndFollow (${usernameCurrent}): ${err} (https://instagram.com/${usernameCurrent})`)
        // that.emit(that.STATE_EVENTS.CHANGE_STATUS, that.STATE.ERROR);
        if (err.message.substr(0, 84) === `TimeoutError: waiting for selector "main header section span > span > button" failed`) {
          this.log.error(`Follow button is missing, quitting for today.`)
          that.dayrest = true
          return resolve(false)
        }
        this.log.warning(`Blacklisting ${usernameCurrent}.`)
        await this.updateDBStatus(`blacklisted`, [usernameCurrent])

        return resolve(false)
      }

      try {
        (await that.bot.$(`main header section span > span > button`)).click()
        await that.utils.sleep(that.utils.random_interval(1, 2))
        const buttonAfterClick = await that.bot.evaluate(el => el.innerHTML, await that.bot.$(`main header section span > span > button`))
        //this.log.debug(`buttonAfterClick = ${buttonAfterClick}`)
        if (buttonAfterClick.toLowerCase() !== 'following') {
          that.log.error(`Failed in following ${usernameCurrent}, follow button is still ${buttonAfterClick}.`)
          return resolve(false)
        }
      } catch (err) {
        // await that.utils.screenshot(this.LOG_NAME, `_ERROR_follow-click_${usernameCurrent}`);
        that.log.error(`openUserpageAndFollow(${usernameCurrent}): click: ${err}`)
        this.log.warning(`Blacklisting ${usernameCurrent}.`)
        await this.updateDBStatus(`blacklisted`, [usernameCurrent])

        return resolve(false)
      }

      try {
        await that.updateDBStatus(`following`, [usernameCurrent])
      } catch (err) {
        that.log.error(`openUserpageAndFollow(${usernameCurrent}): updateDBStatus: ${err}`)
        this.log.warning(`Blacklisting ${usernameCurrent}.`)
        await this.updateDBStatus(`blacklisted`, [usernameCurrent])

        return resolve(false)
      }

      try {
        const followers = await that.getFollowersCount(usernameCurrent)
        if (followers !== undefined && followers > 0) {
          await that.updateDBFollowers(usernameCurrent, followers)
        } else {
          this.log.warning(`Blacklisting ${usernameCurrent}.`)
          await this.updateDBStatus(`blacklisted`, [usernameCurrent])
        }
      } catch (err) {
        that.log.error(`openUserpageAndFollow(${usernameCurrent}): getFollowersCount: ${err}`)
        this.log.warning(`Blacklisting ${usernameCurrent}.`)
        await this.updateDBStatus(`blacklisted`, [usernameCurrent])

        return resolve(false)
      }

      that.updateDBFollowCount(usernameCurrent)

      that.emit(that.STATE_EVENTS.CHANGE_STATUS, that.STATE.OK)
      // this.log.info(`Following '${usernameCurrent}' and found ${} new pending.`)
      resolve(true)
    })
  }

  async getSuggestedAccountsFromPage (usernameCurrent) {
    // Add suggestions to array for later follow
    try {
      const suggestionsSelector = '#react-root > section > main > div > div:nth-child(3) > div > div > div > div > ul > li > div > div > div > div > a'
      await this.bot.waitForSelector(suggestionsSelector, { timeout: 5000 })
      const usernames = await this.bot.$$eval(suggestionsSelector, hrefs => hrefs.map((a) => a.href.replace('https://www.instagram.com/', '').replace(/\/$/, '')))
      return usernames
    } catch (err) {
      this.log.error('getSuggestedAccountsFromPage(): ' + err)
      await this.utils.screenshot(this.LOG_NAME, `getSuggestedAccountsFromPage_${usernameCurrent}`)
      // this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.ERROR);
      return []
    }
  }

  async insertIntoDB (status, usernames) {
    const that = this
    return new Promise(async (resolve, reject) => {
      let result = { new: 0, old: 0, err: 0 }
      await that.db.serialize(async function () {
        for (let i = 0; i < usernames.length; i++) {
          const username = usernames[i]
          // that.log.debug(`insertIntoDB(${status}, [${usernames.length}]): ${username} (${JSON.stringify(result)})`)
          const exists = await that.userExistsInDB(username)
          if (exists) {
            result.old++
            // that.log.debug(`insertIntoDB(): '${username} already exists, skipping (${JSON.stringify(result)})`)
            continue
          } else {
            try {
              await that.db.run(`INSERT INTO temporary_follows (inserted_timestamp, updated_timestamp, status, account, username) VALUES ((datetime('now','localtime')),(datetime('now','localtime')),?,?,?)`, [status, that.config.instagram_username, username])
              result.new++
              that.log.debug(`insertIntoDB(): '${username} new, adding to db (${JSON.stringify(result)})`)
            } catch (err) {
              that.log.warning(`Error when adding ${username}: ${err} (${JSON.stringify(result)})`)
              result.err++
            }
          }
        }
        // that.log.debug(`---- insertIntoDB () end => ${JSON.stringify(result)} ----`)
        resolve(result)
      })
    })
  }

  async updateDBStatus (status, usernames) {
    const that = this
    await this.db.serialize(async function () {
      usernames.forEach((username) => that.db.run(`UPDATE temporary_follows SET updated_timestamp=(datetime('now','localtime')), status=? WHERE account=? AND username=? `, [status, that.config.instagram_username, username]))
    })
  }

  async updateDBFollowCount (username) {
    const that = this
    return new Promise((resolve, reject) => {
      that.db.run(`UPDATE temporary_follows SET follow_count=follow_count + 1 WHERE account=? AND username=? `, [that.config.instagram_username, username], (err) => {
        if (err) return reject(err)
        else resolve()
      })
    })
  }

  async updateMyStats (account, followers, following) {
    const that = this
    return new Promise((resolve, reject) => {
      that.db.run(`INSERT INTO personal_stats (inserted_timestamp, followers, following, account) VALUES (datetime('now','localtime'),?,?,?)`,
        [followers, following, account],
        (err) => {
          if (err) { return reject(err) } else { return resolve() }
        }
      )
    })
  }
  async updateDBFollowers (username, followers) {
    const that = this
    return new Promise((resolve, reject) => {
      that.db.run(`UPDATE temporary_follows SET
                  updated_timestamp=(datetime('now','localtime')),
                  followers=?
              WHERE
                  account=?
                  AND username=?`,
      [followers, that.config.instagram_username, username],
      (err) => {
        if (err) { return reject(err) } else { return resolve() }
      }
      )
    })
  }
  async UpdateDBUser (status, username, followers) {
    const that = this
    return new Promise((resolve, reject) => {
      that.db.run(`UPDATE temporary_follows SET updated_timestamp=(datetime('now','localtime')), status=?, followers=? WHERE account=? AND username=? `, [status, followers, that.config.instagram_username, username], (err) => {
        if (err) {
          return reject(err)
        } else {
          resolve(true)
        }
      })
    })
  }
  async getPendingUsernamesFromDB (limit) {
    const that = this
    return new Promise(function (resolve, reject) {
      that.db.all(`SELECT username, followers, follow_count, points FROM temporary_follows WHERE status='pending' AND account = ? and followers > 500 ORDER BY follows_back desc,  points-((follow_count+1)*3) desc, random() limit ?`, [that.config.instagram_username, limit], function (err, rows) {
        if (err || rows === undefined) {
          that.log.warning(`getUsernamesFromDB(${limit}): ${err}`)
          return reject(err)
        }
        resolve(rows)
        // resolve(rows.map((u) => u.username));
      })
    })
  }
  async getUsernamesFromDB (status) {
    const that = this
    return new Promise(function (resolve, reject) {
      that.db.all(`SELECT username FROM temporary_follows WHERE status=? AND account = ? ORDER BY updated_timestamp ASC`, [status, that.config.instagram_username], function (err, rows) {
        if (err || rows === undefined) {
          that.log.warning(`getUsernamesFromDB(${status}): ${err}`)
          return reject(err)
        }
        resolve(rows.map((u) => u.username))
      })
    })
  }
  async getUsernamesWithoutFollowersFromDB (limit) {
    const that = this
    return new Promise(function (resolve, reject) {
      that.db.all(`SELECT username FROM temporary_follows WHERE account = ? AND followers is null and status != 'blacklisted' ORDER BY points, updated_timestamp asc, random() LIMIT ?`, [that.config.instagram_username, limit], function (err, rows) {
        if (err || rows === undefined) {
          that.log.warning(`getUsernamesFromDB(${limit}): ${err}`)
          return reject(err)
        }
        resolve(rows.map((u) => u.username))
      })
    })
  }
  async getDefollowUsernamesFromDB (limitAmount, days) {
    const that = this
    return new Promise(function (resolve, reject) {
      that.db.all(`SELECT username FROM temporary_follows WHERE status='following' AND (julianday('now') - julianday(updated_timestamp)) > ? AND account = ? ORDER BY random() LIMIT ?`, [days, that.config.instagram_username, limitAmount], function (err, rows) {
        if (err || rows === undefined) {
          that.log.warning(`getDefollowUsernamesFromDB(): ${err}`)
          return reject(err)
        }
        resolve(rows.map((u) => u.username))
      })
    })
  }
  async followingUser (username) {
    const that = this
    return new Promise((resolve, reject) => {
      that.db.get(`SELECT status FROM temporary_follows WHERE account = ? AND username = ?`, [that.config.instagram_username, username], (err, row) => {
        if (err) {
          that.log.warning(`followingUser(${username}): ${err} (${row})`)
          return reject(err)
        }
        // that.log.debug(`executed query returninig ${row.status}`)
        resolve((row !== undefined && row.status === 'following')) // return true if we're following the user, else false
      })
    })
  }
  async userExistsInDB (username) {
    const that = this
    return new Promise((resolve, reject) => {
      that.db.get(`SELECT count(*) c FROM temporary_follows WHERE  username = ?`, [username], (err, row) => {
        if (err) {
          that.log.warning(`followingUser(${username}): ${err} (${row})`)
          return reject(err)
        }
        // that.log.debug(`executed query returninig ${row.status}`)
        resolve((row !== undefined && row.c > 0)) // return true if we're following the user, else false
      })
    })
  }
  async followingCount () {
    const that = this
    return new Promise((resolve, reject) => {
      that.db.get(`SELECT count(*) c FROM temporary_follows WHERE status='following' or status='whitelisted'`, (err, row) => {
        if (err) {
          that.log.warning(`followingCount(): ${err} (${row})`)
          return reject(err)
        }
        resolve(row !== undefined ? row.c : 0)
      })
    })
  }
  async reactivateOldFollows (max) {
    const that = this
    return new Promise((resolve, reject) => {
      that.db.run(`update temporary_follows set status='pending', follow_count = follow_count + 1 where status='defollowed' and followers > 1000 and (julianday('now') - julianday(updated_timestamp)) > 2 and followers < 500000  ORDER BY (type = 'hub') desc, round(followers/1000) desc, random() limit 100`, (err) => {
        if (err) {
          that.log.warning(`reactivateOldFollows(${max}): ${err}`)
          return reject(err)
        }
        resolve(true)
      })
    })
  }

  async adjustPoints (username, points) {
    const that = this
    return new Promise((resolve, reject) => {
      that.db.run(`update temporary_follows set points = points + ? where account = ? and username = ?`, [points, that.config.instagram_username, username], (err) => {
        if (err) { return reject(err) }
        resolve(true)
      })
    })
  }

  async followAndFindSuggestions () {
    // this.log.info(`cache array size ${cacheUserFollows.length}`);

    // Get an username that we're not already following (according to database)
    let usernameCurrent = ''
    do {
      const pendingUsers = await this.getPendingUsernamesFromDB(1)
      if (pendingUsers.length <= 0) {
        this.log.error(`No pending suggestions in database.`)
        return 0
      }
      usernameCurrent = pendingUsers[0].username
      // usernameCurrent = cacheUserFollows.splice(Math.random()*cacheUserFollows.length,1)[0] // get random element from array
      this.log.info(`followAndFindSuggestions([${pendingUsers.length}]) Popped username: '${usernameCurrent}' (${pendingUsers[0].followers})`)
    } while (await this.followingUser(usernameCurrent) && usernameCurrent !== undefined)

    if (usernameCurrent !== undefined) {
      if (await this.openUserpageAndFollow(usernameCurrent)) {
        // FIXME: Välj ut ett antal bilder och gilla
        // const newUsers = (await this.getSuggestedAccountsFromPage()).filter((u) => cacheUserFollows.indexOf(u) === -1) // filer known users
        const newUsers = await this.getSuggestedAccountsFromPage(usernameCurrent)
        if (newUsers.length > 0) {
          // this.log.debug(`Found ${newUsers.length} new pending accounts.`)
          const insertCount = await this.insertIntoDB(`pending`, newUsers)
          this.log.info(`Suggestion scrape result: ${insertCount.new} new, ${insertCount.old} old, ${insertCount.err} errors.`)
          // cacheUserFollows = cacheUserFollows.concat(newUsers)
        } else {
          this.log.debug(`Found no new suggestions, moving on`)
        }

        await this.likeUsersImages(usernameCurrent)

        return 1
      } else {
        // wasn't possible to follow, probably private account. blacklist it.
      }
    }
    return 0
  }

  async defollowOldUsers (followCount, followRate) {
    const that = this
    // const defollow_target = (followCount > followRate) ? (Math.floor(Math.random()*5)) : 1
    // const usercountToDefollow = Math.floor(Math.random() * Math.min(defollow_target, 31)) + 2 // at least defollow two users
    const usercountToDefollow = (followCount > followRate) ? (Math.floor(Math.random() * 4)) + 1 : 1
    const hfDefollowLag = this.config.hf_defollow_lag + Math.random()
    const dbUsersToDefollow = await that.getDefollowUsernamesFromDB(999, hfDefollowLag)
    this.log.debug(`Trying to defollow ${usercountToDefollow} users, found ${dbUsersToDefollow.length} older that ${Math.round(hfDefollowLag * 100) / 100} days.`)
    let actuallyDefollowed = []
    let usercountToDefollowSkip = 0
    for (let i = 0; i < usercountToDefollow + usercountToDefollowSkip && i < dbUsersToDefollow.length; i++) {
      const usernameCurrent = dbUsersToDefollow[i]
      that.log.info(`Defollowing ${i + 1}/${usercountToDefollow + 1} '${usernameCurrent}'.`)
      try {
        await this.bot.goto(`https://instagram.com/${usernameCurrent}/`, {waitUntil: 'domcontentloaded'})
        await this.utils.sleep(this.utils.random_interval(1, 2))
        const newStatus = await that.fdfClickDefollow(usernameCurrent)
        that.updateDBStatus(newStatus, [usernameCurrent])
        if (newStatus === 'defollowed') {
          actuallyDefollowed.push(usernameCurrent)
        } else {
          that.log.warning(`Failed in defollowing '${usernameCurrent}'.`)
          usercountToDefollowSkip += 1
        }
      } catch (err) {
        this.log.error(`defollowOldUsers(): ${err}`)
        usercountToDefollowSkip += 1
      }
    }
    this.log.info(`Defollowed ${actuallyDefollowed.length} users`)
    return actuallyDefollowed.length
    // return cacheUserFollows.filter((u) => actually_defollowed.indexOf(u) === -1)
  }

  async getFollowersCount (usernameCurrent) {
    // this.log.debug(`getFollowersCount(${usernameCurrent})`)
    // await this.utils.sleep(this.utils.random_interval(2,3))
    try {
      const followerSelector = `span[title]:not([title="Verified"i])`
      await this.bot.waitForSelector(followerSelector, { timeout: 10000 })
      const followers = await this.bot.$$eval(followerSelector, spans => spans.map((el) => parseInt(el.title.replace(/,/g, ''))))

      if (followers.length > 0) {
        // this.log.debug(`${followers[0]}`)
        const followersCount = followers[0]
        // this.log.debug(`followers: '${usernameCurrent}' ${followersCount}`)
        return followersCount
      } else {
        this.log.debug(`didn't find any elements matching followers span for '${usernameCurrent}'`)
        return undefined
      }
    } catch (err) {
      this.log.error(`getFollowersCount(${usernameCurrent}): ${err}`)
      return -1
    }
  }

  async getFollowingCount (usernameCurrent) {
    // this.log.debug(`getFollowersCount(${usernameCurrent})`)
    // await this.utils.sleep(this.utils.random_interval(2,3))
    try {
      const followerSelector = `#react-root > section > main > div > header > section > ul > li:nth-child(3) > a > span`
      await this.bot.waitForSelector(followerSelector, { timeout: 10000 })
      const follows = await this.bot.$$eval(followerSelector, spans => spans.map((el) => parseInt(el.innerText.replace(/,/g, ''))))

      if (follows.length > 0) {
        // this.log.debug(`${follows[0]}`)
        const followsCount = follows[0]
        // this.log.debug(`follows: '${usernameCurrent}' ${followsCount}`)
        return followsCount
      } else {
        this.log.debug(`didn't find any elements matching follows span for '${usernameCurrent}'`)
        return undefined
      }
    } catch (err) {
      this.log.error(`getFollowersCount(${usernameCurrent}): ${err}`)
      return undefined
    }
  }

  async getFollowersForPending (minimum) {
    return new Promise(async (resolve, reject) => {
      const processUserCount = Math.floor(Math.random() * 13) + (minimum === undefined ? 3 : minimum)
      const pendingUsers = await this.getUsernamesWithoutFollowersFromDB(processUserCount)
      let successCount = 0
      for (let i = 0; i < pendingUsers.length; i += 1) {
        const usernameCurrent = pendingUsers[i]
        await this.bot.goto(`https://instagram.com/${usernameCurrent}`, {waitUntil: 'domcontentloaded'})
        const followers = await this.getFollowersCount(usernameCurrent)
        if (followers !== undefined && followers > 0) {
          await this.updateDBFollowers(usernameCurrent, followers)
          successCount += 1
        } else {
          this.log.warning(`Blacklisting ${usernameCurrent}.`)
          await this.updateDBStatus(`blacklisted`, [usernameCurrent])
        }
        await this.utils.sleep(this.utils.random_interval(1, 3))
      }
      if (pendingUsers.length !== 0) {
        this.log.info(`Checked followers for ${pendingUsers.length} success for ${successCount}`)
      }
      resolve(pendingUsers.length)
    })
  }

  /**
   * Fdfmode_classic: Defollow me
   * =====================
   * Click on defollow and verify if instagram not (soft) ban you
   *
   */
  async fdfClickDefollow (usernameCurrent) {
    // this.log.info(`fdfClickDefollow(${usernameCurrent})`);

    try {
      await this.bot.waitForSelector(`body.p-error`, {timeout: 2000})
      this.log.error(`The page contains an error-message, skipping.`)
      await this.utils.screenshot(this.LOG_NAME, `fdfClickDefollow_${usernameCurrent}_body_error`)
      return
    } catch (err) {
      // this.log.debug(`No error found within 2s`)
    }

    let username = ''
    let retry = 0
    do {
      try {
        await this.bot.waitForSelector('header section h1')
        username = await this.bot.evaluate(el => el.innerHTML, await this.bot.$('header section h1'))
      } catch (err) {
        this.log.warning(`Get username (${username}) resulted in: ${err}`)
        await this.bot.reload()
        const sleeptime = this.utils.random_interval(3, 6)
        await this.utils.sleep(sleeptime)
      }
      retry++
      const sleeptime = this.utils.random_interval(1, 2)

      await this.utils.sleep(sleeptime)
    } while (retry <= 2)

    if (username.toLowerCase() !== usernameCurrent.toLowerCase()) {
      this.log.warning(`Defollow username missmatch (current/intedned) '${username}' !== '${usernameCurrent}'`)
      this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.OK)
      return 'blacklisted' // false
    }

    try {
      await this.bot.waitForSelector('header section div:nth-child(1) button')
      let button = await this.bot.$('header section div:nth-child(1) button')
      let buttonBeforeClick = await this.bot.evaluate(el => el.innerHTML, await this.bot.$('header section div:nth-child(1) button'))
      // this.log.info(`button text before click: ${buttonBeforeClick}`);

      if (buttonBeforeClick.toLowerCase() === 'following') {
        await button.click()

        await this.utils.sleep(this.utils.random_interval(2, 3))

        await this.bot.waitForSelector('div[role="dialog"] div > div:nth-child(3) button:nth-child(1)')
        let buttonConfirm = await this.bot.$('div[role="dialog"] div > div:nth-child(3) button:nth-child(1)')

        await buttonConfirm.click()

        await this.utils.sleep(this.utils.random_interval(1, 2))

        await this.bot.waitForSelector('header section div:nth-child(1) button')
        await this.bot.$('header section div:nth-child(1) button')
        let buttonAfterClick = await this.bot.evaluate(el => el.innerHTML, await this.bot.$('header section div:nth-child(1) button'))
        // this.log.debug(`button after click: ${buttonAfterClick}`)
        // await this.utils.screenshot(this.LOG_NAME, `defollow_${usernameCurrent}`);

        if (buttonAfterClick !== buttonBeforeClick) {
          this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.OK)
          await this.adjustPoints(usernameCurrent, 1)
          return 'defollowed' // true
        } else {
          this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.OK)
          return 'following' // false
        }
      } else {
        this.log.warning(`Can't defollow, not following '${usernameCurrent}'.`)
        await this.adjustPoints(usernameCurrent, -3)

        this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.OK)
        return 'defollowed' // true
      }
    } catch (err) {
      this.log.warning(`Defollow error for (${usernameCurrent}): ${err}`)
      this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.ERROR)
    }

    // await this.utils.sleep(this.utils.random_interval(3, 6));

    // await this.utils.screenshot(this.LOG_NAME, "last_defollow_after");
  }

  async exploreSuggestedPeople () {
    const that = this
    const baseUrl = `https://instagram.com/explore/people/suggested/?${randomString(Math.floor(Math.random() * 10))}=${randomString(Math.floor(Math.random() * 10))}`
    await this.bot.goto(baseUrl, {load: 'domcontentloaded'}, {waitUntil: 'domcontentloaded'})

    const suggestionsSelector = `#react-root > section > main > div > div > div > div > div`
    try {
      await this.bot.waitForSelector(suggestionsSelector)
    } catch (err) {
      this.log.error(err)
      return false
    }

    let oldSuggestionCount = 0
    let allSuggestions = []
    let i = 0

    do {
      // Scroll down
      await this.bot.evaluate(_ => { window.scrollTo(0, document.body.scrollHeight) })
      await this.utils.sleep(this.utils.random_interval(1, 2))

      // get all buttons
      oldSuggestionCount = allSuggestions.length
      try {
        await this.bot.waitForSelector(suggestionsSelector, { timeout: 10000 })
      } catch (err) {
        this.log.error(err)
        process.exit(1)
      }
      allSuggestions = await this.bot.$$(suggestionsSelector)
      i += 1
    } while (allSuggestions.length > oldSuggestionCount && i < 10)

    let validSuggestions = []
    let miscErrors = 0
    if (allSuggestions.length > 0) {
      // filter out all suggestions that contains "New to instagram" "Friend on facebook" or "Follows you"
      for (let i = 0; i < allSuggestions.length; i += 1) {
        const childNode = allSuggestions[i]
        let username
        try {
          username = await this.bot.evaluate(el => el.children[1].children[0].children[0].children[0].href.replace(/^.*\/([^\/]+)\/$/, '$1'), childNode)
        } catch (err) {
          this.log.error(`looping suggestion ${i}, getting user: ${err}`)
          await that.utils.screenshot(this.LOG_NAME, `_ERROR_suggestions_${i}`)
          miscErrors += 1
          continue
        }

        let followState
        try {
          // this.log.info(`username:\n${JSON.stringify(username)}\n`)
          followState = (await this.bot.evaluate(el => el.children[1].children[2].innerText, childNode))
        } catch (err) {
          this.log.error(`looping suggestion ${i}, getting follow state for ${username}: ${err}`)
          await that.utils.screenshot(this.LOG_NAME, `_ERROR_suggestions_${username}_${i}`)
          miscErrors += 1
          continue
        }

        try {
          if (followState === undefined) {
            this.log.error(`followState is undefined for ${username || 'undefined'}`)
            continue
          }
          if (followState.trim().toLowerCase().indexOf('followed by') !== -1 || followState.trim().toLowerCase().indexOf('follows you') !== -1) {
            validSuggestions.push(username)
          } else {
            continue
          }
        } catch (err) {
          this.log.error(`looping suggestion ${i}, parsing follow state for ${username}: ${err}`)
          await that.utils.screenshot(this.LOG_NAME, `_ERROR_suggestions_${i}`)
          miscErrors += 1
          continue
        }
      }

      // this.log.info(`Found ${validSuggestions.length} new pending usernames.`)
      const insertCount = await this.insertIntoDB(`pending`, validSuggestions)
      this.log.info(`Suggestion scrape result: ${insertCount.new} new, ${insertCount.old} old, ${insertCount.err + miscErrors} errors.`)
    } else {
      return false
    }
  }

  async getPersonalStats (usernameCurrent) {
    await this.bot.goto(`https://instagram.com/${usernameCurrent}`, {waitUntil: 'domcontentloaded'})
    const followers = await this.getFollowersCount(usernameCurrent)
    const following = await this.getFollowingCount(usernameCurrent)
    this.log.info(`MYSTAT: followers: ${followers} following: ${following}`)
    if (followers !== undefined && following !== undefined && followers > 0) {
      await this.updateMyStats(this.config.instagram_username, followers, following)
    }
    await this.utils.sleep(this.utils.random_interval(1, 3))
  }

  /**
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   */
  async likeUsersImages (usernameCurrent) {
    // LOUIE -- like also
    // this.log.info(`likeUsersImages(${usernameCurrent})`)

    // GET list of images
    // $$('article > div > div > div > div > a')
    const imageSelector = `article > div > div > div > div > a`
    try {
      await this.bot.waitForSelector(imageSelector)
    } catch (err) {
      this.log.error(`likeUsersImages(${usernameCurrent}): ${err}`)
      return false
    }
    // const images = await this.bot.$$(`article > div > div > div > div > a`)
    // this.log.debug(`Found ${images.length} images to like`)
    // GET HREF
    // const urls = await this.bot.$$eval(images, hrefs => hrefs.map((a) => a.href))
    const urls = await this.bot.$$eval(imageSelector, hrefs => hrefs.map((a) => a.href))

    // this.log.debug(`Found urls:\n${JSON.stringify(urls, null , 2)}`)
    // this.log.debug(`Found ${urls.length} urls to like`)

    const likeCount = Math.floor(Math.min(urls.length / 2, Math.floor((Math.random() * this.config.bot_superlike_n_m[1]) + this.config.bot_superlike_n_m[0])))

    // const max_like = this.config.bot_superlike_n_m[0] + this.config.bot_superlike_n_m[1];
    // this.log.debug(`Aiming for a likecount of ${likeCount}`)

    // I know this is skewed towards lower values but it's intentional. It looks
    // more natural to like recent images.
    urls.sort(function () {
      return 0.5 - Math.random()
    })

    let likeCountOffset = 0
    for (let i = 0; i < likeCount + likeCountOffset && i < urls.length; i++) {
      //this.log.info(`like photo #${i + 1}/${likeCount} (${urls[i]})`)
      let likeSuccess = false
      try {
        await this.bot.goto(urls[i])
        await this.utils.sleep(this.utils.random_interval(1, 3))
        likeSuccess = await this.likeClickHeart(usernameCurrent, urls[i])
      } catch (e) {
        console.error(`Exception: ${e}`)
      }
      if (!likeSuccess) {
        likeCountOffset += 1
      }
      this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.OK)
      await this.utils.sleep(this.utils.random_interval(1, 3))
      if (await this.utils.keep_alive() === false) {
        break
      }
    }

    this.log.info(`Liked ${likeCount} images.`)
    // LOUIE - like also end
  }

  async likeClickHeart (usernameCurrent, photoCurrent) {
    const that = this
    try {
      await this.bot.waitForSelector('article:nth-child(1) section:nth-child(1) button:nth-child(1)')
      let button = await this.bot.$('article:nth-child(1) section:nth-child(1) button:nth-child(1)')
      let buttonIcon = await this.bot.$('article:nth-child(1) section:nth-child(1) button:nth-child(1) span')
      let classNames = await (await buttonIcon.getProperty('className')).jsonValue()

      if (classNames.indexOf('outline') !== -1) { // like button is not filled
        await button.click()

        let buttonIcon = await this.bot.$('article:nth-child(1) section:nth-child(1) button:nth-child(1) span')
        let classNames = await (await buttonIcon.getProperty('className')).jsonValue()
        if (classNames.indexOf('filled') !== -1) { // like button have changed class to fille
          this.db.run('INSERT INTO liked_images (account, username, photo_url) VALUES (?, ?, ?)', that.config.instagram_username, usernameCurrent, photoCurrent, (err) => {
            if (err) {
              this.log.error(`db insert liked_images: ${err}`)
            }
          })
        }
        return true
      } else {
        this.log.warning(`</3 (liked previously)`)
        return false
      }
    } catch (err) {
      // this.log.warning(`</3 ${err}`);
      // this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.ERROR);
      this.log.error(err)
      return false
    }
  }

  /**
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   *
   */
  /**
   * HubFollow Mode Classic Flow
   * =====================
   *
   */
  async start () {
    this.log.info('Hub-Follow')

    // Load seed from config
    let cacheUserFollows = this.config.hub_accounts ? this.config.hub_accounts : []

    // let today = ''

    await this.init_db()

    const DBcacheUserFollows = await this.getUsernamesFromDB(`pending`)
    cacheUserFollows = cacheUserFollows.concat(DBcacheUserFollows)

    let batchEndTime = getBatchEndTime()

    await this.getPersonalStats(this.config.instagram_username)
    await this.exploreSuggestedPeople()

    let followedToday = 0
    let defollowedToday = 0
    const followMaxDay = 69
    const slowMultiplier = 8

    // Seed some pending users
    // await this.getFollowersForPending(10)

    let batchStartTime = new Date()
    let batchCount = 0
    do {
      try {
        this.log.debug(`---------------------------------------------`)
        // let slowFactor = Math.max(0.0000000000001, (followedToday + defollowedToday)) / followMaxDay
        let slowFactor = (followedToday + defollowedToday + 1) / followMaxDay * (slowMultiplier - 1) + 1
        this.log.info(`Batch ${batchCount} ${batchStartTime}-${new Date(batchEndTime)}, followed today: ${followedToday}, defollowed today: ${defollowedToday}, slowFactor: ${slowFactor}. (f+d: ${followedToday + defollowedToday}/${followMaxDay}).`)
        // this.log.debug(`---------------------------------------------`)
        if (!await this.utils.keep_alive()) { break }

        /**
           * Find people to follow
           */
        const followCount = await this.followingCount()
        const followRate = Math.floor(this.config.bot_followrotate * weekdayRandom() * 0.6) // temporary: lower target with x0.8 to get down to 0 non whitelisted eventually
        const followFactorQ = (Math.random() - 0.3)
        const followFactor = (followCount - followRate) * followFactorQ
        this.log.info(`Now following: ${followCount}, target follow count: ${followRate}. followFactor: ${followFactor} (${followFactorQ}).`)

        if (followFactor < 0) {
          // follow users
          const newFollowTarget = Math.floor(Math.random() * 5)
          for (let i = 0; i < newFollowTarget; i += 1) {
            const newFollowCount = await this.followAndFindSuggestions()
            followedToday += newFollowCount
            await this.utils.sleep(this.utils.random_interval(2, 4))
          }
        } else {
          // Defollow users
          const defollowCount = await this.defollowOldUsers(followCount, followRate)
          defollowedToday += defollowCount

        }
        await this.getFollowersForPending(Math.floor(Math.random() * 20) + 1)

        // Sleep between 7 and 45 minutes after each batch
        if ((new Date().getTime()) > batchEndTime) {
          // Get the followers count for a couple of the pending users
          const r = 1 - Math.sqrt(1 - Math.random()) // weighted random, towards lower values
          const sleepTime = ((r * 2700000) + 420000) * slowFactor
          this.log.info(`Sleeping for ${Math.round(Math.floor((sleepTime / 1000) / 60) * 10) / 10} minutes (s_m: ${slowMultiplier}, s_f: ${slowFactor}).`)
          await this.utils.sleep(Math.floor(sleepTime))
          batchEndTime = getBatchEndTime()
          // batch_size = Math.floor(Math.random() * 25)
          // batch_iterator = 0
        } else {
          const r = 1 - Math.sqrt(1 - Math.random()) // weighted random, towards lower values
          const sleepTime = ((r * 12000) + 2000) * slowFactor // milliseconds
          this.log.info(`Sleeping for ${Math.round(Math.floor((sleepTime / 1000)) * 10) / 10} seconds (s_m: ${slowMultiplier}, s_f: ${slowFactor}).`)
          await this.utils.sleep(sleepTime)
          // batch_iterator += 1
        }

        if (this.dayrest || (followedToday + defollowedToday) > followMaxDay) {
          await this.getPersonalStats(this.config.instagram_username)
          let sleepUntil = new Date()
          sleepUntil.setTime(new Date().getTime() + 86400000)
          sleepUntil.setHours(Math.floor(Math.random()*6 + 7))
          this.log.info(`Sleeping until morning ${sleepUntil}`)
          while ((new Date()) < sleepUntil) {
            let followersResult = await this.getFollowersForPending(Math.floor(Math.random() * 20) + 1)
            if (followersResult !== 0) {
              this.log.info(`Sleeping until morning ${sleepUntil}`)
            }
            await this.utils.sleep(this.utils.random_interval(3600, 7200)) // sleep for 1-2 hours
          }
          batchStartTime = new Date()
          batchEndTime = getBatchEndTime()
          batchCount += 1
          followedToday = 0
          defollowedToday = 0
        }
        // await this.reactivateOldFollows(100)
      } catch (e) {
        this.log.error(e)
        process.exit(1)
      }
    } while (cacheUserFollows.length)
  }
}

module.exports = (bot, config, utils, db) => {
  return new HFModeClassic(bot, config, utils, db)
}
