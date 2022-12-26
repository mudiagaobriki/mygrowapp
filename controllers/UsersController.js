var crypto = require("crypto");
const Prediction = require("../utils/predictions");
const { checkIfUserIsLoggedIn, checkUserSubscription, getFixtureContents } = require("../utils/func");


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
const Notification = require("../models/Notification");
// import { sendPushNotificationViaOneSignal } from "../utils/pushNotification";

const fs = require('fs')
const sendEmail = require("../utils/emails")
const {randomString} = require("../utils/numbers");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
var passport = require('passport');


/**
 * UsersController
 */
class UsersController {
    /**
     * Example controller action.
     * @param {Http} http
     */
     async me(http )  {
        try {
            const id = http.state.get("id");
            const me = await User.findById(id);

            let subscription = null;

            const userHasSubscription = await Subscription.findOne({
                user: User.id(id),
                status: "active"
            });

            if (userHasSubscription) {
                const userSub = {};
                const bundle = await BundleCategory.findById(userHasSubscription.data.bundleCat);
                if (bundle) {
                    (userSub.autoRenew = userHasSubscription.data.autoRenew),
                        (userSub.bundle = bundle.data),
                        (userSub.startDate = userHasSubscription.data.startedAt
                            ? userHasSubscription.data.startedAt
                            : userHasSubscription.data.createdAt),
                        (userSub.expiryDate = userHasSubscription.data.expiredAt
                            ? userHasSubscription.data.expiredAt
                            : moment(userHasSubscription.data.createdAt)
                                  .add(userHasSubscription.data.duration, "days")
                                  .toDate());
                    userSub.duration = userHasSubscription.data.duration;
                    userSub.id = userHasSubscription.id().toString();
                }

                subscription = userSub;
            }

            if (me)
                return http.send({
                    status: "success",
                    msg: "User fetched successfully",
                    user: _.omit(me.data, "password"),
                    subscription
                });
            else
                return http.status(404).send({
                    status: "error",
                    msg: "User not found"
                });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async notifications(http )  {
        try {
            const id = http.state.get("id");
            const notifications = await Notification.find(
                { user: id },
                {
                    sort: { createdAt: -1 }
                }
            );

            if (notifications)
                return http.send({
                    status: "success",
                    msg: "User fetched successfully",
                    notifications
                });
            else
                return http.status(400).send({
                    status: "error",
                    msg: "Unable to fetch notifications"
                });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async singleNotification(http )  {
        try {
            const notifyID = http.params.id;
            const id = http.state.get("id");

            const user = await User.findById(id);
            const notification = await Notification.findById(notifyID);

            if (user && notification) {
                const checkUser = notification.$data?.get("user") === user.$data?.get("_id");

                if (checkUser) {
                    return http.send({
                        status: "success",
                        msg: "Notification fetched successfully",
                        data: notification.data
                    });
                } else {
                    return http.status(404).send({
                        status: "error",
                        msg: "Notification not found"
                    });
                }
            }

            return http.status(404).send({
                status: "error",
                msg: "User not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async notificationStatus(http )  {
        try {
            const id = http.state.get("id");
            const notifyID = http.params.id;

            const user = await User.findById(id);
            const notification = await Notification.findById(notifyID);

            if (user && notification) {
                const update = await Notification.findOne({
                    _id: notification.id(),
                    user: id
                });
                if (update) {
                    await update
                        .set({
                            read: true
                        })
                        .save();

                    return http.status(200).send({
                        status: "success",
                        msg: "Marked as read successfully"
                    });
                }

                return http.status(404).send({
                    status: "error",
                    msg: "Notification not found"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "User not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async checkUnreadNotifications(http )  {
        try {
            const id = http.state.get("id");

            const user = await Notification.find({ user: id, read: false });

            if (user) {
                return http.send({
                    status: "success",
                    data: user
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "User notification cannot be fetched"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async bookmarks(http )  {
        try {
            const id = http.state.get("id");
            const notifications = await Notification.find({ userID: id });

            if (notifications)
                return http.send({
                    status: "success",
                    msg: "User fetched successfully",
                    user: notifications
                });
            else
                return http.status(400).send({
                    status: "error",
                    msg: "Unable to fetch notifications"
                });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async claimBundle(http )  {
        try {
            const id = http.state.get("id");

            const user = await User.findById(id);
            if (!user)
                return http.status(404).send({
                    status: "error",
                    msg: "User not found"
                });

            const schema = Joi.object({
                bundle: Joi.string().required(),
                category: Joi.string().required()
            });
            const { error, value } = schema.validate(http.$body.all());
            if (error) return http.inputError(error.details);

            const checkIfSubscribed = await Subscription.findOne({
                user: user.id().toString(),
                status: "active",
                bundleCat: value.category
            });

            if (checkIfSubscribed) {
                const checkBundleCat = await BundleCategory.findById(value.category);

                if (checkBundleCat) {
                    const checkIfTipHasBeenPreviouslyClaimed = await UserTip.findOne({
                        categoryID: value.category,
                        bundleID: value.bundle,
                        user: user.id().toString()
                    });

                    if (checkIfTipHasBeenPreviouslyClaimed) {
                        return http.status(202).send({
                            status: "success",
                            msg: "Tip already claimed"
                        });
                    }

                    const tip = await new UserTip()
                        .set({
                            user: User.id(user.id().toString()),
                            categoryID: BundleCategory.id(checkBundleCat.id().toString()),
                            bundleID: Bundle.id(value.bundle)
                        })
                        .saveAndReturn();

                    return http.status(201).send({
                        status: "success",
                        msg: "Tip claimed successfully",
                        tip
                    });
                }
                return http.status(400).send({
                    status: "error",
                    msg: "Bundle not available at the moment"
                });
            }

            return http.status(203).send({
                status: "error",
                msg: "You need to be subscribed"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async purchases(http )  {
        try {
            const id = http.state.get("id");

            const user = await User.findById(id);

            if (user) {
                const userTips = await UserTip.find({ user: user.id().toString() });
                if (userTips) {
                    let tips = [];
                    for (const tip of userTips) {
                        const category = await BundleCategory.findById(tip.categoryID, {
                            projection: { title: 1 }
                        });

                        const bundles = await Bundle.findById(tip.bundleID, {
                            projection: { tips: 1 }
                        });

                        if (category && bundles) {
                            tip.category = category.data;
                            tip.bundles = bundles.data;
                        }

                        delete tip.categoryID;
                        delete tip.bundleID;
                        delete tip.user;

                        // tip.createdAt = moment(tip.createdAt).format("YYYY-MM-DD");

                        tips.push(tip);
                    }

                    return http.send({
                        status: "success",
                        msg: "User claimed tips fetched successfully",
                        tips
                    });
                }

                return http.status(400).send({
                    status: "error",
                    msg: "Temporarily unable to fetch tips"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "User not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async transactions(http )  {
        try {
            const id = http.state.get("id");

            const transactions = await Transaction.find(
                { user: id },
                {
                    sort: { createdAt: -1 }
                }
            );
            if (transactions) {
                for (const tranx of transactions) {
                    if (tranx.subscription) {
                        const subscription = await Subscription.findById(tranx.subscription);

                        if (subscription) {
                            const category = await BundleCategory.findById(
                                subscription?.data.bundleCat,
                                {
                                    projection: { title: 1 }
                                }
                            );

                            if (category) tranx.subscription = category.data;
                        }
                    }
                }

                return http.send({
                    status: "success",
                    data: transactions
                });
            }

            return http.status(400).send({
                status: "error",
                msg: "Unable to fetch transactions"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async updateProfilePhoto(http )  {
        try {
            const id = http.state.get("id");
            const schema = Joi.object({
                profile_picture_path: Joi.string().uri().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const user = await User.findById(id);

            if (user) {
                await user
                    .set({
                        profilePhoto: value.profile_picture_path
                    })
                    .save();

                return http.send({
                    status: "success",
                    msg: "Profile photo updated successfully"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "User not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async updateProfile(http )  {
        try {
            const id = http.state.get("id");
            const schema = Joi.object({
                firstName: Joi.string().required(),
                lastName: Joi.string().required(),
                password: Joi.string().optional(),
                new_password: Joi.string().optional(),
                password_confirmation: Joi.string()
                    .optional()
                    .valid(Joi.ref("new_password"))
                    .messages({
                        "string.base": "Password confirmation must match new password!"
                    })
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const user = await User.findById(id);

            if (user) {
                if (value.password) {
                    const comparePassword = bcrypt.compare(value.password, user.data.password);
                    if (!comparePassword) {
                        return http.status(400).send({
                            status: "error",
                            msg: "Incorrect current password entered."
                        });
                    }

                    if (value.password === value.new_password) {
                        return http.status(400).send({
                            status: "error",
                            msg: "Current password cannot be the same with new password"
                        });
                    }

                    if (!value.new_password || !value.password_confirmation) {
                        return http.status(400).send({
                            status: "error",
                            msg: "Kindly enter a new password"
                        });
                    }

                    await user
                        .set({
                            firstName: value.firstName,
                            lastName: value.lastName,
                            password: bcrypt.hash(value.new_password)
                        })
                        .save();
                } else {
                    await user
                        .set({
                            firstName: value.firstName,
                            lastName: value.lastName
                        })
                        .save();
                }

                return http.send({
                    status: "success",
                    msg: "Profile updated successfully"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "User not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async deleteNotification(http )  {
        try {
            const id = http.params.id;
            const user = http.state.get("id");

            const notify = await Notification.findById(id);

            if (notify) {
                if (notify.get("user") === user) {
                    await notify.delete();

                    return http.send({
                        status: "success",
                        msg: "Notification deleted successfully"
                    });
                }
            }

            return http.status(400).send({
                status: "error",
                msg: "Notification not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async addPushDevice(http )  {
        try {
            const id = http.state.get("id");
            const schema = Joi.object({
                token: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const user = await User.findById(id);

            if (user) {
                const checkIfTokenExists = await User.findOne({
                    pushNotificationDevices: value.token
                });
                if (!checkIfTokenExists) {
                    await User.native().updateOne(
                        { _id: user.id().toString() },
                        { $push: { pushNotificationDevices: value.token } }
                    );
                }

                return http.send({
                    status: "success",
                    msg: "Token already exists"
                });
            }

            return http.status(404).send({
                status: "error",
                msg: "User not found"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }

    async autoRenewal(http )  {
        try {
            const schema = Joi.object({
                autoRenew: Joi.boolean().required(),
                subscription: Joi.string().required()
            });

            const { error, value } = schema.validate(http.$body.all());

            if (error) return http.inputError(error.details);

            const subscription = await Subscription.findById(value.subscription);
            if (subscription) {
                subscription
                    .set({
                        autoRenew: value.autoRenew
                    })
                    .save();

                return http.send({
                    status: "success",
                    msg: "Auto renewal updated successfully"
                });
            }

            return http.status(400).send({
                status: "failed",
                msg: "An error occurred, kindly try again later"
            });
        } catch (e ) {
            return http.serverError(e);
        }
    }
}

module.exports = UsersController;
