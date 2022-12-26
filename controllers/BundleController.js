const { checkIfUserIsLoggedIn } = require("../utils/func");


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
 * BundleController
 */
class BundleController {
    /**
     * Example controller action.
     * @param {Http} http
     */
    async bundleCategories(http) {
        try {
            const Category = await BundleCategory.find({});

            let isTrial = false;

            let userSubscription: number = 0;
            const getUserIDIfLoggedIn = await checkIfUserIsLoggedIn(http);
            if (getUserIDIfLoggedIn && typeof getUserIDIfLoggedIn === "string") {
                const subscription = await Subscription.native().findOne({
                    user: getUserIDIfLoggedIn,
                    status: { $regex: /expired|active/g }
                });

                isTrial = !subscription;
            } else {
                isTrial = true;
            }

            return http.json({
                success: true,
                data: Category,
                isTrial
            });
        } catch (e: any) {
            return http.serverError(e);
        }
    }

    async hiddenBundle(http) {
        try {
            // const getBundles = await Bundle.find({ status: true });
            const getBundles = await Bundle.find(
                {
                    status: true
                },
                {
                    sort: { createdAt: -1 },
                    projection: { tips: 1, category: 1 }
                }
            );

            if (getBundles) {
                for (const bundle of getBundles) {
                    const category = await BundleCategory.findById(bundle.category);
                    if (category) {
                        bundle.categoryID = category.id().toString();
                        bundle.bundle = category.data.title;
                        bundle.cost = {
                            daily: category.data.fee.daily,
                            weekly: category.data.fee.weekly,
                            monthly: category.data.fee.monthly,
                            quarterly: category.data.fee.quarterly,
                            biannually: category.data.fee.biannually
                        };
                    }

                    let totalOdds = 0;
                    for (const tip of bundle.tips) {
                        delete tip.home;
                        delete tip.away;
                        delete tip.league;
                        totalOdds += +tip.odds;
                    }
                    delete bundle.category;
                    bundle.totalOdds = totalOdds;
                }

                return http.send({
                    status: "success",
                    msg: "Bundles fetched successfully",
                    data: getBundles
                });
            }

            return http.status(400).send({
                status: "error",
                msg: "Unable to fetch bundles"
            });
        } catch (e: any) {
            return http.serverError(e);
        }
    }

    async initiatePaystack(http) {
        try {
            const id = http.state.get("id");

            const user = await User.findById(id);

            if (!user)
                return http.status(404).send({
                    status: "error",
                    msg: "User not found"
                });

            const userHasSubscription = await Subscription.findOne({
                user: User.id(id),
                status: "active"
            });

            if (user && userHasSubscription) {
                if (userHasSubscription) {
                    return http.status(400).send({
                        status: "error",
                        msg: "You currently have an active subscription"
                    });
                }
            }

            const checkIfFirstSubscription = await Subscription.findOne({
                user: id
            });

            const schema = Joi.object({
                email: Joi.string().email().required(),
                amount: Joi.string().required(),
                category: Joi.string().required(),
                subscription: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const ref = uuidv4();
            const transaction = await new Transaction()
                .set({
                    user: User.id(id),
                    amount: !checkIfFirstSubscription ? 50 : value.amount,
                    ref,
                    status: "pending"
                })
                .saveAndReturn();

            const { data } = await axios.post(
                "https://api.paystack.co/transaction/initialize",
                {
                    email: value.email,
                    amount: !checkIfFirstSubscription ? 50 * 100 : value.amount * 100,
                    currency: "NGN",
                    channels: ["card"],
                    reference: ref,
                    // callback_url: `${$.env("FRONT_END", "http://localhost:3000")}/pricing`,
                    callback_url: `${process.env.FRONT_END}/pricing`,
                    metadata: {
                        category: value.category,
                        transaction: transaction.id().toString(),
                        subscription: value.subscription
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${
                            process.env.NODE_ENV === "development"
                                ? process.env.PAYSTACK_SECRET_KEY_TEST
                                : process.env.PAYSTACK_SECRET_KEY
                        }`
                    }
                }
            );

            if (data.status) {
                return http.send({
                    status: "success",
                    data: data.data
                });
            }

            return http.status(400).send({
                status: "error",
                msg: "Unable go initiate payment, kindly try again"
            });
        } catch (e: any) {
            return http.serverError(e);
        }
    }

    async verifyPaystack(http) {
        try {
            const id = http.state.get("id");
            const transaction_id = http.params.tranxid;

            const { data } = await axios(
                `https://api.paystack.co/transaction/verify/${transaction_id}`,
                {
                    headers: {
                        Authorization: `Bearer ${
                            process.env.NODE_ENV === "development"
                                ? process.env.PAYSTACK_SECRET_KEY_TEST
                                : process.env.PAYSTACK_SECRET_KEY
                        }`
                    }
                }
            );

            const {
                gateway_response,
                status,
                channel,
                ip_address,
                authorization,
                customer,
                metadata,
                // amount,
                reference
            } = data.data;

            if (status === "success") {
                const user = await User.findOne({ email: customer.email });
                const bundle = await BundleCategory.findById(metadata.category);

                if (user && bundle) {
                    const checkIfFirstSubscription = await Subscription.findOne({
                        user: User.id(id)
                    });

                    const bundleType = Object.entries(bundle.data.fee)
                        .filter(([k]) => k === metadata.subscription)
                        .map(([k]) => k);

                    let duration = 0;
                    switch (bundleType[0]) {
                        case "daily":
                            duration = 1;
                            break;
                        case "weekly":
                            duration = 7;
                            break;
                        case "monthly":
                            duration = 30;
                            break;
                        case "quarterly":
                            duration = 90;
                            break;
                        case "biannually":
                            duration = 180;
                    }

                    let subscription;
                    subscription = await Subscription.findOne({
                        user: User.id(id),
                        bundleCat: BundleCategory.id(metadata.category),
                        status: "active"
                    });

                    if (!subscription) {
                        if (!checkIfFirstSubscription) {
                            subscription = await new Subscription()
                                .set({
                                    user: User.id(user.id().toString()),
                                    bundleCat: Bundle.id(bundle.id().toString()),
                                    duration: duration + 7,
                                    status: "active",
                                    // auth: $.base64.encode(authorization.authorization_code),
                                    auth: new Buffer(authorization.authorization_code).toString('base64'),
                                    autoRenew: true
                                })
                                .saveAndReturn();
                        } else {
                            subscription = await new Subscription()
                                .set({
                                    user: User.id(user.id().toString()),
                                    bundleCat: Bundle.id(bundle.id().toString()),
                                    duration,
                                    status: "active",
                                    // auth: $.base64.encode(authorization.authorization_code),
                                    auth: new Buffer(authorization.authorization_code).toString('base64'),
                                    autoRenew: true
                                })
                                .saveAndReturn();
                        }
                    }

                    if (subscription) {
                        const checkIfTranExist = await Transaction.findOne({ ref: reference });
                        if (checkIfTranExist) {
                            await checkIfTranExist
                                .set({
                                    subscription: Subscription.id(subscription.id().toString()),
                                    tran_id: Transaction.id(transaction_id),
                                    payment_type: channel,
                                    ip: ip_address,
                                    last4digits: authorization.last4 ?? null,
                                    status,
                                    description: !checkIfFirstSubscription
                                        ? `${bundle.data.title} ${metadata.subscription} trial subscription`
                                        : `${bundle.data.title} ${metadata.subscription} subscription`
                                })
                                .save();
                        }

                        const source = fs.readFileSync(
                            "../storage/emails/subscription.mjml",
                            "utf8"
                        );
                        const htmlOutput = mjml2html(source);
                        const template = Handlebars.compile(htmlOutput.html);
                        const templateData = {
                            firstName: user.get("firstName"),
                            title: `${bundle.data.title} Subscription Successful`,
                            message: !checkIfFirstSubscription
                                ? `You have successfully subscribed to ${bundle.data.title} ${metadata.subscription} trial subscription.`
                                : `You have successfully subscribed to ${bundle.data.title} ${metadata.subscription} subscription.`
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
                            msg: "Subscription successful"
                        });
                    }

                    return http.status(400).send({
                        status: "error",
                        msg: "Unable to activate subscription now kindly try again!"
                    });
                }

                return http.status(400).send({
                    status: "error",
                    msg: "Bundle currently not available, kindly try again"
                });
            }

            return http.status(401).send({
                status: "error",
                msg: gateway_response
            });
        } catch (e: any) {
            return http.serverError(e);
        }
    }

    async initiateFlutterwave(http) {
        try {
            const id = http.state.get("id");

            const user = await User.findById(id);

            if (!user)
                return http.status(404).send({
                    status: "error",
                    msg: "User not found"
                });

            const userHasSubscription = await Subscription.findOne({
                user: id,
                status: "active"
            });

            if (user && userHasSubscription) {
                if (userHasSubscription) {
                    return http.status(400).send({
                        status: "error",
                        msg: "You currently has an active subscription"
                    });
                }
            }

            const checkIfFirstSubscription = await Subscription.findOne({
                user: id
            });

            const schema = Joi.object({
                email: Joi.string().email().required(),
                amount: Joi.string().required(),
                category: Joi.string().required(),
                subscription: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const ref = uuidv4();

            const transaction = await new Transaction()
                .set({
                    user: User.id(id),
                    amount: !checkIfFirstSubscription ? 50 * 100 : value.amount * 100,
                    ref,
                    status: "pending"
                })
                .saveAndReturn();

            const { data } = await axios.post(
                "https://api.flutterwave.com/v3/payments",
                {
                    tx_ref: ref,
                    amount: value.amount,
                    currency: "NGN",
                    payment_options: ["card"],
                    // redirect_url: `${$.env("FRONT_END", "http://localhost:3000")}/pricing`,
                    redirect_url: `${process.env.FRONT_END}/pricing`,
                    customer: {
                        email: value.email,
                        phonenumber: user.has("phone") && value.mobile,
                        name: user.get("firstName") + " " + user.get("lastName")
                    },
                    customizations: {
                        title: "Betweysure",
                        description: "Prediction for Football and Betting Enthusiasts",
                        logo: "https://firebasestorage.googleapis.com/v0/b/betweysure-511a4.appspot.com/o/images%2Fno-bg.png?alt=media&token=bf81fc22-1f55-43bd-92fd-5aaf34a77deb"
                    },
                    meta: {
                        category: value.category,
                        transaction: transaction.id().toString(),
                        subscription: value.subscription
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${
                            process.env.NODE_ENV === "development"
                                ? process.env.PAYSTACK_SECRET_KEY_TEST
                                : process.env.PAYSTACK_SECRET_KEY
                        }`
                    }
                }
            );

            if (data.status) {
                return http.send({
                    status: "success",
                    data: data.data,
                    transaction
                });
            }

            return http.status(400).send({
                status: "error",
                msg: "Unable go initiate payment, kindly try again"
            });
        } catch (e: any) {
            return http.serverError(e);
        }
    }

    async verifyFlutterwavePayment(http) {
        try {
            const id = http.state.get("id");
            const transaction_id = http.params.tranxid;

            const { data } = await axios(
                `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
                {
                    headers: {
                        Authorization: `Bearer ${
                            process.env.NODE_ENV === "development"
                                ? process.env.FLUTTERWAVE_SECRET_KEY_TEST
                                : process.env.PAYSTACK_SECRET_KEY
                        }`
                    }
                }
            );

            const {
                processor_response,
                status,
                payment_type,
                ip,
                card,
                customer,
                meta,
                amount,
                tx_ref
            } = data.data;

            if (status === "successful") {
                const user = await User.findOne({ email: customer.email });
                const bundle = await BundleCategory.findById(meta.category);
                if (user && bundle) {
                    const checkIfFirstSubscription = await Subscription.findOne({
                        user: User.id(id)
                    });

                    const bundleType = Object.entries(bundle!.data?.fee)
                        .filter(([k]) => k === meta.subscription)
                        .map(([k]) => k);

                    let duration = 0;
                    switch (bundleType[0]) {
                        case "daily":
                            duration = 1;
                            break;
                        case "weekly":
                            duration = 7;
                            break;
                        case "monthly":
                            duration = 30;
                            break;
                        case "quarterly":
                            duration = 90;
                            break;
                        case "biannually":
                            duration = 180;
                    }

                    let subscription: any;
                    subscription = await Subscription.findOne({
                        user: User.id(id),
                        bundleCat: BundleCategory.id(meta.category),
                        status: "active"
                    });
                    if (!subscription) {
                        if (!checkIfFirstSubscription) {
                            subscription = await new Subscription()
                                .set({
                                    user: User.id(user!.id().toString()),
                                    bundleCat: Bundle.id(bundle!.id().toString()),
                                    duration: duration + 7,
                                    status: "active",
                                    auth: new Buffer(card.token).toString('base64'),
                                    // auth: $.base64.encode(card.token),
                                    autoRenew: true
                                })
                                .saveAndReturn();
                        } else {
                            subscription = await new Subscription()
                                .set({
                                    user: User.id(user!.id().toString()),
                                    bundleCat: Bundle.id(meta.category),
                                    duration,
                                    status: "active",
                                    auth: new Buffer(card.token).toString('base64'),
                                    // auth: $.base64.encode(card.token),
                                    autoRenew: true
                                })
                                .saveAndReturn();
                        }
                    }

                    if (subscription) {
                        const checkIfTranExist = await Transaction.findOne({ ref: tx_ref });
                        if (checkIfTranExist) {
                            await checkIfTranExist
                                ?.set({
                                    subscription: Subscription.id(subscription.id().toString()),
                                    tran_id: Transaction.id(transaction_id),
                                    payment_type: payment_type,
                                    ip: ip,
                                    last4digits: card.last_4digits ?? null,
                                    status,
                                    description: !checkIfFirstSubscription
                                        ? `${bundle?.data.title} ${meta.subscription} trial subscription`
                                        : `${bundle?.data.title} ${meta?.subscription} subscription`
                                })
                                .save();
                        }

                        const source = fs.readFileSync(
                            "../storage/emails/subscription.mjml",
                            "utf8"
                        );
                        const htmlOutput = mjml2html(source);
                        const template = Handlebars.compile(htmlOutput.html);
                        const templateData = {
                            firstName: user?.get("firstName"),
                            title: `${bundle?.data.title} Subscription Successful`,
                            message: !checkIfFirstSubscription
                                ? `You have successfully subscribed to ${bundle?.data.title} ${meta.subscription} trial subscription.`
                                : `You have successfully subscribed to ${bundle?.data.title} ${meta.subscription} subscription.`
                        };

                        // await sendMailViaSmtp({
                        //     to: user?.get("email"),
                        //     from: "Betweysure <noreply@betweysure.com>",
                        //     sender: "noreply@betweysure.com",
                        //     subject: "Subscription Successful",
                        //     html: template(templateData)
                        // });

                        sendEmail(user?.get("email"),"","Betweysure","Betweysure <noreply@betweysure.com>",
                            "Subscription Successful", "", template(templateData))

                        return http.send({
                            status: "success",
                            msg: "Subscription successful"
                        });
                    }

                    return http.status(400).send({
                        status: "error",
                        msg: "Unable to activate subscription now kindly try again!"
                    });
                }

                return http.status(400).send({
                    status: "error",
                    msg: "Bundle currently not available, kindly try again"
                });
            }

            return http.status(401).send({
                status: "error",
                msg: processor_response
            });
        } catch (e: any) {
            return http.serverError(e);
        }
    }
}

export = BundleController;
