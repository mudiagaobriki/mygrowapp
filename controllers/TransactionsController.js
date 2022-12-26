var crypto = require("crypto");
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
 * TransactionsController
 */
class TransactionsController {
    /**
     * Example controller action.
     * @param {Http} http
     */
    async flutterwaveWebhook(http)  {
        try {
            const hash = http.req.headers["verif-hash"];

            if (hash !== process.env.WEBHOOK_HASH) return http.status(400).send({ status: "error" });

            const { data } = http.$body.all();
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
                    const bundleType = Object.entries(bundle.data.fee)
                        .filter(([, v]) => v === amount)
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

                    let subscription ;
                    subscription = await Subscription.findOne({
                        user: user.id().toString(),
                        bundleCat: meta.category,
                        status: "active"
                    });
                    if (!subscription) {
                        subscription = await new Subscription()
                            .set({
                                user: User.id(user.id().toString()),
                                bundleCat: Bundle.id(bundle.id().toString()),
                                duration,
                                status: "active"
                            })
                            .saveAndReturn();
                    }

                    if (subscription) {
                        const checkIfTranExist = await Transaction.findOne({ ref: tx_ref });
                        if (checkIfTranExist) {
                            await checkIfTranExist
                                .set({
                                    subscription: Subscription.id(subscription.id().toString()),
                                    tran_id: meta.transaction,
                                    payment_type,
                                    ip,
                                    last4digits: card.last_4digits ?? null,
                                    status
                                })
                                .save();

                            const actualBundle = await Bundle.findOne({
                                category: meta.category,
                                status: true
                            });

                            const checkIfTipHasBeenPreviouslyClaimed = await UserTip.findOne({
                                categoryID: meta.category,
                                bundleID: actualBundle?.id().toString(),
                                user: user.id().toString()
                            });

                            if (checkIfTipHasBeenPreviouslyClaimed) {
                                return http.status(202).send({
                                    status: "success"
                                });
                            } else {
                                await new UserTip()
                                    .set({
                                        user: User.id(user.id().toString()),
                                        categoryID: BundleCategory.id(meta.category),
                                        bundleID: Bundle.id(actualBundle?.id().toString())
                                    })
                                    .saveAndReturn();
                            }
                        }

                        return http.send({
                            status: "success"
                        });
                    }

                    return http.status(400).send({
                        status: "error"
                    });
                }

                return http.status(400).send({
                    status: "error"
                });
            }

            return http.status(401).send({
                status: "error"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async paystackWebhook(http )  {
        try {
            const hash = crypto
                .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY_TEST)
                .update(JSON.stringify(http.req.body))
                .digest("hex");
            if (hash == http.req.headers["x-paystack-signature"]) {
                const { event } = http.$body.all();

                if (event === "paymentrequest.success") {
                    const { data } = http.$body.all();
                }
            }
            return http.status(401).send({
                status: "error"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }
}

module.exports = TransactionsController;
