import { GoogleSpreadsheet } from "google-spreadsheet";
const { checkIfUserIsLoggedIn, checkUserSubscription, replacePredictionText } = require( "../utils/func");
const Prediction = require("../utils/predictions");

var _ = require('lodash');
const uuidv4 = require('uuid').v4;
const axios = require('axios').default;
const GoogleSpreadsheet = require("google-spreadsheet").GoogleSpreadsheet;
const Handlebars = require("handlebars");
const Joi = require("joi");
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
 * PredictionsController
 */
class PredictionsController{
    static middleware() {
        return {
            LoggedIn: ["matchPrediction"]
        };
    }

    /**
     * Example controller action.
     * @param {Http} http
     */
    uefaChampionsLeague(http ) {
        try {
            const today = moment().format("YYYY/MM/DD");

            const fixturePath = `../storage/sports/${today}/fixtures.json`;

            let fixtures ;
            if (fs.existsSync(fixturePath)) {
                fixtures = fs.readFileSync(fixturePath);
                fixtures = JSON.parse(fixtures);

                const matchFixtures = fixtures.filter(
                    (el) =>
                        moment(today.replace(new RegExp("/", "g"), "-")).isSame(
                            moment(el.time.date),
                            "day"
                        ) && el.league.id === 2
                );

                return http.send({
                    status: "success",
                    data: matchFixtures
                });
            } else {
                return http.status(500).send({
                    status: "error",
                    msg: "Fixtures are getting updated"
                });
            }
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async uefaChampionsLeagueSubmission(http )  {
        try {
            const schema = Joi.object({
                email: Joi.string().email().required(),
                name: Joi.string().required(),
                phone: Joi.string().required(),
                scores: Joi.string().required(),
                match: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const doc = new GoogleSpreadsheet("138OgOXZ0dVsB29k95UwPfW5rA37Iv64ohScGmAhm0AE");

            fs.readFileSync("../storage/sports/", {
                encoding: "utf8"
            });

            let file ;
            file = fs.read("../storage/bws-338918-261f5d97bd34.json").toString();

            file = JSON.parse(file);

            await doc.useServiceAccountAuth({
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: file.private_key
            });

            await doc.loadInfo();

            const sheet =
                doc.sheetsByTitle[value.match] ||
                (await doc.addSheet({
                    title: value.match,
                    headerValues: ["Name", "Email", "Phone", "Match", "Prediction"]
                }));

            await sheet.addRow({
                Name: value.name,
                Email: value.email,
                Phone: `'${value.phone}`,
                Match: value.match,
                Prediction: value.scores
            });

            return http.send({
                status: "success",
                msg: "UEFA Champions League Prediction added successfully"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async predictionsWon(http )  {
        try {
            const yesterday = moment().subtract(1, "day").format("YYYY/MM/DD");
            const today = moment().format("YYYY/MM/DD");

            const yesterdayFixtures = fs.readFileSync(`../storage/sports/${yesterday}/fixtures.json`, "utf-8");
            const todayFixtures = fs.readFileSync(`../storage/sports/${today}/fixtures.json`, "utf-8");


            const data = {
                yesterday: JSON.parse(yesterdayFixtures),
                today: JSON.parse(todayFixtures)
            };

            const prediction = new Prediction([...data.yesterday, ...data.today]);

            const winnings = prediction.getWinningTips();

            return http.send({
                status: "success",
                fixtures: winnings
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async getFixturesByPrediction(http )  {
        try {
            const yesterday = moment().subtract(1, "day").format("YYYY/MM/DD");
            const today = moment().format("YYYY/MM/DD");

            const predictionType = http.params.prediction;

            // check sub
            let userSubscription  = 0;
            const getUserIDIfLoggedIn = await checkIfUserIsLoggedIn(http);
            userSubscription = getUserIDIfLoggedIn
                ? await checkUserSubscription(getUserIDIfLoggedIn)
                : 0;

            if (userSubscription === 0) {
                if (
                    predictionType === "gg" ||
                    predictionType === "over_2_5" ||
                    predictionType === "under_2_5" ||
                    predictionType === "over_3_5" ||
                    predictionType === "under_3_5"
                ) {
                    return http.send({
                        status: "success",
                        msg: "You need to subscribe to get access to this feature",
                        data: [],
                        userLevel: "free"
                    });
                }
            }

            let fixtures ;
            if (!fs.existsSync(`../storage/sports/${today}/fixtures.json`)) {
                fixtures = fs.readFileSync(`../storage/sports/${yesterday}/fixtures.json`);
            } else {
                fixtures = fs.readFileSync(`../storage/sports/${today}/fixtures.json`);
            }
            fixtures = JSON.parse(fixtures);

            const possibleValues = [
                "home",
                "away",
                "gg",
                "over_2_5",
                "over_3_5",
                "under_2_5",
                "correct_score"
            ];

            const data = {
                today: [],
                yesterday: []
            };

            const allFixtures = fixtures.filter((el) =>
                moment(today).isSame(
                    momentT(new Date(el.time.date), "UTC").clone().tz("Africa/Lagos").format(),
                    "day"
                )
            );

            if (
                possibleValues.indexOf(predictionType) !== -1 &&
                predictionType !== "correct_score"
            ) {
                const filterTodayFixtures = fixtures
                    .filter(
                        (el) =>
                            moment(today.replace(new RegExp("/", "g"), "-")).isSame(
                                moment(el.time.date),
                                "day"
                            ) &&
                            Object.values(el.label).includes(replacePredictionText(predictionType))
                    )
                    .map((el) => {
                        return {
                            id: el.id,
                            time: el.time,
                            scores: el.scores,
                            league: el.league,
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
                            vote: el.vote,
                            slug: el.slug,
                            label:
                                userSubscription === 0
                                    ? Object.values(el.label)[0]
                                    : `${Object.values(el.label)[0]} or ${
                                          Object.values(el.label)[1]
                                      }`
                        };
                    });

                const paidPred = new Prediction(allFixtures)
                    .removePaidPredictions()
                    .map((el) => el.id);

                const paidSubPredFil = userSubscription === 3 ? paidPred.slice(3, 5) : paidPred;

                data.today =
                    userSubscription !== 0
                        ? filterTodayFixtures.filter(
                              (el) => paidSubPredFil.indexOf(el.id) === -1
                          )
                        : filterTodayFixtures;

                data.yesterday = fixtures
                    .filter(
                        (el) =>
                            moment(yesterday.replace(new RegExp("/", "g"), "-")).isSame(
                                moment(el.time.date),
                                "day"
                            ) &&
                            Object.values(el.label).includes(replacePredictionText(predictionType))
                    )
                    .map((el) => {
                        return {
                            id: el.id,
                            time: el.time,
                            scores: el.scores,
                            league: el.league,
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
                            vote: el.vote,
                            slug: el.slug,
                            label:
                                userSubscription === 0
                                    ? Object.values(el.label)[0]
                                    : `${Object.values(el.label)[0]} or ${
                                          Object.values(el.label)[1]
                                      }`
                        };
                    });

                return http.send({
                    status: "success",
                    msg: "Fixtures Fetched Successfully",
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
                                : data.today
                    },
                    userLevel: userSubscription === 0 ? "free" : "premium"
                });
            } else if (
                possibleValues.indexOf(predictionType) !== -1 &&
                predictionType === "correct_score"
            ) {
                const filterTodayFixtures = fixtures
                    .filter((el) =>
                        moment(today.replace(new RegExp("/", "g"), "-")).isSame(
                            moment(el.time.date),
                            "day"
                        )
                    )
                    .map((el) => {
                        return {
                            id: el.id,
                            time: el.time,
                            scores: el.scores,
                            league: el.league,
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
                            vote: el.vote,
                            slug: el.slug,
                            label: Object.keys(el.odds.correct_score).reduce((a, b) =>
                                el.odds.correct_score[a] > el.odds.correct_score[b] ? a : b
                            )
                        };
                    });

                const paidPred = new Prediction(allFixtures)
                    .removePaidPredictions()
                    .map((el) => el.id);

                const paidSubPredFil = userSubscription === 3 ? paidPred.slice(3, 5) : paidPred;

                data.today =
                    userSubscription !== 0
                        ? filterTodayFixtures.filter(
                              (el) => paidSubPredFil.indexOf(el.id) === -1
                          )
                        : filterTodayFixtures;

                data.yesterday = fixtures
                    .filter((el) =>
                        moment(yesterday.replace(new RegExp("/", "g"), "-")).isSame(
                            moment(el.time.date),
                            "day"
                        )
                    )
                    .map((el) => {
                        return {
                            id: el.id,
                            time: el.time,
                            scores: el.scores,
                            league: el.league,
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
                            vote: el.vote,
                            slug: el.slug,
                            label: Object.keys(el.odds.correct_score).reduce((a, b) =>
                                el.odds.correct_score[a] > el.odds.correct_score[b] ? a : b
                            )
                        };
                    });

                return http.send({
                    status: "success",
                    msg: "Fixtures Fetched Successfully",
                    data: {
                        yesterday: data.yesterday,
                        today:
                            getUserIDIfLoggedIn && typeof getUserIDIfLoggedIn === "string"
                                ? data.today.length > 11
                                    ? data.today.slice(0, 11)
                                    : data.today
                                : data.today.length > 8
                                ? data.today.slice(0, 8)
                                : data.today
                    },
                    userLevel: userSubscription === 0 ? "free" : "premium"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Prediction currently not available"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async predictionsByCategory(http )  {
        try {
            const yesterday = moment().subtract(1, "day").format("YYYY/MM/DD");
            const today = moment().format("YYYY/MM/DD");

            let fixtures ;
            if (!fs.existsSync(`../storage/sports/${today}/fixtures.json`)) {
                fixtures = fs.readFileSync(`../storage/sports/${yesterday}/fixtures.json`);
            } else {
                fixtures = fs.readFileSync(`../storage/sports/${today}/fixtures.json`);
            }
            fixtures = JSON.parse(fixtures);

            let userSubscription  = 0;
            const getUserIDIfLoggedIn = await checkIfUserIsLoggedIn(http);
            userSubscription = getUserIDIfLoggedIn
                ? await checkUserSubscription(getUserIDIfLoggedIn)
                : 0;

            const possibleValues = ["home", "away", "gg", "over_2_5", "under_2_5", "correct_score"];

            let data = {
                home: [],
                away: [],
                gg: [],
                over_2_5: [],
                under_2_5: [],
                correct_score: []
            };

            for (const option of possibleValues) {
                if (userSubscription === 0) {
                    const restrictedOptions = ["gg", "over_2_5", "over_3_5", "under_2_5"];
                    if (restrictedOptions.indexOf(option) !== -1) {
                        continue;
                    }
                }

                const filterPredDate = fixtures.filter((el) =>
                    moment(today.replace(new RegExp("/", "g"), "-")).isSame(
                        moment(el.time.date),
                        "day"
                    )
                );

                if (option === "correct_score") {
                    data[option] = filterPredDate.map((el) => {
                        return {
                            time: el.time,
                            scores: el.scores,
                            league: el.league,
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
                            label: Object.keys(el.odds.correct_score).reduce((a, b) =>
                                el.odds.correct_score[a] > el.odds.correct_score[b] ? a : b
                            )
                        };
                    });
                } else {
                    const filterPred = filterPredDate.filter(
                        (el) => {
                            for (const label of Object.values(el.label)) {
                                if (label === replacePredictionText(option, true)) {
                                    return true;
                                }
                            }
                        }
                    );
                    data[option] = filterPred.map((el) => {
                        return {
                            time: el.time,
                            scores: el.scores,
                            league: el.league,
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
                            label: el.label
                        };
                    });
                }
            }

            return http.send({
                status: "success",
                data,
                userLevel: userSubscription === 0 ? "free" : "premium"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    /**
     * @deprecated response too large
     * @description Get all predictions results all together
     * @param http
     */
    async predictionResults(http )  {
        try {
            let userSubscription  = 0;

            const getUserIDIfLoggedIn = await checkIfUserIsLoggedIn(http);

            userSubscription = getUserIDIfLoggedIn
                ? await checkUserSubscription(getUserIDIfLoggedIn)
                : 0;

            const backData = [
                "today",
                "yesterday",
                "twoDaysAgo",
                "threeDaysAgo",
                "fourDaysAgo",
                "fiveDaysAgo"
            ];

            let dates = {};
            for (const back of backData) {
                dates[back] = moment().subtract(backData.indexOf(back), "day").format("YYYY/MM/DD");
            }

            let fixtures = {};

            for (const date of backData) {
                if (fs.existsSync(`../storage/sports/${dates[date]}/fixtures.json`)) {
                    fixtures[date] = JSON.parse(
                        fs.readFileSync(
                            `../storage/sports/${dates[date]}/fixtures.json`,
                            "utf8"
                        )
                    );
                } else {
                    fixtures[date] = [];
                }
            }

            let unwrap = ({ homeTeam, awayTeam, league, label, scores, time }) => ({
                homeTeam,
                awayTeam,
                league,
                label,
                scores,
                time
            });

            let data = {
                today: fixtures?.today?.map(unwrap),
                yesterday: fixtures?.yesterday?.map(unwrap),
                twoDaysAgo: fixtures?.twoDaysAgo?.map(unwrap),
                threeDaysAgo: fixtures?.threeDaysAgo?.map(unwrap),
                fourDaysAgo: fixtures?.fourDaysAgo?.map(unwrap),
                fiveDaysAgo: fixtures?.fiveDaysAgo?.map(unwrap)
            };

            const { today, ...otherDays } = data;

            return http.send({
                status: "success",
                data: {
                    today:
                        getUserIDIfLoggedIn && typeof getUserIDIfLoggedIn === "string"
                            ? today.length > 11
                                ? today.slice(0, 11)
                                : today
                            : today.length > 8
                            ? today.slice(0, 8)
                            : today,
                    otherDays
                }
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async predictionResultsByDate(http )  {
        try {
            const date = http.params.date;

            let previousDay ;
            const today = moment().format("YYYY-MM-DD");
            const formattedDate = moment(date).format("YYYY/MM/DD");

            let fixtures = [];

            if (!fs.existsSync(`../storage/sports/${formattedDate}/fixtures.json`)) {
                fixtures = [];
            } else {
                fixtures = JSON.parse(
                    fs.readFileSync(
                        `../storage/sports/${formattedDate}/fixtures.json`,
                        "utf8"
                    )
                );
            }

            let unwrap = ({ homeTeam, awayTeam, league, label, scores, time }) => ({
                homeTeam,
                awayTeam,
                league,
                label,
                scores,
                time
            });

            let userSubscription  = 0;
            const getUserIDIfLoggedIn = await checkIfUserIsLoggedIn(http);
            userSubscription = getUserIDIfLoggedIn
                ? await checkUserSubscription(getUserIDIfLoggedIn)
                : 0;

            const todayResults = (fixtures)
                .map(unwrap)
                .filter((el) =>
                    moment(today).isSame(
                        momentT(new Date(el.time.date), "UTC").clone().tz("Africa/Lagos").format(),
                        "day"
                    )
                );

            const returnedLimited =
                getUserIDIfLoggedIn && typeof getUserIDIfLoggedIn === "string"
                    ? !userSubscription
                        ? todayResults.slice(0, 11)
                        : todayResults
                    : todayResults.slice(0, 8);

            return http.send({
                status: "success",
                data:
                    date === today
                        ? returnedLimited
                        : (fixtures)
                              .map(unwrap)
                              .filter((el) =>
                                  moment(date.replace(new RegExp("/", "g"), "-")).isSame(
                                      momentT(new Date(el.time.date), "UTC")
                                          .clone()
                                          .tz("Africa/Lagos")
                                          .format(),
                                      "day"
                                  )
                              ),
                userLevel: userSubscription === 0 ? "free" : "premium"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    /**
     * @description Temporary endpoint for predictions (FA CUP)
     */
    async matchPrediction(http )  {
        try {
            const id = http.state.get("id");

            const user = await User.findById(id.toString());
            if (!user)
                return http.status(404).send({
                    status: "error",
                    msg: "User not found"
                });

            const schema = Joi.object({
                scores: Joi.string().required(),
                match: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const doc = new GoogleSpreadsheet("1d9IJUKWjyTnD_hvw75tcO8KL5BP__dDnBoR5eIU4Ol4");

            let file ;
            file = fs.read("../storage/bws-338918-261f5d97bd34.json").toString();

            file = JSON.parse(file);

            await doc.useServiceAccountAuth({
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: file.private_key
            });

            await doc.loadInfo();

            const sheet =
                doc.sheetsByTitle[value.match] ||
                (await doc.addSheet({
                    title: value.match,
                    headerValues: ["Name", "Email", "Phone", "Match", "Prediction"]
                }));

            await sheet.addRow({
                Name: user.data.firstName + " " + user.data.lastName,
                Email: user.data.email,
                Phone: user.data.phone,
                Match: value.match,
                Prediction: value.scores
            });

            return http.send({
                status: "success",
                msg: "Prediction added successfully"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }
}

module.exports = PredictionsController;
