const Prediction = require("../utils/predictions");
const { checkIfUserIsLoggedIn, checkUserSubscription, getFixtureContents } = require("../utils/func");


var _ = require('lodash');
const uuidv4 = require('uuid').v4;
const axios = require('axios').default;
const GoogleSpreadsheet = require("google-spreadsheet").GoogleSpreadsheet;
const Handlebars = require("handlebars");
const joi = require("joi");
const mjml2html = require("mjml");
const moment = require("moment");
const momentT = require("moment-timezone");
const http = require('http');
const Bundle = require("../models/Bundle");
const BundleCategory = require("../models/BundleCategory");
const Subscription = require("../models/Subscription");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const UserTip = require("../models/UserTip");
import { sendPushNotificationViaOneSignal } from "../utils/pushNotification";

const fs = require('fs')
const sendEmail = require("../utils/emails")
const {randomString} = require("../utils/numbers");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
var passport = require('passport');

/**
 * FixturesController
 */
class FixturesController {
    static middleware() {
        return {
            LoggedIn: ["fixtureVotes"]
        };
    }

    /**
     * Example controller action.
     * @param {Http} http
     */
    async getFixtures(http) {
        try {
            const yesterday = moment().subtract(1, "day").format("YYYY/MM/DD");
            const today = moment().format("YYYY/MM/DD");
            const tomorrow = moment().add(1, "day").format("YYYY/MM/DD");

            const yesterdayFixtures = JSON.parse(
                fs.readFileSync(`../storage/sports/${yesterday}/fixtures.json`).toString()
            );

            const todayFixtures = JSON.parse(
                fs.readFileSync(`../storage/sports/${today}/fixtures.json`).toString()
            );

            const tomorrowFixtures = JSON.parse(
                fs.readFileSync(`../storage/sports/${tomorrow}/fixtures.json`).toString()
            );

            // let fixtures ;
            // if (!fs.existsSync($.path.storage(`/sports/${today}/fixtures.json`))) {
            //     fixtures = fs.readFileSync($.path.storage(`/sports/${yesterday}/fixtures.json`));
            // } else {
            //     fixtures = fs.readFileSync($.path.storage(`/sports/${today}/fixtures.json`));
            // }

            // fixtures = JSON.parse(fixtures);

            let userSubscription  = 0;

            const getUserIDIfLoggedIn = await checkIfUserIsLoggedIn(http);

            userSubscription = getUserIDIfLoggedIn
                ? await checkUserSubscription(getUserIDIfLoggedIn)
                : 0;

            const data = {
                yesterday: [],
                today: [],
                tomorrow: []
            };

            if (userSubscription > 0) {
                const freePrediction = new Prediction([
                    ...yesterdayFixtures,
                    ...todayFixtures,
                    ...tomorrowFixtures
                ]).get3GameBundlePredictions();

                data.yesterday = freePrediction
                    .filter((el) =>
                        moment(yesterday.replace(new RegExp("/", "g"), "-")).isSame(
                            momentT(new Date(el.time.date), "UTC")
                                .clone()
                                .tz("Africa/Lagos")
                                .format(),
                            "day"
                        )
                    )
                    .map((el) => ({
                        id: el.id,
                        homeTeam: {
                            id: el.homeTeam.id,
                            name: el.homeTeam.name,
                            logo: el.homeTeam.logo,
                            short_code: el.homeTeam.short_code
                        },
                        awayTeam: {
                            id: el.awayTeam.id,
                            name: el.awayTeam.name,
                            logo: el.awayTeam.logo,
                            short_code: el.awayTeam.short_code
                        },
                        label: el.label,
                        scores: el.scores,
                        time: el.time,
                        league: el.league,
                        slug: el.slug,
                        vote: el.vote
                    }));
                data.today = freePrediction
                    .filter((el) =>
                        moment(today.replace(new RegExp("/", "g"), "-")).isSame(
                            momentT(new Date(el.time.date), "UTC")
                                .clone()
                                .tz("Africa/Lagos")
                                .format(),
                            "day"
                        )
                    )
                    .map((el) => ({
                        id: el.id,
                        homeTeam: {
                            id: el.homeTeam.id,
                            name: el.homeTeam.name,
                            logo: el.homeTeam.logo,
                            short_code: el.homeTeam.short_code
                        },
                        awayTeam: {
                            id: el.awayTeam.id,
                            name: el.awayTeam.name,
                            logo: el.awayTeam.logo,
                            short_code: el.awayTeam.short_code
                        },
                        label: el.label,
                        scores: el.scores,
                        time: el.time,
                        league: el.league,
                        slug: el.slug,
                        vote: el.vote
                    }));

                data.tomorrow = freePrediction
                    .filter((el) =>
                        moment(tomorrow.replace(new RegExp("/", "g"), "-")).isSame(
                            momentT(new Date(el.time.date), "UTC")
                                .clone()
                                .tz("Africa/Lagos")
                                .format(),
                            "day"
                        )
                    )
                    .map((el) => ({
                        id: el.id,
                        homeTeam: {
                            id: el.homeTeam.id,
                            name: el.homeTeam.name,
                            logo: el.homeTeam.logo,
                            short_code: el.homeTeam.short_code
                        },
                        awayTeam: {
                            id: el.awayTeam.id,
                            name: el.awayTeam.name,
                            logo: el.awayTeam.logo,
                            short_code: el.awayTeam.short_code
                        },
                        label: el.label,
                        scores: el.scores,
                        time: el.time,
                        league: el.league,
                        slug: el.slug,
                        vote: el.vote
                    }));

                return http.send({
                    status: "success",
                    msg: "Fixtures fetched successfully",
                    type: "premium",
                    data
                });
            } else {
                const freePrediction = new Prediction([
                    ...yesterdayFixtures,
                    ...todayFixtures,
                    ...tomorrowFixtures
                ]).getAllHomeAwayWin();

                data.yesterday = freePrediction.filter((el) =>
                    moment(yesterday.replace(new RegExp("/", "g"), "-")).isSame(
                        momentT(new Date(el.time.date), "UTC").clone().tz("Africa/Lagos").format(),
                        "day"
                    )
                );
                data.today = freePrediction.filter((el) =>
                    moment(today.replace(new RegExp("/", "g"), "-")).isSame(
                        momentT(new Date(el.time.date), "UTC").clone().tz("Africa/Lagos").format(),
                        "day"
                    )
                );
                data.tomorrow = freePrediction.filter((el) =>
                    moment(tomorrow.replace(new RegExp("/", "g"), "-")).isSame(
                        momentT(new Date(el.time.date), "UTC").clone().tz("Africa/Lagos").format(),
                        "day"
                    )
                );

                return http.send({
                    status: "success",
                    msg: "Fixtures fetched successfully",
                    userLevel: "free",
                    data: {
                        yesterday: data.yesterday,
                        today:
                            getUserIDIfLoggedIn && typeof getUserIDIfLoggedIn === "string"
                                ? userSubscription !== 0
                                    ? data.today
                                    : data.today.length > 11
                                    ? data.today.slice(0, 11)
                                    : data.today
                                : data.today.length > 8
                                ? data.today.slice(0, 8)
                                : data.today,
                        tomorrow:
                            getUserIDIfLoggedIn && typeof getUserIDIfLoggedIn === "string"
                                ? data.tomorrow.length > 11
                                    ? data.tomorrow.slice(0, 11)
                                    : data.tomorrow
                                : data.tomorrow.length > 8
                                ? data.tomorrow.slice(0, 8)
                                : data.tomorrow
                    },
                    total: {
                        yesterday: data.yesterday.length,
                        today: data.today.length,
                        tomorrow: data.tomorrow.length
                    }
                });
            }
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async getFixturesByDate(http) {
        try {
            const date = http.params.date;

            const fixtureFile = fs
                .readFileSync(
                    `../storage/sports/${moment(date).format("YYYY/MM/DD")}/fixtures.json`
                )
                .toString();

            const fixtures = JSON.parse(fixtureFile);

            const requestedData = fixtures.map((el) => ({
                id: el.id,
                homeTeam: {
                    id: el.homeTeam.id,
                    name: el.homeTeam.name,
                    logo: el.homeTeam.logo,
                    short_code: el.homeTeam.short_code
                },
                awayTeam: {
                    id: el.awayTeam.id,
                    name: el.awayTeam.name,
                    logo: el.awayTeam.logo,
                    short_code: el.awayTeam.short_code
                },
                label: el.label,
                scores: el.scores,
                time: el.time,
                league: el.league,
                slug: el.slug,
                vote: el.vote
            }));

            return http.send({
                status: "success",
                data: requestedData
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    getFixtureByDateLeague(http) {
        try {
            const date = http.params.date;
            const league = http.params.league;

            const today = moment();

            let fixtureFile  = "[]";

            const checkIfExist = fs.existsSync(
                `../storage/sports/${moment(date).format("YYYY/MM/DD")}/fixtures.json`
            );

            if (checkIfExist || moment(new Date(date)).diff(moment().add(1, "d"), "d") < 2) {
                fixtureFile = fs.readFileSync(
                    `../storage/sports/${today.format("YYYY/MM/DD")}/fixtures.json`
                );

                fixtureFile = JSON.parse(fixtureFile);

                const requestedData = fixtureFile
                    .filter(
                        (el) =>
                            el.league.id === parseInt(league) &&
                            moment(el.time.date).isSame(moment(date), "day")
                    )
                    .map((el) => ({
                        id: el.id,
                        homeTeam: {
                            id: el.homeTeam.id,
                            name: el.homeTeam.name,
                            logo: el.homeTeam.logo,
                            short_code: el.homeTeam.short_code
                        },
                        awayTeam: {
                            id: el.awayTeam.id,
                            name: el.awayTeam.name,
                            logo: el.awayTeam.logo,
                            short_code: el.awayTeam.short_code
                        },
                        label: el.label,
                        scores: el.scores,
                        time: el.time,
                        league: el.league,
                        slug: el.slug,
                        vote: el.vote
                    }));

                return http.send({
                    status: "success",
                    data: requestedData
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Fixtures for selected day not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    viewTips(http) {
        try {
            const fixture = http.params.fixtureID;

            const fixtures = getFixtureContents();

            const data = fixtures.find((el) => el.id === parseInt(fixture));

            if (data) {
                return http.send({
                    status: "success",
                    data
                });
            }
            return http.status(404).send({
                status: "error",
                msg: "Fixture not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async newViewTips(http) {
        try {
            const year = http.params.year;
            const month = http.params.month;
            const day = http.params.day;
            const slug = http.params.fixture;
            const id = http.params.id;

            const today = moment().format("YYYY/MM/DD");

            const checkIfExist = fs.existsSync(
                `../storage/sports/${year}/${month}/${day}/fixtures.json`
            );

            let userSubscription  = 0;
            const getUserIDIfLoggedIn = await checkIfUserIsLoggedIn(http);
            userSubscription = getUserIDIfLoggedIn
                ? await checkUserSubscription(getUserIDIfLoggedIn)
                : 0;

            const checkDate = moment(`${year}-${month}-${day}`);

            let use = null;

            const difference = moment(new Date().toISOString().split("T")[0]).diff(
                checkDate,
                "days"
            );

            if (difference === -1 || difference === -2 || difference === 0 || difference === 1) {
                use = "today";
            } else {
                use = "input";
            }
            let file ;
            if (checkIfExist) {
                file = fs.readFileSync(
                    `../storage/sports/${year}/${month}/${day}/fixtures.json`
                );

                file = JSON.parse(file);

                const data = file.find(
                    (el) => el.slug === slug && el.id === parseInt(id)
                );

                if (data) {
                    let { label, ...result } = data;

                    return http.send({
                        status: "success",
                        data: {
                            ...result,
                            label:
                                userSubscription === 0
                                    ? data.label.winOrDraw
                                    : `${data.label.winOrDraw} or ${data.label.otherOption}`
                        }
                    });
                }
                return http.status(404).send({
                    status: "error",
                    msg: "Fixture not found"
                });
            } else {
                if (use === "today") {
                    file = fs.readFileSync(`../storage/sports/${today}/fixtures.json`);
                } else {
                    file = fs.readFileSync(
                        `../storage/sports/${year}/${month}/${day}/fixtures.json`
                    );
                }

                file = JSON.parse(file);

                const data = (file ).find(
                    (el) => el.slug === slug && el.id === parseInt(id)
                );

                let { label, ...result } = data;

                if (data) {
                    return http.send({
                        status: "success",
                        // data: {
                        //     ...result
                        // label: userSubscription === 0 ? data.label.winOrDraw : `${data.label.winOrDraw} or ${data.label.otherOption}`
                        // },
                        userLevel: userSubscription === 0 ? "free" : "premium"
                    });
                }
            }
            return http.status(404).send({
                status: "error",
                msg: "Fixture not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }


    async fixtureVotes(http) {
        try {
            const yesterday = moment().subtract(1, "day").format("YYYY/MM/DD");
            const today = moment().format("YYYY/MM/DD");

            const voteSelection = http.params.voteSelection;
            const fixture = http.req.query.fixture;

            let selectedDay ;
            let fixtures;
            if (!fs.existsSync(`../storage/sports/${today}/fixtures.json`)) {
                // const fetchTodayFixtures = fs.readFileSync(
                //     $.path.storage(`/sports/${yesterday}/fixtures.json`)
                // );
                // fixtures = JSON.parse(fetchTodayFixtures.toString());
                fixtures = fs.readJson(
                    `../storage/sports/${yesterday}/fixtures.json`
                )
                selectedDay = "yesterday";
            } else {
                fixtures = fs.readJson(
                    `../storage/sports/${today}/fixtures.json`
                );
                // fs.readFileSync(
                //     $.path.storage(`/sports/${today}/fixtures.json`)
                // );
                // fixtures = JSON.parse(fetchTomorrowFixtures);
                selectedDay = "today";
            }

            const findFixture = fixtures?.findIndex((el) => el.id === parseInt(fixture));

            if (findFixture && fixtures) {
                if (voteSelection === "up") {
                    ++fixtures[findFixture].vote.up;
                } else {
                    ++fixtures[findFixture].vote.down;
                }

                await fs.writeFile(
                        `../storage/sports/${selectedDay === "today" ? today : yesterday}/fixtures.json`,
                    JSON.stringify(fixtures)
                );

                return http.send({
                    status: "success",
                    msg: "Vote submitted successfully"
                });
            }

            return http.send({
                status: "error",
                msg: "Fixture not found!"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async eplStandings(http)  {
        try {
            const league = http.params.league;
            if (fs.existsSync(`../storage/sports/standings/${league}.json`)) {
                const standings = fs.readFileSync(
                    `../storage/sports/standings/${league}.json`,
                    "utf-8"
                );
                return http.send({
                    status: "success",
                    msg: "Standings Fetched Successfully",
                    data: JSON.parse(standings)
                });
            } else {
                return http.send({
                    status: "failed",
                    msg: "An error occurred while fetching standings, kindly try again!"
                });
            }
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async tempFAcup(http)  {
        try {
            const today = moment().format("YYYY/MM/DD");

            let fixtures ;
            if (!fs.existsSync(`../storage/sports/${today}/fixtures.json`)) {
                fixtures = [];
            } else {
                fixtures = fs.readFileSync(`../storage/sports/${today}/fixtures.json`);
            }

            fixtures = JSON.parse(fixtures);

            return http.send({
                status: "success",
                msg: "Fixtures Fetched Successfully",
                data: fixtures
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async updateFixturesPredictions(http)  {
        try {
            const schema = joi.object({
                fixtures: joi.array().required(),
                date: joi.string().required()
            });
            const { error, value } = schema.validate(http.$body.all());
            if (error) return http.inputError(error.details);

            const today = moment(value.date).format("YYYY/MM/DD");

            let fixtures;
            if (!fs.existsSync(`../storage/sports/${today}/fixtures.json`)) {
                fixtures = [];
            } else {
                fixtures = JSON.parse(
                    fs.readFileSync(`../storage/sports/${today}/fixtures.json`).toString()
                );
            }

            // fixtures = JSON.parse(fixtures);

            if (fixtures.length > 0) {
                for (const fixture of value.fixtures) {
                    const findFixture  = fixtures.findIndex(
                        (el) => el.id === parseInt(fixture.id)
                    );
                    if (findFixture !== -1) {
                        fixtures[findFixture].label = fixture.label;
                    }
                }
            }

            await fs.writeFile(
                `../storage/sports/${today}/fixtures.json`,
                JSON.stringify(fixtures)
            );

            return http.send({
                status: "success",
                msg: "Fixtures Fetched Successfully",
                data: fixtures
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }
}

module.exports = FixturesController;
