var _ = require('lodash');
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

require('dotenv').config()

/**
 * AdminController
 */
class AdminController {
    static middleware() {
        return {
            Admin: ["logout", "getAllBetBundles"]
        };
    }

    /**
     * AdminController Login
     * @param {Http} http
     */
    async login(http) {
        try {
            const schema = Joi.object({
                email: Joi.string().email().required(),
                password: Joi.string().min(4).required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const { email, password } = value;

            const user = await User.findOne({
                level: { $gt: 1 },
                email
            });

            if (user) {
                const comparePassword = bcrypt.compare(password, user.get("password"));

                if (!comparePassword)
                    return http.status(401).send({
                        status: "error",
                        msg: "Invalid credentials"
                    });

                if (!user.has("loginToken") || !user.get("loginToken")) {
                    user.set("loginToken", randomString(20));
                    await user.save();
                }

                const loginToken = user.get("loginToken");

                const token = jwt.sign({ id: user.id().toString(), token: loginToken });

                return http.status(200).send({
                    status: "success",
                    msg: "Logged in successfully",
                    token,
                    user: _.omit(user.data, ["password"]),
                    tokenExpireAt: moment(new Date()).add(24, "hours")
                });
            }

            return http.status(401).send({
                status: "error",
                msg: "Invalid credentials"
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async logout(http) {
        try {
            const id = http.state.get("id");
            const user = await User.findById(id);

            if (user) {
                user.set("loginToken", null);
                await user.save();

                return http.send({
                    status: "success",
                    msg: "Logged out successfully"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "User not found"
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async bundles(http) {
        try {
            const bundles = await BundleCategory.find({});

            return http.send({
                status: "success",
                msg: "Bundle categories fetched successfully",
                data: bundles
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async updateBundleStatus(http) {
        try {
            const schema = Joi.object({
                id: Joi.string().required(),
                status: Joi.boolean().required()
            });

            const { error, value } = schema.validate(http.$body.all());
            if (error) return http.inputError(error.details);

            const bundle = await Bundle.findById(value.id);
            if (bundle) {
                await bundle
                    .set({
                        status: value.status
                    })
                    .save();

                return http.send({
                    status: "success",
                    msg: "Bundle updated successfully"
                });
            }

            return http.status(422).send({
                status: "error",
                msg: "Bundle not found!"
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async createBundleCategory(http) {
        try {
            const schema = Joi.object({
                title: Joi.string().required(),
                status: Joi.boolean().required(),
                fee: Joi.object({
                    daily: Joi.number().required(),
                    weekly: Joi.number().required(),
                    monthly: Joi.number().required(),
                    quarterly: Joi.number().required(),
                    biannually: Joi.number().required()
                }),
                games: Joi.number().required()
            });

            const { error, value } = schema.validate(http.$body.all());
            if (error) return http.inputError(error.details);

            const checkIfExist = await BundleCategory.findOne({
                title: value.title
            });

            if (checkIfExist)
                return http.status(422).send({
                    status: "error",
                    msg: `Bundle category with ${value.title} already exists`
                });

            const category = await new BundleCategory()
                .set({
                    title: value.title,
                    status: value.status,
                    fee: value.fee,
                    games: value.games
                })
                .saveAndReturn();

            return http.send({
                status: "error",
                msg: "Bundle Category Created",
                data: category.data
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async deleteBundleCat(http) {
        try {
            const bundle = http.params.id;

            const findBundleCategory = await BundleCategory.findById(bundle.toString());

            if (findBundleCategory) {
                await findBundleCategory.delete();

                return http.send({
                    status: "success",
                    msg: "Bundle category deleted successfully"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Bundle category not found"
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async addTips(http) {
        try {
            const schema = Joi.object({
                category: Joi.string().required(),
                tips: Joi.array().items(
                    Joi.object().keys({
                        league: Joi.string().required(),
                        home: Joi.string().required(),
                        away: Joi.string().required(),
                        prediction: Joi.string().required(),
                        odds: Joi.string().required(),
                        date: Joi.date().required()
                    })
                )
            });

            const { error, value } = schema.validate(http.$body.all());
            if (error) return http.inputError(error.details);

            const { tips, category } = value;

            const findBundle = await BundleCategory.findById(category);
            if (!findBundle)
                return http.status(422).send({
                    status: "error",
                    msg: "Bundle category not found"
                });

            if (findBundle.get("games") !== tips.length)
                return http.status(422).send({
                    status: "error",
                    msg: `Number of tips must be equal to ${findBundle.get("games")}`
                });

            const checkRunningGame = await Bundle.findOne({ category, status: true });

            if (checkRunningGame) {
                return http.status(403).send({
                    status: "error",
                    msg: "previous bundle is still running, kindly disable and continue with creating a new one"
                });
            }

            const data = await new Bundle()
                .set({
                    category: BundleCategory.id(category),
                    tips
                })
                .saveAndReturn();

            return http.status(201).send({
                status: "success",
                msg: "Bundle added successfully",
                data
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async modifyTips(http) {
        try {
            const tipsSchema = Joi.object({
                bundleID: Joi.string().required(),
                tips: Joi.array().items(
                    Joi.object().keys({
                        league: Joi.string().required(),
                        home: Joi.string().required(),
                        away: Joi.string().required(),
                        prediction: Joi.string().required(),
                        odds: Joi.string().required(),
                        date: Joi.date().required()
                    })
                )
            });

            const { error, value } = tipsSchema.validate(http.$body.all());
            if (error) return http.inputError(error.details);

            const { tips, bundleID } = value;

            const findBundle = await Bundle.findById(bundleID);

            if (findBundle) {
                const cat = await BundleCategory.findById(findBundle.get("category"));

                if (cat) {
                    if (cat.get("games") !== tips.length)
                        return http.status(422).send({
                            status: "error",
                            msg: `Number of tips must be equal to ${cat.get("games")}`
                        });
                }

                await findBundle
                    .set({
                        tips
                    })
                    .save();

                return http.send({
                    status: "success",
                    msg: "Bundle updated successfully"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Bundle not found"
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async getSubscribers(http) {
        try {
            const bundle = http.params.bundle;

            const findBundle = await BundleCategory.findById(bundle.toString());

            if (findBundle) {
                const fetchSubscribers = await Subscription.find({
                    bundleCat: bundle,
                    status: "active"
                });

                if (fetchSubscribers) {
                    let users = [];

                    if (fetchSubscribers.length) {
                        for (const subscribers of fetchSubscribers) {
                            const getUserInfo = await User.findById(subscribers.user.toString());

                            if (getUserInfo) {
                                users.push(_.omit(getUserInfo.data, ["password"]));
                            }
                        }
                    }

                    return http.send({
                        status: "success",
                        msg: "Subscribers fetched successfully",
                        data: users
                    });
                }

                return http.status(403).send({
                    status: "error",
                    msg: "Unable to fetch subscribers"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "Bundle not found"
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async getTips(http) {
        try {
            const categories = await BundleCategory.find({});

            if (categories) {
                for (const category of categories) {
                    const getBundles = await Bundle.find(
                        { category: category._id.toString() },
                        {
                            limit: 3,
                            sort: { createdAt: -1 }
                        }
                    );

                    if (getBundles) {
                        category.bundles = getBundles;
                    }
                }

                return http.send({
                    status: "success",
                    data: categories
                });
            }

            return http.status(401).send({
                status: "error",
                msg: "No tip(s) found"
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async createNotification(http) {
        try {
            const schema = Joi.object({
                title: Joi.string().required(),
                message: Joi.string().required(),
                url: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());
            if (error) return http.inputError(error.details);

            await sendPushNotificationViaOneSignal({
                message: value.message,
                url: value.url,
                heading: value.title
            });

            // $.eServer.emit("notify-users", value);

            return http.status(201).send({
                status: "success",
                msg: "Notifications sent successfully"
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async transactionChart(http) {
        try {
            // const transactions = await Transaction.native().find({
            //     status: { $in: ["success", "successful"] }
            // });

            const transactions = await Transaction.count({
                status: { $in: ["success", "successful"] }
            });

            const data = [];

            // for (let step = 0; step < 12; step++) {
            //     const filterData = {} as { name; amount: number };
            //
            //     filterData.name =
            //         data[
            //             moment(transaction.createdAt).format("MMMM").toString().toLowerCase()
            //         ].push(transaction);
            // }

            return http.send({
                status: "success",
                data,
                transactions
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async getAllBetBundles(http) {
        try {
            const yesterday = moment().subtract(1, "day").format("YYYY/MM/DD");
            const today = moment().format("YYYY/MM/DD");

            let fixtures;
            if (!fs.existsSync(`../storage/sports/${today}/fixtures.json`)) {
                fixtures = fs.readFileSync(`../storage/sports/${yesterday}/fixtures.json`);
            } else {
                fixtures = fs.readFileSync(`../storage/sports/${today}/fixtures.json`);
            }
            fixtures = JSON.parse(fixtures);

            const todayFixtures = (
                fixtures.filter((el) =>
                    moment(today.replace(new RegExp("/", "g"), "-")).isSame(
                        moment(el.time.date),
                        "day"
                    )
                )
            );

            const filteredFixtures = todayFixtures.sort((a, b) => {
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

            let data = filteredFixtures.slice(0, 5);

            return http.send({
                status: "success",
                data
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async allUsers(http) {
        try {
            const page = http.params.page;
            const perPage = http.params.perPage;
            const q = http.req.query.q;

            if (q && q.length) {
                const users = await User.paginate(
                    page,
                    perPage,
                    { email: q },
                    { sort: { createdAt: -1 } }
                );

                return http.send({
                    status: "success",
                    data: users
                });
            } else {
                // Pagination of all posts
                const users = await User.paginate(
                    page,
                    perPage,
                    {},
                    {
                        sort: {
                            createdAt: -1
                        }
                    }
                );

                return http.send({
                    status: "success",
                    data: users
                });
            }
        } catch (e) {
            return http.serverError(e);
        }
    }

    async deleteUser(http) {
        try {
            const userId = http.params.userId;
            const user = await User.findById(userId);
            if (!user) {
                return http.status(404).send({
                    status: "error",
                    msg: "User not found"
                });
            }

            // const fetchAllUserTips = await UserTip.find({user: userId.toString()});
            const fetchAllUserTips = await UserTip.fromQuery((native) =>
                native.find({ user: userId.toString() })
            );
            const fetchAllUserTransactions = await Transaction.fromQuery((native) =>
                native.find({ user: userId.toString() })
            );
            const fetchAllUserSubscriptions = await Subscription.fromQuery((native) =>
                native.find({ user: userId.toString() })
            );

            if (fetchAllUserTips.length > 0) {
                for (const tip of fetchAllUserTips) {
                    await tip.delete();
                }
            }

            if (fetchAllUserTransactions.length > 0) {
                for (const transaction of fetchAllUserTransactions) {
                    await transaction.delete();
                }
            }

            if (fetchAllUserSubscriptions.length > 0) {
                for (const subscription of fetchAllUserSubscriptions) {
                    await subscription.delete();
                }
            }

            await user.delete();

            return http.send({
                status: "success",
                msg: "User deleted"
            });
        } catch (e) {
            return http.serverError(e);
        }
    }

    async subscribeUserToBundle(http) {
        try {
            const schema = Joi.object({
                userId: Joi.string().required(),
                bundleId: Joi.string().required(),
                duration: Joi.number().required(),
                startDate: Joi.date().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error)
                return http.status(422).send({
                    status: "failed",
                    error: error.details
                });

            const user = await User.findById(value.userId);
            if (!user)
                return http.status(404).send({
                    status: "error",
                    msg: "User not found"
                });

            const checkIfUserHasSubscription = await Subscription.findOne({
                user: User.id(value.userId),
                status: "active"
            });

            if (checkIfUserHasSubscription)
                return http.status(422).send({
                    status: "failed",
                    msg: "User already has an active subscription"
                });

            await new Subscription()
                .set({
                    user: User.id(value.userId),
                    bundleCat: BundleCategory.id(value.bundleId),
                    duration: value.duration,
                    startDate: new Date(value.startDate),
                    expiredAt: new Date(
                        moment(value.startDate).add(value.duration, "days").toDate()
                    ),
                    updatedAt: moment(value.startDate).add(1, "hour").toDate(),
                    status: "active"
                })
                .save();

            const bundle = await BundleCategory.findById(value.bundleId.toString());

            const source = fs.readFileSync("../storage/emails/subscription.mjml", "utf8");
            const htmlOutput = mjml2html(source);
            const template = Handlebars.compile(htmlOutput.html);
            const templateData = {
                firstName: user.get("firstName"),
                title: `${bundle?.data.title} Subscription Successful`,
                message: `You have successfully subscribed to ${bundle?.data.title} subscription.`
            };

            // await sendMailViaSmtp({
            //     to: user.get("email"),
            //     from: "Betweysure <noreply@betweysure.com>",
            //     sender: "noreply@betweysure.com",
            //     subject: "Subscription Successful",
            //     html: template(templateData)
            // });

            sendEmail(user.get("email"),"","Betweysure","Betweysure <noreply@betweysure.com>",
                "Subscription Successful", "", template(templateData))

            return http.send({
                status: "success",
                msg: "User subscribed to bundle successfully"
            });
        } catch (e) {
            return http.serverError(e);
        }
    }
}

module.exports = AdminController;
