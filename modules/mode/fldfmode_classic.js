/**
 * MODE: fldfmode_classic
 * =====================
 * Follow 30 users, like an image from the users, and defollow the first followed at 31 follow (in loop). This method is not detected from socialblade or similar software.
 *
 * @author:     Anders Green [@the_louie] <me@louie.se> (https://louie.se)
 * @license:    This code and contributions have 'GNU General Public License v3'
 *
 */
const Manager_state = require("../common/state").Manager_state;
class Fldfmode_classic extends Manager_state {
    constructor (bot, config, utils, db) {
        super();
        this.bot = bot;
        this.config = config;
        this.utils = utils;
        this.db = db["logs"];
        this.db_fldf = db["fldf"];
        this.cache_hash_tags = [];
        this.photo_liked = [];
        this.photo_current = "";
        this.username_current = "";
        this.cache_hash_tags_user = [];
        this.LOG_NAME = "fldf_classic";
        this.STATE = require("../common/state").STATE;
        this.STATE_EVENTS = require("../common/state").EVENTS;
        this.Log = require("../logger/log");
        this.log = new this.Log(this.LOG_NAME, this.config);
    }

    /**
     * Database init
     * =====================
     * Save users nickname and other information
     *
     */
    async init_db () {
        let self = this;

        await this.db.serialize(async function () {
            self.db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT, mode TEXT, username TEXT, photo_url TEXT, hashtag TEXT, type_action TEXT, inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP)", function (err) {
                if (err) {
                    self.log.error(`init_db: ${err}`);
                }
            });

            self.db.run("ALTER TABLE users ADD COLUMN hashtag TEXT", function (err) {
                if (err) {
                    self.log.info(`init_db users ADD COLUMN hashtag: ${err}`);
                }
            });

            self.db.run("ALTER TABLE users ADD COLUMN inserted_at DATETIME DEFAULT NULL", function (err) {
                if (err) {
                    self.log.info(`init_db users ADD COLUMN inserted_at: ${err}`);
                }
            });

            self.db.run("CREATE TABLE IF NOT EXISTS liked_images (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATE DEFAULT (datetime('now','localtime')), account TEXT, username TEXT, photo_url TEXT)", function (err) {
                if (err) {
                    self.log.error(`init_db liked_images: ${err}`)
                } else {
                    self.log.info('init_db liked_images created')
                }
            })

        });

        await this.db_fldf.serialize(async function () {
            self.db_fldf.run("CREATE TABLE IF NOT EXISTS fldf (id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT, username TEXT, photo_url TEXT, hashtag TEXT, type_fldf TEXT, inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP)", function (err) {
                if (err) {
                    self.log.error(`init_db_fldf: ${err}`);
                }
            });

            self.db_fldf.run("ALTER TABLE fldf ADD COLUMN hashtag TEXT", function (err) {
                if (err) {
                    self.log.info(`init_db_fldf fldf ADD COLUMN hashtag: ${err}`);
                }
            });

            self.db_fldf.run("ALTER TABLE fldf ADD COLUMN inserted_at DATETIME DEFAULT NULL", function (err) {
                if (err) {
                    self.log.info(`init_db_fldf fldf ADD COLUMN inserted_at: ${err}`);
                }
            });
        });
    }

    // /**
    //  * Get photo url from cache
    //  * =====================
    //  * @return {string} url
    //  *
    //  */
    // get_photo_url () {
    //     let photo_url = "";
    //     do {
    //         photo_url = this.cache_hash_tags.pop();
    //     } while (typeof photo_url === "undefined" && this.cache_hash_tags.length > 0);

    //     return photo_url;
    // }


    /**
     * Is image in liked images table
     * =====================
     * SQL get return if image in liked_images table
     *
     */
    async is_liked_in_db (photo_url) {
        let self = this;
        return new Promise(function (resolve, reject) {
            self.db.get('SELECT count(*) as c from liked_images where photo_url like ?', photo_url, function (err, row) {
                if (err) {
                    self.log.warning(`is_liked_in_db() error select ${err}`);
                    return reject(err)
                }
                resolve(row !== undefined && row.c !== 0);
            });
        });
    }

    /**
     * Get photo url from cache
     * @return {string} url
     */
    async get_photo_url (type) {
        let photo_url = "";
        do {
            if (type === "hashtag") {
                photo_url = this.cache_hash_tags.pop();
            } else {
                // Weighted random towards newer images
                const n = Math.floor((1 - Math.sqrt(1 - Math.random())) * this.cache_hash_tags_user.length);
                photo_url = this.cache_hash_tags_user[n];
            }
            if (await this.is_liked_in_db(photo_url)) {
                this.log.debug(`Image in liked_images table ${photo_url}`)
            }
        } while ((typeof photo_url === "undefined") && (this.cache_hash_tags.length > 0 || this.cache_hash_tags_user > 0) && await this.is_liked_in_db(photo_url));

        return photo_url;
    }

    /**
     * Fldfmode_classic: Open Hashtag
     * =====================
     * Get random hashtag from array and open page
     *
     */
    async fldf_open_hashtagpage () {
        this.hashtag_tag = this.utils.get_random_hash_tag();
        this.log.info(`current hashtag ${this.hashtag_tag}`);
        try {
            this.log.debug(`Goto: https://www.instagram.com/explore/tags/${this.hashtag_tag}/`);
            await this.bot.goto(`https://www.instagram.com/explore/tags/${this.hashtag_tag}/`);
        } catch (err) {
            this.log.error(`goto ${err}`);
        }

        await this.utils.sleep(this.utils.random_interval(1, 6));

        await this.utils.screenshot(this.LOG_NAME, "last_hashtag");
    }

    /**
     * Fldfmode_classic: Open Photo
     * =====================
     * Open url of photo and cache urls from hashtag page in array
     *
     */
    async fldf_get_urlpic () {
        this.log.info("fldf_get_urlpic");

        let photo_url = "";

        if (this.cache_hash_tags.length <= 0) {
            try {
                this.cache_hash_tags = await this.bot.$$eval("article a", hrefs => hrefs.map((a) => {
                    return a.href;
                }));

                await this.utils.sleep(this.utils.random_interval(10, 15));

                if (this.utils.is_debug()) {
                    this.log.debug(`array photos ${this.cache_hash_tags.join(" ")}`);
                }

                photo_url = await this.get_photo_url("hashtag");

                this.log.info(`current photo url ${photo_url}`);
                if (typeof photo_url === "undefined") {
                    this.log.warning("check if current hashtag have photos, you write it good in config.js? Bot go to next hashtag.");
                    photo_url = await this.get_photo_url("hashtag");
                    if (photo_url == "" || typeof photo_url === "undefined") {
                        this.cache_hash_tags = [];
                    }
                }

                await this.utils.sleep(this.utils.random_interval(1, 6));

                if (this.cache_hash_tags.length > 0) {
                    this.log.debug(`Goto: ${photo_url}`);
                    await this.bot.goto(photo_url);
                }
            } catch (err) {
                this.cache_hash_tags = [];
                this.log.error(`fldf_get_urlpic error ${err}`);
                await this.utils.screenshot(this.LOG_NAME, "fldf_get_urlpic_error");
            }
        } else {
            photo_url = await this.get_photo_url("hashtag");

            this.log.info(`current photo url from cache ${photo_url}`);
            await this.utils.sleep(this.utils.random_interval(1, 6));

            try {
                this.log.debug(`Goto: ${photo_url}`);
                await this.bot.goto(photo_url);
            } catch (err) {
                this.log.error(`goto ${err}`);
            }
        }

        if (this.cache_hash_tags.length > 0) {
            this.photo_current = photo_url.split("?tagged")[0];
            if (typeof photo_url !== "undefined") {
                if (typeof this.photo_liked[this.photo_current] === "undefined") {
                    this.photo_liked[this.photo_current] = 1;
                } else {
                    this.photo_liked[this.photo_current]++;
                }

            }
            await this.utils.sleep(this.utils.random_interval(1, 6));
        }
    }

    /**
     * Fldfmode_classic: Follow me
     * =====================
     * Click on follow and verify if instagram not (soft) ban you
     *
     */
    async fldf_click_follow () {
        this.log.info("try follow");
        let username = "";
        try {
            await this.bot.waitForSelector("article div a:nth-child(1)");
            username = await this.bot.evaluate(el => el.innerHTML, await this.bot.$("article div a:nth-child(1)"));
            this.log.info(`username ${username}`);
            this.username_current = username
        } catch (err) {
            this.log.warning(`get username: ${err}`);
        }
        const db_users_followed = await this.get_all_usernames_from_database();
        this.log.info(`users already followed count ${db_users_followed.length}`);
        const whitelist = [...this.config.bot_userwhitelist, db_users_followed.map(u => u.username)];

        // if (this.utils.is_debug()) {
        //     this.log.debug(`whitelist ${whitelist}`);
        // }

        let did_follow = true;
        if (username != "" && whitelist.includes(username)) {
            this.log.warning(`${username}: is in whitelist, ignored by follow.`);
            did_follow = false;
        } else {
            try {
                await this.bot.waitForSelector("article header div button");
                let button = await this.bot.$("article header div button");
                let button_before_click = await this.bot.evaluate(el => el.innerHTML, await this.bot.$("article header div button"));
                this.log.info(`button text before click: ${button_before_click}`);
                if (this.photo_liked[this.photo_current] > 1) {
                    this.log.warning("followed previously");
                    this.db.run("INSERT INTO users (account, mode, username, photo_url, hashtag, type_action) VALUES (?, ?, ?, ?, ?, ?)", this.config.instagram_username, this.LOG_NAME, username, this.photo_current, this.hashtag_tag, "followed previously");
                    did_follow = false;
                } else {
                    await button.click();

                    await this.utils.sleep(this.utils.random_interval(2, 3));

                    await this.bot.waitForSelector("article header div button");
                    let button_after_click = await this.bot.evaluate(el => el.innerHTML, await this.bot.$("article header div button"));
                    this.log.info(`button text after click: ${button_after_click}`);

                    if (button_after_click != button_before_click) {
                        this.log.info("follow");
                        this.db.run("INSERT INTO users (account, mode, username, photo_url, hashtag, type_action) VALUES (?, ?, ?, ?, ?, ?)", this.config.instagram_username, this.LOG_NAME, username, this.photo_current, this.hashtag_tag, "follow");
                        this.db_fldf.run("INSERT INTO fldf (account, username, photo_url, hashtag, type_fldf) VALUES (?, ?, ?, ?, ?)", this.config.instagram_username, username, this.photo_current, this.hashtag_tag, "follow");
                        did_follow = true;
                    } else {
                        this.log.warning("not follow");
                        did_follow = false;
                    }

                }
                this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.OK);
            } catch (err) {
                if (this.utils.is_debug()) {
                    this.log.debug(err);
                }

                this.log.warning("follow error");
                this.db.run("INSERT INTO users (account, mode, username, photo_url, hashtag, type_action) VALUES (?, ?, ?, ?, ?, ?)", this.config.instagram_username, this.LOG_NAME, username, this.photo_current, this.hashtag_tag, "follow error");
                this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.ERROR);
                did_follow = false;
            }

            await this.utils.sleep(this.utils.random_interval(1, 6));

            await this.utils.screenshot(this.LOG_NAME, "last_follow_after");

            return did_follow;
        }
    }

    /**
     * Get all already followed usernames
     * =====================
     * SQL get all usernames
     *
     */
    async get_all_usernames_from_database () {
        let self = this;
        return new Promise(function (resolve) {
            self.db_fldf.all("SELECT username FROM fldf WHERE account = ? ORDER BY id ASC", self.config.instagram_username, function (err, row) {
                if (err) {
                    self.log.warning(`get_all_users_from_database() error select ${err}`);
                }
                resolve(row || []);
            });
        });
    }

    /**
     * Get all follow user
     * =====================
     * SQL get all users with follow type_action, for defollow next time
     *
     */
    async get_users_with_type_follow_from_database () {
        let self = this;
        return new Promise(function (resolve) {
            self.db_fldf.all("SELECT * FROM fldf WHERE account = ? AND type_fldf = 'follow' ORDER BY id ASC", self.config.instagram_username, function (err, row) {
                if (err) {
                    self.log.warning(`get_users_with_type_follow_from_database() error select ${err}`);
                }
                resolve(row || []);
            });
        });
    }

    /**
     * Get all follow user
     * =====================
     * SQL get all users with follow type_action, for defollow next time
     *
     */
    async goto_user_for_defollow (username) {
        this.username_current = username;
        this.photo_current = `https://www.instagram.com/${username}`;
        this.log.info("go to url for try defollow");

        try {
            this.log.debug(`Goto: ${this.photo_current}`);
            await this.bot.goto(this.photo_current);
        } catch (err) {
            this.log.error(`goto ${err}`);
        }
    }

    /**
     * Fldfmode_classic: Defollow me
     * =====================
     * Click on defollow and verify if instagram not (soft) ban you
     *
     */
    async fldf_click_defollow () {
        this.log.info("try defollow");
        let username = "";
        let retry = 0;
        do {
            try {
                await this.bot.waitForSelector("header section h1");
                username = await this.bot.evaluate(el => el.innerHTML, await this.bot.$("header section h1"));
                this.log.info(`username ${username}`);
                retry = 0;
            } catch (err) {
                this.log.warning(`get username: ${err}`);
                await this.bot.reload();
                await this.utils.sleep(this.utils.random_interval(1, 6));
                retry++;
            }
        } while (retry == 1);

        try {
            await this.bot.waitForSelector("header section div:nth-child(1) button");
            let button = await this.bot.$("header section div:nth-child(1) button");
            let button_before_click = await this.bot.evaluate(el => el.innerHTML, await this.bot.$("header section div:nth-child(1) button"));
            this.log.info(`button text before click: ${button_before_click}`);

            if (this.photo_liked[this.photo_current] !== undefined) {
                this.log.warning("followed previously");
                this.db.run("INSERT INTO users (account, mode, username, photo_url, hashtag, type_action) VALUES (?, ?, ?, ?, ?, ?)", this.config.instagram_username, this.LOG_NAME, username, this.photo_current, this.hashtag_tag, "defollowed previously");
            } else {
                await button.click();

                await this.utils.sleep(this.utils.random_interval(2, 3));

                await this.bot.waitForSelector("div[role=\"dialog\"] div > div:nth-child(3) button:nth-child(1)");
                let button_confirm = await this.bot.$("div[role=\"dialog\"] div > div:nth-child(3) button:nth-child(1)");

                await button_confirm.click();

                await this.utils.sleep(this.utils.random_interval(1, 2));

                await this.bot.waitForSelector("header section div:nth-child(1) button");
                let button_after_click = await this.bot.evaluate(el => el.innerHTML, await this.bot.$("header section div:nth-child(1) button"));
                this.log.info(`button text after click: ${button_after_click}`);

                if (button_after_click != button_before_click) {
                    this.log.info("defollow");
                    this.db.run("INSERT INTO users (account, mode, username, photo_url, hashtag, type_action) VALUES (?, ?, ?, ?, ?, ?)", this.config.instagram_username, this.LOG_NAME, username, this.photo_current, this.hashtag_tag, "defollow");
                    this.db_fldf.run("UPDATE fldf SET type_fldf = ? WHERE account = ? AND username = ?", "defollow", this.config.instagram_username, username);
                } else {
                    this.log.warning("not defollow, removed from defollow list");
                    this.db_fldf.run("UPDATE fldf SET type_fldf = ? WHERE account = ? AND username = ?", "defollow error, photo removed", this.config.instagram_username, this.username_current);
                }
            }
            this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.OK);
        } catch (err) {
            if (this.utils.is_debug()) {
                this.log.debug(err);
            }

            this.log.warning("defollow error");
            this.db.run("INSERT INTO users (account, mode, username, photo_url, hashtag, type_action) VALUES (?, ?, ?, ?, ?, ?)", this.config.instagram_username, this.LOG_NAME, username, this.photo_current, this.hashtag_tag, "defollow error");
            this.db_fldf.run("UPDATE fldf SET type_fldf = ? WHERE account = ? AND username = ?", "defollow error, photo removed", this.config.instagram_username, this.username_current);
            this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.ERROR);
        }

        await this.utils.sleep(this.utils.random_interval(1, 6));

        await this.utils.screenshot(this.LOG_NAME, "last_defollow_after");
    }

    /**
     * Fldfmode_classic: Love me
     * =====================
     * Click on heart and verify if instagram not (soft) ban you
     *
     */
    async like_click_heart () {
        this.log.info("louie: try heart like");

        try {
            await this.bot.waitForSelector("article:nth-child(1) section:nth-child(1) button:nth-child(1)");
            let button = await this.bot.$("article:nth-child(1) section:nth-child(1) button:nth-child(1)");
            let button_icon = await this.bot.$("article:nth-child(1) section:nth-child(1) button:nth-child(1) span");
            let class_names = await (await button_icon.getProperty("className")).jsonValue();
            // glyphsSpriteHeart__outline__24__grey_9 u-__7
            // glyphsSpriteHeart__filled__24__red_5 u-__7
            if (class_names.indexOf('outline') !== -1) { // like button is not filled
                await button.click();
                this.log.info("louie: <3");

                if (this.photo_liked[this.photo_current] === undefined) {
                    this.photo_liked[this.photo_current] = 0;
                }
                this.photo_liked[this.photo_current] += 1;

                let button_icon = await this.bot.$("article:nth-child(1) section:nth-child(1) button:nth-child(1) span");
                let class_names = await (await button_icon.getProperty("className")).jsonValue();
                if (class_names.indexOf('filled') !== -1) { // like button have changed class to fille
                    this.db.run("INSERT INTO liked_images (account, username, photo_url) VALUES (?, ?, ?)", this.config.instagram_username, this.username_current, this.photo_current, (err) => {
                        if(err) {
                            this.log.error(`db insert liked_images: ${err}`)
                        }
                    });
                }

            } else {
                this.log.warning(`louie: </3 (liked previously) ${this.photo_current}`);
            }
            this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.OK);
        } catch (err) {
            if (this.utils.is_debug()) {
                this.log.debug(err);
            }

            this.log.warning("</3");
            this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.ERROR);
        }

        await this.utils.sleep(this.utils.random_interval(1, 6));

        await this.utils.screenshot(this.LOG_NAME, "last_like_after");
    }
    /**
     * Fldfmode_classic: open user page
     * =====================
     * Open user page for 3 likes
     *
     */
    async like_open_userpage () {
        this.log.info("louie: try open userpage");

        try {
            await this.bot.waitForSelector("article:nth-child(1) header:nth-child(1) div:nth-child(2) a:nth-child(1)");
            let button = await this.bot.$("article:nth-child(1) header:nth-child(1) div:nth-child(2) a:nth-child(1)");
            await button.click();
            this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.OK);
        } catch (err) {
            if (this.utils.is_debug()) {
                this.log.debug(err);
            }

            this.emit(this.STATE_EVENTS.CHANGE_STATUS, this.STATE.ERROR);
        }

        await this.utils.sleep(this.utils.random_interval(1, 6));
        await this.utils.screenshot(this.LOG_NAME, "userpage");
    }

    /**
     * Fldfmode_classic: Open Photo
     * =====================
     * Open url of photo and cache urls from hashtag page in array
     *
     */
    async like_get_urlpic () {
        this.log.info("louie: like_get_urlpic");

        let photo_url = "";

        if (this.cache_hash_tags.length <= 0) {
            try {
                this.cache_hash_tags = await this.bot.$$eval("article a", hrefs => hrefs.map((a) => {
                    return a.href;
                }));

                await this.utils.sleep(this.utils.random_interval(10, 15));

                if (this.utils.is_debug()) {
                    this.log.debug(`array photos ${this.cache_hash_tags.join(" ")}`);
                }

                photo_url = await this.get_photo_url("hashtag");

                this.log.info(`current photo url ${photo_url}`);
                if (typeof photo_url === "undefined") {
                    this.log.warning("check if current hashtag have photos, you write it good in config.js? Bot go to next hashtag.");
                    this.cache_hash_tags = [];
                    this.cache_hash_tags_user = [];
                }

                await this.utils.sleep(this.utils.random_interval(1, 6));

                this.log.debug(`Goto: ${photo_url}`);
                await this.bot.goto(photo_url);
            } catch (err) {
                this.cache_hash_tags = [];
                this.cache_hash_tags_user = [];
                this.log.error(`like_get_urlpic error ${err}`);
                await this.utils.screenshot(this.LOG_NAME, "like_get_urlpic_error");
            }
        } else {
            photo_url = await this.get_photo_url("hashtag");

            this.log.info(`current photo url from cache ${photo_url}`);
            await this.utils.sleep(this.utils.random_interval(1, 6));

            try {
                this.log.debug(`Goto: ${photo_url}`);
                await this.bot.goto(photo_url);
            } catch (err) {
                this.log.error(`goto ${err}`);
                this.cache_hash_tags = [];
                this.cache_hash_tags_user = [];
            }
        }
        await this.utils.sleep(this.utils.random_interval(1, 6));
    }

    /**
     * Fldfmode_classic: Open Photo
     * =====================
     * Open url of photo and cache urls from hashtag page in array
     *
     */
    async like_get_urlpic_user () {
        this.log.info("louie: like_get_urlpic_fromuser");

        let photo_url = "";

        if (this.cache_hash_tags_user.length <= 0) {
            try {
                // Remove explore tags from the list of user hrefs
            //   this.cache_hash_tags_user = (await this.bot.$$eval("article a", hrefs => hrefs.map((a) =>
            //       a.href.match(/instagram.com\/explore\/tags/) === null ? a.href : undefined
            //   ))).filter((href) => href !== undefined)

                this.cache_hash_tags_user = await this.bot.$$eval("article a", hrefs => hrefs.map((a) => {
                    return a.href;
                }));
                this.cache_hash_tags_user = this.cache_hash_tags_user.filter((a) => a.match(/instagram.com\/explore\/tags/) === null);

                await this.utils.sleep(this.utils.random_interval(10, 15));

                if (this.utils.is_debug()) {
                    this.log.debug(`array photos from user ${this.cache_hash_tags_user.join(" ")}`);
                }

                photo_url = await this.get_photo_url("user");

                this.log.info(`louie: current photo url user ${photo_url}`);
                if (typeof photo_url === "undefined") {
                    this.log.warning("check if current hashtag have photos, you write it good in config.js? Bot go to next hashtag.");
                }

                await this.utils.sleep(this.utils.random_interval(1, 6));

                this.log.debug(`Goto: ${photo_url}`);
                await this.bot.goto(photo_url);
                this.photo_current = photo_url;

            } catch (err) {
                this.cache_hash_tags = [];
                this.cache_hash_tags_user = [];
                this.log.error(`like_get_urlpic_user error ${err}`);
                await this.utils.screenshot(this.LOG_NAME, "like_get_urlpic_error");
            }
        } else {
            photo_url = await this.get_photo_url("user");

            this.log.info(`louie: current photo url user from cache ${photo_url}`);
            await this.utils.sleep(this.utils.random_interval(1, 6));

            try {
                this.log.debug(`Goto: ${photo_url}`);
                await this.bot.goto(photo_url);
                this.photo_current = photo_url;
            } catch (err) {
                this.log.error(`goto ${err}`);
                this.cache_hash_tags = [];
                this.cache_hash_tags_user = [];
            }
        }
    }

    /**
     * FldfMode Classic Flow
     * =====================
     *
     */
    async start () {
        this.log.info("classic");

        let today = "";

        await this.init_db();

        let alive = true;
        do {
            alive = await this.utils.keep_alive();
            if (alive == false) {
                break;
            }

            today = new Date();
            this.log.info(`time night: ${parseInt(`${today.getHours()}${today.getMinutes() < 10 ? "0" : ""}${today.getMinutes()}`)}`);

            if (this.config.bot_sleep_night === false) {
                this.config.bot_start_sleep = "00:00";
            }
            if ((parseInt(`${today.getHours()}${today.getMinutes() < 10 ? "0" : ""}${today.getMinutes()}`) >= (this.config.bot_start_sleep).replace(":", ""))) {

                this.log.info(`loading... ${new Date(today.getFullYear(), today.getMonth(), today.getDate(), today.getHours(), today.getMinutes(), today.getSeconds())}`);

                // defollow flow
                let users = await this.get_users_with_type_follow_from_database();

                if (typeof users !== "undefined" && users.length > this.config.bot_followrotate) {
                    this.log.info("defollow flow start");
                    let rotate = users.length - this.config.bot_followrotate;
                    this.log.info(`defollow rotate tot: ${rotate}`);
                    for (let ir = 0; ir < rotate; ir++) {
                        this.log.info(`defollow rotate n: ${rotate}`);
                        this.log.info(`defollow user ${users[ir].username} from photo: ${users[ir].photo_url}`);
                        await this.goto_user_for_defollow(users[ir].username);
                        await this.utils.sleep(this.utils.random_interval(1, 6));
                        await this.fldf_click_defollow();
                    }
                }

                if (this.config.bot_followrotate == 0) {
                    this.log.info("bot defollow all followed user by this app");
                    this.bot.close();
                }

                this.log.info(`cache array size ${this.cache_hash_tags.length}`);
                if (this.cache_hash_tags.length <= 0) {
                    await this.fldf_open_hashtagpage();
                }

                await this.utils.sleep(this.utils.random_interval(1, 6));

                await this.fldf_get_urlpic();

                await this.utils.sleep(this.utils.random_interval(1, 6));

                if (this.cache_hash_tags.length > 0) {
                    const did_follow = await this.fldf_click_follow();
                    if (did_follow) {
                        // LOUIE -- like also
                        this.log.info("louie: Going into like-mode");
                        await this.utils.sleep(this.utils.random_interval(1, 6));

                        await this.like_open_userpage(); // moved out from the following loop
                        let like_count = Math.floor((Math.random() * this.config.bot_superlike_n_m[1]) + this.config.bot_superlike_n_m[0]);
                        if (this.get_status === 0) {
                            like_count = 0; 
                        }
                        for (let i = 0; i < like_count; i++) {
                            this.log.info(`louie: try like photo ${i + 1}/${like_count}`);

                            // while (this.get_status() === 0) {
                            //     this.log.info("louie: photo not found, retry next...");
                            //     await this.like_get_urlpic();
                            //     await this.like_open_userpage();
                            // }
                            await this.utils.sleep(this.utils.random_interval(2, 5));
                            await this.like_get_urlpic_user();
                            await this.utils.sleep(this.utils.random_interval(1, 3));
                            await this.like_click_heart();
                            alive = await this.utils.keep_alive();
                            if (alive == false) {
                                break;
                            }
                        }
                        this.log.info("louie: Exiting from like-mode");
                        // LOUIE - like also end
                    }
                }
                this.cache_hash_tags_user = [];

                await this.utils.sleep(this.utils.random_interval(1, 6));

                if (this.cache_hash_tags.length < 9) { // remove popular photos
                    this.cache_hash_tags = [];
                }

                alive = await this.utils.keep_alive();
                if (alive == false) {
                    break;
                }

                if (this.cache_hash_tags.length <= 0) {
                    this.log.info(`finish follow, bot sleep ${this.config.bot_fastlikefldf_min}-${this.config.bot_fastlikefldf_max} minutes`);
                    this.cache_hash_tags = [];
                    await this.utils.sleep(this.utils.random_interval(60 * this.config.bot_fastlikefldf_min, 60 * this.config.bot_fastlikefldf_max));
                }
            } else {
                this.log.info("is night, bot sleep");
                await this.utils.sleep(this.utils.random_interval(60 * 4, 60 * 5));
            }

        } while (true);
    }

}

module.exports = (bot, config, utils, db) => {
    return new Fldfmode_classic(bot, config, utils, db);
};