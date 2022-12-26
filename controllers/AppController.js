const axios = require('axios').default;
const GoogleSpreadsheet = require("google-spreadsheet").GoogleSpreadsheet;
const Handlebars = require("handlebars");
const Joi = require("joi").required;
const mjml2html = require("mjml");
const moment = require("moment");
const momentT = require("moment-timezone");
const http = require('http');
const BundleCategory = require("../models/BundleCategory");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
import { sendPushNotificationViaOneSignal } from "../utils/pushNotification";
import {required} from "joi";

const fs = require('fs')
const sendEmail = require("../utils/emails")

require('dotenv').config()

/**
 * AppController
 */
class AppController {
    static middleware() {
        return {
            LoggedIn: ["betBundle"]
        };
    }

    /**
     * Example controller action.
     * @param {Http} http
     */
    async subscribeToNewsletter(http) {
        try {
            const schema = Joi.object({
                email: Joi.string().email().required(),
                firstName: Joi.string().required(),
                lastName: Joi.string().required(),
                mobile: Joi.string().optional()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const subscribingUser = {
                firstName: value.firstName,
                lastName: value.lastName,
                email: value.email
            };

            const listId = "14529220af";

            const { data } = await axios.post(
                `https://us20.api.mailchimp.com/3.0/lists/${listId}/members/`,
                {
                    email_address: value.email,
                    status: "subscribed",
                    merge_fields: {
                        first_name: subscribingUser.firstName,
                        last_name: subscribingUser.lastName
                    }
                },
                {
                    headers: {
                        authorization: `apikey ${process.env.MAILCHIMP_API_KEY}`
                    }
                }
            );

            // const { data } = await axios.post(
            //     "https://api.mailjet.com/v3/REST/contact",
            //     {
            //         IsExcludedFromCampaigns: false,
            //         name: value.fullName,
            //         email: value.email,
            //         ...(value.mobile && { mobile: value.mobile })
            //     },
            //     {
            //         auth: {
            //             username: $.env("MAILJET_API"),
            //             password: $.env("MAILJET_SECRET")
            //         }
            //     }
            // );

            console.log(data);

            return http.send({
                status: "success",
                msg: "Subscribed to newsletter successfully"
            });
        } catch (e) {
            console.dir(e, { depth: null });
            if (e.response && e.response.status === 400) {
                return http.send({
                    status: "success",
                    msg: "Already subscribed"
                });
            } else {
                return http.serverError(e);
            }
        }
    }

    async contactForm(http) {
        try {
            const schema = Joi.object({
                email: Joi.string().email().required(),
                fullName: Joi.string().required(),
                message: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const source = fs.readFileSync("../storage/emails/contactus.mjml", "utf8");
            const htmlOutput = mjml2html(source);
            const template = Handlebars.compile(htmlOutput.html);
            const templateData = {
                fullName: value.fullName,
                email: value.email,
                message: value.message
            };

            // await sendMailViaSmtp({
            //     to: "info@betweysure.com",
            //     replyTo: value.email,
            //     from: "Betweysure <noreply@betweysure.com>",
            //     sender: "noreply@betweysure.com",
            //     subject: "New contact message",
            //     html: template(templateData)
            // });

            sendEmail("info@betweysure.com","","Betweysure","Betweysure <noreply@betweysure.com>",
                "New contact message", "", template(templateData))

            return http.send({
                status: "success",
                msg: "Message sent successfully!"
            });

        } catch (e) {
            return http.serverError(e);
        }
    }


    async betBundle(http) {
        try {
            const id = http.state.get("id");
            const user = await User.findById(id);
            if (!user)
                return http.status(404).send({
                    status: "error",
                    msg: "User not found"
                });

            const subscription = await Subscription.findOne({
                user: user.id(),
                status: "active"
            });

            if (!subscription)
                return http.status(401).send({
                    status: "error",
                    msg: "You currently don't have any active subscription or your subscription has expired!"
                });

            const yesterday = moment().subtract(1, "day").format("YYYY/MM/DD");
            const today = moment().format("YYYY/MM/DD");

            // let fixtures ;
            // if (!fs.existsSync($.path.storage(`/sports/${today}/fixtures.json`))) {
            //     fixtures = [];
            // } else {
            //     fixtures = fs.readFileSync(
            //         $.path.storage(`/sports/${today}/fixtures.json`),
            //         "utf8"
            //     );
            // }

            const yesterdayRawFixtures = JSON.parse(
                fs.readFileSync(`../storage/sports/${yesterday}/fixtures.json`).toString()
            );

            const todayRawFixtures = JSON.parse(
                fs.readFileSync(`../storage/sports/${today}/fixtures.json`).toString()
            );

            const fixtures = [...yesterdayRawFixtures, ...todayRawFixtures];

            const todayFixtures = fixtures.filter((el) => {
                return (
                    moment(today.replace(new RegExp("/", "g"), "-")).isSame(
                        momentT(new Date(el.time.date), "UTC").clone().tz("Africa/Lagos").format(),
                        "day"
                    ) &&
                    momentT(new Date(el.time.date), "UTC")
                        .clone()
                        .tz("Africa/Lagos")
                        .isAfter(today.replace(new RegExp("/", "g"), "-") + " 12:00:00") &&
                    momentT(new Date(el.time.date), "UTC")
                        .clone()
                        .tz("Africa/Lagos")
                        .isBefore(today.replace(new RegExp("/", "g"), "-") + " 23:00:00")
                );
            });

            const yesterdayFixtures = fixtures.filter(
                (el) =>
                    moment(yesterday.replace(new RegExp("/", "g"), "-")).isSame(
                        momentT(new Date(el.time.date), "UTC").clone().tz("Africa/Lagos").format(),
                        "day"
                    ) &&
                    momentT(new Date(el.time.date), "UTC")
                        .clone()
                        .tz("Africa/Lagos")
                        .isAfter(yesterday.replace(new RegExp("/", "g"), "-") + " 09:00:00") &&
                    momentT(new Date(el.time.date), "UTC")
                        .clone()
                        .tz("Africa/Lagos")
                        .isBefore(yesterday.replace(new RegExp("/", "g"), "-") + " 22:00:00")
            );

            const filteredFixtures = todayRawFixtures.sort((a, b) => {
                const checkA = a.predictions;
                const checkB = b.predictions;

                let sumOfA = 0;
                let sumOfB = 0;

                for (const probA of Object.values(checkA)) {
                    sumOfA += Number(probA);
                }

                for (const probB of Object.values(checkB)) {
                    sumOfB += Number(probB);
                }

                // return sumOfA < sumOfB ? 1 : -1;
                // return -1;
                return sumOfB - sumOfA;
            });


            const yesFilteredFixtures = yesterdayRawFixtures.sort((a, b) => {
                const checkA = a.predictions;
                const checkB = b.predictions;

                let sumOfA = 0;
                let sumOfB = 0;

                for (const probA of Object.values(checkA)) {
                    sumOfA += Number(probA);
                }

                for (const probB of Object.values(checkB)) {
                    sumOfB += Number(probB);
                }
                return sumOfB - sumOfA;
            });

            let data = {
                today: [],
                yesterday: []
            };
            const getBundle = await BundleCategory.findById(subscription.data.bundleCat);
            if (getBundle?.data.games === 3) {
                data.today = filteredFixtures.length >= 3 ? filteredFixtures.slice(0, 3) : [];
                data.yesterday =
                    yesFilteredFixtures.length >= 3 ? yesFilteredFixtures.slice(0, 3) : [];
            } else if (getBundle?.data.games === 5) {
                data.today = filteredFixtures.length >= 5 ? filteredFixtures.slice(0, 5) : [];
                data.yesterday =
                    yesFilteredFixtures.length >= 5 ? yesFilteredFixtures.slice(0, 5) : [];
            }

            return http.send({
                status: "success",
                data,
                bundle: getBundle?.data.games
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async addPushNotification(http) {
        try {
            const schema = Joi.object({
                token: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            let currentTokens ;
            currentTokens = fs.readFileSync(`../sports/tokens.json`);

            currentTokens = JSON.parse(currentTokens);

            if (currentTokens.includes(value.token)) {
                return http.send({
                    status: "success",
                    msg: "Token already exists"
                });
            }

            await fs.writeFile(
                `../sports/token.json`,
                JSON.stringify(currentTokens.push(value.token))
            );

            return http.send({
                status: "success",
                msg: "Token added"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async sendPushNotification(http) {
        try {
            const schema = Joi.object({
                heading: Joi.string().optional(),
                message: Joi.string().required(),
                url: Joi.string().uri().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const sendMsg = await sendPushNotificationViaOneSignal({
                message: value.message,
                url: value.url,
                heading: value.heading
            });

            if (sendMsg) {
                return http.send({
                    status: "success",
                    msg: "Message sent"
                });
            }

            return http.status(400).send({
                status: "error",
                msg: "Message not sent"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }
}

module.exports = AppController;
